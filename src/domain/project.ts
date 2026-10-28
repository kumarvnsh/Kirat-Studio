// Project data model. Project data defines the sign; the 3D scene only displays it.
//   DesignState      — what the customer approves. Saved, undoable.
//   ViewState        — how we're looking at it. Never saved into the design, never undone.
//   FabricationState — how the workshop makes it. Saved separately from the design.
// Dimensions are millimetres. Conversion to metres happens only in src/scene.

import type { ScenePreset } from './scenePresets.ts';
import type { Environment } from './lighting.ts';
import type { LengthUnit } from './units.ts';

export type ConstructionType =
  | 'front'
  | 'halo'
  | 'fronthalo'
  | 'fullacrylic'
  | 'acrylic'
  | 'metal'
  | 'acplogo'
  | 'vinyl'
  | 'acpbacklit'
  | 'acpflush'
  | 'pushthrough'
  | 'omit';

export const constructionNames: Record<ConstructionType, string> = {
  acpbacklit: 'ACP cut-out · backlit',
  acpflush: 'Flush illuminated inlay',
  pushthrough: 'Push-through acrylic',
  front: 'Front-lit',
  halo: 'Halo-lit',
  fronthalo: 'Front + halo',
  fullacrylic: 'Full acrylic',
  acrylic: 'Flat acrylic',
  metal: 'Flat metal',
  acplogo: 'ACP logo',
  vinyl: 'Vinyl',
  omit: 'Excluded',
};

export type Point = [number, number];
export type Region = { outer: Point[]; holes: Point[][] };

export type ArtworkElement = {
  id: string;
  name: string;
  type: ConstructionType;
  group: string;
  override: boolean; // true when type differs on purpose from the group's type
  pixels: number;
  bounds: [number, number, number, number]; // traced image pixels, y down
  color: string; // average colour of the artwork (traced / SVG fill)
  faceColor?: string; // chosen face colour; overrides the group's
  returnColor?: string | null; // null = bare metal; otherwise overrides the group's
  charHeight?: number; // per-character height override (mm)
  charWidth?: number; // per-character width override (mm)
  charDepth?: number; // per-character 3D depth / thickness override (mm)
  letterSpacing?: number; // per-character horizontal offset (mm)
  regions: Region[];
};

// params: overrides of the recipe defaults for this group's construction (see recipes.ts).
export type ArtworkGroup = {
  id: string;
  name: string;
  type: ConstructionType;
  params?: Record<string, number>;
  faceColor?: string; // face / flat colour for the group; unset = artwork colours or board default
  returnColor?: string; // painted return colour (lit letters); unset = natural metal
  // Day/night face film (front-lit only): the face shows faceColor (default near-black) in
  // daylight and transmits the LED white when lit after dark.
  dayNight?: boolean;
  light?: GroupLight; // lit constructions only; unset fields follow the board defaults
  charHeight?: number; // nominal character height for the group (mm)
  charWidth?: number; // nominal character width for the group (mm)
  charDepth?: number; // nominal character depth / thickness for the group (mm)
  letterSpacing?: number; // extra horizontal spacing between characters in this group (mm)
  groupGap?: number; // extra spacing between this group and adjacent groups (mm)
};

// Per-group lighting (one circuit per group).
//   white   — white LEDs at `temp` K (default: settings.ledTemp)
//   rgb     — RGB LEDs set to `color`
//   artwork — RGB LEDs matching each letter's own colour
export type LightMode = 'white' | 'rgb' | 'artwork';
export type GroupLight = {
  mode?: LightMode;
  temp?: number;
  color?: string;
  dimming?: number;
  on?: boolean;
};

export type Artwork = {
  elements: ArtworkElement[];
  groups: ArtworkGroup[];
  bounds: [number, number, number, number];
  imageWidth: number;
  imageHeight: number;
  imageData: string; // PNG data URL of the cleaned artwork, used for face colours
  approved: boolean;
  origin?: 'vector' | 'trace'; // vector = exact SVG outlines, trace = reconstructed from pixels
};

// Numeric design settings. The table is the single source for UI inputs, defaults and validation.
export const numericSettings = {
  width: { label: 'Board width', min: 500, max: 12000, step: 1, value: 3600 },
  height: { label: 'Board height', min: 300, max: 4000, step: 1, value: 1200 },
  artscale: { label: 'Artwork width (% of board)', min: 20, max: 94, step: 1, value: 84 },
  acp: { label: 'ACP thickness', min: 1, max: 10, step: 0.5, value: 3 },
  gi: { label: 'GI thickness', min: 0.4, max: 3, step: 0.1, value: 0.8 },
  frame: { label: 'Frame section', min: 20, max: 100, step: 1, value: 40 },
  framewall: { label: 'Frame wall', min: 1, max: 5, step: 0.5, value: 2 },
  backing: { label: 'Front backing sheet (0 = none)', min: 0, max: 6, step: 0.5, value: 0 },
  ledTemp: {
    label: 'LED colour temperature',
    min: 2000,
    max: 10000,
    step: 100,
    value: 6500,
    unit: 'K',
  },
} as const;
export type NumericKey = keyof typeof numericSettings;

// Rooftop letters stand on a steel support structure instead of an ACP fascia board.
export type RooftopStructure = 'beam' | 'braced' | 'lattice';
export type Mounting = {
  kind: 'rooftop';
  structure: RooftopStructure;
  clearance: number; // letter bottom above the roof (mm)
  spacing: number; // maximum post / vertical spacing (mm)
};
export const rooftopStructures: Record<RooftopStructure, string> = {
  beam: 'Box beam',
  braced: 'Braced posts',
  lattice: 'Lattice frame',
};
export const rooftopLimits = { clearance: [0, 5000], spacing: [400, 4000] } as const;
export const defaultRooftop = (): Mounting => ({ kind: 'rooftop', structure: 'beam', clearance: 300, spacing: 1200 });
// Letters that stand on their own. Panel types need a fascia; halo needs a surface to light.
export const ROOFTOP_TYPES: ConstructionType[] = ['front', 'fullacrylic', 'acrylic', 'metal', 'omit'];
// Day colour of a day/night face when the group has no face colour of its own.
export const DAY_NIGHT_COLOUR = '#161616';
export const isRooftop = (s: { mounting?: Mounting }) => s.mounting?.kind === 'rooftop';

export type DesignSettings = Record<NumericKey, number> & {
  boardcolor: string;
  facecolor: string;
  keepart: boolean; // preserve artwork colours on faces
  groupSpacing?: number; // extra space between groups (mm)
  mounting?: Mounting; // unset = letters on an ACP fascia board
};

export type DesignState = { settings: DesignSettings; artwork: Artwork | null };

export type ViewMode = '3d' | '2d' | 'bend';
export type ViewState = {
  mode: ViewMode;
  unit?: LengthUnit; // display/edit length unit: mm, in (inch), ft (foot)
  selected: string | null;
  selectionActive: boolean;
  isolate: boolean;
  step: number; // assembly step, 1..n (ALL_STEPS = complete)
  layers: boolean[];
  explode: number; // 0..100
  bend: number; // forming progress 0..100
  bendStrip?: number; // view-only index in outer-then-counter strip order
  environment: Environment; // time of day
  scenePreset?: ScenePreset;
  lights: boolean; // sign power
  dimming: number; // 0.1..1 of full LED output
  exposure: number; // camera EV offset, -2..+2
  presentation: boolean;
  toolpaths: boolean; // overlay compensated cut paths in the 2D view
  selection: string[]; // selected element ids (selected = the primary one)
  selectedGroup: string | null; // set when a whole group is selected from the structure tree
  hidden: string[]; // element ids hidden in the views (never affects the design)
};

// Cutting and bending settings (see src/fabrication).
export type { FabricationState } from '../fabrication/plan.ts';

// Assembly layers, rear to front. Index = assembly step - 1.
export const LAYERS = [
  {
    id: 'gi',
    name: 'GI rear cover',
    kind: 'board',
    note: 'GI sheet closes the rear of the steel frame.',
  },
  {
    id: 'frame',
    name: 'MS frame',
    kind: 'board',
    note: 'Hollow steel sections: perimeter plus vertical members. Sections need project engineering.',
  },
  {
    id: 'backing',
    name: 'Front backing sheet',
    kind: 'board',
    note: 'Optional sheet between frame and ACP. Set its thickness to 0 to omit it.',
  },
  {
    id: 'acp',
    name: 'ACP fascia',
    kind: 'board',
    note: 'ACP panel in front of the frame. Seams and fixing pattern are not detailed yet.',
  },
  {
    id: 'mounting',
    name: 'Letter mounting',
    kind: 'letter',
    note: 'Spacers / studs for letters with a standoff. Positions are an even spread, not an engineered pattern.',
  },
  {
    id: 'backs',
    name: 'Letter backs',
    kind: 'letter',
    note: 'Cut letter backs follow the approved outlines, including counters.',
  },
  {
    id: 'returns',
    name: 'Return walls',
    kind: 'letter',
    note: 'Returns follow outer and inner contours at the recipe depth and gauge; no joining compensation.',
  },
  {
    id: 'leds',
    name: 'LED modules',
    kind: 'letter',
    note: 'Symbolic module grid — not a manufacturer layout or electrical calculation.',
  },
  {
    id: 'power',
    name: 'Power & wiring',
    kind: 'board',
    note: 'PSUs in the bottom-right frame bay, a cable penetration behind each lit letter; runs cross the intermediate verticals through drilled holes (not modelled). Placeholder module and PSU ratings; service access through the rear GI cover.',
  },
  {
    id: 'faces',
    name: 'Faces / graphics',
    kind: 'letter',
    note: 'Faces, flat letters and films. Illumination is a visual approximation.',
  },
] as const;
export type LayerId = (typeof LAYERS)[number]['id'];
export const LAYER_COUNT = LAYERS.length;

export function defaultSettings(): DesignSettings {
  const s = Object.fromEntries(
    Object.entries(numericSettings).map(([k, v]) => [k, v.value]),
  ) as Record<NumericKey, number>;
  return { ...s, boardcolor: '#243843', facecolor: '#ff9e35', keepart: true };
}

export function defaultView(): ViewState {
  return {
    mode: '3d',
    unit: 'mm',
    selected: null,
    selectionActive: false,
    isolate: false,
    step: 99, // ALL_STEPS
    layers: Array(LAYER_COUNT).fill(true),
    explode: 0,
    bend: 100,
    environment: 'day',
    scenePreset: 'studio',
    lights: false,
    dimming: 1,
    exposure: 0,
    presentation: false,
    toolpaths: false,
    selection: [],
    selectedGroup: null,
    hidden: [],
  };
}

// Returns an error message, or null when the settings are buildable.
export function checkSettings(s: DesignSettings): string | null {
  for (const [k, r] of Object.entries(numericSettings)) {
    const v = s[k as NumericKey];
    if (!Number.isFinite(v) || v < r.min || v > r.max)
      return `${r.label} must be between ${r.min} and ${r.max} ${'unit' in r ? r.unit : 'mm'}.`;
  }
  if (s.framewall * 2 >= s.frame) return 'Frame wall must be less than half the frame section.';
  if (
    s.groupSpacing !== undefined &&
    (!Number.isFinite(s.groupSpacing) || s.groupSpacing < -1000 || s.groupSpacing > 3000)
  )
    return 'Space between groups must be between -1000 and 3000 mm.';
  const m = s.mounting;
  if (m !== undefined) {
    const within = (v: unknown, [lo, hi]: readonly [number, number]) =>
      typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
    if (m?.kind !== 'rooftop' || !Object.hasOwn(rooftopStructures, m.structure))
      return 'Unknown sign mounting.';
    if (!within(m.clearance, rooftopLimits.clearance))
      return `Height above roof must be between ${rooftopLimits.clearance[0]} and ${rooftopLimits.clearance[1]} mm.`;
    if (!within(m.spacing, rooftopLimits.spacing))
      return `Post spacing must be between ${rooftopLimits.spacing[0]} and ${rooftopLimits.spacing[1]} mm.`;
  }
  return null;
}
