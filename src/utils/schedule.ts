import { getDb } from './database';

/**
 * Computes the 0-based rotation index for a schedule layer at a given point in time.
 *
 * @param rotationType - 'daily' rotates every day; anything else rotates every 7 days
 * @param memberCount  - total number of members in the layer
 * @param startDate    - when the layer rotation started
 * @param now          - the reference time (defaults to current time)
 */
export function computeRotationIndex(
  rotationType: string,
  memberCount: number,
  startDate: Date,
  now: Date,
): number {
  const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (rotationType === 'daily') {
    return daysSinceStart % memberCount;
  }
  return Math.floor(daysSinceStart / 7) % memberCount;
}

export interface OncallResolution {
  userId: string;
  source: 'override' | 'schedule';
  layerName?: string;
}

/**
 * Resolves the currently on-call userId for a schedule, respecting overrides.
 * Returns null if no schedule, no layers, or no members.
 */
export async function resolveScheduleOncall(scheduleId: string): Promise<OncallResolution | null> {
  const db = getDb();
  const now = new Date();

  const override = await db.scheduleOverride.findFirst({
    where: { scheduleId, startTime: { lte: now }, endTime: { gte: now } },
  });
  if (override) return { userId: override.userId, source: 'override' };

  const schedule = await db.schedule.findUnique({
    where: { id: scheduleId },
    include: { layers: { include: { members: { orderBy: { position: 'asc' } } }, orderBy: { priority: 'desc' } } },
  });

  if (!schedule || schedule.layers.length === 0) return null;
  const topLayer = schedule.layers[0];
  if (topLayer.members.length === 0) return null;

  const rotationIndex = computeRotationIndex(topLayer.rotationType, topLayer.members.length, topLayer.startDate, now);
  return { userId: topLayer.members[rotationIndex].userId, source: 'schedule', layerName: topLayer.name };
}
