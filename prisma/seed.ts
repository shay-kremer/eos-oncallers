import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

function generatePassword(): string {
  return crypto.randomBytes(12).toString('base64url').slice(0, 16);
}

async function main() {
  console.log('Seeding database...');

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@oncall.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || generatePassword();
  const userPassword = process.env.SEED_USER_PASSWORD || generatePassword();
  const adminHash = await bcrypt.hash(adminPassword, 12);
  const userHash = await bcrypt.hash(userPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, name: 'Admin User', passwordHash: adminHash, role: 'ADMIN', phone: '+1234567890' },
  });

  const leader = await prisma.user.upsert({
    where: { email: 'leader@oncall.local' },
    update: {},
    create: { email: 'leader@oncall.local', name: 'Team Leader', passwordHash: userHash, role: 'GROUP_LEADER', phone: '+1234567891' },
  });

  const engineer1 = await prisma.user.upsert({
    where: { email: 'alice@oncall.local' },
    update: {},
    create: { email: 'alice@oncall.local', name: 'Alice Engineer', passwordHash: userHash, role: 'USER', phone: '+1234567892' },
  });

  const engineer2 = await prisma.user.upsert({
    where: { email: 'bob@oncall.local' },
    update: {},
    create: { email: 'bob@oncall.local', name: 'Bob Engineer', passwordHash: userHash, role: 'USER', phone: '+1234567893' },
  });

  const team = await prisma.team.upsert({
    where: { name: 'Platform Team' },
    update: {},
    create: { name: 'Platform Team', description: 'Core platform engineering' },
  });

  await prisma.teamMember.createMany({
    data: [
      { teamId: team.id, userId: admin.id, role: 'ADMIN' },
      { teamId: team.id, userId: leader.id, role: 'GROUP_LEADER' },
      { teamId: team.id, userId: engineer1.id, role: 'USER' },
      { teamId: team.id, userId: engineer2.id, role: 'USER' },
    ],
    skipDuplicates: true,
  });

  const policy = await prisma.escalationPolicy.upsert({
    where: { name: 'Default Policy' },
    update: {},
    create: {
      name: 'Default Policy',
      description: 'Default escalation: engineer -> leader -> admin',
      repeatCount: 3,
    },
  });

  const level1 = await prisma.escalationLevel.upsert({
    where: { escalationPolicyId_level: { escalationPolicyId: policy.id, level: 1 } },
    update: {},
    create: { escalationPolicyId: policy.id, level: 1, delayMinutes: 5 },
  });

  const level2 = await prisma.escalationLevel.upsert({
    where: { escalationPolicyId_level: { escalationPolicyId: policy.id, level: 2 } },
    update: {},
    create: { escalationPolicyId: policy.id, level: 2, delayMinutes: 15 },
  });

  const level3 = await prisma.escalationLevel.upsert({
    where: { escalationPolicyId_level: { escalationPolicyId: policy.id, level: 3 } },
    update: {},
    create: { escalationPolicyId: policy.id, level: 3, delayMinutes: 30 },
  });

  await prisma.escalationTarget.createMany({
    data: [
      { escalationLevelId: level1.id, targetType: 'USER', targetId: engineer1.id },
      { escalationLevelId: level2.id, targetType: 'USER', targetId: leader.id },
      { escalationLevelId: level3.id, targetType: 'USER', targetId: admin.id },
    ],
    skipDuplicates: true,
  });

  const service = await prisma.service.upsert({
    where: { name: 'API Gateway' },
    update: {},
    create: { name: 'API Gateway', description: 'Main API service', teamId: team.id, escalationPolicyId: policy.id },
  });

  await prisma.serviceIntegration.upsert({
    where: { integrationKey: 'demo-integration-key-001' },
    update: {},
    create: { serviceId: service.id, type: 'events_api', name: 'Events API v2', integrationKey: 'demo-integration-key-001' },
  });

  const schedule = await prisma.schedule.upsert({
    where: { name: 'Primary On-Call' },
    update: {},
    create: { name: 'Primary On-Call', description: 'Weekly rotation', timezone: 'America/New_York' },
  });

  const layer = await prisma.scheduleLayer.upsert({
    where: { scheduleId_priority: { scheduleId: schedule.id, priority: 0 } },
    update: {},
    create: { scheduleId: schedule.id, name: 'Primary Layer', priority: 0, rotationType: 'weekly', handoffTime: '09:00', handoffDay: 1, startDate: new Date('2024-01-01') },
  });

  await prisma.scheduleMember.createMany({
    data: [
      { userId: engineer1.id, scheduleId: schedule.id, layerId: layer.id, position: 0 },
      { userId: engineer2.id, scheduleId: schedule.id, layerId: layer.id, position: 1 },
    ],
    skipDuplicates: true,
  });

  await prisma.notificationRule.createMany({
    data: [
      { userId: engineer1.id, method: 'SLACK', contactDetail: '#oncall-alerts', delayMinutes: 0 },
      { userId: engineer1.id, method: 'SMS', contactDetail: '+1234567892', delayMinutes: 5 },
      { userId: engineer2.id, method: 'SLACK', contactDetail: '#oncall-alerts', delayMinutes: 0 },
      { userId: leader.id, method: 'PHONE', contactDetail: '+1234567891', delayMinutes: 0, urgency: 'HIGH' },
    ],
    skipDuplicates: true,
  });

  const statusPage = await prisma.statusPage.upsert({
    where: { url: 'https://status.example.com' },
    update: {},
    create: { name: 'External Status', url: 'https://status.example.com' },
  });

  await prisma.statusPageComponent.createMany({
    data: [
      { statusPageId: statusPage.id, name: 'API' },
      { statusPageId: statusPage.id, name: 'Dashboard' },
      { statusPageId: statusPage.id, name: 'Database' },
    ],
    skipDuplicates: true,
  });

  console.log('Seed complete!');
  console.log(`  Admin: ${adminEmail} / ${adminPassword}`);
  console.log(`  Leader: leader@oncall.local / ${userPassword}`);
  console.log(`  Engineers: alice@oncall.local, bob@oncall.local / ${userPassword}`);
  console.log(`  Integration key: demo-integration-key-001`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
