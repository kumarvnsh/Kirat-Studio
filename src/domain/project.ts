// Project data model. Project data defines the sign; the 3D scene only displays it.
//   DesignState      — what the customer approves. Saved, undoable.
//   ViewState        — how we're looking at it. Never saved into the design, never undone.
//   FabricationState — how the workshop makes it. Saved separately from the design.
// Dimensions are millimetres. Conversion to metres happens only in src/scene.

export type ConstructionType = 'front' | 'halo' | 'acrylic' | 'metal' | 'acplogo' | 'vinyl' | 'omit';

export const constructionNames: Record<ConstructionType, string> = {
  front: 'Front-lit',
  halo: 'Halo-lit',
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
  color: string;
  regions: Region[];
};

export type ArtworkGroup = { id: string; name: string; type: ConstructionType };

export type Artwork = {
  elements: ArtworkElement[];
  groups: ArtworkGroup[];
  bounds: [number, number, number, number];
  imageWidth: number;
  imageHeight: number;
  imageData: string; // PNG data URL of the cleaned artwork, used for face colours
  approved: boolean;
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
  depth: { label: 'Return depth', min: 20, max: 200, step: 1, value: 60 },
  gauge: { label: 'Return gauge', min: 0.4, max: 2, step: 0.1, value: 0.6 },
  face: { label: 'Acrylic face', min: 1, max: 20, step: 0.5, value: 3 },
  back: { label: 'Letter back', min: 1, max: 10, step: 0.5, value: 3 },
} as const;
export type NumericKey = keyof typeof numericSettings;

export type DesignSettings = Record<NumericKey, number> & {
  boardcolor: string;
  facecolor: string;
  keepart: boolean; // preserve artwork colours on faces
};

export type DesignState = { settings: DesignSettings; artwork: Artwork | null };

export type ViewMode = '3d' | '2d' | 'bend';
export type ViewState = {
  mode: ViewMode;
  selected: string | null;
  selectionActive: boolean;
  isolate: boolean;
  step: number; // assembly stage 1..7
  layers: boolean[];
  explode: number; // 0..100
  bend: number; // forming progress 0..100
  night: boolean;
  lights: boolean;
  brightness: number;
  presentation: boolean;
};

// Reserved for seams, bend calibration, tool settings and allowances (Milestone E).
export type FabricationState = Record<string, never>;

export const LAYER_COUNT = 7;

export function defaultSettings(): DesignSettings {
  const s = Object.fromEntries(Object.entries(numericSettings).map(([k, v]) => [k, v.value])) as Record<
    NumericKey,
    number
  >;
  return { ...s, boardcolor: '#243843', facecolor: '#ff9e35', keepart: true };
}

export function defaultView(): ViewState {
  return {
    mode: '3d',
    selected: null,
    selectionActive: false,
    isolate: false,
    step: LAYER_COUNT,
    layers: Array(LAYER_COUNT).fill(true),
    explode: 0,
    bend: 100,
    night: true,
    lights: true,
    brightness: 1,
    presentation: false,
  };
}

// Returns an error message, or null when the settings are buildable.
export function checkSettings(s: DesignSettings): string | null {
  for (const [k, r] of Object.entries(numericSettings)) {
    const v = s[k as NumericKey];
    if (!Number.isFinite(v) || v < r.min || v > r.max)
      return `${r.label} must be between ${r.min} and ${r.max} mm.`;
  }
  if (s.framewall * 2 >= s.frame) return 'Frame wall must be less than half the frame section.';
  return null;
}

// Flat object for SignScene.build(): the one place design + view meet the renderer.
export function sceneInput(design: DesignState, view: ViewState) {
  const a = design.artwork;
  return {
    ...design.settings,
    ...view,
    components: a?.elements ?? [],
    artBounds: a?.bounds,
    imageWidth: a?.imageWidth ?? 1,
    imageHeight: a?.imageHeight ?? 1,
  };
}
