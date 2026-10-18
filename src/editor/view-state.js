// View-only state transitions. These never alter artwork, dimensions or constructions.
export function resetAssemblyView(state) {
  state.isolate = false;
  state.mode = '3d';
  state.step = 7;
  state.layers = Array(7).fill(true);
  state.explode = 0;
  state.bend = 100;
  state.selectionActive = false;
  return state;
}
export function isolateElement(state, id) {
  if (!id || !state.components.some((p) => p.id === id && p.type !== 'omit')) return false;
  state.selected = id;
  state.mode = '3d';
  state.isolate = true;
  state.step = 7;
  state.layers = Array(7).fill(true);
  state.selectionActive = true;
  return true;
}
