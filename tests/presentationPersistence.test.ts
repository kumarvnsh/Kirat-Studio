import test from 'node:test';
import assert from 'node:assert/strict';
import { serialise, parseProject } from '../src/storage/project.ts';
import { defaultFabrication } from '../src/fabrication/plan.ts';
import { presentationFixture } from './fixtures/presentation.ts';
import { defaultPresentation } from '../src/presentation/model.ts';
import { getState, loadDesign, setPresentation } from '../src/app/store.ts';
test('v5 proposals acquire an option and migrate the old default top slot to exploded', () => {
  const raw = JSON.parse(
    serialise({
      design: presentationFixture('front'),
      fabrication: defaultFabrication(),
      presentation: defaultPresentation(),
    }),
  );
  raw.version = 5;
  delete raw.presentation.options;
  const top = raw.presentation.shots.find((s: any) => s.camera.preset === 'exploded');
  top.id = 'top';
  top.camera.preset = 'top';
  top.name = 'Technical top';
  raw.presentation.pages = raw.presentation.pages.map((p: any) =>
    p.shotId === 'exploded' ? { ...p, shotId: 'top', caption: 'Technical top' } : p,
  );
  for (const s of raw.presentation.shots) delete s.optionId;
  const result = parseProject(JSON.stringify(raw));
  assert.equal(result.presentation!.options.length, 1);
  assert.equal(result.presentation!.shots.find((s) => s.id === 'top')!.camera.preset, 'exploded');
  assert.deepEqual(result.design, raw.design);
});
test('v6 saves presentation without changing design and restores invalid presentation safely', () => {
  const design = presentationFixture('halo'),
    presentation = defaultPresentation();
  presentation.metadata.client = 'किरात ग्राहक';
  const text = serialise({
    design,
    fabrication: defaultFabrication(),
    presentation,
  });
  assert.equal(JSON.parse(text).version, 6);
  const p = parseProject(text);
  assert.deepEqual(p.design, design);
  assert.deepEqual(p.presentation, presentation);
  const bad = JSON.parse(text);
  bad.presentation.shots[0].width = -1;
  const recovered = parseProject(JSON.stringify(bad));
  assert.deepEqual(recovered.design, design);
  assert.ok(recovered.warnings?.length);
});
test('presentation edits do not enter design history and replacement resets presentation', () => {
  loadDesign(presentationFixture('front'), 'fixture');
  const history = getState().design;
  setPresentation({
    ...defaultPresentation(),
    metadata: {
      project: 'Proposal',
      client: 'Client',
      revision: '01',
      notes: '',
    },
  });
  assert.equal(getState().design, history);
  loadDesign(presentationFixture('metal'), 'other');
  assert.equal(getState().presentation.metadata.client, '');
});
