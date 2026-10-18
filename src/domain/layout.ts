// Layout: turns a design into dimensioned physical parts (millimetres, sign coordinates).
// x right, y up, origin at the board centre; z out of the wall, 0 at the centre of the steel frame.
// The renderer, the BOM and the inspector all read this; none of them repeat the math.
import { inside, perimeter } from '../artwork/contours.js';
import { recipes, resolveParams, VINYL_THICKNESS } from './recipes.ts';
import { assemblySteps, visibleLayers } from './assembly.ts';
import { isRGB, resolveLight, type ResolvedLight } from './lighting.ts';
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
export type PartKind = 'stud' | 'standoff' | 'back' | 'returns' | 'leds' | 'face' | 'trim' | 'flat';
export type LetterPart = { kind: PartKind; layer: LayerId; material: string; z0: number; z1: number };
export type ElementLayout = {
  id: string;
  name: string;
  type: ConstructionType;
  group: string;
  params: Record<string, number>;
  faceColor?: string; // resolved: letter override, else group colour; unset = artwork colours
  returnColor?: string; // painted returns; unset = natural metal
  light?: ResolvedLight; // lit constructions only
  regions: Region[];
  bounds: [number, number, number, number]; // x0, y0, x1, y1 (mm)
  pixelBounds?: [number, number, number, number]; // original traced pixel bounds [px0, py0, px1, py1]
  perimeter: number; // all outer and inner contours
  base: number; // z of the fascia the element is mounted on
  parts: LetterPart[];
  leds: Point[];
  fixings: Point[]; // stud (and standoff, if any) positions
};
export type GroupLayoutMetrics = {
  id: string;
  name: string;
  baseCharHeight: number;
  baseCharWidth: number;
  charHeight: number;
  charWidth: number;
  charDepth: number;
  naturalLetterGap: number;
  letterGap: number;
  naturalGroupGap: number;
  groupGap: number;
  bounds: [number, number, number, number]; // [x0, y0, x1, y1] in mm
};
export type Point3 = [number, number, number];
export type Cable = { element: string; psu: number; points: Point3[]; length: number };
export type Power = {
  loadW: number;
  psus: Point3[]; // centres
  cables: Cable[];
  warnings: string[];
};
export type Layout = {
  scale: number; // mm per traced pixel
  cx: number; // artwork centre in traced pixels
  cy: number;
  board: BoardLayer[];
  letterBase: number; // z of the ACP front face
  frame: FrameMember[];
  elements: ElementLayout[];
  groupMetrics: Record<string, GroupLayoutMetrics>;
  naturalBoardGroupGap: number; // average natural gap between groups on the board (mm)
  boardGroupGap: number; // effective average gap between groups on the board (mm)
  ledcount: number;
  returnLength: number; // mm
  power: Power;
};

export const LED_SPACING = 85;
export const LED_LIMIT = 360;
export const LED_SIZE = { w: 21, h: 9, d: 7 };
const STANDOFF_SPACING = 250;
const STANDOFF_LIMIT = 12;
export const STUD_EMBED = 20; // stud length behind the fascia face
export const TRIM_TOP = 1.5; // trim cap thickness over the face

// Placeholder electrical ratings until the verified parts atlas (Milestone F).
export const MODULE_W = 0.72; // W per LED module
export const PSU_W = 100;
export const PSU_LOADING = 0.8; // use at most 80% of rated output
export const PSU_SIZE = { w: 160, h: 98, d: 38 };

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
    groupMetrics: {},
    naturalBoardGroupGap: 0,
    boardGroupGap: 0,
    ledcount: 0,
    returnLength: 0,
    power: { loadW: 0, psus: [], cables: [], warnings: [] },
  };
  if (a) {
    const [bx0, by0, bx1, by1] = a.bounds;
    const k = Math.min((s.width * s.artscale) / 100 / (bx1 - bx0), (s.height * 0.75) / (by1 - by0)),
      cx = (bx0 + bx1) / 2,
      cy = (by0 + by1) / 2;
    Object.assign(layout, { scale: k, cx, cy });
    const baseMap = (p: Point): Point => [(p[0] - cx) * k, (cy - p[1]) * k];

    // Precompute base group & character column metrics in mm.
    type ElBase = {
      id: string;
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      w: number;
      h: number;
      cx: number;
      cy: number;
    };
    const elBaseMap = new Map<string, ElBase>();
    for (const e of a.elements) {
      if (e.type === 'omit') continue;
      const x0 = (e.bounds[0] - cx) * k,
        x1 = (e.bounds[2] - cx) * k,
        y0 = (cy - e.bounds[3]) * k,
        y1 = (cy - e.bounds[1]) * k;
      elBaseMap.set(e.id, {
        id: e.id,
        x0,
        y0,
        x1,
        y1,
        w: Math.max(0.1, x1 - x0),
        h: Math.max(0.1, y1 - y0),
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
      });
    }

    type GroupBox = {
      id: string;
      name: string;
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      cx: number;
      cy: number;
      cols: { els: ElBase[]; x0: number; x1: number; y0: number; y1: number; cx: number; cy: number; w: number; h: number }[];
      baseCharHeight: number;
      baseCharWidth: number;
      naturalLetterGap: number;
    };
    const groupBoxes: GroupBox[] = [];
    for (const g of a.groups) {
      const gEls = a.elements
        .filter((e) => e.group === g.id && e.type !== 'omit')
        .map((e) => elBaseMap.get(e.id)!)
        .filter(Boolean);
      if (!gEls.length) continue;
      const gx0 = Math.min(...gEls.map((b) => b.x0)),
        gx1 = Math.max(...gEls.map((b) => b.x1)),
        gy0 = Math.min(...gEls.map((b) => b.y0)),
        gy1 = Math.max(...gEls.map((b) => b.y1));
      // Cluster elements into left-to-right character columns (stacked pieces overlap >= 40% horizontally)
      const sorted = [...gEls].sort((p, q) => p.cx - q.cx);
      const cols: GroupBox['cols'] = [];
      for (const eb of sorted) {
        const prev = cols[cols.length - 1];
        if (prev) {
          const overlap = Math.min(prev.x1, eb.x1) - Math.max(prev.x0, eb.x0);
          if (overlap >= 0.4 * Math.min(prev.w, eb.w)) {
            prev.els.push(eb);
            prev.x0 = Math.min(prev.x0, eb.x0);
            prev.x1 = Math.max(prev.x1, eb.x1);
            prev.y0 = Math.min(prev.y0, eb.y0);
            prev.y1 = Math.max(prev.y1, eb.y1);
            prev.w = prev.x1 - prev.x0;
            prev.h = prev.y1 - prev.y0;
            prev.cx = (prev.x0 + prev.x1) / 2;
            prev.cy = (prev.y0 + prev.y1) / 2;
            continue;
          }
        }
        cols.push({
          els: [eb],
          x0: eb.x0,
          x1: eb.x1,
          y0: eb.y0,
          y1: eb.y1,
          w: eb.w,
          h: eb.h,
          cx: eb.cx,
          cy: eb.cy,
        });
      }
      const baseCharHeight = cols.length > 1 ? Math.max(...cols.map((c) => c.h)) : Math.max(0.1, gy1 - gy0);
      const sortedW = cols.map((c) => c.w).sort((p, q) => p - q);
      const baseCharWidth = cols.length > 1 ? sortedW[Math.floor(sortedW.length / 2)] : Math.max(0.1, gx1 - gx0);
      let naturalLetterGap = 0;
      if (cols.length > 1) {
        let sum = 0;
        for (let i = 0; i < cols.length - 1; i++) sum += Math.max(0, cols[i + 1].x0 - cols[i].x1);
        naturalLetterGap = sum / (cols.length - 1);
      }
      groupBoxes.push({
        id: g.id,
        name: g.name,
        x0: gx0,
        y0: gy0,
        x1: gx1,
        y1: gy1,
        cx: (gx0 + gx1) / 2,
        cy: (gy0 + gy1) / 2,
        cols,
        baseCharHeight,
        baseCharWidth,
        naturalLetterGap,
      });
    }

    // Measure natural gaps between groups and compute group shift offsets when groupSpacing or groupGap is set.
    const naturalGroupGapMap = new Map<string, { gap: number; axis: 'x' | 'y'; dir: number }>();
    let gapSum = 0,
      gapCount = 0;
    const allCx = groupBoxes.length ? groupBoxes.reduce((s, b) => s + b.cx, 0) / groupBoxes.length : 0;
    const allCy = groupBoxes.length ? groupBoxes.reduce((s, b) => s + b.cy, 0) / groupBoxes.length : 0;
    for (const gb of groupBoxes) {
      let bestGap = 0,
        bestDist = Infinity,
        axis: 'x' | 'y' = 'y',
        dir = 1;
      for (const other of groupBoxes) {
        if (other.id === gb.id) continue;
        const hGap = Math.max(gb.x0, other.x0) - Math.min(gb.x1, other.x1);
        const vGap = Math.max(gb.y0, other.y0) - Math.min(gb.y1, other.y1);
        const dist = Math.hypot(Math.max(0, hGap), Math.max(0, vGap)) || Math.hypot(gb.cx - other.cx, gb.cy - other.cy);
        if (dist < bestDist) {
          bestDist = dist;
          if (hGap > vGap) {
            axis = 'x';
            bestGap = Math.max(0, hGap);
            dir = gb.cx >= other.cx ? 1 : -1;
          } else {
            axis = 'y';
            bestGap = Math.max(0, vGap);
            dir = gb.cy >= other.cy ? 1 : -1;
          }
        }
      }
      if (groupBoxes.length <= 1) {
        dir = gb.cy >= allCy ? 1 : -1;
      }
      naturalGroupGapMap.set(gb.id, { gap: bestGap, axis, dir });
      if (groupBoxes.length > 1) {
        gapSum += bestGap;
        gapCount++;
      }
    }
    const naturalBoardGroupGap = gapCount > 0 ? gapSum / gapCount : 0;
    const boardSpacingDelta = s.groupSpacing ?? 0;
    layout.naturalBoardGroupGap = +naturalBoardGroupGap.toFixed(1);
    layout.boardGroupGap = +(naturalBoardGroupGap + boardSpacingDelta).toFixed(1);

    // Build per-element point mapper and populate layout.groupMetrics
    const elMapper = new Map<string, (p: Point) => Point>();
    for (const gb of groupBoxes) {
      const g = a.groups.find((x) => x.id === gb.id)!;
      const gScaleY = g.charHeight !== undefined && gb.baseCharHeight > 0 ? g.charHeight / gb.baseCharHeight : 1;
      const gScaleX = g.charWidth !== undefined && gb.baseCharWidth > 0 ? g.charWidth / gb.baseCharWidth : 1;
      const letterSpacingDelta = g.letterSpacing ?? 0;
      const ng = naturalGroupGapMap.get(gb.id) ?? { gap: 0, axis: 'y' as const, dir: 1 };
      const groupGapDelta = g.groupGap ?? 0;
      const totalGroupShift = groupBoxes.length > 1 ? boardSpacingDelta * 0.5 + groupGapDelta : groupGapDelta;
      const groupShiftX = ng.axis === 'x' ? ng.dir * totalGroupShift : 0;
      const groupShiftY = ng.axis === 'y' ? ng.dir * totalGroupShift : 0;

      const resolved = resolveParams(g.type, g);
      const effDepth =
        g.charDepth ??
        (recipes[g.type].lit ? resolved.depth : (resolved.thickness ?? VINYL_THICKNESS));

      layout.groupMetrics[gb.id] = {
        id: gb.id,
        name: gb.name,
        baseCharHeight: +gb.baseCharHeight.toFixed(1),
        baseCharWidth: +gb.baseCharWidth.toFixed(1),
        charHeight: gb.baseCharHeight * gScaleY,
        charWidth: gb.baseCharWidth * gScaleX,
        charDepth: +effDepth.toFixed(2),
        naturalLetterGap: +(gb.naturalLetterGap * gScaleX).toFixed(1),
        letterGap: +(gb.naturalLetterGap * gScaleX + letterSpacingDelta).toFixed(1),
        naturalGroupGap: +ng.gap.toFixed(1),
        groupGap: +(ng.gap + boardSpacingDelta + groupGapDelta).toFixed(1),
        bounds: [gb.x0, gb.y0, gb.x1, gb.y1],
      };

      const numCols = gb.cols.length;
      gb.cols.forEach((col, colIdx) => {
        const colOffset = numCols > 1 ? (colIdx - (numCols - 1) / 2) * letterSpacingDelta : 0;
        for (const eb of col.els) {
          const e = a.elements.find((x) => x.id === eb.id)!;
          const elScaleY = e.charHeight !== undefined && eb.h > 0 ? e.charHeight / eb.h : gScaleY;
          const elScaleX = e.charWidth !== undefined && eb.w > 0 ? e.charWidth / eb.w : gScaleX;
          const elSpacing = e.letterSpacing ?? 0;
          const isIdentity =
            elScaleX === 1 &&
            elScaleY === 1 &&
            gScaleX === 1 &&
            gScaleY === 1 &&
            colOffset === 0 &&
            elSpacing === 0 &&
            groupShiftX === 0 &&
            groupShiftY === 0;
          if (isIdentity) {
            elMapper.set(eb.id, baseMap);
          } else {
            const targetColCx = gb.cx + (col.cx - gb.cx) * gScaleX + colOffset + elSpacing + groupShiftX;
            const targetColCy = gb.cy + (col.cy - gb.cy) * gScaleY + groupShiftY;
            elMapper.set(eb.id, (p: Point): Point => {
              const [bx, by] = baseMap(p);
              return [
                targetColCx + (bx - col.cx) * elScaleX,
                targetColCy + (by - col.cy) * elScaleY,
              ];
            });
          }
        }
      });
    }

    for (const e of a.elements) {
      if (e.type === 'omit') continue;
      const recipe = recipes[e.type],
        group = a.groups.find((g) => g.id === e.group),
        params = { ...resolveParams(e.type, group) },
        light = resolveLight(group, e, s.ledTemp),
        map = elMapper.get(e.id) ?? baseMap,
        regions = e.regions.map((r) => ({ outer: r.outer.map(map), holes: r.holes.map((h) => h.map(map)) })),
        m = recipe.materials;
      if (typeof e.charDepth === 'number') {
        if (recipe.lit) params.depth = e.charDepth;
        else params.thickness = e.charDepth;
      } else if (typeof group?.charDepth === 'number' && !recipe.lit) {
        params.thickness = group.charDepth;
      }
      const parts: LetterPart[] = [];
      let z = front;
      const add = (kind: PartKind, layer: LayerId, depth: number, material = '') => {
        parts.push({ kind, layer, material, z0: z, z1: z + depth });
        z += depth;
      };
      if (params.standoff > 0) add('standoff', 'mounting', params.standoff, m.standoff);
      if (recipe.lit) {
        add('back', 'backs', params.back, `${m.back} ${params.back} mm`);
        parts.push({
          kind: 'leds',
          layer: 'leds',
          material: isRGB(light.mode) ? m.leds!.replace('LED module', 'RGB LED module') : m.leds!,
          z0: z,
          z1: z + LED_SIZE.d,
        });
        add('returns', 'returns', params.depth, `${m.returns} ${params.gauge} mm`);
        add('face', 'faces', params.face, `${m.face} ${params.face} mm`);
        // Trim cap wraps the face edge and the top of the return; it doesn't add to the stack below it.
        if (params.trimcap > 0)
          parts.push({
            kind: 'trim',
            layer: 'faces',
            material: `${m.trim} ${params.trimcap} mm lip`,
            z0: z - params.face - 5,
            z1: z + TRIM_TOP,
          });
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
        faceColor: e.faceColor ?? group?.faceColor,
        light: recipe.lit ? light : undefined,
        returnColor: group?.returnColor,
        regions,
        bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        pixelBounds: e.bounds,
        perimeter: loops.reduce((n, l) => n + perimeter(l), 0),
        base: front,
        parts,
        leds: recipe.lit ? grid(regions, LED_SPACING, LED_LIMIT - layout.ledcount) : [],
        fixings: e.type === 'vinyl' ? [] : fixings(regions),
      };
      // Studs pass from the letter back through the fascia into the frame cavity.
      if (el.fixings.length) {
        const acp = board[board.length - 1];
        parts.push({
          kind: 'stud',
          layer: 'mounting',
          material: 'Fixing stud M5 (placeholder)',
          z0: acp.z0 - STUD_EMBED,
          z1: front + params.standoff + 2,
        });
      }
      layout.ledcount += el.leds.length;
      if (recipe.lit) layout.returnLength += el.perimeter;
      layout.elements.push(el);
    }
    // Update groupMetrics bounds from placed elements
    for (const gm of Object.values(layout.groupMetrics)) {
      const placed = layout.elements.filter((el) => el.group === gm.id);
      if (placed.length) {
        gm.bounds = [
          Math.min(...placed.map((el) => el.bounds[0])),
          Math.min(...placed.map((el) => el.bounds[1])),
          Math.max(...placed.map((el) => el.bounds[2])),
          Math.max(...placed.map((el) => el.bounds[3])),
        ];
      }
    }
  }
  layout.power = planPower(layout, s);
  cache.set(design, layout);
  return layout;
}

// Placeholder power plan: size PSUs from the LED load, park them in the bottom-right frame bay,
// and route one cable per lit element: through the fascia, down inside the frame, across to its PSU.
export function planPower(L: Layout, s: DesignSettings): Power {
  const lit = L.elements.filter((e) => e.leds.length),
    loadW = L.ledcount * MODULE_W,
    count = loadW > 0 ? Math.ceil(loadW / (PSU_W * PSU_LOADING)) : 0,
    { width: W, height: H, frame: F } = s,
    warnings: string[] = [];
  const bayLeft = W / 6 + F / 2,
    bayRight = (W - F) / 2 - F / 2,
    perRow = Math.max(1, Math.floor((bayRight - bayLeft - 20) / (PSU_SIZE.w + 20))),
    psus: Point3[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % perRow,
      row = Math.floor(i / perRow);
    psus.push([
      bayRight - 20 - PSU_SIZE.w / 2 - col * (PSU_SIZE.w + 20),
      -H / 2 + F + 20 + PSU_SIZE.h / 2 + row * (PSU_SIZE.h + 20),
      0,
    ]);
  }
  if (count && PSU_SIZE.d > F)
    warnings.push(
      `PSU (${PSU_SIZE.d} mm deep) does not fit inside the ${F} mm frame section. Use a deeper frame or an external enclosure.`,
    );
  if (psus.some((p) => p[1] + PSU_SIZE.h / 2 > H / 2 - F))
    warnings.push('PSUs do not fit in the bottom-right frame bay. Plan a separate enclosure.');
  if (L.ledcount >= LED_LIMIT) warnings.push(`LED grid capped at ${LED_LIMIT} modules; load is understated.`);
  const cables: Cable[] = lit.map((e, i) => {
    const [px, py] = e.leds[0],
      psu = psus.length ? i % psus.length : 0,
      [qx, qy] = psus[psu] ?? [px, py],
      back = e.parts.find((p) => p.kind === 'back')!.z0,
      points: Point3[] = [
        [px, py, back],
        [px, py, 0],
        [px, qy, 0],
        [qx, qy, 0],
      ];
    const length = points
      .slice(1)
      .reduce((n, p, j) => n + Math.hypot(...(p.map((v, k) => v - points[j][k]) as Point3)), 0);
    return { element: e.id, psu, points, length };
  });
  return { loadW, psus, cables, warnings };
}

// Everything the renderer needs: one flat object, read-only.
export function sceneInput(design: DesignState, view: ViewState) {
  const a = design.artwork;
  return {
    ...view,
    settings: design.settings,
    layout: computeLayout(design),
    visibleLayers: visibleLayers(assemblySteps(design), view.step),
    imageWidth: a?.imageWidth ?? 1,
    imageHeight: a?.imageHeight ?? 1,
  };
}
export type SceneInput = ReturnType<typeof sceneInput>;
