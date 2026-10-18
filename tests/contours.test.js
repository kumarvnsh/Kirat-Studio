import test from 'node:test';
import assert from 'node:assert/strict';
import { traceMask, area } from '../src/artwork/contours.js';

// 20x20 mask: a ring (letter "O") plus a separate 3x3 dot.
function ringWithDot() {
  const w = 20,
    h = 20,
    m = new Uint8Array(w * h);
  for (let y = 2; y < 14; y++)
    for (let x = 2; x < 14; x++) {
      const inHole = x >= 6 && x < 10 && y >= 6 && y < 10;
      if (!inHole) m[y * w + x] = 1;
    }
  for (let y = 16; y < 19; y++) for (let x = 16; x < 19; x++) m[y * w + x] = 1;
  return { m, w, h };
}

test('traceMask keeps inner holes and separates disconnected shapes', () => {
  const { m, w, h } = ringWithDot();
  const { components } = traceMask(m, w, h, { minPixels: 3 });
  assert.equal(components.length, 2);
  const [ring, dot] = components;
  assert.equal(ring.regions.length, 1);
  assert.equal(ring.regions[0].holes.length, 1);
  assert.ok(area(ring.regions[0].outer) > 0);
  assert.ok(area(ring.regions[0].holes[0]) < 0);
  assert.equal(dot.regions[0].holes.length, 0);
});

test('traceMask drops shapes below minPixels', () => {
  const { m, w, h } = ringWithDot();
  assert.equal(traceMask(m, w, h, { minPixels: 20 }).components.length, 1);
});
