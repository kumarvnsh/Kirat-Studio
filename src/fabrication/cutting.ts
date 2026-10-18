// Cutting: tool-compensated paths and manufacturability checks. The approved outline is never
// changed; compensated paths are derived on demand.
import ClipperLib from 'clipper-lib';
import { area } from '../artwork/contours.js';
import type { Point, Region } from '../domain/project.ts';

const C = ClipperLib as any;
const S = 1000; // Clipper works in integers: µm

const toPath = (loop: Point[]) => loop.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
const fromPath = (p: any[]): Point[] => p.map((v) => [v.X / S, v.Y / S]);

// Offset a region (outer + holes) by delta mm: positive grows the part (outer out, holes in).
export function offsetRegion(r: Region, delta: number, round = true): Region[] {
  const paths = [r.outer, ...r.holes].map((loop, i) => {
    const p = toPath(loop);
    if (C.Clipper.Orientation(p) !== (i === 0)) p.reverse(); // outer positive, holes negative
    return p;
  });
  const o = new C.ClipperOffset(2, 0.05 * S);
  o.AddPaths(paths, round ? C.JoinType.jtRound : C.JoinType.jtMiter, C.EndType.etClosedPolygon);
  const tree = new C.PolyTree();
  o.Execute(tree, delta * S);
  const out: Region[] = [];
  const visit = (node: any) => {
    for (const n of node.Childs()) {
      if (!n.IsHole())
        out.push({
          outer: fromPath(n.Contour()),
          holes: n
            .Childs()
            .filter((h: any) => h.IsHole())
            .map((h: any) => fromPath(h.Contour())),
        });
      visit(n);
    }
  };
  visit(tree);
  return out;
}

const regionArea = (rs: Region[]) =>
  rs.reduce((n, r) => n + Math.abs(area(r.outer)) - r.holes.reduce((m, h) => m + Math.abs(area(h)), 0), 0);

export type CutMethod = 'router' | 'laser';
export type CutSettings = { method: CutMethod; toolDiameter: number; kerf: number; minStroke: number };
export const defaultCut: CutSettings = { method: 'router', toolDiameter: 6, kerf: 0.2, minStroke: 3 };

// Distance from the part edge to the tool centre (router) or beam centre (laser).
export const compensation = (c: CutSettings) => (c.method === 'router' ? c.toolDiameter / 2 : c.kerf / 2);

// Tool-centre path for one region.
export const toolpath = (r: Region, c: CutSettings) => offsetRegion(r, compensation(c));

export type CutIssue = { kind: 'counter-lost' | 'counter-corners' | 'narrow'; message: string };

export function cutChecks(r: Region, c: CutSettings): CutIssue[] {
  const issues: CutIssue[] = [],
    rad = compensation(c);
  // Counters: the tool works inside each hole. If it can't fit, the hole is lost; if it loses area,
  // the hole's corners or slots are tighter than the tool.
  r.holes.forEach((h, i) => {
    const hole: Region = { outer: h, holes: [] },
      inner = offsetRegion(hole, -rad);
    if (!inner.length)
      issues.push({
        kind: 'counter-lost',
        message: `Counter ${i + 1} is too small for a ${c.method === 'router' ? `Ø${c.toolDiameter} mm tool` : 'kerf'}.`,
      });
    else {
      const loss = 1 - regionArea(offsetRegion(inner[0], rad)) / Math.abs(area(h));
      if (loss > 0.03)
        issues.push({
          kind: 'counter-corners',
          message: `Counter ${i + 1}: ${(loss * 100).toFixed(0)}% of its area is in corners or slots the tool can't reach (radius ${rad} mm).`,
        });
    }
  });
  // Strokes: opening the part by minStroke/2 removes features thinner than minStroke.
  const opened = offsetRegion(r, -c.minStroke / 2).flatMap((x) => offsetRegion(x, c.minStroke / 2)),
    loss = 1 - regionArea(opened) / regionArea([r]);
  if (loss > 0.02)
    issues.push({
      kind: 'narrow',
      message: `${(loss * 100).toFixed(0)}% of the outline is narrower than ${c.minStroke} mm: fragile or lost when cut.`,
    });
  return issues;
}
