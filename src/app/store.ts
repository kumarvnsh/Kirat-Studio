import { useSyncExternalStore } from 'react';
import {
  defaultSettings,
  defaultView,
  LAYER_COUNT,
  type DesignState,
  type FabricationState,
  type ViewState,
} from '../domain/project.ts';
import { defaultTrace, type TraceOptions } from '../artwork/import.ts';
import { ALL_STEPS } from '../domain/assembly.ts';
import { defaultFabrication } from '../fabrication/plan.ts';
import { historyOf, record, undo as undoH, redo as redoH, type History } from '../editor/history.ts';

export type AppState = {
  design: History<DesignState>; // design.present is the current design
  view: ViewState;
  fabrication: FabricationState;
  trace: TraceOptions; // import settings for the next retrace (saved with the project, not undone)
  message: string;
};

let state: AppState = {
  design: historyOf<DesignState>({ settings: defaultSettings(), artwork: null }),
  view: defaultView(),
  fabrication: defaultFabrication(),
  trace: defaultTrace(),
  message: 'Start with the Kirat sample or upload your logo.',
};
const listeners = new Set<() => void>();

export const getState = () => state;
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function set(next: AppState) {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
}

// Select an existing reference from state (don't build new objects in the selector).
export const useApp = <T>(select: (s: AppState) => T) => useSyncExternalStore(subscribe, () => select(state));
export const useDesign = () => useApp((s) => s.design.present);
export const useView = () => useApp((s) => s.view);

export const say = (message: string) => set({ ...state, message });
export const setTrace = (patch: Partial<TraceOptions>) =>
  set({ ...state, trace: { ...state.trace, ...patch } });

let lastCoalesce: { key: string; at: number } | null = null;

// Design edits go through history. View changes never touch the design.
// When `coalesceKey` is provided (e.g. while dragging a slider or scrubbing a number),
// rapid edits with the same key within 650 ms replace the present state without pushing duplicates to `past`.
export function editDesign(fn: (d: DesignState) => DesignState, message?: string, coalesceKey?: string) {
  const next = fn(state.design.present);
  if (next === state.design.present) return;
  const now = Date.now();
  const coalesce =
    !!coalesceKey &&
    lastCoalesce?.key === coalesceKey &&
    now - lastCoalesce.at < 650 &&
    state.design.past.length > 0;
  lastCoalesce = coalesceKey ? { key: coalesceKey, at: now } : null;
  set({
    ...state,
    design: coalesce
      ? { past: state.design.past, present: next, future: [] }
      : record(state.design, next),
    message: message ?? state.message,
  });
}
// Load a whole design (open file, restore autosave): fresh history, fresh view.
export function loadDesign(design: DesignState, message: string, fabrication = state.fabrication) {
  lastCoalesce = null;
  const first = design.artwork?.elements[0]?.id ?? null;
  set({
    ...state,
    design: historyOf(design),
    fabrication,
    view: { ...defaultView(), selected: first },
    message,
  });
}
// Fabrication settings: saved with the project, not part of the design's undo history.
export function setFabrication(fn: (f: FabricationState) => FabricationState) {
  set({ ...state, fabrication: fn(state.fabrication) });
}
export const undo = () => {
  lastCoalesce = null;
  set({ ...state, design: undoH(state.design) });
};
export const redo = () => {
  lastCoalesce = null;
  set({ ...state, design: redoH(state.design) });
};

export function setView(patch: Partial<ViewState> | ((v: ViewState) => Partial<ViewState>)) {
  const p = typeof patch === 'function' ? patch(state.view) : patch;
  set({ ...state, view: { ...state.view, ...p } });
}

// View-only transitions. These never alter artwork, dimensions or constructions.
export function showAll(
  message = 'Complete assembly restored. Artwork and construction settings are unchanged.',
) {
  setView({
    isolate: false,
    mode: '3d',
    step: ALL_STEPS,
    layers: Array(LAYER_COUNT).fill(true),
    explode: 0,
    bend: 100,
    selectionActive: false,
  });
  say(message);
}
// Isolate the current selection (or one element). View only.
export function isolate(id: string | null) {
  const elements = state.design.present.artwork?.elements ?? [],
    ids = (state.view.selection.length ? state.view.selection : id ? [id] : []).filter((x) =>
      elements.some((e) => e.id === x && e.type !== 'omit'),
    );
  if (!ids.length) return say('Select a visible artwork element first.');
  setView({
    selected: ids.includes(state.view.selected ?? '') ? state.view.selected : ids[0],
    selection: ids,
    mode: '3d',
    isolate: true,
    step: ALL_STEPS,
    layers: Array(LAYER_COUNT).fill(true),
    selectionActive: true,
  });
  say(
    `${ids.length > 1 ? ids.length + ' elements' : 'Element'} isolated. Use Show all above the scene or press Esc to return.`,
  );
}

// Selection. `selected` is the primary element; `selection` all selected elements.
export const select = (id: string) =>
  setView({ selected: id, selection: [id], selectedGroup: null, selectionActive: true });
export function clearSelection() {
  setView({ selected: null, selection: [], selectedGroup: null, selectionActive: false });
}
export function selectBoard() {
  setView({ selected: null, selection: [], selectedGroup: '__board', selectionActive: false });
}
export function selectMany(ids: string[], primary = ids[ids.length - 1] ?? null) {
  setView({ selected: primary, selection: ids, selectedGroup: null, selectionActive: ids.length > 0 });
}
// Add or remove one element (Ctrl/Cmd/Shift-click in the views).
export function toggleSelect(id: string) {
  const cur = state.view.selection.length
    ? state.view.selection
    : state.view.selected
      ? [state.view.selected]
      : [];
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  selectMany(next, next.includes(id) ? id : (next[next.length - 1] ?? null));
}
export const selectionIds = (v: { selection: string[]; selected: string | null }) =>
  v.selection.length ? v.selection : v.selected ? [v.selected] : [];
export function selectGroup(groupId: string) {
  const ids = (state.design.present.artwork?.elements ?? [])
    .filter((e) => e.group === groupId)
    .map((e) => e.id);
  setView({
    selected: ids[0] ?? null,
    selection: ids,
    selectedGroup: groupId,
    selectionActive: ids.length > 0,
  });
}
export function toggleHidden(ids: string[]) {
  const hidden = new Set(state.view.hidden),
    hide = ids.some((id) => !hidden.has(id));
  ids.forEach((id) => (hide ? hidden.add(id) : hidden.delete(id)));
  setView({ hidden: [...hidden] });
}
