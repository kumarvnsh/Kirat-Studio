// v7 adds panel-integrated constructions and colour tracing.
// v6 adds independent proposal options; v5 added presentation separate from design and fabrication.
// v3 had board-wide letter dimensions; v4 keeps them per group as recipe params.
// v1/v2 (prototype) files store one flat `state` object. Older files are migrated on open.
import {
  checkSettings,
  constructionNames,
  defaultSettings,
  numericSettings,
  type Artwork,
  type DesignSettings,
  type DesignState,
  type FabricationState,
} from '../domain/project.ts';
import { autoGroup } from '../artwork/grouping.js';
import { checkParams } from '../domain/recipes.ts';
import { defaultFabrication } from '../fabrication/plan.ts';
import { checkLight } from '../editor/artworkOps.ts';
import {
  defaultPresentation,
  validatePresentation,
  type PresentationConfig,
} from '../presentation/model.ts';

export const FORMAT = 'kirat-signage-studio';
export const VERSION = 7;

export type TraceSettings = { background: string; backgroundColor?: string; threshold: number; minpixels: number };
export type ProjectFile = {
  design: DesignState;
  fabrication: FabricationState;
  traceSettings?: TraceSettings;
  presentation?: PresentationConfig;
  warnings?: string[];
};

export function serialise(p: ProjectFile): string {
  const { warnings, ...saved } = p;
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    ...saved,
    presentation: p.presentation ?? defaultPresentation(),
    savedAt: new Date().toISOString(),
  });
}

export function parseProject(text: string): ProjectFile {
  const raw = JSON.parse(text);
  if (raw?.format !== FORMAT) throw Error('Not a Kirat Studio project.');
  let design: DesignState;
  if (raw.version === 4 || raw.version === 5 || raw.version === 6 || raw.version === 7)
    design = raw.design && {
      ...raw.design,
      settings: { ...defaultSettings(), ...raw.design.settings },
    };
  else if (raw.version === 3) design = fromV3(raw.design);
  else if (raw.version === 1 || raw.version === 2)
    design = fromV3(fromFlatState(raw.state, raw.version));
  else throw Error('Unsupported project version ' + raw.version + '.');
  validateDesign(design);
  const presentation = validatePresentation(raw.version >= 5 ? raw.presentation : undefined);
  return {
    design,
    fabrication: parseFabrication(raw.fabrication),
    traceSettings: raw.traceSettings,
    presentation: presentation.value,
    warnings: presentation.warnings,
  };
}

// Fabrication settings: defaults for anything missing; out-of-range values rejected.
const fabRanges: Record<string, [number, number]> = {
  toolDiameter: [0.5, 25],
  kerf: [0, 2],
  minStroke: [0, 20],
  minAngle: [0.5, 20],
  curveSpacing: [1, 100],
  cornerAngle: [5, 90],
  overlap: [0, 100],
};
function parseFabrication(raw: any): FabricationState {
  const d = defaultFabrication(),
    f = { cut: { ...d.cut, ...raw?.cut }, bend: { ...d.bend, ...raw?.bend } };
  if (f.cut.method !== 'router' && f.cut.method !== 'laser') throw Error('Invalid cutting method.');
  for (const [k, v] of [...Object.entries(f.cut), ...Object.entries(f.bend)]) {
    const r = fabRanges[k];
    if (r && !(typeof v === 'number' && v >= r[0] && v <= r[1]))
      throw Error('Invalid fabrication setting ' + k + '.');
  }
  return f;
}

const LETTER_KEYS = ['depth', 'gauge', 'face', 'back'] as const;

// v3: depth/gauge/face/back were board-wide. Give them to every front-lit and halo group.
function fromV3(d: any): DesignState {
  if (!d?.settings) throw Error('Missing design settings.');
  const { depth, gauge, face, back, ...rest } = d.settings,
    old = { depth, gauge, face, back };
  const settings = { ...defaultSettings(), ...rest } as DesignSettings;
  if (!d.artwork) return { settings, artwork: null };
  const groups = d.artwork.groups.map((g: any) =>
    g.type === 'front' || g.type === 'halo'
      ? {
          ...g,
          params: Object.fromEntries(
            LETTER_KEYS.filter((k) => typeof old[k] === 'number').map((k) => [k, old[k]]),
          ),
        }
      : g,
  );
  return { settings, artwork: { ...d.artwork, groups } };
}

// Prototype files: one flat object mixing design and view fields. Produces a v3 design.
function fromFlatState(s: any, version: 1 | 2): any {
  if (!s || !Array.isArray(s.components)) throw Error('Missing artwork data.');
  const keys = [...Object.keys(defaultSettings()), ...LETTER_KEYS];
  const settings = Object.fromEntries(keys.filter((k) => k in s).map((k) => [k, s[k]]));
  let elements = s.components,
    groups = s.groups;
  if (version === 1) {
    // v1 had no groups: group by layout, keep each element's saved construction.
    const g = autoGroup(elements);
    groups = g.groups;
    elements = g.components.map((c: any, i: number) => ({
      ...c,
      type: s.components[i].type,
      override: s.components[i].type !== g.groups.find((x: any) => x.id === c.group)!.type,
    }));
  }
  return {
    settings,
    artwork: {
      elements,
      groups,
      bounds: s.artBounds,
      imageWidth: s.imageWidth,
      imageHeight: s.imageHeight,
      imageData: s.artData,
      approved: !!s.approved,
    },
  };
}

const finite = (n: unknown, lo: number, hi: number) =>
  typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
const isType = (t: unknown) => typeof t === 'string' && Object.hasOwn(constructionNames, t);
const optColour = (c: unknown) =>
  c === undefined || (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c));
const isId = (id: unknown) => typeof id === 'string' && /^[\w-]{1,60}$/.test(id);

export function validateDesign(d: DesignState) {
  if (!d?.settings) throw Error('Missing design settings.');
  for (const k of Object.keys(numericSettings))
    if (typeof (d.settings as any)[k] !== 'number') throw Error('Invalid ' + k + '.');
  const bad = checkSettings(d.settings);
  if (bad) throw Error(bad);
  if (
    !/^#[0-9a-f]{6}$/i.test(d.settings.boardcolor) ||
    !/^#[0-9a-f]{6}$/i.test(d.settings.facecolor)
  )
    throw Error('Invalid colour.');
  if (d.artwork) validateArtwork(d.artwork);
}

function validateArtwork(a: Artwork) {
  const b = a.bounds;
  if (
    !Array.isArray(b) ||
    b.length !== 4 ||
    b.some((v) => !finite(v, 0, 2000)) ||
    b[2] <= b[0] ||
    b[3] <= b[1]
  )
    throw Error('Invalid artwork bounds.');
  if (!finite(a.imageWidth, 1, 2000) || !finite(a.imageHeight, 1, 2000))
    throw Error('Invalid artwork dimensions.');
  if (
    typeof a.imageData !== 'string' ||
    !a.imageData.startsWith('data:image/png;base64,') ||
    a.imageData.length > 12e6
  )
    throw Error('Invalid face artwork.');
  if (a.origin !== undefined && a.origin !== 'vector' && a.origin !== 'trace')
    throw Error('Invalid artwork origin.');
  if (!Array.isArray(a.groups) || a.groups.length > 100) throw Error('Invalid artwork groups.');
  for (const g of a.groups)
    if (
      !isId(g.id) ||
      typeof g.name !== 'string' ||
      g.name.length > 60 ||
      !isType(g.type) ||
      (g.params !== undefined && (typeof g.params !== 'object' || checkParams(g.type, g.params))) ||
      !optColour(g.faceColor) ||
      !optColour(g.returnColor) ||
      (g.dayNight !== undefined && typeof g.dayNight !== 'boolean') ||
      (g.light !== undefined && (typeof g.light !== 'object' || checkLight(g.light) !== null))
    )
      throw Error(
        'Invalid artwork group' + (g.params ? ': ' + checkParams(g.type, g.params) : '.'),
      );
  if (!Array.isArray(a.elements) || a.elements.length > 100)
    throw Error('Project exceeds the 100-shape limit.');
  let points = 0;
  for (const e of a.elements) {
    if (
      !isId(e.id) ||
      !isType(e.type) ||
      !/^#[0-9a-f]{6}$/i.test(e.color) ||
      !optColour(e.faceColor) ||
      (e.returnColor !== null && !optColour(e.returnColor)) ||
      typeof e.name !== 'string'
    )
      throw Error('Invalid element data.');
    if (!a.groups.some((g) => g.id === e.group) || typeof e.override !== 'boolean')
      throw Error('Invalid element group.');
    if (
      !Array.isArray(e.bounds) ||
      e.bounds.length !== 4 ||
      e.bounds.some((n) => !finite(n, 0, 2000))
    )
      throw Error('Invalid element bounds.');
    if (!Array.isArray(e.regions) || e.regions.length > 100) throw Error('Invalid contours.');
    for (const r of e.regions) {
      if (!Array.isArray(r.outer) || !Array.isArray(r.holes)) throw Error('Invalid contours.');
      for (const loop of [r.outer, ...r.holes]) {
        points += loop.length;
        if (
          loop.length < 3 ||
          loop.length > 10000 ||
          loop.some(
            (v) => !Array.isArray(v) || v.length !== 2 || v.some((n) => !finite(n, -10000, 10000)),
          )
        )
          throw Error('Invalid contour points.');
      }
    }
  }
  if (points > 50000) throw Error('Project exceeds the contour complexity limit.');
}

// Browser autosave. The previous session's autosave is kept as a backup.
export const AUTOSAVE = 'kirat-studio-autosave';
export const BACKUP = 'kirat-studio-backup';
export function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeStore(key: string, text: string): boolean {
  try {
    localStorage.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}
