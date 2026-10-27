import test from 'node:test';
import assert from 'node:assert/strict';
import { maskFromRGBA, traceMask } from '../src/artwork/contours.js';
const image = (bg, alpha = 255) => {
  const d = new Uint8ClampedArray(20 * 20 * 4);
  for (let i = 0; i < 400; i++) d.set([...bg, alpha], i * 4);
  for (let y = 4; y < 16; y++)
    for (let x = 4; x < 16; x++) d.set([255, 255, 255, 255], (y * 20 + x) * 4);
  for (let y = 8; y < 12; y++) for (let x = 8; x < 12; x++) d.set([...bg, alpha], (y * 20 + x) * 4);
  return d;
};
test('auto removes dark coloured background and retains white lettering with counters', () => {
  const d = image([23, 55, 47]);
  const m = maskFromRGBA(d, 20, 20, 'auto', 45);
  assert.equal(m[0], 0);
  assert.equal(m[5 * 20 + 5], 1);
  assert.equal(m[9 * 20 + 9], 0);
  const r = traceMask(m, 20, 20, { minPixels: 3 });
  assert.equal(r.components.length, 1);
  assert.equal(r.components[0].regions[0].holes.length, 1);
});
test('auto honours transparency and custom removal is independent of corners', () => {
  const d = image([23, 55, 47], 0);
  assert.equal(maskFromRGBA(d, 20, 20, 'auto', 45)[0], 0);
  const opaque = image([23, 55, 47]);
  opaque.set([255, 0, 0, 255], 0);
  assert.equal(maskFromRGBA(opaque, 20, 20, 'custom', 45, '#17372f')[1], 0);
  assert.equal(maskFromRGBA(opaque, 20, 20, 'custom', 45, '#17372f')[0], 1);
});
import { splitColourGroups } from '../src/artwork/grouping.js';
test('contrasting white wordmark and gold strip can be assigned constructions independently', () => {
  const groups = [{ id: 'g1', name: 'Wordmark', type: 'front' }],
    components = [
      { id: 'a', group: 'g1', color: '#ffffff' },
      { id: 'b', group: 'g1', color: '#fafafa' },
      { id: 'c', group: 'g1', color: '#d0a276' },
    ];
  const result = splitColourGroups(groups, components);
  assert.equal(result.groups.length, 2);
  assert.equal(result.components[0].group, result.components[1].group);
  assert.notEqual(result.components[0].group, result.components[2].group);
  assert.equal(components[0].group, 'g1');
});
test('auto handles a white background and ignores one contaminated corner', () => {
  const d = image([23, 55, 47]);
  d.set([255, 0, 0, 255], 0);
  assert.equal(maskFromRGBA(d, 20, 20, 'auto', 45)[1], 0);
  const white = image([255, 255, 255]);
  for (let y = 5; y < 8; y++)
    for (let x = 5; x < 8; x++) white.set([0, 0, 0, 255], (y * 20 + x) * 4);
  const mask = maskFromRGBA(white, 20, 20, 'auto', 45);
  assert.equal(mask[0], 0);
  assert.equal(mask[6 * 20 + 6], 1);
});
