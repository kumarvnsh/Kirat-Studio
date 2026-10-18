// Return-strip bend schedules. Geometric only: no bend allowance, springback, notching or machine
// calibration. A schedule is a preview for planning, not a machine program.
import { area } from '../artwork/contours.js';
import type { Point } from '../domain/project.ts';

export type BendDirection = 'convex' | 'concave'; // as seen from outside the letter
export type Station = { at: number; angle: number; direction: BendDirection }; // mm from seam, degrees
export type Segment =
  | { kind: 'straight'; from: number; to: number }
  | { kind: 'corner'; at: number; angle: number; direction: BendDirection }
  | { kind: 'curve'; from: number; to: number; angle: number; radius: number; direction: BendDirection };

export type StripSchedule = {
  contour: 'outer' | 'inner';
  length: number; // developed length along the contour, mm
  cutLength: number; // length + joint overlap
  height: number; // return depth, mm
  seam: Point; // where the strip starts and closes
  stations: Station[];
  segments: Segment[];
};

export type BendOptions = { minAngle: number; curveSpacing: number; cornerAngle: number; overlap: number };
export const defaultBendOptions: BendOptions = {
  minAngle: 2, // turns are accumulated until they reach this angle, then bent
  curveSpacing: 40, // bends closer than this (mm) and below cornerAngle form a curve
  cornerAngle: 30,
  overlap: 10, // joint overlap added to the cut length
};

const deg = (r: number) => (r * 180) / Math.PI;

// Material is kept on the left of travel: outer contours run counter-clockwise (y up), inner ones clockwise.
export function bendSchedule(
  loop: Point[],
  contour: 'outer' | 'inner',
  height: number,
  o: BendOptions = defaultBendOptions,
): StripSchedule {
  let pts = loop.slice();
  const ccw = area(pts) > 0;
  if ((contour === 'outer') !== ccw) pts.reverse();
  const n = pts.length,
    len = (i: number) => Math.hypot(pts[(i + 1) % n][0] - pts[i][0], pts[(i + 1) % n][1] - pts[i][1]);
  // Seam: middle of the longest edge, a straight run that is easiest to join.
  let k = 0;
  for (let i = 1; i < n; i++) if (len(i) > len(k)) k = i;
  const a = pts[k],
    b = pts[(k + 1) % n],
    seam: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // Walk from the seam: vertices k+1 .. k+n (wrapping), measuring distance and turn at each vertex.
  const stations: Station[] = [];
  let at = len(k) / 2,
    pending = 0;
  for (let j = 1; j <= n; j++) {
    const i = (k + j) % n,
      p = pts[(i - 1 + n) % n],
      q = pts[i],
      r = pts[(i + 1) % n];
    const turn = deg(
      Math.atan2(
        (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]),
        (q[0] - p[0]) * (r[0] - q[0]) + (q[1] - p[1]) * (r[1] - q[1]),
      ),
    );
    // Accumulate small turns so smooth curves keep their full angle; bend once the sum is large enough.
    pending += turn;
    if (Math.abs(pending) >= o.minAngle) {
      stations.push({ at, angle: Math.abs(pending), direction: pending > 0 ? 'convex' : 'concave' });
      pending = 0;
    }
    at += j === n ? len(i) / 2 : len(i);
  }
  const length = at;
  return {
    contour,
    length,
    cutLength: length + o.overlap,
    height,
    seam,
    stations,
    segments: segments(stations, length, o),
  };
}

// Group stations: isolated or sharp bends are corners; runs of small, close, same-direction bends are curves.
function segments(stations: Station[], length: number, o: BendOptions): Segment[] {
  const out: Segment[] = [];
  let pos = 0,
    i = 0;
  const straightTo = (to: number) => {
    if (to - pos > 0.05) out.push({ kind: 'straight', from: pos, to });
  };
  while (i < stations.length) {
    const s = stations[i];
    let j = i;
    if (s.angle < o.cornerAngle)
      while (
        j + 1 < stations.length &&
        stations[j + 1].angle < o.cornerAngle &&
        stations[j + 1].direction === s.direction &&
        stations[j + 1].at - stations[j].at <= o.curveSpacing
      )
        j++;
    straightTo(s.at);
    if (j > i) {
      const run = stations.slice(i, j + 1),
        angle = run.reduce((n, x) => n + x.angle, 0),
        span = run[run.length - 1].at - run[0].at;
      // Arc through the run: span covers (count - 1) of count equal turns.
      const radius = span / (((angle * (run.length - 1)) / run.length) * (Math.PI / 180));
      out.push({
        kind: 'curve',
        from: s.at,
        to: run[run.length - 1].at,
        angle,
        radius,
        direction: s.direction,
      });
      pos = run[run.length - 1].at;
    } else {
      out.push({ kind: 'corner', at: s.at, angle: s.angle, direction: s.direction });
      pos = s.at;
    }
    i = j + 1;
  }
  straightTo(length);
  return out;
}
