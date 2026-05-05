import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getDb } from '../src/utils/database';
import jwt from 'jsonwebtoken';

const app = createApp();
const db = getDb() as any;

function authToken() {
  return jwt.sign({ userId: 'u1', email: 'admin@test.com', role: 'ADMIN' }, process.env.JWT_SECRET!);
}

describe('GET /api/activity-log', () => {
  beforeEach(() => {
    db.activityLog.findMany.mockResolvedValue([
      { id: 'log1', action: 'created', resource: 'incident', resourceId: 'inc1', createdAt: new Date(), user: { id: 'u1', name: 'Admin', email: 'a@b.com' } },
    ]);
    db.activityLog.count.mockResolvedValue(1);
  });

  it('returns activity logs with auth', async () => {
    const res = await request(app)
      .get('/api/activity-log')
      .set('Authorization', `Bearer ${authToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('logs');
    expect(res.body).toHaveProperty('total', 1);
    expect(res.body.logs).toHaveLength(1);
  });

  it('supports limit and offset', async () => {
    db.activityLog.findMany.mockResolvedValue([]);
    db.activityLog.count.mockResolvedValue(0);
    const res = await request(app)
      .get('/api/activity-log?limit=10&offset=5')
      .set('Authorization', `Bearer ${authToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(10);
    expect(res.body.offset).toBe(5);
  });

  it('rejects without auth', async () => {
    const res = await request(app).get('/api/activity-log');
    expect(res.status).toBe(401);
  });
});
