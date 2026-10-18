import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_STEPS, assemblySteps, visibleLayers } from '../src/domain/assembly.ts';
import { defaultSettings, LAYERS, type DesignState } from '../src/domain/project.ts';

const design = (backing: number): DesignState => ({
  settings: { ...defaultSettings(), backing },
  artwork: null,
});

test('every step comes after the steps it depends on', () => {
  for (const d of [design(0), design(1.5)]) {
    const steps = assemblySteps(d),
      seen = new Set<string>();
    for (const s of steps) {
      for (const dep of s.dependsOn) assert.ok(seen.has(dep), `${s.id} depends on ${dep}`);
      seen.add(s.id);
    }
  }
});

test('the backing sheet step exists only when the design has one', () => {
  assert.ok(!assemblySteps(design(0)).some((s) => s.id === 'backing'));
  assert.ok(assemblySteps(design(1.5)).some((s) => s.id === 'backing'));
});

test('completing all steps reveals every layer the design uses; steps reveal cumulatively', () => {
  const steps = assemblySteps(design(1.5));
  assert.deepEqual([...visibleLayers(steps, ALL_STEPS)].sort(), LAYERS.map((l) => l.id).sort());
  assert.deepEqual([...visibleLayers(steps, 1)], ['frame']);
  assert.ok(visibleLayers(steps, 3).has('gi'));
});
