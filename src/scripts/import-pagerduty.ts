/**
 * Import PagerDuty export data into eos-oncallers database.
 *
 * Usage:
 *   npx tsx src/scripts/import-pagerduty.ts [path-to-export.json]
 *
 * Default path: data/pagerduty-export.json
 * Idempotent: uses upsert operations keyed on unique names/emails.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

export interface PdUser {
  id: string;
  name: string;
  email: string;
  role: string;
  time_zone: string;
  job_title: string | null;
  teams: Array<{ id: string; summary: string }>;
}

export interface PdTeam {
  id: string;
  name: string;
  description: string | null;
}

export interface PdService {
  id: string;
  name: string;
  description: string | null;
  status: string;
  escalation_policy: { id: string; summary: string } | null;
  teams: Array<{ id: string; summary: string }>;
  integrations: Array<{ id: string; type: string; summary: string }>;
}

export interface PdScheduleLayer {
  id: string;
  name: string;
  start: string;
  end: string | null;
  rotation_virtual_start: string;
  rotation_turn_length_seconds: number;
  users: Array<{ id: string; summary: string }>;
}

export interface PdSchedule {
  id: string;
  name: string;
  description: string | null;
  time_zone: string;
  schedule_layers: PdScheduleLayer[];
  teams: Array<{ id: string; summary: string }>;
  users: Array<{ id: string; summary: string }>;
}

export interface PdEscalationPolicy {
  id: string;
  name: string;
  description: string | null;
  num_loops: number;
  escalation_rules: Array<{
    escalation_delay_in_minutes: number;
    targets: Array<{ id: string; type: string; summary: string }>;
  }>;
  teams: Array<{ id: string; summary: string }>;
}

export interface PdExport {
  exported_at: string;
  source: string;
  counts: Record<string, number>;
  users: PdUser[];
  teams: PdTeam[];
  services: PdService[];
  schedules: PdSchedule[];
  escalation_policies: PdEscalationPolicy[];
}

export function mapPdRole(pdRole: string): 'ADMIN' | 'GROUP_LEADER' | 'USER' {
  if (pdRole === 'admin' || pdRole === 'owner') return 'ADMIN';
  if (pdRole === 'manager') return 'GROUP_LEADER';
  return 'USER';
}

export function mapRotationType(turnLengthSeconds: number): string {
  const days = Math.round(turnLengthSeconds / 86400);
  return days <= 1 ? 'daily' : 'weekly';
}

export async function importPagerDuty(exportPath: string): Promise<{
  users: number;
  teams: number;
  services: number;
  schedules: number;
  escalationPolicies: number;
}> {
  const raw = fs.readFileSync(exportPath, 'utf-8');
  const data: PdExport = JSON.parse(raw);

  console.log(`Importing from ${data.source} (exported ${data.exported_at})`);
  console.log(`Counts: ${JSON.stringify(data.counts)}`);

  const userIdMap = new Map<string, string>();
  const teamIdMap = new Map<string, string>();
  const scheduleIdMap = new Map<string, string>();
  const policyIdMap = new Map<string, string>();

  // 1. Teams
  for (const pdTeam of data.teams) {
    const team = await prisma.team.upsert({
      where: { name: pdTeam.name },
      update: { description: pdTeam.description || undefined },
      create: { name: pdTeam.name, description: pdTeam.description },
    });
    teamIdMap.set(pdTeam.id, team.id);
  }
  console.log(`Imported ${data.teams.length} teams`);

  // 2. Users
  const defaultHash = await bcrypt.hash('changeme123!', 12);
  for (const pdUser of data.users) {
    const role = mapPdRole(pdUser.role);
    const user = await prisma.user.upsert({
      where: { email: pdUser.email },
      update: { name: pdUser.name, role },
      create: { email: pdUser.email, name: pdUser.name, passwordHash: defaultHash, role },
    });
    userIdMap.set(pdUser.id, user.id);

    for (const pdTeamRef of pdUser.teams) {
      const localTeamId = teamIdMap.get(pdTeamRef.id);
      if (localTeamId) {
        await prisma.teamMember.upsert({
          where: { userId_teamId: { userId: user.id, teamId: localTeamId } },
          update: {},
          create: { userId: user.id, teamId: localTeamId, role },
        });
      }
    }
  }
  console.log(`Imported ${data.users.length} users`);

  // 3. Schedules
  for (const pdSchedule of data.schedules) {
    const schedule = await prisma.schedule.upsert({
      where: { name: pdSchedule.name },
      update: { description: pdSchedule.description, timezone: pdSchedule.time_zone },
      create: { name: pdSchedule.name, description: pdSchedule.description, timezone: pdSchedule.time_zone },
    });
    scheduleIdMap.set(pdSchedule.id, schedule.id);

    // Delete existing layers + members to rebuild
    await prisma.scheduleMember.deleteMany({ where: { scheduleId: schedule.id } });
    await prisma.scheduleLayer.deleteMany({ where: { scheduleId: schedule.id } });

    const layerSource = pdSchedule.schedule_layers.length > 0
      ? pdSchedule.schedule_layers
      : pdSchedule.users.length > 0
        ? [{ id: 'default', name: 'Primary', start: '2024-01-01', end: null, rotation_virtual_start: '2024-01-01', rotation_turn_length_seconds: 604800, users: pdSchedule.users }]
        : [];

    for (let i = 0; i < layerSource.length; i++) {
      const pdLayer = layerSource[i];
      const rotationType = mapRotationType(pdLayer.rotation_turn_length_seconds || 604800);

      const layer = await prisma.scheduleLayer.create({
        data: {
          scheduleId: schedule.id,
          name: pdLayer.name || `Layer ${i}`,
          priority: i,
          rotationType,
          handoffTime: '09:00',
          handoffDay: rotationType === 'weekly' ? 1 : undefined,
          startDate: new Date(pdLayer.rotation_virtual_start || pdLayer.start || '2024-01-01'),
          endDate: pdLayer.end ? new Date(pdLayer.end) : undefined,
        },
      });

      for (let pos = 0; pos < pdLayer.users.length; pos++) {
        const localUserId = userIdMap.get(pdLayer.users[pos].id);
        if (localUserId) {
          await prisma.scheduleMember.create({
            data: { userId: localUserId, scheduleId: schedule.id, layerId: layer.id, position: pos },
          });
        }
      }
    }
  }
  console.log(`Imported ${data.schedules.length} schedules`);

  // 4. Escalation policies
  for (const pdPolicy of data.escalation_policies) {
    const policy = await prisma.escalationPolicy.upsert({
      where: { name: pdPolicy.name },
      update: { description: pdPolicy.description, repeatCount: pdPolicy.num_loops || 3 },
      create: { name: pdPolicy.name, description: pdPolicy.description, repeatCount: pdPolicy.num_loops || 3 },
    });
    policyIdMap.set(pdPolicy.id, policy.id);

    await prisma.escalationLevel.deleteMany({ where: { escalationPolicyId: policy.id } });

    for (let i = 0; i < pdPolicy.escalation_rules.length; i++) {
      const rule = pdPolicy.escalation_rules[i];
      const level = await prisma.escalationLevel.create({
        data: { escalationPolicyId: policy.id, level: i + 1, delayMinutes: rule.escalation_delay_in_minutes || 5 },
      });

      for (const target of rule.targets) {
        const isSchedule = target.type === 'schedule_reference' || target.type === 'schedule';
        const targetId = isSchedule ? scheduleIdMap.get(target.id) : userIdMap.get(target.id);
        if (targetId) {
          await prisma.escalationTarget.create({
            data: { escalationLevelId: level.id, targetType: isSchedule ? 'SCHEDULE' : 'USER', targetId },
          });
        }
      }
    }
  }
  console.log(`Imported ${data.escalation_policies.length} escalation policies`);

  // 5. Services
  let fallbackTeamId: string | undefined;
  for (const pdService of data.services) {
    const teamRef = pdService.teams[0];
    let teamId = teamRef ? teamIdMap.get(teamRef.id) : undefined;
    if (!teamId) {
      if (!fallbackTeamId) {
        const first = await prisma.team.findFirst();
        fallbackTeamId = first?.id;
        if (!fallbackTeamId) {
          const t = await prisma.team.create({ data: { name: 'Default Team' } });
          fallbackTeamId = t.id;
        }
      }
      teamId = fallbackTeamId;
    }

    const policyId = pdService.escalation_policy ? policyIdMap.get(pdService.escalation_policy.id) : undefined;

    await prisma.service.upsert({
      where: { name: pdService.name },
      update: { description: pdService.description, teamId, escalationPolicyId: policyId, status: pdService.status === 'active' ? 'active' : 'disabled' },
      create: { name: pdService.name, description: pdService.description, teamId, escalationPolicyId: policyId, status: pdService.status === 'active' ? 'active' : 'disabled' },
    });
  }
  console.log(`Imported ${data.services.length} services`);

  return {
    users: data.users.length,
    teams: data.teams.length,
    services: data.services.length,
    schedules: data.schedules.length,
    escalationPolicies: data.escalation_policies.length,
  };
}

// CLI entrypoint
const isMain = process.argv[1]?.includes('import-pagerduty');
if (isMain) {
  const exportPath = process.argv[2] || path.resolve(__dirname, '../../data/pagerduty-export.json');
  if (!fs.existsSync(exportPath)) {
    console.error(`Export file not found: ${exportPath}`);
    console.error('Usage: npx tsx src/scripts/import-pagerduty.ts [path-to-export.json]');
    process.exit(1);
  }
  importPagerDuty(exportPath)
    .then(() => process.exit(0))
    .catch((err) => { console.error('Import failed:', err); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
