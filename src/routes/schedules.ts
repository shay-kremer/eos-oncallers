import { Router, Request, Response } from "express";
import { z } from "zod";
import { getDb } from "../utils/database";
import { authenticate, authorize } from "../middleware/auth";
import { computeRotationIndex } from "../utils/schedule";

const router = Router();
router.use(authenticate);

const createScheduleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  timezone: z.string().default("UTC"),
});

const createLayerSchema = z.object({
  name: z.string().min(1),
  priority: z.number().int().min(0),
  rotationType: z.enum(["daily", "weekly", "custom"]).default("weekly"),
  handoffTime: z.string().default("09:00"),
  handoffDay: z.number().int().min(0).max(6).optional(),
  startDate: z.string().transform(s => new Date(s)),
  endDate: z.string().transform(s => new Date(s)).optional(),
  members: z.array(z.string().uuid()).min(1),
});

const createOverrideSchema = z.object({
  userId: z.string().uuid(),
  startTime: z.string().transform(s => new Date(s)),
  endTime: z.string().transform(s => new Date(s)),
  reason: z.string().optional(),
});

function computeOnCall(schedule: any, now: Date): { user: { id: string; name: string } | null; source: string; layer?: string } {
  if (!schedule.layers || schedule.layers.length === 0) {
    return { user: null, source: "none" };
  }
  if (schedule.overrides && schedule.overrides.length > 0) {
    const activeOverride = schedule.overrides.find(
      (o: any) => new Date(o.startTime) <= now && new Date(o.endTime) >= now
    );
    if (activeOverride) {
      return { user: activeOverride.user, source: "override" };
    }
  }
  const topLayer = schedule.layers[0];
  if (!topLayer.members || topLayer.members.length === 0) {
    return { user: null, source: "none" };
  }
  const rotationIndex = computeRotationIndex(topLayer.rotationType, topLayer.members.length, new Date(topLayer.startDate), now);
  const currentMember = topLayer.members[rotationIndex];
  return {
    user: { id: currentMember.user.id, name: currentMember.user.name },
    source: "schedule",
    layer: topLayer.name,
  };
}

router.get("/", async (_req: Request, res: Response) => {
  const db = getDb();
  const now = new Date();
  const schedules = await db.schedule.findMany({
    include: {
      layers: {
        include: { members: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { position: "asc" } } },
        orderBy: { priority: "desc" },
      },
      overrides: {
        where: { startTime: { lte: now }, endTime: { gte: now } },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { startTime: "desc" },
      },
      members: { include: { user: { select: { id: true, name: true } } } },
    },
    orderBy: { name: "asc" },
  });
  const result = schedules.map((s: any) => ({
    id: s.id, name: s.name, description: s.description, timezone: s.timezone, createdAt: s.createdAt,
    layers: s.layers.map((l: any) => ({
      id: l.id, name: l.name, priority: l.priority, rotationType: l.rotationType,
      handoffTime: l.handoffTime, handoffDay: l.handoffDay, startDate: l.startDate, endDate: l.endDate,
      members: l.members.map((m: any) => ({ id: m.user.id, name: m.user.name, position: m.position })),
    })),
    currentOnCall: computeOnCall(s, now),
    memberCount: s.members.length,
  }));
  res.json(result);
});

router.get("/:id", async (req: Request, res: Response) => {
  const db = getDb();
  const id = req.params.id as string;
  const now = new Date();
  const schedule = await db.schedule.findUnique({
    where: { id },
    include: {
      layers: {
        include: { members: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { position: "asc" } } },
        orderBy: { priority: "desc" },
      },
      overrides: {
        include: { user: { select: { id: true, name: true } } },
        where: { endTime: { gte: now } },
        orderBy: { startTime: "asc" },
      },
    },
  });
  if (!schedule) { res.status(404).json({ error: "Schedule not found" }); return; }
  res.json({ ...schedule, currentOnCall: computeOnCall(schedule, now) });
});

router.post("/", authorize("ADMIN", "GROUP_LEADER"), async (req: Request, res: Response) => {
  const parsed = createScheduleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }
  const db = getDb();
  const schedule = await db.schedule.create({ data: parsed.data });
  res.status(201).json(schedule);
});

router.post("/:id/layers", authorize("ADMIN", "GROUP_LEADER"), async (req: Request, res: Response) => {
  const parsed = createLayerSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }
  const db = getDb();
  const scheduleId = req.params.id as string;
  const { members, ...layerData } = parsed.data;
  const layer = await db.scheduleLayer.create({ data: { ...layerData, scheduleId } });
  await Promise.all(members.map((userId: string, idx: number) =>
    db.scheduleMember.create({ data: { userId, scheduleId, layerId: layer.id, position: idx } })
  ));
  const result = await db.scheduleLayer.findUnique({
    where: { id: layer.id },
    include: { members: { include: { user: { select: { id: true, name: true } } } } },
  });
  res.status(201).json(result);
});

router.post("/:id/overrides", authenticate, async (req: Request, res: Response) => {
  const parsed = createOverrideSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }
  const db = getDb();
  const scheduleId = req.params.id as string;
  const override = await db.scheduleOverride.create({
    data: { ...parsed.data, scheduleId },
    include: { user: { select: { id: true, name: true } } },
  });
  res.status(201).json(override);
});

router.get("/:id/oncall", async (req: Request, res: Response) => {
  const db = getDb();
  const scheduleId = req.params.id as string;
  const now = new Date();
  const override = await db.scheduleOverride.findFirst({
    where: { scheduleId, startTime: { lte: now }, endTime: { gte: now } },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { startTime: "desc" },
  });
  if (override) { res.json({ oncall: override.user, source: "override" }); return; }
  const schedule = await db.schedule.findUnique({
    where: { id: scheduleId },
    include: { layers: { include: { members: { include: { user: true }, orderBy: { position: "asc" } } }, orderBy: { priority: "desc" } } },
  });
  if (!schedule || schedule.layers.length === 0) { res.json({ oncall: null, source: "none" }); return; }
  const topLayer = schedule.layers[0];
  if (topLayer.members.length === 0) { res.json({ oncall: null, source: "none" }); return; }
  const rotationIndex = computeRotationIndex(topLayer.rotationType, topLayer.members.length, topLayer.startDate, now);
  const currentMember = topLayer.members[rotationIndex];
  res.json({ oncall: { id: currentMember.user.id, name: currentMember.user.name, email: currentMember.user.email }, source: "schedule", layer: topLayer.name });
});

export default router;
