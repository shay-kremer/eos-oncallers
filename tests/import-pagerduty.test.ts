import { describe, it, expect } from 'vitest';
import { mapPdRole, mapRotationType, PdExport } from '../src/scripts/import-pagerduty';
import * as fs from 'fs';
import * as path from 'path';

describe('PagerDuty Import - Unit Tests', () => {
  describe('mapPdRole', () => {
    it('maps admin and owner to ADMIN', () => {
      expect(mapPdRole('admin')).toBe('ADMIN');
      expect(mapPdRole('owner')).toBe('ADMIN');
    });

    it('maps manager to GROUP_LEADER', () => {
      expect(mapPdRole('manager')).toBe('GROUP_LEADER');
    });

    it('maps other roles to USER', () => {
      expect(mapPdRole('limited_user')).toBe('USER');
      expect(mapPdRole('user')).toBe('USER');
      expect(mapPdRole('read_only_user')).toBe('USER');
      expect(mapPdRole('')).toBe('USER');
    });
  });

  describe('mapRotationType', () => {
    it('maps <= 1 day to daily', () => {
      expect(mapRotationType(86400)).toBe('daily');
      expect(mapRotationType(43200)).toBe('daily');
    });

    it('maps > 1 day to weekly', () => {
      expect(mapRotationType(604800)).toBe('weekly');
      expect(mapRotationType(172800)).toBe('weekly');
    });
  });

  describe('Export file validation', () => {
    const exportPath = path.resolve(__dirname, '../data/pagerduty-export.json');

    it('export file exists and is valid JSON', () => {
      expect(fs.existsSync(exportPath)).toBe(true);
      const raw = fs.readFileSync(exportPath, 'utf-8');
      const data: PdExport = JSON.parse(raw);
      expect(data.exported_at).toBeDefined();
      expect(data.source).toContain('PagerDuty');
    });

    it('export contains expected sections', () => {
      const data: PdExport = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
      expect(data.users).toBeInstanceOf(Array);
      expect(data.teams).toBeInstanceOf(Array);
      expect(data.services).toBeInstanceOf(Array);
      expect(data.schedules).toBeInstanceOf(Array);
      expect(data.escalation_policies).toBeInstanceOf(Array);
    });

    it('users have required fields', () => {
      const data: PdExport = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
      for (const user of data.users) {
        expect(user.id).toBeDefined();
        expect(user.name).toBeDefined();
        expect(user.email).toBeDefined();
        expect(user.email).toContain('@');
      }
    });

    it('services have required fields', () => {
      const data: PdExport = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
      for (const service of data.services) {
        expect(service.id).toBeDefined();
        expect(service.name).toBeDefined();
        expect(service.status).toBeDefined();
      }
    });

    it('escalation policies have rules with targets', () => {
      const data: PdExport = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
      const withRules = data.escalation_policies.filter(p => p.escalation_rules.length > 0);
      expect(withRules.length).toBeGreaterThan(0);
      for (const policy of withRules) {
        for (const rule of policy.escalation_rules) {
          expect(rule.escalation_delay_in_minutes).toBeGreaterThanOrEqual(0);
          expect(rule.targets.length).toBeGreaterThan(0);
        }
      }
    });

    it('counts match actual array lengths', () => {
      const data: PdExport = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
      expect(data.counts.users).toBe(data.users.length);
      expect(data.counts.services).toBe(data.services.length);
      expect(data.counts.schedules).toBe(data.schedules.length);
      expect(data.counts.escalation_policies).toBe(data.escalation_policies.length);
      expect(data.counts.teams).toBe(data.teams.length);
    });

    it('no secrets or phone numbers in export', () => {
      const raw = fs.readFileSync(exportPath, 'utf-8');
      // Should not contain phone patterns (we stripped them)
      expect(raw).not.toMatch(/\+\d{10,}/);
      // Should not contain API keys
      expect(raw).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
      expect(raw).not.toMatch(/Bearer\s+[a-zA-Z0-9]/);
    });
  });
});
