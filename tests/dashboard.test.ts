import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getDb } from '../src/utils/database';

const app = createApp();
const db = getDb() as any;

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /', () => {
    it('should return HTML (not JSON 404)', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
      expect(res.text).toContain('eos-oncallers');
    });
  });

  describe('GET /health', () => {
    it('should return ok status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/dashboard/summary', () => {
    it('should return counts summary', async () => {
      db.service.count.mockResolvedValue(5);
      db.user.count.mockResolvedValue(12);
      db.team.count.mockResolvedValue(3);
      db.schedule.count.mockResolvedValue(4);
      db.escalationPolicy.count.mockResolvedValue(2);
      db.incident.groupBy.mockResolvedValue([
        { status: 'TRIGGERED', _count: 2 },
        { status: 'ACKNOWLEDGED', _count: 1 },
        { status: 'RESOLVED', _count: 10 },
      ]);
      db.serviceIntegration.count.mockResolvedValue(3);
      db.incident.findMany.mockResolvedValue([
        { id: 'inc-1', number: 1, title: 'Test', status: 'TRIGGERED', createdAt: new Date(), service: { id: 's1', name: 'API' } },
      ]);
      db.serviceIntegration.findFirst.mockResolvedValue(null);

      const res = await request(app).get('/api/dashboard/summary');
      expect(res.status).toBe(200);
      expect(res.body.services).toBe(5);
      expect(res.body.users).toBe(12);
      expect(res.body.teams).toBe(3);
      expect(res.body.schedules).toBe(4);
      expect(res.body.escalationPolicies).toBe(2);
      expect(res.body.incidents.triggered).toBe(2);
      expect(res.body.incidents.acknowledged).toBe(1);
      expect(res.body.incidents.resolved).toBe(10);
      expect(res.body.incidents.total).toBe(13);
      expect(res.body.integrations).toBe(3);
      expect(res.body.recentIncidents).toHaveLength(1);
      expect(res.body.environment).toBe('test');
    });

    it('should expose demo integration key in development', async () => {
      process.env.NODE_ENV = 'development';
      db.service.count.mockResolvedValue(1);
      db.user.count.mockResolvedValue(1);
      db.team.count.mockResolvedValue(1);
      db.schedule.count.mockResolvedValue(0);
      db.escalationPolicy.count.mockResolvedValue(0);
      db.incident.groupBy.mockResolvedValue([]);
      db.serviceIntegration.count.mockResolvedValue(1);
      db.incident.findMany.mockResolvedValue([]);
      db.serviceIntegration.findFirst.mockResolvedValue({
        integrationKey: 'test-key-123',
        name: 'Datadog',
        service: { name: 'API' },
      });

      const res = await request(app).get('/api/dashboard/summary');
      expect(res.status).toBe(200);
      expect(res.body.demoIntegrationKey).toBe('test-key-123');

      process.env.NODE_ENV = 'test';
    });

    it('should NOT expose integration key in production', async () => {
      process.env.NODE_ENV = 'production';
      db.service.count.mockResolvedValue(0);
      db.user.count.mockResolvedValue(0);
      db.team.count.mockResolvedValue(0);
      db.schedule.count.mockResolvedValue(0);
      db.escalationPolicy.count.mockResolvedValue(0);
      db.incident.groupBy.mockResolvedValue([]);
      db.serviceIntegration.count.mockResolvedValue(0);
      db.incident.findMany.mockResolvedValue([]);

      const res = await request(app).get('/api/dashboard/summary');
      expect(res.status).toBe(200);
      expect(res.body.demoIntegrationKey).toBeNull();

      process.env.NODE_ENV = 'test';
    });
  });

  describe('GET /api/unknown-route', () => {
    it('should return 404 JSON for unknown API routes', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not found');
    });
  });
});
