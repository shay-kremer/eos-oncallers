import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getDb } from '../src/utils/database';
import jwt from 'jsonwebtoken';

const app = createApp();
const db = getDb() as any;

const adminToken = jwt.sign({ userId: 'admin-1', email: 'admin@test.com', role: 'ADMIN' }, 'test-secret');

describe('Incidents API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/incidents', () => {
    it('should list incidents', async () => {
      db.incident.findMany.mockResolvedValue([
        { id: 'inc-1', title: 'Test Incident', status: 'TRIGGERED', service: { id: 's-1', name: 'API' }, assignments: [] },
      ]);

      const res = await request(app)
        .get('/api/incidents')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Test Incident');
    });

    it('should reject unauthenticated', async () => {
      const res = await request(app).get('/api/incidents');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/incidents', () => {
    it('should create an incident', async () => {
      db.incident.create.mockResolvedValue({
        id: 'inc-new', title: 'New Alert', status: 'TRIGGERED', serviceId: 's-1',
      });
      db.incidentTimeline.create.mockResolvedValue({});

      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'New Alert', serviceId: '00000000-0000-0000-0000-000000000001' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('New Alert');
    });

    it('should deduplicate incidents', async () => {
      db.incident.findUnique.mockResolvedValue({ id: 'existing', status: 'TRIGGERED', dedupKey: 'dup-1' });

      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Dup Alert', serviceId: '00000000-0000-0000-0000-000000000001', dedupKey: 'dup-1' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('existing');
    });
  });

  describe('POST /api/incidents/:id/acknowledge', () => {
    it('should acknowledge an incident', async () => {
      db.incident.findUnique.mockResolvedValue({ id: 'inc-1', status: 'TRIGGERED' });
      db.incident.update.mockResolvedValue({ id: 'inc-1', status: 'ACKNOWLEDGED' });
      db.incidentTimeline.create.mockResolvedValue({});

      const res = await request(app)
        .post('/api/incidents/inc-1/acknowledge')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ACKNOWLEDGED');
    });

    it('should not acknowledge resolved incident', async () => {
      db.incident.findUnique.mockResolvedValue({ id: 'inc-1', status: 'RESOLVED' });

      const res = await request(app)
        .post('/api/incidents/inc-1/acknowledge')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/incidents/:id/resolve', () => {
    it('should resolve an incident', async () => {
      db.incident.findUnique.mockResolvedValue({ id: 'inc-1', status: 'ACKNOWLEDGED' });
      db.incident.update.mockResolvedValue({ id: 'inc-1', status: 'RESOLVED' });
      db.incidentTimeline.create.mockResolvedValue({});

      const res = await request(app)
        .post('/api/incidents/inc-1/resolve')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('RESOLVED');
    });
  });
});
