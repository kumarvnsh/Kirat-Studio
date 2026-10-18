import test from 'node:test';
import assert from 'node:assert/strict';
import { assemblyFrame } from '../src/app/assemblyState.ts';
import { defaultSettings, LAYERS } from '../src/domain/project.ts';
import { assemblySteps } from '../src/domain/assembly.ts';
import { getState, loadDesign, setSaveStatus } from '../src/app/store.ts';

test('save feedback does not create design history and loaded projects select the board', () => {
  loadDesign({ settings: defaultSettings(), artwork: null }, 'Loaded');
  const history = getState().design;
  setSaveStatus('saving');
  assert.equal(getState().saveStatus, 'saving');
  setSaveStatus('error');
  assert.equal(getState().saveStatus, 'error');
  assert.equal(getState().design, history);
  assert.equal(getState().view.selectedGroup, '__board');
});

test('assembly step derives actual cumulative layers and clamps playback bounds', () => {
  const steps = assemblySteps({ settings: defaultSettings(), artwork: null });
  const first = assemblyFrame(steps, -1);
  assert.equal(first.step, 1);
  assert.equal(first.layers[LAYERS.findIndex(l => l.id === 'frame')], true);
  assert.equal(first.layers[LAYERS.findIndex(l => l.id === 'faces')], false);
  assert.equal(assemblyFrame(steps, 999).step, steps.length);
  const backed = assemblySteps({ settings: { ...defaultSettings(), backing: 2 }, artwork: null });
  assert.equal(backed.length, steps.length + 1);
  assert.equal(assemblyFrame(backed, 999).step, backed.length);
});
