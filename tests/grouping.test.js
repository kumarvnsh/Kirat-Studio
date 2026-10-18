import test from 'node:test';
import assert from 'node:assert/strict';
import { attachDetails, autoGroup, applyGroupType } from '../src/artwork/grouping.js';

// Box-shaped component helper: bounds [x0,y0,x1,y1] in image pixels (y down).
const box = (id, x0, y0, x1, y1) => ({
  id,
  name: id,
  type: 'front',
  pixels: (x1 - x0) * (y1 - y0),
  bounds: [x0, y0, x1, y1],
  color: '#ffffff',
  regions: [
    {
      outer: [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
      holes: [],
    },
  ],
});

test('attachDetails merges an i-dot into the stem below it', () => {
  const stem = box('stem', 10, 30, 16, 80);
  const dot = box('dot', 10, 18, 16, 24);
  const next = box('k', 25, 10, 55, 80);
  const out = attachDetails([stem, dot, next]);
  assert.deepEqual(
    out.map((c) => c.id),
    ['stem', 'k'],
  );
  assert.equal(out[0].regions.length, 2);
  assert.deepEqual(out[0].bounds, [10, 18, 16, 80]);
});

test('attachDetails leaves a full stop beside a letter alone', () => {
  const letter = box('a', 0, 0, 30, 40);
  const stop = box('stop', 34, 34, 40, 40);
  assert.equal(attachDetails([letter, stop]).length, 2);
});

test('autoGroup splits rows and gives the small tagline one construction', () => {
  // Wordmark: two tall letters. Tagline: three small letters on a lower row.
  const comps = [
    box('W1', 0, 0, 60, 100),
    box('W2', 70, 0, 130, 100),
    box('t1', 0, 130, 15, 155),
    box('t2', 20, 130, 35, 155),
    box('t3', 40, 130, 55, 155),
  ];
  const { components, groups } = autoGroup(comps);
  assert.equal(groups.length, 2);
  const g = Object.fromEntries(components.map((c) => [c.id, c.group]));
  assert.equal(g.W1, g.W2);
  assert.equal(g.t1, g.t2);
  assert.equal(g.t2, g.t3);
  assert.notEqual(g.W1, g.t1);
  const tagline = groups.find((x) => x.id === g.t1);
  assert.equal(tagline.type, 'vinyl');
  for (const c of components.filter((c) => c.group === tagline.id)) assert.equal(c.type, 'vinyl');
  assert.equal(groups.find((x) => x.id === g.W1).type, 'front');
});

test('autoGroup separates a symbol from the wordmark by a wide gap', () => {
  const comps = [box('S', 0, 0, 100, 100), box('W1', 300, 10, 360, 100), box('W2', 370, 10, 430, 100)];
  const { components } = autoGroup(comps);
  const g = Object.fromEntries(components.map((c) => [c.id, c.group]));
  assert.notEqual(g.S, g.W1);
  assert.equal(g.W1, g.W2);
});

test('autoGroup keeps the wordmark front-lit next to a taller symbol', () => {
  const comps = [
    box('S', 0, 0, 220, 220),
    box('W1', 400, 60, 470, 170),
    box('W2', 480, 60, 550, 170),
    box('t1', 400, 300, 430, 335),
    box('t2', 440, 300, 470, 335),
  ];
  const { components, groups } = autoGroup(comps);
  const type = Object.fromEntries(components.map((c) => [c.id, c.type]));
  assert.equal(groups.length, 3);
  assert.equal(type.S, 'front');
  assert.equal(type.W1, 'front');
  assert.equal(type.t1, 'vinyl');
});

test('applyGroupType keeps per-element overrides', () => {
  const groups = [{ id: 'g1', name: 'Tagline', type: 'vinyl' }];
  const components = [
    { id: 'a', group: 'g1', type: 'vinyl' },
    { id: 'b', group: 'g1', type: 'metal', override: true },
  ];
  applyGroupType(groups, components, 'g1', 'acrylic');
  assert.equal(groups[0].type, 'acrylic');
  assert.equal(components[0].type, 'acrylic');
  assert.equal(components[1].type, 'metal');
});
