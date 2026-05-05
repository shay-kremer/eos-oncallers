import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getDb } from '../src/utils/database';
import jwt from 'jsonwebtoken';

const app = createApp();
const db = getDb() as any;

const adminToken = jwt.sign({ userId: 'admin-1', email: 'admin@test.com', role: 'ADMIN' }, 'test-secret');

describe('Schedules API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/schedules', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/schedules');
      expect(res.status).toBe(401);
    });

    it('should return schedules with layers, members, and on-call', async () => {
      const startDate = new Date('2025-01-01');
      db.schedule.findMany.mockResolvedValue([
        {
          id: 's1', name: 'Primary Rotation', description: null,
          timezone: 'America/New_York', createdAt: new Date(),
          layers: [{
            id: 'l1', name: 'Layer 1', priority: 0, rotationType: 'weekly',
            handoffTime: '09:00', handoffDay: 1, startDate, endDate: null,
            members: [
              { user: { id: 'u1', name: 'Alice', email: 'a@t.com' }, position: 0 },
              { user: { id: 'u2', name: 'Bob', email: 'b@t.com' }, position: 1 },
            ],
          }],
          overrides: [],
          members: [{ user: { id: 'u1', name: 'Alice' } }, { user: { id: 'u2', name: 'Bob' } }],
        },
      ]);

      const res = await request(app)
        .get('/api/schedules')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Primary Rotation');
      expect(res.body[0].timezone).toBe('America/New_York');
      expect(res.body[0].layers).toHaveLength(1);
      expect(res.body[0].layers[0].name).toBe('Layer 1');
      expect(res.body[0].layers[0].members).toHaveLength(2);
      expect(res.body[0].currentOnCall).toBeDefined();
      expect(res.body[0].currentOnCall.source).toBe('schedule');
      expect(res.body[0].memberCount).toBe(2);
    });

    it('should handle empty schedules', async () => {
      db.schedule.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/schedules')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should show override user as on-call when active', async () => {
      const now = new Date();
      const startDate = new Date('2025-01-01');
      db.schedule.findMany.mockResolvedValue([
        {
          id: 's1', name: 'Sched', description: null,
          timezone: 'UTC', createdAt: new Date(),
          layers: [{
            id: 'l1', name: 'Layer 1', priority: 0, rotationType: 'weekly',
            handoffTime: '09:00', handoffDay: 1, startDate, endDate: null,
            members: [{ user: { id: 'u1', name: 'Alice', email: 'a@t.com' }, position: 0 }],
          }],
          overrides: [{
            user: { id: 'u3', name: 'Charlie' },
            startTime: new Date(now.getTime() - 3600000),
            endTime: new Date(now.getTime() + 3600000),
          }],
          members: [{ user: { id: 'u1', name: 'Alice' } }],
        },
      ]);

      const res = await request(app)
        .get('/api/schedules')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body[0].currentOnCall.user.name).toBe('Charlie');
      expect(res.body[0].currentOnCall.source).toBe('override');
    });
  });

  describe('GET /api/schedules/:id', () => {
    it('should return 404 for unknown schedule', async () => {
      db.schedule.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/schedules/unknown')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });
});
