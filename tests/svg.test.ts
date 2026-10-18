import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { shapesToArtwork, SVG_SIZE } from '../src/artwork/svg.ts';
import { area } from '../src/artwork/contours.js';

// Ring "O": circle of radius r with a circular hole, centred at (cx, cy) in SVG units.
function ring(cx: number, cy: number, r: number) {
  const s = new T.Shape();
  s.absarc(cx, cy, r, 0, Math.PI * 2, false);
  const h = new T.Path();
  h.absarc(cx, cy, r / 2, 0, Math.PI * 2, true);
  s.holes.push(h);
  return s;
}
function rect(x: number, y: number, w: number, h: number) {
  const s = new T.Shape();
  s.moveTo(x, y);
  s.lineTo(x + w, y);
  s.lineTo(x + w, y + h);
  s.lineTo(x, y + h);
  s.lineTo(x, y); // explicit close, as SVG "Z" produces
  return s;
}

test('curved letter keeps its hole and a smooth outline', () => {
  const a = shapesToArtwork([{ shape: ring(100, 100, 100), color: '#ff0000', group: null }]);
  assert.equal(a.elements.length, 1);
  const [r] = a.elements[0].regions;
  assert.equal(r.holes.length, 1);
  assert.ok(r.outer.length >= 24, 'curve is finely flattened, not a polygon of a few points');
  // Area of ring normalised to SVG_SIZE across: π(R² - (R/2)²) with R = SVG_SIZE / 2.
  const R = SVG_SIZE / 2,
    expected = Math.PI * (R * R - (R / 2) * (R / 2)),
    got = Math.abs(area(r.outer)) - Math.abs(area(r.holes[0]));
  assert.ok(Math.abs(got - expected) / expected < 0.01, `area within 1% (${got} vs ${expected})`);
});

test('artwork is normalised so the longest side is SVG_SIZE, starting at 0', () => {
  const a = shapesToArtwork([
    { shape: rect(500, 300, 40, 10), color: '#000000', group: null },
    { shape: rect(560, 300, 40, 10), color: '#000000', group: null },
  ]);
  assert.deepEqual(a.bounds, [0, 0, SVG_SIZE, SVG_SIZE * (10 / 100)]);
  assert.equal(a.elements[0].regions[0].outer.length, 4, 'closing duplicate point removed');
});

test('top-level SVG groups become named artwork groups', () => {
  const a = shapesToArtwork([
    { shape: ring(50, 50, 50), color: '#e0262f', group: 'Symbol' },
    { shape: rect(150, 20, 40, 60), color: '#ed982f', group: 'Wordmark' },
    { shape: rect(200, 20, 40, 60), color: '#ed982f', group: 'Wordmark' },
    { shape: rect(150, 90, 10, 10), color: '#224444', group: 'Tagline' },
    { shape: rect(165, 90, 10, 10), color: '#224444', group: 'Tagline' },
  ]);
  assert.deepEqual(
    a.groups.map((g) => g.name),
    ['Symbol', 'Wordmark', 'Tagline'],
  );
  const groupName = (id: string) => a.groups.find((g) => g.id === id)!.name;
  assert.deepEqual(
    a.elements.map((e) => groupName(e.group)),
    ['Symbol', 'Wordmark', 'Wordmark', 'Tagline', 'Tagline'],
  );
  assert.equal(a.groups.find((g) => g.name === 'Tagline')!.type, 'vinyl');
  assert.equal(a.groups.find((g) => g.name === 'Wordmark')!.type, 'front');
});

test('ungrouped files fall back to layout grouping; empty files are rejected', () => {
  const a = shapesToArtwork([
    { shape: rect(0, 0, 40, 60), color: '#000000', group: null },
    { shape: rect(50, 0, 40, 60), color: '#000000', group: null },
  ]);
  assert.equal(a.groups.length, 1);
  assert.throws(() => shapesToArtwork([]), /No filled shapes/);
});
