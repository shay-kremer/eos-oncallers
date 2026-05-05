import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getDb } from '../utils/database';
import { getConfig } from '../utils/config';
import { hashPassword, verifyPassword } from '../utils/password';
import { authenticate } from '../middleware/auth';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  phone: z.string().optional(),
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  const db = getDb();
  const user = await db.user.findUnique({ where: { email } });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    getConfig().JWT_SECRET,
    { expiresIn: "24h" }
  );

  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  const { email, name, password, phone } = parsed.data;
  const db = getDb();

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await db.user.create({
    data: { email, name, passwordHash, phone },
    select: { id: true, email: true, name: true, role: true },
  });

  res.status(201).json(user);
});

router.get('/me', authenticate, async (req: Request, res: Response) => {
  const db = getDb();
  const user = await db.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, name: true, role: true, phone: true, slackUserId: true },
  });
  res.json(user);
});

export default router;
