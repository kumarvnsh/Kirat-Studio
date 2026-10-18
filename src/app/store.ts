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
  fabrication: {},
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

// Design edits go through history. View changes never touch the design.
export function editDesign(fn: (d: DesignState) => DesignState, message?: string) {
  set({
    ...state,
    design: record(state.design, fn(state.design.present)),
    message: message ?? state.message,
  });
}
// Load a whole design (open file, restore autosave): fresh history, fresh view.
export function loadDesign(design: DesignState, message: string) {
  const first = design.artwork?.elements[0]?.id ?? null;
  set({ ...state, design: historyOf(design), view: { ...defaultView(), selected: first }, message });
}
export const undo = () => set({ ...state, design: undoH(state.design) });
export const redo = () => set({ ...state, design: redoH(state.design) });

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
    step: LAYER_COUNT,
    layers: Array(LAYER_COUNT).fill(true),
    explode: 0,
    bend: 100,
    selectionActive: false,
  });
  say(message);
}
export function isolate(id: string | null) {
  const el = state.design.present.artwork?.elements.find((e) => e.id === id && e.type !== 'omit');
  if (!el) return say('Select a visible artwork element first.');
  setView({
    selected: el.id,
    mode: '3d',
    isolate: true,
    step: LAYER_COUNT,
    layers: Array(LAYER_COUNT).fill(true),
    selectionActive: true,
  });
  say('Element isolated. Use Show all above the scene or press Esc to return.');
}
export const select = (id: string) => setView({ selected: id, selectionActive: true });
