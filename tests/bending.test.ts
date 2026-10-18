import test from 'node:test';
import assert from 'node:assert/strict';
import { bendSchedule } from '../src/fabrication/bending.ts';
import type { Point } from '../src/domain/project.ts';

const square = (s: number): Point[] => [
  [0, 0],
  [s, 0],
  [s, s],
  [0, s],
];
const circle = (r: number, n: number): Point[] =>
  Array.from({ length: n }, (_, i) => [
    r * Math.cos((2 * Math.PI * i) / n),
    r * Math.sin((2 * Math.PI * i) / n),
  ]);

test('square outer contour: four convex 90° corners spaced along the strip from a mid-edge seam', () => {
  const s = bendSchedule(square(100), 'outer', 60);
  assert.equal(s.length, 400);
  assert.equal(s.cutLength, 410);
  assert.deepEqual(
    s.stations.map((x) => [Math.round(x.at), Math.round(x.angle), x.direction]),
    [
      [50, 90, 'convex'],
      [150, 90, 'convex'],
      [250, 90, 'convex'],
      [350, 90, 'convex'],
    ],
  );
  assert.deepEqual(
    s.segments.map((g) => g.kind),
    ['straight', 'corner', 'straight', 'corner', 'straight', 'corner', 'straight', 'corner', 'straight'],
  );
});

test('a counter (inner contour) bends the other way, whatever the input winding', () => {
  for (const loop of [square(40), square(40).reverse()]) {
    const s = bendSchedule(loop, 'inner', 60);
    assert.ok(s.stations.every((x) => x.direction === 'concave'));
  }
});

test('a polygonal circle becomes one curve with the right radius and total angle', () => {
  const s = bendSchedule(circle(100, 72), 'outer', 60);
  const curves = s.segments.filter((g) => g.kind === 'curve');
  assert.equal(curves.length, 1);
  const c = curves[0] as Extract<(typeof s.segments)[number], { kind: 'curve' }>;
  assert.ok(Math.abs(c.angle - 360) < 1, `total turn ${c.angle}`);
  assert.ok(Math.abs(c.radius - 100) < 3, `radius ${c.radius}`);
  assert.ok(Math.abs(s.length - 2 * Math.PI * 100) < 1);
});

test('tiny wobbles do not create extra bends', () => {
  const wobbly: Point[] = [
    [0, 0],
    [50, 0.5],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  const s = bendSchedule(wobbly, 'outer', 60);
  assert.equal(s.stations.length, 4);
});

test('a finely flattened curve keeps its full angle even when each vertex turns less than minAngle', () => {
  const s = bendSchedule(circle(300, 2000), 'outer', 60); // ~0.18° per vertex
  const total = s.stations.reduce((n, x) => n + x.angle, 0);
  assert.ok(Math.abs(total - 360) < 2.5, `total ${total}`); // at most one unfinished step at the seam
  const curves = s.segments.filter((g) => g.kind === 'curve');
  assert.equal(curves.length, 1);
});
