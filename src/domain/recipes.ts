// Construction recipes: how approved artwork becomes physical parts.
// Parameters are millimetres. Each artwork group stores overrides for its recipe; elements inherit them.
// Materials are descriptive placeholders until the verified parts atlas (Milestone F) replaces them.
import type { ArtworkGroup, ConstructionType } from './project.ts';

export type Param = { label: string; min: number; max: number; step: number; value: number };
const P = (label: string, min: number, max: number, step: number, value: number): Param => ({
  label,
  min,
  max,
  step,
  value,
});

export type Recipe = {
  name: string;
  lit: 'front' | 'halo' | 'both' | null; // which way the light leaves the letter
  params: Record<string, Param>;
  materials: Partial<Record<'standoff' | 'back' | 'returns' | 'leds' | 'face' | 'flat' | 'trim', string>>;
};

export const recipes: Record<ConstructionType, Recipe> = {
  front: {
    name: 'Front-lit channel letter',
    lit: 'front',
    params: {
      standoff: P('Standoff from fascia', 0, 100, 1, 0),
      back: P('Letter back', 1, 10, 0.5, 3),
      depth: P('Return depth', 20, 200, 1, 60),
      gauge: P('Return gauge', 0.4, 2, 0.1, 0.6),
      face: P('Acrylic face', 1, 20, 0.5, 3),
      trimcap: P('Trim cap lip (0 = none)', 0, 25, 1, 0),
    },
    materials: {
      standoff: 'Mounting spacer',
      back: 'ACP letter back',
      returns: 'Aluminium channel strip',
      leds: 'LED module (symbolic)',
      face: 'Opal acrylic face',
      trim: 'Trim cap',
    },
  },
  fronthalo: {
    name: 'Front + halo letter',
    lit: 'both',
    params: {
      standoff: P('Standoff from fascia', 10, 100, 1, 40),
      back: P('Clear back', 2, 10, 0.5, 5),
      depth: P('Return depth', 20, 200, 1, 60),
      gauge: P('Return gauge', 0.4, 2, 0.1, 0.8),
      face: P('Acrylic face', 1, 20, 0.5, 3),
      trimcap: P('Trim cap lip (0 = none)', 0, 25, 1, 0),
    },
    materials: {
      standoff: 'Threaded spacer',
      back: 'Clear acrylic back',
      returns: 'Aluminium return',
      leds: 'LED module (symbolic, front + rear)',
      face: 'Opal acrylic face',
      trim: 'Trim cap',
    },
  },
  fullacrylic: {
    name: 'Full acrylic letter',
    lit: 'front',
    params: {
      standoff: P('Standoff from fascia', 0, 100, 1, 0),
      back: P('Letter back', 1, 10, 0.5, 3),
      depth: P('Acrylic side height', 15, 150, 1, 50),
      gauge: P('Acrylic side thickness', 2, 6, 0.5, 3),
      face: P('Acrylic face', 2, 20, 0.5, 5),
    },
    materials: {
      standoff: 'Mounting spacer',
      back: 'Acrylic letter back',
      returns: 'Acrylic side strip (solvent-bonded)',
      leds: 'LED module (symbolic)',
      face: 'Acrylic face',
    },
  },
  halo: {
    name: 'Halo-lit letter',
    lit: 'halo',
    params: {
      standoff: P('Standoff from fascia', 10, 100, 1, 40),
      back: P('Clear back', 2, 10, 0.5, 5),
      depth: P('Return depth', 20, 150, 1, 50),
      gauge: P('Return gauge', 0.6, 3, 0.1, 1.2),
      face: P('Metal face', 0.8, 5, 0.1, 1.5),
    },
    materials: {
      standoff: 'Threaded spacer',
      back: 'Clear acrylic back',
      returns: 'Metal return',
      leds: 'LED module (symbolic, rear-facing)',
      face: 'Opaque metal face',
    },
  },
  acrylic: {
    name: 'Flat acrylic',
    lit: null,
    params: {
      standoff: P('Standoff from fascia', 0, 50, 1, 0),
      thickness: P('Acrylic thickness', 2, 30, 1, 10),
    },
    materials: { standoff: 'Stud / spacer', flat: 'Cast acrylic' },
  },
  metal: {
    name: 'Flat metal',
    lit: null,
    params: {
      standoff: P('Standoff from fascia', 0, 50, 1, 0),
      thickness: P('Metal thickness', 1, 10, 0.5, 3),
    },
    materials: { standoff: 'Stud / spacer', flat: 'Metal sheet' },
  },
  acplogo: {
    name: 'Flat ACP logo',
    lit: null,
    params: { standoff: P('Standoff from fascia', 0, 50, 1, 0), thickness: P('ACP thickness', 2, 6, 1, 3) },
    materials: { standoff: 'Stud / spacer', flat: 'ACP cut panel' },
  },
  vinyl: {
    name: 'Printed / cut vinyl',
    lit: null,
    params: {},
    materials: { flat: 'Vinyl film' },
  },
  omit: { name: 'Excluded', lit: null, params: {}, materials: {} },
};

export const VINYL_THICKNESS = 0.15;

// Which lighting effects a construction produces.
export const frontLit = (t: ConstructionType) => recipes[t].lit === 'front' || recipes[t].lit === 'both';
export const haloLit = (t: ConstructionType) => recipes[t].lit === 'halo' || recipes[t].lit === 'both';

// Recipe defaults, overridden by the group's params when the element uses the group's construction.
export function resolveParams(type: ConstructionType, group?: ArtworkGroup): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, p] of Object.entries(recipes[type].params)) out[k] = p.value;
  if (group?.type === type && group.params)
    for (const k of Object.keys(out)) if (typeof group.params[k] === 'number') out[k] = group.params[k];
  return out;
}

export function checkParams(type: ConstructionType, params: Record<string, number>): string | null {
  for (const [k, p] of Object.entries(recipes[type].params)) {
    const v = params[k];
    if (v === undefined) continue;
    if (!Number.isFinite(v) || v < p.min || v > p.max)
      return `${p.label} must be between ${p.min} and ${p.max} mm.`;
  }
  return null;
}
