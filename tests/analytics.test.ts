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

describe('GET /api/analytics/summary', () => {
  beforeEach(() => {
    db.incident.count.mockResolvedValue(42);
    db.incident.groupBy.mockResolvedValue([
      { status: 'TRIGGERED', _count: 5 },
      { status: 'ACKNOWLEDGED', _count: 7 },
      { status: 'RESOLVED', _count: 30 },
    ]);
    db.incident.aggregate.mockResolvedValue({ _avg: { number: null } });
    db.incident.findMany.mockResolvedValue([]);
    db.service.findMany.mockResolvedValue([]);
  });

  it('returns analytics summary with auth', async () => {
    const res = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', `Bearer ${authToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('byStatus');
    expect(res.body).toHaveProperty('bySeverity');
    expect(res.body).toHaveProperty('avgAcknowledgeMinutes');
    expect(res.body).toHaveProperty('avgResolveMinutes');
    expect(res.body).toHaveProperty('period', '30d');
  });

  it('rejects without auth', async () => {
    const res = await request(app).get('/api/analytics/summary');
    expect(res.status).toBe(401);
  });
});
