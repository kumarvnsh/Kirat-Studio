// Layout: turns a design into dimensioned physical parts (millimetres, sign coordinates).
// x right, y up, origin at the board centre; z out of the wall, 0 at the centre of the steel frame.
// The renderer, the BOM and the inspector all read this; none of them repeat the math.
import { inside, perimeter } from '../artwork/contours.js';
import { recipes, resolveParams, VINYL_THICKNESS } from './recipes.ts';
import type {
  ConstructionType,
  DesignSettings,
  DesignState,
  LayerId,
  Point,
  Region,
  ViewState,
} from './project.ts';

export type BoardLayer = { layer: LayerId; name: string; material: string; z0: number; z1: number };
export type FrameMember = { axis: 'x' | 'y'; length: number; x: number; y: number };
export type PartKind = 'standoff' | 'back' | 'returns' | 'leds' | 'face' | 'flat';
export type LetterPart = { kind: PartKind; layer: LayerId; material: string; z0: number; z1: number };
export type ElementLayout = {
  id: string;
  name: string;
  type: ConstructionType;
  group: string;
  params: Record<string, number>;
  regions: Region[];
  bounds: [number, number, number, number]; // x0, y0, x1, y1
  perimeter: number; // all outer and inner contours
  parts: LetterPart[];
  leds: Point[];
  standoffs: Point[];
};
export type Layout = {
  scale: number; // mm per traced pixel
  cx: number; // artwork centre in traced pixels
  cy: number;
  board: BoardLayer[];
  letterBase: number; // z of the ACP front face
  frame: FrameMember[];
  elements: ElementLayout[];
  ledcount: number;
  returnLength: number; // mm
};

export const LED_SPACING = 85;
export const LED_LIMIT = 360;
export const LED_SIZE = { w: 21, h: 9, d: 7 };
const STANDOFF_SPACING = 250;
const STANDOFF_LIMIT = 12;

export function boardStack(s: DesignSettings): { layers: BoardLayer[]; front: number } {
  const F = s.frame,
    layers: BoardLayer[] = [
      { layer: 'gi', name: 'GI rear cover', material: `GI sheet ${s.gi} mm`, z0: -F / 2 - s.gi, z1: -F / 2 },
      {
        layer: 'frame',
        name: 'MS frame',
        material: `MS hollow section ${F}×${F}×${s.framewall} mm`,
        z0: -F / 2,
        z1: F / 2,
      },
    ];
  let z = F / 2;
  if (s.backing > 0) {
    layers.push({
      layer: 'backing',
      name: 'Front backing sheet',
      material: `Sheet ${s.backing} mm`,
      z0: z,
      z1: z + s.backing,
    });
    z += s.backing;
  }
  layers.push({ layer: 'acp', name: 'ACP fascia', material: `ACP ${s.acp} mm`, z0: z, z1: z + s.acp });
  return { layers, front: z + s.acp };
}

// Perimeter rectangle plus two intermediate verticals at thirds.
export function frameMembers(s: DesignSettings): FrameMember[] {
  const { width: W, height: H, frame: F } = s;
  return [
    { axis: 'x', length: W, x: 0, y: (H - F) / 2 },
    { axis: 'x', length: W, x: 0, y: -(H - F) / 2 },
    ...[-(W - F) / 2, (W - F) / 2, -W / 6, W / 6].map((x) => ({
      axis: 'y' as const,
      length: H - 2 * F,
      x,
      y: 0,
    })),
  ];
}

// Regular grid of points inside the regions (outside holes).
function grid(regions: Region[], spacing: number, limit: number): Point[] {
  const out: Point[] = [];
  for (const r of regions) {
    const xs = r.outer.map((v) => v[0]),
      ys = r.outer.map((v) => v[1]),
      [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (let y = y0 + Math.min(spacing / 2, (y1 - y0) / 2); y < y1; y += spacing)
      for (let x = x0 + Math.min(spacing / 2, (x1 - x0) / 2); x < x1; x += spacing) {
        if (out.length >= limit) return out;
        if (inside([x, y], r.outer) && !r.holes.some((h) => inside([x, y], h))) out.push([x, y]);
      }
  }
  return out;
}

// At least one fixing per region: tighten the grid for small regions.
function fixings(regions: Region[]): Point[] {
  const out: Point[] = [];
  for (const r of regions) {
    let pts: Point[] = [];
    for (let s = STANDOFF_SPACING; s >= 10 && !pts.length; s /= 2) pts = grid([r], s, STANDOFF_LIMIT);
    out.push(...pts);
  }
  return out.slice(0, Math.max(STANDOFF_LIMIT, regions.length));
}

const cache = new WeakMap<DesignState, Layout>();

export function computeLayout(design: DesignState): Layout {
  const hit = cache.get(design);
  if (hit) return hit;
  const s = design.settings,
    a = design.artwork,
    { layers: board, front } = boardStack(s);
  const layout: Layout = {
    scale: 1,
    cx: 0,
    cy: 0,
    board,
    letterBase: front,
    frame: frameMembers(s),
    elements: [],
    ledcount: 0,
    returnLength: 0,
  };
  if (a) {
    const [bx0, by0, bx1, by1] = a.bounds;
    const k = Math.min((s.width * s.artscale) / 100 / (bx1 - bx0), (s.height * 0.75) / (by1 - by0)),
      cx = (bx0 + bx1) / 2,
      cy = (by0 + by1) / 2;
    Object.assign(layout, { scale: k, cx, cy });
    const map = (p: Point): Point => [(p[0] - cx) * k, (cy - p[1]) * k];
    for (const e of a.elements) {
      if (e.type === 'omit') continue;
      const recipe = recipes[e.type],
        params = resolveParams(
          e.type,
          a.groups.find((g) => g.id === e.group),
        ),
        regions = e.regions.map((r) => ({ outer: r.outer.map(map), holes: r.holes.map((h) => h.map(map)) })),
        m = recipe.materials;
      const parts: LetterPart[] = [];
      let z = front;
      const add = (kind: PartKind, layer: LayerId, depth: number, material = '') => {
        parts.push({ kind, layer, material, z0: z, z1: z + depth });
        z += depth;
      };
      if (params.standoff > 0) add('standoff', 'mounting', params.standoff, m.standoff);
      if (recipe.lit) {
        add('back', 'backs', params.back, `${m.back} ${params.back} mm`);
        parts.push({ kind: 'leds', layer: 'leds', material: m.leds!, z0: z, z1: z + LED_SIZE.d });
        add('returns', 'returns', params.depth, `${m.returns} ${params.gauge} mm`);
        add('face', 'faces', params.face, `${m.face} ${params.face} mm`);
      } else
        add(
          'flat',
          'faces',
          params.thickness ?? VINYL_THICKNESS,
          `${m.flat} ${params.thickness ?? VINYL_THICKNESS} mm`,
        );
      const loops = regions.flatMap((r) => [r.outer, ...r.holes]),
        xs = regions.flatMap((r) => r.outer.map((v) => v[0])),
        ys = regions.flatMap((r) => r.outer.map((v) => v[1]));
      const el: ElementLayout = {
        id: e.id,
        name: e.name,
        type: e.type,
        group: e.group,
        params,
        regions,
        bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        perimeter: loops.reduce((n, l) => n + perimeter(l), 0),
        parts,
        leds: recipe.lit ? grid(regions, LED_SPACING, LED_LIMIT - layout.ledcount) : [],
        standoffs: params.standoff > 0 ? fixings(regions) : [],
      };
      layout.ledcount += el.leds.length;
      if (recipe.lit) layout.returnLength += el.perimeter;
      layout.elements.push(el);
    }
  }
  cache.set(design, layout);
  return layout;
}

// Everything the renderer needs: one flat object, read-only.
export function sceneInput(design: DesignState, view: ViewState) {
  const a = design.artwork;
  return {
    ...view,
    settings: design.settings,
    layout: computeLayout(design),
    imageWidth: a?.imageWidth ?? 1,
    imageHeight: a?.imageHeight ?? 1,
  };
}
export type SceneInput = ReturnType<typeof sceneInput>;
