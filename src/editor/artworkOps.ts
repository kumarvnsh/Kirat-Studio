// Structure edits on an artwork. Pure and immutable: each returns a new Artwork (one undo step when
// passed through editDesign). Unknown ids are ignored rather than throwing, except where noted.
import type { Artwork, ArtworkGroup, ConstructionType, GroupLight } from '../domain/project.ts';

const HEX = /^#[0-9a-f]{6}$/i;

const mapGroups = (a: Artwork, id: string, fn: (g: ArtworkGroup) => ArtworkGroup): Artwork => ({
  ...a,
  groups: a.groups.map((g) => (g.id === id ? fn(g) : g)),
});

export const renameGroup = (a: Artwork, id: string, name: string) =>
  name.trim() ? mapGroups(a, id, (g) => ({ ...g, name: name.trim().slice(0, 60) })) : a;

export const renameElement = (a: Artwork, id: string, name: string) =>
  name.trim()
    ? { ...a, elements: a.elements.map((e) => (e.id === id ? { ...e, name: name.trim().slice(0, 60) } : e)) }
    : a;

const nextGroupId = (a: Artwork) => 'g' + (Math.max(0, ...a.groups.map((g) => +g.id.slice(1) || 0)) + 1);

// Move elements into a group. Elements keep their own construction; it counts as an override
// when it differs from the new group's.
export function moveElements(a: Artwork, ids: string[], groupId: string): Artwork {
  const g = a.groups.find((x) => x.id === groupId);
  if (!g) return a;
  const set = new Set(ids);
  return {
    ...a,
    elements: a.elements.map((e) => (set.has(e.id) ? { ...e, group: g.id, override: e.type !== g.type } : e)),
  };
}

// New group (optionally from elements). Takes the construction of the first element moved in.
export function createGroup(a: Artwork, name: string, ids: string[] = []): { artwork: Artwork; id: string } {
  const id = nextGroupId(a),
    first = a.elements.find((e) => ids.includes(e.id)),
    group: ArtworkGroup = { id, name: name.trim() || 'Group ' + id.slice(1), type: first?.type ?? 'front' };
  return { id, artwork: moveElements({ ...a, groups: [...a.groups, group] }, ids, id) };
}

// Remove a group; its elements move into `into`. A non-empty group needs a target.
export function deleteGroup(a: Artwork, id: string, into?: string): Artwork {
  const members = a.elements.filter((e) => e.group === id).map((e) => e.id);
  if (members.length && (!into || into === id || !a.groups.some((g) => g.id === into)))
    throw Error('Choose a group to receive the elements first.');
  const moved = members.length ? moveElements(a, members, into!) : a;
  return { ...moved, groups: moved.groups.filter((g) => g.id !== id) };
}

export const mergeGroups = (a: Artwork, from: string, into: string) => deleteGroup(a, from, into);

export function moveGroup(a: Artwork, id: string, toIndex: number): Artwork {
  const i = a.groups.findIndex((g) => g.id === id);
  if (i < 0) return a;
  const groups = a.groups.slice(),
    [g] = groups.splice(i, 1);
  groups.splice(Math.max(0, Math.min(groups.length, toIndex)), 0, g);
  return { ...a, groups };
}

export type GroupPatch = {
  type?: ConstructionType;
  faceColor?: string | null; // null clears
  returnColor?: string | null;
  params?: Record<string, number>;
  light?: GroupLight | null; // merged into the group's light; null resets to board defaults
};

// Returns an error message for out-of-range light settings, or null.
export function checkLight(l: GroupLight): string | null {
  if (l.mode !== undefined && !['white', 'rgb', 'artwork'].includes(l.mode)) return 'Unknown light mode.';
  if (l.temp !== undefined && !(Number.isFinite(l.temp) && l.temp >= 2000 && l.temp <= 10000))
    return 'Colour temperature must be 2000–10000 K.';
  if (l.color !== undefined && !HEX.test(l.color)) return 'Colours are #rrggbb.';
  if (l.dimming !== undefined && !(Number.isFinite(l.dimming) && l.dimming >= 0.1 && l.dimming <= 1))
    return 'Dimming must be 10–100%.';
  if (l.on !== undefined && typeof l.on !== 'boolean') return 'Invalid on/off.';
  return null;
}

export function setGroup(a: Artwork, id: string, patch: GroupPatch): Artwork {
  const g0 = a.groups.find((g) => g.id === id);
  if (!g0) return a;
  const g: ArtworkGroup = { ...g0 };
  if (patch.type && patch.type !== g.type) {
    g.type = patch.type;
    delete g.params; // params belong to the previous recipe
  }
  if (patch.params) g.params = { ...g.params, ...patch.params };
  if (patch.light === null) delete g.light;
  else if (patch.light) {
    const light = { ...g.light, ...patch.light },
      bad = checkLight(light);
    if (bad) throw Error(bad);
    g.light = light;
  }
  for (const k of ['faceColor', 'returnColor'] as const)
    if (patch[k] === null) delete g[k];
    else if (patch[k] !== undefined) {
      if (!HEX.test(patch[k]!)) throw Error('Colours are #rrggbb.');
      g[k] = patch[k]!;
    }
  return {
    ...a,
    groups: a.groups.map((x) => (x.id === id ? g : x)),
    elements: a.elements.map((e) => (e.group === id && !e.override ? { ...e, type: g.type } : e)),
  };
}

export type ElementPatch = {
  type?: ConstructionType | 'inherit'; // inherit = follow the group
  faceColor?: string | null;
};

export function setElements(a: Artwork, ids: string[], patch: ElementPatch): Artwork {
  const set = new Set(ids);
  if (patch.faceColor && !HEX.test(patch.faceColor)) throw Error('Colours are #rrggbb.');
  return {
    ...a,
    elements: a.elements.map((e) => {
      if (!set.has(e.id)) return e;
      const out = { ...e },
        group = a.groups.find((g) => g.id === e.group)!;
      if (patch.type === 'inherit') Object.assign(out, { type: group.type, override: false });
      else if (patch.type) Object.assign(out, { type: patch.type, override: patch.type !== group.type });
      if (patch.faceColor === null) delete out.faceColor;
      else if (patch.faceColor) out.faceColor = patch.faceColor;
      return out;
    }),
  };
}

// Distinct artwork colours, most used first: a palette for quick recolouring.
export function artworkPalette(a: Artwork, limit = 8): string[] {
  const weight = new Map<string, number>();
  for (const e of a.elements) {
    const c = (e.faceColor ?? e.color).toLowerCase();
    weight.set(c, (weight.get(c) ?? 0) + e.pixels);
  }
  const near = (p: string, q: string) => {
    const v = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [a1, b1, c1] = v(p),
      [a2, b2, c2] = v(q);
    return Math.hypot(a1 - a2, b1 - b2, c1 - c2) < 40;
  };
  const out: string[] = [];
  for (const [c] of [...weight].sort((x, y) => y[1] - x[1])) if (!out.some((o) => near(o, c))) out.push(c);
  return out.slice(0, limit);
}
