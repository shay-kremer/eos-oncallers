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
