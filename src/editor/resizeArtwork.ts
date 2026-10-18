import { computeLayout } from '../domain/layout.ts';
import type { Artwork, DesignState } from '../domain/project.ts';
import { setElements, setGroup, type ElementPatch, type GroupPatch } from './artworkOps.ts';
const validSource = (n: number) => Number.isFinite(n) && n > 0;
const validSize = (n: number) => Number.isFinite(n) && n >= 5 && n <= 4000;
export function resizeArtwork(design: DesignState, scope: { ids: string[]; groupId?: string }, axis: 'height' | 'width', targetMm: number, linked: boolean): Artwork {
  const a = design.artwork;
  if (!a) throw Error('Select artwork to resize.');
  if (!validSize(targetMm)) throw Error('Dimensions must be between 5 and 4000 mm.');
  const layout = computeLayout(design), key = axis === 'height' ? 'charHeight' : 'charWidth';
  const keys: ('charHeight' | 'charWidth')[] = linked ? ['charHeight', 'charWidth'] : [key];
  let out = a;
  const check = (n: number) => { if (!validSize(n)) throw Error('Dimensions must be between 5 and 4000 mm.'); return n; };
  if (scope.groupId) {
    const g = a.groups.find(g => g.id === scope.groupId), m = layout.groupMetrics[scope.groupId];
    if (!g || !m) throw Error('Select a valid group.');
    if (!validSource(m.charHeight) || !validSource(m.charWidth)) throw Error('Cannot resize invalid source dimensions.');
    const ratio = targetMm / m[key], patch: GroupPatch = {};
    for (const k of keys) patch[k] = check(m[k] * ratio);
    out = setGroup(out, g.id, patch);
    for (const e of a.elements.filter(e => e.group === g.id)) {
      const ep: ElementPatch = {};
      for (const k of keys) if (e[k] !== undefined) {
        if (!validSource(e[k]!)) throw Error('Cannot resize invalid source dimensions.');
        ep[k] = check(e[k]! * ratio);
      }
      if (Object.keys(ep).length) out = setElements(out, [e.id], ep);
    }
  } else {
    const ids = [...new Set(scope.ids)], first = layout.elements.find(e => e.id === ids[0]);
    if (!first) throw Error('Select a valid shape.');
    const dimension = (bounds: number[], k: string) => k === 'charHeight' ? bounds[3] - bounds[1] : bounds[2] - bounds[0];
    const source = dimension(first.bounds, key);
    if (!validSource(source)) throw Error('Cannot resize invalid source dimensions.');
    const ratio = targetMm / source;
    for (const id of ids) {
      const e = layout.elements.find(e => e.id === id);
      if (!e || !validSource(dimension(e.bounds,'charHeight')) || !validSource(dimension(e.bounds,'charWidth'))) throw Error('Cannot resize invalid source dimensions.');
      const patch: ElementPatch = {};
      for (const k of keys) patch[k] = check(dimension(e.bounds, k) * ratio);
      out = setElements(out, [id], patch);
    }
  }
  const after = computeLayout({...design, artwork: out});
  const affected = scope.groupId ? after.elements.filter(e => e.group === scope.groupId) : after.elements.filter(e => scope.ids.includes(e.id));
  for (const e of affected) for (const k of keys) {
    const size = k === 'charHeight' ? e.bounds[3]-e.bounds[1] : e.bounds[2]-e.bounds[0];
    check(size);
  }
  return out;
}
