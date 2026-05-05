import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getDb } from '../src/utils/database';
import jwt from 'jsonwebtoken';

const app = createApp();
const db = getDb() as any;

describe('Auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      db.user.findUnique.mockResolvedValue(null);
      db.user.create.mockResolvedValue({
        id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'USER',
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', name: 'Test User', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe('test@example.com');
      expect(res.body.role).toBe('USER');
    });

    it('should reject invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'invalid', name: 'Test', password: 'password123' });

      expect(res.status).toBe(400);
    });

    it('should reject short password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', name: 'Test', password: 'short' });

      expect(res.status).toBe(400);
    });

    it('should reject duplicate email', async () => {
      db.user.findUnique.mockResolvedValue({ id: 'existing' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', name: 'Test', password: 'password123' });

      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should reject invalid credentials', async () => {
      db.user.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('should return user profile with valid token', async () => {
      const token = jwt.sign({ userId: 'user-1', email: 'test@test.com', role: 'USER' }, 'test-secret');
      db.user.findUnique.mockResolvedValue({
        id: 'user-1', email: 'test@test.com', name: 'Test', role: 'USER', phone: null, slackUserId: null,
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('test@test.com');
    });
  });
});

describe('Health Check', () => {
  it('should return 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
