import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../src/editor/history.js';

function setup() {
  const doc = { v: 1 };
  const h = createHistory({
    capture: () => JSON.stringify(doc),
    apply: (s) => Object.assign(doc, JSON.parse(s)),
  });
  h.reset();
  return { doc, h };
}

test('undo and redo walk back and forward through committed changes', () => {
  const { doc, h } = setup();
  doc.v = 2;
  h.commit();
  doc.v = 3;
  h.commit();
  assert.ok(h.undo());
  assert.equal(doc.v, 2);
  assert.ok(h.undo());
  assert.equal(doc.v, 1);
  assert.equal(h.undo(), false);
  assert.ok(h.redo());
  assert.equal(doc.v, 2);
});

test('commit without a change adds no history; a new change clears redo', () => {
  const { doc, h } = setup();
  assert.equal(h.commit(), false);
  assert.equal(h.canUndo, false);
  doc.v = 2;
  h.commit();
  h.undo();
  doc.v = 5;
  h.commit();
  assert.equal(h.canRedo, false);
});
