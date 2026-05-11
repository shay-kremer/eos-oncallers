import { vi } from 'vitest';

vi.mock('../src/utils/database', () => {
  const mockPrisma = {
    user: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    team: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    teamMember: { create: vi.fn(), deleteMany: vi.fn() },
    service: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    incident: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), groupBy: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    incidentAssignment: { upsert: vi.fn() },
    incidentTimeline: { create: vi.fn() },
    alert: { create: vi.fn() },
    alertRule: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    schedule: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), count: vi.fn() },
    scheduleLayer: { create: vi.fn(), findUnique: vi.fn() },
    scheduleMember: { create: vi.fn() },
    scheduleOverride: { create: vi.fn(), findFirst: vi.fn() },
    escalationPolicy: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), count: vi.fn() },
    notificationRule: { findMany: vi.fn() },
    serviceIntegration: { findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    statusPage: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    statusPageComponent: { create: vi.fn(), update: vi.fn() },
    statusPageSubscription: { upsert: vi.fn() },
    activityLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  };
  return { getDb: () => mockPrisma, disconnectDb: vi.fn() };
});

vi.mock('../src/services/notification', () => ({
  notifyIncident: vi.fn(),
  escalateIncident: vi.fn(),
}));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-minimum-16chars';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
