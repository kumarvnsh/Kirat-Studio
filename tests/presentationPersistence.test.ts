import test from 'node:test';
import assert from 'node:assert/strict';
import { serialise, parseProject } from '../src/storage/project.ts';
import { defaultFabrication } from '../src/fabrication/plan.ts';
import { presentationFixture } from './fixtures/presentation.ts';
import { defaultPresentation } from '../src/presentation/model.ts';
import { getState, loadDesign, setPresentation } from '../src/app/store.ts';
test('v5 saves presentation without changing design and restores invalid presentation safely', () => {
  const design = presentationFixture('halo'),
    presentation = defaultPresentation();
  presentation.metadata.client = 'किरात ग्राहक';
  const text = serialise({
    design,
    fabrication: defaultFabrication(),
    presentation,
  });
  assert.equal(JSON.parse(text).version, 5);
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
