import type { Region } from '../domain/project.ts';

// Match fabricationPlan's outer-then-counters order without changing the contours.
export function returnContours(regions: Region[], stripIndex?: number) {
  const loops = regions.flatMap(region => [region.outer, ...region.holes]);
  if (stripIndex === undefined) return loops;
  return Number.isInteger(stripIndex) && stripIndex >= 0 && loops[stripIndex] ? [loops[stripIndex]] : [];
}
