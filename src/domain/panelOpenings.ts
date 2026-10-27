import ClipperLib from 'clipper-lib';
import type { DesignSettings, Point, Region } from './project.ts';
import type { Layout } from './layout.ts';
import { panelIntegrated } from './recipes.ts';
const C = ClipperLib as any,
  SCALE = 1000;
const paths = (regions: Region[]) =>
  regions.flatMap((r) =>
    [r.outer, ...r.holes].map((loop, i) => {
      const p = loop.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
      if (C.Clipper.Orientation(p) !== (i === 0)) p.reverse();
      return p;
    }),
  );
const regionsFromTree = (tree: any): Region[] => {
  const out: Region[] = [];
  const loop = (p: any[]): Point[] => p.map((p) => [p.X / SCALE, p.Y / SCALE]);
  const visit = (n: any) => {
    for (const c of n.Childs()) {
      if (!c.IsHole())
        out.push({
          outer: loop(c.Contour()),
          holes: c
            .Childs()
            .filter((h: any) => h.IsHole())
            .map((h: any) => loop(h.Contour())),
        });
      visit(c);
    }
  };
  visit(tree);
  return out;
};
export function expandRegions(regions: Region[], mm: number) {
  const o = new C.ClipperOffset(2, 0.02 * SCALE);
  o.AddPaths(paths(regions), C.JoinType.jtMiter, C.EndType.etClosedPolygon);
  const tree = new C.PolyTree();
  o.Execute(tree, mm * SCALE);
  return regionsFromTree(tree);
}
export function fasciaRegions(
  layout: Layout,
  s: Pick<DesignSettings, 'width' | 'height'>,
): Region[] {
  const outer: Region = {
    outer: [
      [-s.width / 2, -s.height / 2],
      [s.width / 2, -s.height / 2],
      [s.width / 2, s.height / 2],
      [-s.width / 2, s.height / 2],
    ],
    holes: [],
  };
  const cutouts = layout.elements.filter((e) => panelIntegrated(e.type)).flatMap((e) => e.regions);
  if (!cutouts.length) return [outer];
  const c = new C.Clipper();
  c.AddPaths(paths([outer]), C.PolyType.ptSubject, true);
  c.AddPaths(paths(cutouts), C.PolyType.ptClip, true);
  const tree = new C.PolyTree();
  c.Execute(C.ClipType.ctDifference, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return regionsFromTree(tree);
}
