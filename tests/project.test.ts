import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject, serialise } from '../src/storage/project.ts';
import { defaultSettings, type DesignState } from '../src/domain/project.ts';

const square = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];
const PNG = 'data:image/png;base64,AAAA';
const element = (id: string, x: number, type: string) => ({
  id,
  name: id,
  type,
  pixels: 100,
  bounds: [x, 0, x + 10, 10],
  color: '#ff9e35',
  regions: [{ outer: square.map(([a, b]) => [a + x, b]), holes: [] }],
});

// Prototype v1 file: flat state, no groups.
const v1 = {
  format: 'kirat-signage-studio',
  version: 1,
  state: {
    ...defaultSettings(),
    night: true,
    isolate: true,
    components: [element('a', 0, 'front'), element('b', 12, 'metal')],
    artBounds: [0, 0, 22, 10],
    imageWidth: 22,
    imageHeight: 10,
    artData: PNG,
    approved: true,
  },
};

test('v1 prototype file migrates to v3 groups and keeps saved constructions', () => {
  const { design } = parseProject(JSON.stringify(v1));
  const [a, b] = design.artwork!.elements;
  assert.equal(a.group, b.group);
  assert.equal(a.type, 'front');
  assert.equal(b.type, 'metal');
  assert.equal(a.override, false);
  assert.equal(b.override, true);
  assert.equal(design.artwork!.approved, true);
  assert.equal((design as any).isolate, undefined, 'view state must not leak into the design');
});

test('v3 round-trips through serialise and parse', () => {
  const { design } = parseProject(JSON.stringify(v1));
  const again = parseProject(serialise({ design, fabrication: {} }));
  assert.deepEqual(again.design, design);
});

test('invalid settings are rejected with a readable message', () => {
  const design: DesignState = { settings: { ...defaultSettings(), width: 100 }, artwork: null };
  assert.throws(
    () => parseProject(serialise({ design, fabrication: {} })),
    /Board width must be between 500 and 12000/,
  );
});

test('unknown formats and versions are rejected', () => {
  assert.throws(() => parseProject('{"format":"other"}'), /Not a Kirat Studio project/);
  assert.throws(() => parseProject('{"format":"kirat-signage-studio","version":9}'), /Unsupported/);
});
