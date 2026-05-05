import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getDb } from '../src/utils/database';

const app = createApp();
const db = getDb() as any;

describe('Webhooks API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/webhooks/events', () => {
    it('should trigger an incident via routing key', async () => {
      db.serviceIntegration.findUnique.mockResolvedValue({
        integrationKey: 'test-key', serviceId: 'svc-1', enabled: true, service: { id: 'svc-1', name: 'Test' },
      });
      db.incident.findUnique.mockResolvedValue(null);
      db.incident.create.mockResolvedValue({ id: 'inc-1', title: 'Test Alert', serviceId: 'svc-1' });
      db.alert.create.mockResolvedValue({});
      db.incidentTimeline.create.mockResolvedValue({});

      const res = await request(app)
        .post('/api/webhooks/events')
        .send({
          routing_key: 'test-key',
          event_action: 'trigger',
          payload: { summary: 'Test Alert', severity: 'ERROR' },
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('triggered');
    });

    it('should reject invalid routing key', async () => {
      db.serviceIntegration.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/webhooks/events')
        .send({
          routing_key: 'invalid-key',
          event_action: 'trigger',
          payload: { summary: 'Alert' },
        });

      expect(res.status).toBe(404);
    });

    it('should deduplicate events', async () => {
      db.serviceIntegration.findUnique.mockResolvedValue({
        integrationKey: 'test-key', serviceId: 'svc-1', enabled: true, service: { id: 'svc-1' },
      });
      db.incident.findUnique.mockResolvedValue({ id: 'existing', status: 'TRIGGERED' });
      db.alert.create.mockResolvedValue({});

      const res = await request(app)
        .post('/api/webhooks/events')
        .send({
          routing_key: 'test-key',
          event_action: 'trigger',
          dedup_key: 'dedup-1',
          payload: { summary: 'Dup Alert' },
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('deduplicated');
    });

    it('should acknowledge via dedup key', async () => {
      db.serviceIntegration.findUnique.mockResolvedValue({
        integrationKey: 'test-key', serviceId: 'svc-1', enabled: true, service: { id: 'svc-1' },
      });
      db.incident.findUnique.mockResolvedValue({ id: 'inc-1', status: 'TRIGGERED' });
      db.incident.update.mockResolvedValue({ id: 'inc-1', status: 'ACKNOWLEDGED' });

      const res = await request(app)
        .post('/api/webhooks/events')
        .send({
          routing_key: 'test-key',
          event_action: 'acknowledge',
          dedup_key: 'dedup-1',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('acknowledged');
    });
  });
});
