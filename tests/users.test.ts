import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getDb } from '../src/utils/database';
import jwt from 'jsonwebtoken';

const app = createApp();
const db = getDb() as any;

const adminToken = jwt.sign({ userId: 'admin-1', email: 'admin@test.com', role: 'ADMIN' }, 'test-secret');

describe('Users API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/users', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(401);
    });

    it('should return users list with teams and contact info', async () => {
      db.user.findMany.mockResolvedValue([
        {
          id: 'u1', email: 'alice@test.com', name: 'Alice', role: 'ADMIN',
          phone: '+1234', slackUserId: 'U123', createdAt: new Date(),
          teamMemberships: [{ team: { id: 't1', name: 'Platform' }, role: 'ADMIN' }],
          notificationRules: [{ method: 'EMAIL' }, { method: 'SMS' }],
        },
        {
          id: 'u2', email: 'bob@test.com', name: 'Bob', role: 'USER',
          phone: null, slackUserId: null, createdAt: new Date(),
          teamMemberships: [],
          notificationRules: [],
        },
      ]);

      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('Alice');
      expect(res.body[0].hasPhone).toBe(true);
      expect(res.body[0].hasSlack).toBe(true);
      expect(res.body[0].teams).toHaveLength(1);
      expect(res.body[0].teams[0].name).toBe('Platform');
      expect(res.body[0].contactMethods).toContain('EMAIL');
      expect(res.body[0].contactMethods).toContain('SMS');
      // Should NOT expose actual phone number
      expect(res.body[0].phone).toBeUndefined();

      expect(res.body[1].name).toBe('Bob');
      expect(res.body[1].hasPhone).toBe(false);
      expect(res.body[1].hasSlack).toBe(false);
      expect(res.body[1].teams).toHaveLength(0);
    });

    it('should support search by name', async () => {
      db.user.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/users?search=alice')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(db.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ name: { contains: 'alice', mode: 'insensitive' } }),
            ]),
          }),
        })
      );
    });

    it('should support filter by role', async () => {
      db.user.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/users?role=ADMIN')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(db.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'ADMIN' }),
        })
      );
    });
  });

  describe('GET /api/users/:id', () => {
    it('should return user with teams and schedules', async () => {
      db.user.findUnique.mockResolvedValue({
        id: 'u1', email: 'alice@test.com', name: 'Alice', role: 'ADMIN',
        phone: '+1234', slackUserId: 'U123', createdAt: new Date(),
        teamMemberships: [{ team: { id: 't1', name: 'Platform' }, role: 'ADMIN' }],
        notificationRules: [{ method: 'EMAIL' }],
        scheduleMembers: [{ schedule: { id: 's1', name: 'Primary' } }],
      });

      const res = await request(app)
        .get('/api/users/u1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Alice');
      expect(res.body.schedules).toHaveLength(1);
      expect(res.body.schedules[0].name).toBe('Primary');
      expect(res.body.phone).toBeUndefined();
    });

    it('should return 404 for unknown user', async () => {
      db.user.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/users/unknown')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });
});
