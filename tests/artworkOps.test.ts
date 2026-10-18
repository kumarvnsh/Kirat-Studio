import test from 'node:test';
import assert from 'node:assert/strict';
import {
  artworkPalette,
  createGroup,
  deleteGroup,
  mergeGroups,
  moveElements,
  moveGroup,
  renameElement,
  renameGroup,
  setElements,
  setGroup,
} from '../src/editor/artworkOps.ts';
import type { Artwork, ArtworkElement } from '../src/domain/project.ts';

const el = (id: string, group: string, type: ArtworkElement['type'], color = '#ffa030'): ArtworkElement => ({
  id,
  name: id,
  type,
  group,
  override: false,
  pixels: 100,
  bounds: [0, 0, 10, 10],
  color,
  regions: [],
});
const art = (): Artwork => ({
  elements: [el('K', 'g1', 'front'), el('i', 'g1', 'front'), el('s', 'g2', 'vinyl', '#161f2b')],
  groups: [
    { id: 'g1', name: 'Main wordmark', type: 'front', params: { depth: 80 } },
    { id: 'g2', name: 'Tagline', type: 'vinyl' },
  ],
  bounds: [0, 0, 10, 10],
  imageWidth: 10,
  imageHeight: 10,
  imageData: '',
  approved: false,
});

test('operations never mutate the input artwork', () => {
  const a = art(),
    before = JSON.stringify(a);
  renameGroup(a, 'g1', 'X');
  moveElements(a, ['K'], 'g2');
  setGroup(a, 'g1', { type: 'halo', faceColor: '#ffffff' });
  setElements(a, ['K'], { faceColor: '#000000' });
  createGroup(a, 'New', ['K']);
  assert.equal(JSON.stringify(a), before);
});

test('rename ignores blank names', () => {
  assert.equal(renameGroup(art(), 'g1', '  ').groups[0].name, 'Main wordmark');
  assert.equal(renameElement(art(), 'K', 'Letter K').elements[0].name, 'Letter K');
});

test('moving a letter into a group with another construction marks it as an override', () => {
  const a = moveElements(art(), ['K'], 'g2');
  const k = a.elements.find((e) => e.id === 'K')!;
  assert.equal(k.group, 'g2');
  assert.equal(k.type, 'front');
  assert.equal(k.override, true);
});

test("new group from a selection takes the first letter's construction", () => {
  const { artwork, id } = createGroup(art(), 'Dot', ['i']);
  const g = artwork.groups.find((x) => x.id === id)!;
  assert.equal(g.name, 'Dot');
  assert.equal(g.type, 'front');
  assert.equal(artwork.elements.find((e) => e.id === 'i')!.group, id);
  assert.equal(id, 'g3');
});

test('deleting a non-empty group needs a target; merge moves the letters', () => {
  assert.throws(() => deleteGroup(art(), 'g2'), /receive/);
  const m = mergeGroups(art(), 'g2', 'g1');
  assert.deepEqual(
    m.groups.map((g) => g.id),
    ['g1'],
  );
  const s = m.elements.find((e) => e.id === 's')!;
  assert.equal(s.group, 'g1');
  assert.equal(s.override, true, 'vinyl letter in a front-lit group is an override');
  const { artwork } = createGroup(art(), 'Empty');
  assert.equal(deleteGroup(artwork, 'g3').groups.length, 2);
});

test('group order can be changed', () => {
  assert.deepEqual(
    moveGroup(art(), 'g2', 0).groups.map((g) => g.id),
    ['g2', 'g1'],
  );
});

test('changing a group construction updates its letters and resets recipe params; colours set and clear', () => {
  let a = setGroup(art(), 'g1', { type: 'halo' });
  assert.equal(a.groups[0].params, undefined);
  assert.ok(a.elements.filter((e) => e.group === 'g1').every((e) => e.type === 'halo'));
  a = setGroup(a, 'g1', { faceColor: '#ff0000', returnColor: '#222222' });
  assert.equal(a.groups[0].faceColor, '#ff0000');
  a = setGroup(a, 'g1', { faceColor: null });
  assert.equal('faceColor' in a.groups[0], false);
  assert.throws(() => setGroup(art(), 'g1', { faceColor: 'red' }), /#rrggbb/);
});

test('letter overrides: construction and colour, and back to inherit', () => {
  let a = setElements(art(), ['K', 'i'], { type: 'metal', faceColor: '#123456' });
  assert.ok(
    a.elements.slice(0, 2).every((e) => e.type === 'metal' && e.override && e.faceColor === '#123456'),
  );
  a = setElements(a, ['K'], { type: 'inherit', faceColor: null });
  const k = a.elements[0];
  assert.equal(k.type, 'front');
  assert.equal(k.override, false);
  assert.equal(k.faceColor, undefined);
});

test('palette lists distinct artwork colours, heaviest first', () => {
  assert.deepEqual(artworkPalette(art()), ['#ffa030', '#161f2b']);
});

test('group lighting merges, validates and resets', async () => {
  let a = setGroup(art(), 'g1', { light: { mode: 'rgb', color: '#00ff00' } });
  a = setGroup(a, 'g1', { light: { dimming: 0.4 } });
  assert.deepEqual(a.groups[0].light, { mode: 'rgb', color: '#00ff00', dimming: 0.4 });
  assert.throws(() => setGroup(a, 'g1', { light: { dimming: 2 } }), /Dimming/);
  assert.throws(() => setGroup(a, 'g1', { light: { temp: 900 } }), /temperature/);
  a = setGroup(a, 'g1', { light: null });
  assert.equal(a.groups[0].light, undefined);
});
