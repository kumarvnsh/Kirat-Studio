// Fabrication plan: which parts are cut from sheet, their tool-compensated paths, return-strip
// schedules and manufacturability issues. Derived from the layout; nothing here edits the design.
import { computeLayout } from '../domain/layout.ts';
import { recipes } from '../domain/recipes.ts';
import type { DesignState, Region } from '../domain/project.ts';
import { bendSchedule, defaultBendOptions, type BendOptions, type StripSchedule } from './bending.ts';
import { cutChecks, defaultCut, toolpath, type CutIssue, type CutSettings } from './cutting.ts';

export type FabricationState = { cut: CutSettings; bend: BendOptions };
export const defaultFabrication = (): FabricationState => ({
  cut: { ...defaultCut },
  bend: { ...defaultBendOptions },
});

export type CutPart = {
  element: string;
  name: string;
  group: string;
  part: 'back' | 'face' | 'flat' | 'vinyl';
  material: string;
  outline: Region[]; // approved outline, mm
  toolpath: Region[]; // compensated (vinyl: plotter, uncompensated)
};
export type ElementStrips = { element: string; name: string; group: string; schedules: StripSchedule[] };
export type ElementIssues = { element: string; name: string; group: string; issues: CutIssue[] };
export type FabPlan = { cuts: CutPart[]; strips: ElementStrips[]; issues: ElementIssues[] };

const cache = new WeakMap<DesignState, WeakMap<FabricationState, FabPlan>>();

export function fabricationPlan(design: DesignState, fab: FabricationState): FabPlan {
  const hit = cache.get(design)?.get(fab);
  if (hit) return hit;
  const L = computeLayout(design),
    groups = design.artwork?.groups ?? [],
    plan: FabPlan = { cuts: [], strips: [], issues: [] };
  for (const e of L.elements) {
    const group = groups.find((g) => g.id === e.group)?.name ?? '',
      base = { element: e.id, name: e.name, group };
    const lit = !!recipes[e.type].lit;
    for (const p of e.parts) {
      const kind =
        p.kind === 'back' || p.kind === 'face'
          ? p.kind
          : p.kind === 'flat'
            ? e.type === 'vinyl'
              ? 'vinyl'
              : 'flat'
            : null;
      if (!kind) continue;
      plan.cuts.push({
        ...base,
        part: kind,
        material: p.material,
        outline: e.regions,
        toolpath: kind === 'vinyl' ? e.regions : e.regions.flatMap((r) => toolpath(r, fab.cut)),
      });
    }
    if (e.type !== 'vinyl') {
      const issues = e.regions.flatMap((r) => cutChecks(r, fab.cut));
      if (issues.length) plan.issues.push({ ...base, issues });
    }
    if (lit)
      plan.strips.push({
        ...base,
        schedules: e.regions.flatMap((r) => [
          bendSchedule(r.outer, 'outer', e.params.depth, fab.bend),
          ...r.holes.map((h) => bendSchedule(h, 'inner', e.params.depth, fab.bend)),
        ]),
      });
  }
  if (!cache.has(design)) cache.set(design, new WeakMap());
  cache.get(design)!.set(fab, plan);
  return plan;
}

// One row per strip, for the workshop: CSV with distances from the seam.
export function bendScheduleCSV(plan: FabPlan): string {
  const rows = [
    [
      'element',
      'group',
      'contour',
      'strip',
      'cut length mm',
      'height mm',
      'segment',
      'from mm',
      'to mm',
      'angle °',
      'radius mm',
      'direction',
    ],
  ];
  for (const s of plan.strips)
    s.schedules.forEach((sc, i) => {
      for (const g of sc.segments) {
        const from = g.kind === 'corner' ? g.at : g.from,
          to = g.kind === 'corner' ? g.at : g.to;
        rows.push([
          s.name,
          s.group,
          sc.contour,
          String(i + 1),
          sc.cutLength.toFixed(1),
          sc.height.toFixed(1),
          g.kind,
          from.toFixed(1),
          to.toFixed(1),
          g.kind === 'straight' ? '' : g.angle.toFixed(1),
          g.kind === 'curve' ? g.radius.toFixed(0) : '',
          g.kind === 'straight' ? '' : g.direction,
        ]);
      }
    });
  return rows
    .map((r) => r.map((v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(','))
    .join('\n');
}
