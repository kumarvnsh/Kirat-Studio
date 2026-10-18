// Snapshot undo/redo. capture() returns a string snapshot of design state; apply(snapshot) restores it.
// commit() is cheap to call after any change: identical snapshots are ignored.
export function createHistory({ capture, apply, limit = 100 }) {
  let past = [],
    future = [],
    current = null;
  return {
    reset() {
      past = [];
      future = [];
      current = capture();
    },
    commit() {
      const next = capture();
      if (current === null) current = next;
      if (next === current) return false;
      past.push(current);
      if (past.length > limit) past.shift();
      future = [];
      current = next;
      return true;
    },
    undo() {
      if (!past.length) return false;
      future.push(current);
      current = past.pop();
      apply(current);
      return true;
    },
    redo() {
      if (!future.length) return false;
      past.push(current);
      current = future.pop();
      apply(current);
      return true;
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
  };
}
