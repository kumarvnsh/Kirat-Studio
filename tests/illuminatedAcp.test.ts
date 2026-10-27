import test from 'node:test';
import assert from 'node:assert/strict';
import { presentationFixture } from './fixtures/presentation.ts';
import { computeLayout } from '../src/domain/layout.ts';
import { fasciaRegions } from '../src/domain/panelOpenings.ts';
import { fabricationPlan, defaultFabrication } from '../src/fabrication/plan.ts';
import type { ConstructionType } from '../src/domain/project.ts';
for (const type of ['acpbacklit', 'acpflush', 'pushthrough'] as ConstructionType[])
  test(`${type} uses a routed panel, rear LEDs and acrylic without channel returns`, () => {
    const d = presentationFixture(type);
    d.artwork!.imageData = '';
    const l = computeLayout(d),
      e = l.elements[0];
    assert.ok(e.parts.some((p) => p.kind === 'face'));
    assert.ok(!e.parts.some((p) => ['returns', 'stud', 'standoff'].includes(p.kind)));
    assert.ok(e.parts.find((p) => p.kind === 'leds')!.z1 < l.letterBase - d.settings.acp);
    const face = e.parts.find((p) => p.kind === 'face')!;
    assert.equal(
      type === 'acpflush'
        ? face.z1 === l.letterBase
        : type === 'pushthrough'
          ? face.z1 > l.letterBase
          : face.z1 < l.letterBase,
      true,
    );
    assert.ok(fasciaRegions(l, d.settings).length >= 2, 'O counter stays as a panel island');
    const plan = fabricationPlan(d, defaultFabrication());
    assert.equal(plan.strips.length, 0);
    assert.ok(plan.cuts.some((p) => p.part === 'fascia'));
  });
import { serialise, parseProject } from '../src/storage/project.ts';
import { defaultPresentation } from '../src/presentation/model.ts';
test('panel constructions persist in v7 and legacy v6 still opens', () => {
  const d = presentationFixture('acpflush');
  const text = serialise({
    design: d,
    fabrication: defaultFabrication(),
    presentation: defaultPresentation(),
    traceSettings: {
      background: 'custom',
      backgroundColor: '#17372f',
      threshold: 45,
      minpixels: 12,
    },
  });
  assert.equal(parseProject(text).design.artwork!.elements[0].type, 'acpflush');
  assert.equal(parseProject(text).traceSettings?.backgroundColor, '#17372f');
  const legacy = JSON.parse(
    serialise({ design: presentationFixture('front'), fabrication: defaultFabrication() }),
  );
  legacy.version = 6;
  assert.equal(parseProject(JSON.stringify(legacy)).design.artwork!.elements[0].type, 'front');
});
test('mixed panel openings leave ordinary flat artwork outside the cutout set', () => {
  const d = presentationFixture('acpflush');
  const second = structuredClone(d.artwork!.elements[0]);
  second.id = 'flat';
  second.type = 'vinyl';
  second.override = true;
  second.regions = second.regions.map((r) => ({
    outer: r.outer.map(([x, y]) => [x + 150, y]),
    holes: r.holes.map((h) => h.map(([x, y]) => [x + 150, y])),
  }));
  second.bounds = [150, 0, 250, 100];
  d.artwork!.elements.push(second);
  d.artwork!.bounds = [0, 0, 250, 100];
  const l = computeLayout(d);
  assert.equal(
    l.elements.find((e) => e.id === 'flat')!.parts.some((p) => p.kind === 'leds'),
    false,
  );
  const cut = fasciaRegions(l, d.settings);
  assert.equal(cut.length, 2);
});
test('old channel depth overrides do not turn a flush inlay into a channel letter', () => {
  const d = presentationFixture('acpflush');
  d.artwork!.groups[0].charDepth = 80;
  d.artwork!.elements[0].charDepth = 60;
  const l = computeLayout(d);
  assert.equal(l.groupMetrics.g.charDepth, 0);
  assert.equal(l.elements[0].parts.find((p) => p.kind === 'face')!.z1, l.letterBase);
});
