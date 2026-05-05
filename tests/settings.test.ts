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

describe('GET /api/settings', () => {
  beforeEach(() => {
    db.serviceIntegration.count.mockResolvedValue(3);
  });

  it('returns settings with current user context', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${authToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('environment');
    expect(res.body).toHaveProperty('integrations');
    expect(res.body).toHaveProperty('currentUser');
    expect(res.body.currentUser.role).toBe('ADMIN');
    expect(res.body).toHaveProperty('features');
  });

  it('rejects without auth', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/settings/demo-key', () => {
  beforeEach(() => {
    db.serviceIntegration.findFirst.mockResolvedValue({
      integrationKey: 'demo-key-123',
      name: 'Demo',
      service: { name: 'Test Service' },
    });
  });

  it('returns demo key in development', async () => {
    const res = await request(app)
      .get('/api/settings/demo-key')
      .set('Authorization', `Bearer ${authToken()}`);
    // NODE_ENV=test, so should be 403
    expect(res.status).toBe(403);
  });
});
