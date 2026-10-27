import test from 'node:test';
import assert from 'node:assert/strict';
import { presentationFixture, presentationTypes } from './fixtures/presentation.ts';
import { computeLayout } from '../src/domain/layout.ts';
for (const type of presentationTypes) test(`${type} presentation fixture retains counter and material overrides`, () => {
  const design = presentationFixture(type), before = JSON.stringify(design);
  const layout = computeLayout(design), e = layout.elements[0];
  assert.equal(e.regions[0].holes.length, 1);
  assert.equal(e.faceColor, '#c74c36');
  assert.equal(e.returnColor, '#283d46');
  assert.ok(e.parts.every(p => p.z1 > p.z0));
  assert.equal(JSON.stringify(design), before);
  if (type === 'halo' || type === 'fronthalo') assert.equal(e.params.standoff, 40);
});
