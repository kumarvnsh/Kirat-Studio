import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOption, duplicateOption, removeOption } from '../src/presentation/options.ts';
import { defaultPresentation, validatePresentation } from '../src/presentation/model.ts';
test('repeated option duplication keeps identifiers valid for saved projects', () => {
  let c = defaultPresentation();
  for (let i = 0; i < 5; i++) c = duplicateOption(c, c.options.at(-1)!.id, crypto.randomUUID());
  assert.equal(validatePresentation(c).warnings.length, 0);
});
import { shotFingerprint } from '../src/presentation/fingerprints.ts';
import { presentationFixture } from './fixtures/presentation.ts';
import { computeLayout } from '../src/domain/layout.ts';
test('option constructions and colours are independent of the base artwork', () => {
  const d = presentationFixture('front'),
    before = structuredClone(d),
    o = defaultPresentation().options[0];
  d.artwork!.groups[0].params = { depth: 100 };
  o.groupOverrides.g = { type: 'halo', faceColor: '#e5ba57' };
  o.elementOverrides.letter = { type: 'fronthalo', faceColor: '#0099cc', returnColor: '#223344' };
  const result = applyOption(d, o),
    e = computeLayout(result).elements[0];
  assert.equal(e.type, 'fronthalo');
  assert.equal(e.faceColor, '#0099cc');
  assert.equal(e.returnColor, '#223344');
  assert.equal(result.artwork!.groups[0].params, undefined);
  assert.equal(d.artwork!.elements[0].type, 'front');
  assert.equal(before.artwork!.elements[0].type, 'front');
});
test('duplicates scope linked pairs to their own option and remove only their own pages', () => {
  const c = defaultPresentation(),
    next = duplicateOption(c, c.options[0].id, 'alternate');
  assert.equal(next.options.length, 2);
  assert.equal(next.shots.length, c.shots.length * 2);
  const ids = new Set(next.shots.map((s) => s.id));
  assert.equal(ids.size, next.shots.length);
  assert.notEqual(next.shots[0].pairId, next.shots[c.shots.length].pairId);
  assert.deepEqual(removeOption(next, 'alternate'), c);
  assert.equal(removeOption(c, c.options[0].id), c);
});
test('only option appearance changes render identity', async () => {
  const d = presentationFixture('front'),
    s = defaultPresentation().shots[0],
    o = defaultPresentation().options[0];
  const a = await shotFingerprint(d, s, 'test', o);
  o.name = 'Premium';
  o.description = 'Service explanation';
  assert.equal(await shotFingerprint(d, s, 'test', o), a);
  o.groupOverrides.g = { type: 'halo' };
  assert.notEqual(await shotFingerprint(d, s, 'test', o), a);
});
test('an individual bare-metal return clears an inherited painted return', () => {
  const d = presentationFixture('front'),
    o = defaultPresentation().options[0];
  o.groupOverrides.g = { returnColor: '#112233' };
  o.elementOverrides.letter = { returnColor: null };
  assert.equal(computeLayout(applyOption(d, o)).elements[0].returnColor, undefined);
});
