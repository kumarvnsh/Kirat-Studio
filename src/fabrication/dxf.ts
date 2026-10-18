// DXF export (maker.js). Millimetres, parts at their positions on the sign (no nesting yet).
// Layers: <PART>-OUTLINE = approved outline (reference), <PART>-CUT = compensated tool path,
// STRIP = flat return strips below the board, BEND-CONVEX / BEND-CONCAVE = bend lines on the strips.
import makerjs from 'makerjs';
import type { Point, Region } from '../domain/project.ts';
import type { FabPlan } from './plan.ts';

type Model = makerjs.IModel;

const poly = (loop: Point[], layer: string): Model => {
  const m: Model = new makerjs.models.ConnectTheDots(true, loop as makerjs.IPoint[]);
  m.layer = layer;
  return m;
};
const regionModels = (rs: Region[], layer: string) =>
  rs.flatMap((r) => [r.outer, ...r.holes].map((l) => poly(l, layer)));

export function planToDXF(plan: FabPlan, board: { width: number; height: number }): string {
  const models: Record<string, Model> = {};
  let n = 0;
  const add = (m: Model) => (models['m' + n++] = m);
  for (const c of plan.cuts) {
    const tag = c.part.toUpperCase();
    regionModels(c.outline, `${tag}-OUTLINE`).forEach(add);
    regionModels(c.toolpath, `${tag}-CUT`).forEach(add);
  }
  // Flat strips, stacked below the board, each with its bend lines and a label.
  let y = -board.height / 2 - 150;
  for (const s of plan.strips)
    s.schedules.forEach((sc, i) => {
      const rect: Model = new makerjs.models.Rectangle(sc.cutLength, sc.height);
      rect.layer = 'STRIP';
      rect.origin = [-board.width / 2, y - sc.height];
      makerjs.model.addCaption(
        rect,
        `${s.name} ${sc.contour} ${i + 1} · ${sc.cutLength.toFixed(0)} mm`,
        [0, sc.height + 12],
        [sc.cutLength, sc.height + 12],
      );
      add(rect);
      for (const st of sc.stations) {
        const line = new makerjs.paths.Line(
          [-board.width / 2 + st.at, y - sc.height],
          [-board.width / 2 + st.at, y],
        );
        add({ paths: { l: line }, layer: st.direction === 'convex' ? 'BEND-CONVEX' : 'BEND-CONCAVE' });
      }
      y -= sc.height + 60;
    });
  return makerjs.exporter.toDXF({ models }, { units: makerjs.unitType.Millimeter, usePOLYLINE: true });
}
