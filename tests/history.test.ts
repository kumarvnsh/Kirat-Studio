import test from 'node:test';
import assert from 'node:assert/strict';
import { historyOf, record, undo, redo } from '../src/editor/history.ts';

test('undo and redo walk back and forward through recorded values', () => {
  let h = historyOf(1);
  h = record(h, 2);
  h = record(h, 3);
  h = undo(h);
  assert.equal(h.present, 2);
  h = undo(h);
  assert.equal(h.present, 1);
  assert.equal(undo(h), h);
  h = redo(h);
  assert.equal(h.present, 2);
});

test('recording the same value is a no-op; a new value clears redo', () => {
  const a = { v: 1 };
  let h = historyOf(a);
  assert.equal(record(h, a), h);
  h = undo(record(h, { v: 2 }));
  h = record(h, { v: 5 });
  assert.equal(h.future.length, 0);
  assert.equal(h.past.length, 1);
});
