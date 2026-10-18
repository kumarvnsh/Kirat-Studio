import test from 'node:test';
import assert from 'node:assert/strict';
import { cutChecks, defaultCut, offsetRegion, toolpath } from '../src/fabrication/cutting.ts';
import { area } from '../src/artwork/contours.js';
import type { Point, Region } from '../src/domain/project.ts';

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const bbox = (pts: Point[]) => {
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => +v.toFixed(2));
};

test('router path runs one tool radius outside the outer edge and inside the counter', () => {
  const part: Region = { outer: rect(0, 0, 100, 100), holes: [rect(30, 30, 40, 40)] };
  const [p] = toolpath(part, defaultCut); // Ø6 → 3 mm
  assert.deepEqual(bbox(p.outer), [-3, -3, 103, 103]);
  assert.equal(p.holes.length, 1);
  assert.deepEqual(bbox(p.holes[0]), [33, 33, 67, 67]);
});

test('laser path uses half the kerf', () => {
  const [p] = toolpath(
    { outer: rect(0, 0, 10, 10), holes: [] },
    { ...defaultCut, method: 'laser', kerf: 0.2 },
  );
  assert.deepEqual(bbox(p.outer), [-0.1, -0.1, 10.1, 10.1]);
});

test('offset keeps the approved outline untouched', () => {
  const outer = rect(0, 0, 50, 50),
    copy = JSON.stringify(outer);
  offsetRegion({ outer, holes: [] }, 5);
  assert.equal(JSON.stringify(outer), copy);
});

test('a counter smaller than the tool is reported as lost', () => {
  const issues = cutChecks({ outer: rect(0, 0, 100, 100), holes: [rect(48, 48, 4, 4)] }, defaultCut);
  assert.ok(issues.some((i) => i.kind === 'counter-lost'));
});

test('a narrow stroke is flagged; a solid letter is not', () => {
  const thin = cutChecks({ outer: rect(0, 0, 100, 2), holes: [] }, defaultCut);
  assert.ok(thin.some((i) => i.kind === 'narrow'));
  assert.equal(cutChecks({ outer: rect(0, 0, 100, 100), holes: [] }, defaultCut).length, 0);
});

test('a counter with a slot narrower than the tool is flagged; plain corner rounding is not', () => {
  const slotted: Point[] = [
    [30, 30],
    [90, 30],
    [90, 34],
    [60, 34],
    [60, 60],
    [30, 60],
  ];
  assert.ok(Math.abs(area(slotted)) > 1000);
  const issues = cutChecks({ outer: rect(0, 0, 100, 100), holes: [slotted] }, defaultCut);
  assert.ok(issues.some((i) => i.kind === 'counter-corners'));
  const plain = cutChecks({ outer: rect(0, 0, 100, 100), holes: [rect(40, 10, 8, 80)] }, defaultCut);
  assert.equal(plain.length, 0);
});
