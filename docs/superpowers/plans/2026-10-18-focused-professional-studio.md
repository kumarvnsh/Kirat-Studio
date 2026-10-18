# Focused Professional Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Design, Assembly and Fabrication workspace with generated 3D letter references, consistent editing and selection, cleaner presentation and usable responsive layouts.

**Architecture:** Preserve the current React store, immutable design history, shared physical layout and Three.js renderer. Extract existing JSX by responsibility, keep the viewport mounted across task switches, and use small pure helpers for selection, draft validation and dimensional resizing. Application shell state stays separate from saved projects.

**Tech Stack:** Existing React 19, TypeScript, CSS, Three.js, Node test runner and Vite. No new production dependencies.

---

## Working context

Repository root: /Users/vnshkumar/Documents/Kirat-Studio
Approved spec: /Users/vnshkumar/Documents/Kirat-Studio/docs/superpowers/specs/2026-10-18-focused-professional-studio-design.md
Screen evidence: /Users/vnshkumar/Documents/Kirat-Studio/docs/ux-review/2026-10-18/
Generated assets: /Users/vnshkumar/Documents/Kirat-Studio/public/images/construction-references/

All paths below are relative to this repository root. The asset files already exist; their consuming application code has not been changed. Preserve original PNGs and their README with provenance and full prompts.

Use a suitable existing attached checkout/worktree when possible. Inspect git status before editing; do not stage .superpowers or unrelated user changes. Keep project file format v4 and the existing geometry/lighting formulas.

This is one editor redesign with sequential dependencies. Execute tasks in order; each commit must leave the app usable. UI extractions preserve existing callback bodies, bounds and disclosures. Do not replace real geometry with the schematic plates or sample letter shown in mockups.

## File responsibilities

| File | Responsibility |
|---|---|
| src/app/App.tsx | Shell, task navigation, responsive drawers and keyboard orchestration |
| src/app/WorkspaceHeader.tsx | Project/help/export menus, undo and presentation entry |
| src/app/selection.ts | Shared board/group/shape/multi-selection descriptor |
| src/app/Structure.tsx | Layer tree, search, collapse and existing structure actions |
| src/app/Inspector.tsx | Selection-scoped properties and disclosure hierarchy |
| src/app/ArtworkPanel.tsx | Source-aware import, trace and outline-review controls |
| src/app/AssemblyWorkspace.tsx | Steps, playback, explode, visible layers and quantities |
| src/app/FabricationWorkspace.tsx | Parts navigation, outlines, strips and settings |
| src/app/MakePanel.tsx | Extractable fabrication controls and existing exporters/strip renderer |
| src/app/PresentationPanel.tsx | Customer preview and day/night comparison lifecycle |
| src/app/ConstructionDiagram.tsx | Construction picker and project-driven anatomy |
| src/app/ConstructionReference.tsx | Generated references with native-reference fallback |
| src/app/numericDraft.ts | Pure draft parsing and validation |
| src/app/ScrubInput.tsx | Commit/cancel input behavior and unit-aware controls |
| src/editor/resizeArtwork.ts | Linked dimensional edits over existing design fields |
| src/app/Viewport.tsx | Persistent renderer, contextual chrome, 2D/forming views |
| src/app/actions.ts and src/app/store.ts | Existing actions plus truthful persistence status |
| src/app/style.css | Final layout, typography, menus, images and responsive rules |
| tests/selection.test.ts, tests/numericDraft.test.ts, tests/resizeArtwork.test.ts | Behavioral regression checks |
| tests/constructionReferences.test.ts | Recipe-to-asset mapping and local asset existence |

## Task 1: Baseline and reference-image integration

**Files:** create src/app/constructionReferences.ts and src/app/ConstructionReference.tsx; modify src/app/ConstructionDiagram.tsx and src/app/style.css; create tests/constructionReferences.test.ts.

- [ ] Run the existing baseline separately: npm test; npm run typecheck; npm run build. Record command results before changing source.
- [ ] Create the asset map:

~~~ts
import type { ConstructionType } from '../domain/project.ts';

export const constructionReferences: Partial<Record<ConstructionType, {
  src: string;
  alt: string;
}>> = {
  front: {
    src: '/images/construction-references/front-lit.png',
    alt: 'Front-lit A with a luminous acrylic face and opaque metal returns',
  },
  halo: {
    src: '/images/construction-references/halo-lit.png',
    alt: 'Halo-lit A with an opaque metal face and a rear wall halo',
  },
  fronthalo: {
    src: '/images/construction-references/front-and-halo.png',
    alt: 'A with a luminous front face, opaque metal sides and a separate rear halo',
  },
  fullacrylic: {
    src: '/images/construction-references/full-acrylic.png',
    alt: 'Full acrylic A with a luminous face and translucent illuminated sides',
  },
};
~~~

- [ ] Add this mapping test and run node --test tests/constructionReferences.test.ts:

~~~ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { constructionReferences } from '../src/app/constructionReferences.ts';

test('all four illuminated recipes point to shipped reference images', () => {
  assert.deepEqual(Object.keys(constructionReferences).sort(),
    ['front', 'fronthalo', 'fullacrylic', 'halo']);
  for (const reference of Object.values(constructionReferences)) {
    assert.ok(reference);
    assert.ok(reference.alt.length > 20);
    assert.ok(existsSync(new URL('../public' + reference.src, import.meta.url)));
  }
  assert.equal(constructionReferences.vinyl, undefined);
});
~~~

- [ ] Add the reference component:

~~~tsx
import { useState, type ReactNode } from 'react';
import type { ConstructionType } from '../domain/project.ts';
import { constructionReferences } from './constructionReferences.ts';

export function ConstructionReference({
  type, fallback,
}: {
  type: ConstructionType;
  fallback: ReactNode;
}) {
  const reference = constructionReferences[type];
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!reference || failedSrc === reference.src) return fallback;
  return (
    <img
      className="construction-reference"
      src={reference.src}
      alt={reference.alt}
      width={1536}
      height={1024}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(reference.src)}
    />
  );
}
~~~

- [ ] In ConstructionPicker's renderGroup, replace only its thumbnail call with:

~~~tsx
<ConstructionReference
  type={m.type}
  fallback={<Letter3DReferenceThumb type={m.type} />}
/>
~~~

Import ConstructionReference at the top. Keep Letter3DReferenceThumb and CrossSectionDiagram intact. Add:

~~~css
.construction-reference {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 2;
  object-fit: contain;
  border-radius: 6px;
  background: #12293e;
}
~~~

The wider chooser in Task 6 gives the images enough room. Until then constrain the thumbnail wrapper to the current card width without cropping the reference.

- [ ] Verify four correct images in the browser, native references for flat/utility types and SVG fallback when an image request fails. Run typecheck and asset test. Commit only the asset consumer, test and styling changes.

## Task 2: Unify selection scope

**Files:** create src/app/selection.ts and tests/selection.test.ts; modify src/app/Inspector.tsx, src/app/Viewport.tsx and src/app/store.ts.

- [ ] Add the pure selection descriptor:

~~~ts
type Source = {
  groups: readonly { id: string; name: string }[];
  elements: readonly { id: string; name: string; group: string }[];
};
type SelectionView = {
  selectedGroup: string | null;
  selected: string | null;
  selection: string[];
};
export type SelectionScope = {
  kind: 'empty' | 'board' | 'group' | 'shape' | 'multiple';
  label: string;
  ids: string[];
};
export function selectionScope(
  artwork: Source | null, view: SelectionView,
): SelectionScope {
  if (!artwork) return { kind: 'empty', label: 'No artwork', ids: [] };
  if (view.selectedGroup === '__board')
    return { kind: 'board', label: 'Board', ids: [] };
  const group = artwork.groups.find(g => g.id === view.selectedGroup);
  if (group) return {
    kind: 'group',
    label: group.name,
    ids: artwork.elements.filter(e => e.group === group.id).map(e => e.id),
  };
  const wanted = view.selection.length
    ? view.selection : view.selected ? [view.selected] : [];
  const ids = [...new Set(wanted)].filter(id =>
    artwork.elements.some(e => e.id === id));
  if (ids.length > 1)
    return { kind: 'multiple', label: ids.length + ' shapes', ids };
  if (ids.length === 1) return {
    kind: 'shape',
    label: artwork.elements.find(e => e.id === ids[0])!.name,
    ids,
  };
  return { kind: 'board', label: 'Board', ids: [] };
}
~~~

- [ ] Add and run the regression test:

~~~ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionScope } from '../src/app/selection.ts';
const artwork = {
  groups: [{ id: 'g1', name: 'Wordmark' }],
  elements: [
    { id: 'e1', name: 'Element 01', group: 'g1' },
    { id: 'e2', name: 'Element 02', group: 'g1' },
  ],
};
test('group scope takes precedence over stale primary element', () => {
  assert.deepEqual(selectionScope(artwork, {
    selectedGroup: 'g1', selected: 'e1', selection: ['e1', 'e2'],
  }), { kind: 'group', label: 'Wordmark', ids: ['e1', 'e2'] });
});
test('board scope takes precedence; invalid IDs do not survive', () => {
  assert.equal(selectionScope(artwork, {
    selectedGroup: '__board', selected: 'e1', selection: ['e1'],
  }).kind, 'board');
  assert.equal(selectionScope(artwork, {
    selectedGroup: null, selected: 'missing', selection: ['missing'],
  }).kind, 'board');
});
test('multiple and empty states are explicit', () => {
  assert.equal(selectionScope(artwork, {
    selectedGroup: null, selected: 'e1', selection: ['e1', 'e2', 'e1'],
  }).label, '2 shapes');
  assert.equal(selectionScope(null, {
    selectedGroup: null, selected: null, selection: [],
  }).kind, 'empty');
});
~~~

- [ ] Replace separate label/scope derivation in Inspector and Viewport with selectionScope. Use its IDs for Frame/Hide/Isolate and its kind for the properties branch. Keep geometry calculations based on the matching element/group, never a stale selected element when kind is group.
- [ ] Change loadDesign and successful import startup selection to board: selected null, selection empty, selectedGroup '__board', selectionActive false. Keep the existing view defaults.
- [ ] Verify group selection reproducer is fixed; test empty group, removed shape, mixed selection, undo and isolate/exit. Run selection and existing artwork/history tests, then typecheck. Commit.

## Task 3: Numeric drafts, units and proportional sizing

**Files:** create src/app/numericDraft.ts and tests/numericDraft.test.ts; modify src/app/ScrubInput.tsx; create src/editor/resizeArtwork.ts and tests/resizeArtwork.test.ts; modify src/app/Inspector.tsx.

- [ ] Add draft parsing independent of UI:

~~~ts
export type NumericDraft =
  | { ok: true; value: number }
  | { ok: false; error: string };
export function parseNumericDraft(
  text: string, min: number, max: number,
): NumericDraft {
  const value = Number(text);
  if (!text.trim() || !Number.isFinite(value))
    return { ok: false, error: 'Enter a number.' };
  if (value < min || value > max)
    return { ok: false, error: 'Enter a value from ' + min + ' to ' + max + '.' };
  return { ok: true, value };
}
~~~

- [ ] Test empty, whitespace, NaN, Infinity, both bounds, a valid decimal and out-of-range values using node:test/assert. Use this full core test:

~~~ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNumericDraft } from '../src/app/numericDraft.ts';
test('rejects invalid drafts without clamping and accepts both bounds', () => {
  for (const text of ['', ' ', 'NaN', 'Infinity', '-1', '101'])
    assert.equal(parseNumericDraft(text, 0, 100).ok, false);
  assert.deepEqual(parseNumericDraft('0', 0, 100), { ok: true, value: 0 });
  assert.deepEqual(parseNumericDraft('100', 0, 100), { ok: true, value: 100 });
  assert.deepEqual(parseNumericDraft('4.25', 0, 100), { ok: true, value: 4.25 });
});
~~~

- [ ] In ScrubInput replace handleInput's model write with setText(raw) and clear its inline error. On blur/Enter, parse text against dispMin/dispMax, convert with the existing toMm, round to the existing step, and call onChange(value, false) only for valid changed values. Invalid drafts preserve committed geometry and show the returned error next to the field.
- [ ] Escape must cancel before blur: keep a ref flag consumed by handleBlur, reset text from the committed prop, and clear the error. Use useId for aria-describedby and aria-invalid. Preserve the current pointer scrub implementation and coalescing; remove per-field persistent multi-unit rows and expose formatAllUnits via an accessible details disclosure.
- [ ] Add resizeArtwork using computeLayout and existing setGroup/setElements. Signature:

~~~ts
import { computeLayout } from '../domain/layout.ts';
import type { Artwork, DesignState } from '../domain/project.ts';
import { setElements, setGroup } from './artworkOps.ts';

export function resizeArtwork(
  design: DesignState,
  scope: { ids: string[]; groupId?: string },
  axis: 'height' | 'width',
  targetMm: number,
  linked: boolean,
): Artwork {
  const artwork = design.artwork;
  if (!artwork) throw Error('Import artwork first.');
  if (!Number.isFinite(targetMm) || targetMm < 5 || targetMm > 4000)
    throw Error('Size must be 5–4000 mm.');
  const layout = computeLayout(design);
  const dimensions = (id: string) => {
    const part = layout.elements.find(e => e.id === id);
    if (!part) throw Error('Selected shape is unavailable.');
    return {
      charWidth: part.bounds[2] - part.bounds[0],
      charHeight: part.bounds[3] - part.bounds[1],
    };
  };
  const key = axis === 'height' ? 'charHeight' : 'charWidth';
  const keys: ('charHeight' | 'charWidth')[] = linked
    ? ['charHeight', 'charWidth'] : [key];
  const group = scope.groupId
    ? artwork.groups.find(g => g.id === scope.groupId) : undefined;
  if (scope.groupId && !group) throw Error('Selected group is unavailable.');
  const ids = group
    ? artwork.elements.filter(e => e.group === group.id).map(e => e.id)
    : [...new Set(scope.ids)];
  if (!ids.length) throw Error('Select a shape first.');
  const metric = group ? layout.groupMetrics[group.id] : dimensions(ids[0]);
  if (!metric || !(metric[key] > 0)) throw Error('Selection has no measurable size.');
  const factor = targetMm / metric[key];
  const checked = (value: number) => {
    if (!Number.isFinite(value) || value < 5 || value > 4000)
      throw Error('Every resized dimension must be 5–4000 mm.');
    return value;
  };
  for (const id of ids) {
    const size = dimensions(id);
    for (const dimension of keys) checked(size[dimension] * factor);
  }
  let next = artwork;
  if (group) {
    const patch: { charHeight?: number; charWidth?: number } = {};
    for (const dimension of keys) patch[dimension] = checked(metric[dimension] * factor);
    next = setGroup(next, group.id, patch);
  }
  for (const id of ids) {
    const element = artwork.elements.find(e => e.id === id)!;
    const size = dimensions(id);
    const patch: { charHeight?: number; charWidth?: number } = {};
    for (const dimension of keys) {
      if (!group || element[dimension] !== undefined)
        patch[dimension] = checked((group ? element[dimension]! : size[dimension]) * factor);
    }
    if (Object.keys(patch).length) next = setElements(next, [id], patch);
  }
  return next;
}
~~~

Implement this algorithm without modifying layout formulas: resolve current physical bounds once; for a group use groupMetrics' nominal selected axis as the reference and update its charHeight/charWidth using the same scale factor when linked. Scale only already-existing per-element sizing overrides on affected axes; inherited fields remain absent. For shape/multiple selection, use the first selected shape as the editing anchor and apply target/current-anchor uniformly to every selected shape's affected axis, writing per-element dimensions from its own computed bounds. With linking enabled scale both axes by that factor. Reject nonpositive/invalid source bounds and any resulting value outside 5–4000 mm before returning a changed artwork. Never partially apply a bulk change.
- [ ] Add tests using a two-shape artwork with unequal widths from existing artworkOps/layout test fixtures: linked group edit preserves both ratios and inheritance; existing overrides scale; unlinked width changes height by zero; multiple shapes scale uniformly; invalid output throws without mutating the input; toggling link alone does not write design.

~~~ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, type ArtworkElement, type DesignState } from '../src/domain/project.ts';
import { computeLayout } from '../src/domain/layout.ts';
import { resizeArtwork } from '../src/editor/resizeArtwork.ts';
const fixture = (): DesignState => {
  const element = (id: string, x: number, width: number): ArtworkElement => ({
    id, name: id, group: 'g1', type: 'front', override: false,
    pixels: width * 100, bounds: [x, 0, x + width, 100], color: '#ffffff',
    regions: [{ outer: [[x, 0], [x + width, 0], [x + width, 100], [x, 100]], holes: [] }],
  });
  return {
    settings: defaultSettings(),
    artwork: {
      elements: [element('a', 0, 100), element('b', 110, 50)],
      groups: [{ id: 'g1', name: 'Wordmark', type: 'front' }],
      bounds: [0, 0, 160, 100], imageWidth: 160, imageHeight: 100,
      imageData: '', approved: false,
    },
  };
};
const sizes = (d: DesignState) => computeLayout(d).elements.map(e => ({
  width: e.bounds[2] - e.bounds[0], height: e.bounds[3] - e.bounds[1],
}));
test('linked group resizing preserves unequal ratios and inheritance', () => {
  const d = fixture(), before = sizes(d);
  const target = computeLayout(d).groupMetrics.g1.charHeight * 1.1;
  const artwork = resizeArtwork(d, { ids: ['a', 'b'], groupId: 'g1' }, 'height', target, true);
  const after = sizes({ ...d, artwork });
  before.forEach((size, i) => {
    assert.ok(Math.abs(after[i].width / after[i].height - size.width / size.height) < 1e-6);
    assert.equal(artwork.elements[i].charHeight, undefined);
    assert.equal(artwork.elements[i].charWidth, undefined);
  });
});
test('group resizing scales explicit overrides without clearing them', () => {
  const d = fixture();
  d.artwork!.elements[0].charHeight = 200;
  d.artwork!.elements[0].charWidth = 100;
  const target = computeLayout(d).groupMetrics.g1.charHeight * 1.1;
  const artwork = resizeArtwork(d, { ids: ['a', 'b'], groupId: 'g1' }, 'height', target, true);
  assert.ok(Math.abs(artwork.elements[0].charHeight! - 220) < 1e-6);
  assert.ok(Math.abs(artwork.elements[0].charWidth! - 110) < 1e-6);
});
test('unlinked width edits preserve height and bulk edits share a scale factor', () => {
  const d = fixture(), before = sizes(d);
  const artwork = resizeArtwork(d, { ids: ['a', 'b'] }, 'width', before[0].width * 1.1, false);
  const after = sizes({ ...d, artwork });
  before.forEach((size, i) => {
    assert.ok(Math.abs(after[i].width / size.width - 1.1) < 1e-6);
    assert.ok(Math.abs(after[i].height - size.height) < 1e-6);
  });
});
test('invalid bulk input leaves the original design unchanged', () => {
  const d = fixture(), before = JSON.stringify(d);
  assert.throws(() => resizeArtwork(d, { ids: ['a', 'b'] }, 'height', Infinity, true));
  assert.throws(() => resizeArtwork(d, { ids: ['missing'] }, 'height', 100, true));
  assert.equal(JSON.stringify(d), before);
});
~~~
- [ ] Wire link state locally in properties, default true for shape selection, with an explicit pressed state and label. On edits call resizeArtwork inside one editArtwork transaction. Show Mixed for unequal values; do not substitute an arbitrary numeric field until the user enters a value. For multi-selection the first selected shape is the anchor, labelled beside the field.
- [ ] Run draft, resize, layout, artworkOps and history tests; typecheck. Manually check Enter, blur, Escape, scrubbing, inch/foot conversion, mixed values and undo. Commit.

## Task 4: Source-aware artwork and discoverable layer tree

**Files:** create src/app/ArtworkPanel.tsx; modify src/app/ToolsPanel.tsx, src/app/Structure.tsx, src/app/actions.ts and src/app/style.css.

- [ ] Extract the complete ArtworkPanel function from ToolsPanel into ArtworkPanel.tsx with its used imports. Export it; import it in ToolsPanel so the intermediate application still works.
- [ ] Within ArtworkPanel derive:

~~~ts
const vectorSource = artwork?.origin === 'vector';
~~~

Render file/source/count/review summary for vectors. Wrap the whole raster trace-settings/crop/retrace block in !vectorSource. Keep Upload/Replace, sample, Type text and artwork review checkbox reachable for both paths. Review outlines calls setMode('2d') and focuses the canvas heading. Failed/cancelled import retains the prior artwork.

- [ ] Put the importer in a native dialog opened by Import artwork/Replace artwork. Use showModal, an explicit title, Close, Escape and return focus to its trigger. Retain current file-size/type validation and error handling.
- [ ] Tree initial collapsed state derives from all current group IDs. Track expanded IDs instead of seeding a Set only at initial mount, so imported groups start collapsed and user-expanded existing groups remain expanded.
- [ ] Add a labelled search input. Filter by group name, shape name or ID; show matched ancestors expanded without overwriting the user's expansion set. Clearing search restores it. Preserve current drag/move, rename, range-selection, group-menu and visibility handlers.
- [ ] Replace click-only row containers with keyboard-operable semantic controls without nested buttons. Render compact thumbnails from existing shape contours with a viewBox computed from bounds; keep label/ID and count. Preserve context-menu actions for callers that do not use drag.
- [ ] Verify SVG and raster paths, failed import, replacement undo, searching, collapse persistence, long names, empty groups and keyboard selection. Run existing svg/grouping/artworkOps tests plus typecheck/build. Commit.

## Task 5: Shell, header, persistent viewport and saving status

**Files:** create src/app/WorkspaceHeader.tsx; modify src/app/App.tsx, src/app/store.ts, src/app/actions.ts, src/app/Viewport.tsx and src/app/style.css.

- [ ] Add local shell state in App:

~~~tsx
type TaskMode = 'design' | 'assembly' | 'fabrication';
type Drawer = 'layers' | 'properties' | 'preview';
const [taskMode, setTaskMode] = useState<TaskMode>('design');
const [drawer, setDrawer] = useState<Drawer>('layers');
~~~

Extract the existing header into WorkspaceHeader using callbacks passed by App. Menus are native dialogs or labelled disclosure popovers with keyboard-close/focus return. Project moves existing Open, Save copy, Restore backup; Help moves tour/shortcuts/atlas. Keep Undo/Redo, Present and one Export entry. Preserve file handling and confirmations already present in the app.

- [ ] Replace the Workflow tabs with Design/Assembly/Fabrication primary navigation. Render the same Viewport instance at the same React tree position throughout mode changes. Keep existing renderer effects and refs in Viewport; do not create competing SignScene instances.
- [ ] Move StructureTree into the Design left panel. Remove it from Inspector; retain properties on the right. Pass mode-specific rail/detail/footer content as ReactNode slots to the workspace shell. Keep task content mounted while hidden when it owns useful scroll/expansion state.
- [ ] Consolidate UnitSelector to the status strip. Remove copies from Board, Inspector and Viewport. Update the unit change message so it no longer promises always-visible three-unit rows. Preserve global view.unit and internal mm.
- [ ] Add persistence status to AppState, outside design:

~~~ts
saveStatus: 'idle' | 'saving' | 'saved' | 'error';
~~~

Initialize idle and add setSaveStatus next to say using the same immutable set pattern. In startSession set saving when design/fabrication changes; in its existing 400ms callback set saved only after writeStore returns true, error after failure, idle for an empty design. Status-only changes must not schedule another save; retain existing d/f identity guard. Expose Save project copy next to the error.

- [ ] Decouple body.nightmode application styling from environment. Keep the renderer's current environment and light updates. Move mode-specific camera, exposure/dimming and global LED defaults into one Preview settings surface.
- [ ] Test save success and failure through injected/mock storage at the existing writeStore boundary; verify status does not recurse or create history entries. Test no geometry changes on units, navigation or camera. Run all tests/typecheck/build and browser smoke. Commit.

## Task 6: Essential-first inspector and visual construction chooser

**Files:** modify src/app/Inspector.tsx, src/app/ConstructionDiagram.tsx and src/app/style.css.

- [ ] Reorder BoardProps, GroupProps and ElementProps JSX while retaining existing callback implementations: scoped title/name → dimensions/spacing → construction → finish → expandable recipe/anatomy → group lighting → detailed stack. Move CrossSectionDiagram into a collapsed details block with summary “Anatomy & material thicknesses”.
- [ ] Preserve every existing parameter, colour/reset, group transfer and lighting mode. Display inheritance/reset beside each supported overridden field and use setElements with null to clear the override. Group changes retain letter overrides unless the existing explicit apply-to-overrides action is chosen.
- [ ] Make ConstructionPicker a dialog opened by a compact current-construction summary. Show the full four generated references from Task 1 in a two-column illuminated grid; retain flat/utility choices below. Keep labels outside images and an “Appearance reference” note. Display “Changing construction resets this recipe's parameters” before the chooser action.
- [ ] Commit selection through the existing onChange callback; close the chooser and return focus. Cancel leaves the recipe unchanged. Preserve the inherit option for individual shapes.
- [ ] Remove Apply controls from tree, inspector header, group/shape/board footers only after Task 3 proves every edit commits without them. Do not call applySceneChanges for ordinary edits: it also resets step/layers. Keep its export temporarily only if remaining callers need it.
- [ ] Verify all nine construction choices, all four generated images, fallback, group overrides, mixed bulk edits, recipe reset/undo, colour reset and keyboard dialog focus. Run tests/typecheck/build. Commit.

## Task 7: Dedicated assembly workspace

**Files:** create src/app/AssemblyWorkspace.tsx; modify src/app/ToolsPanel.tsx, src/app/App.tsx, src/app/Viewport.tsx and src/app/style.css.

- [ ] Extract BuildPanel, LightingControls, PowerSummary and PartsList into named exported components grouped by their final responsibility. Preserve actual bodies/imports first, confirm the old entry still works, then remove the obsolete Build tab.
- [ ] Assembly left rail renders assemblySteps(design) with selected step buttons. Right panel shows selected step description, added layers' parts, visibility controls and expandable PowerSummary/PartsList. Derive quantities from existing computeLayout/bom; never hard-code mockup values.
- [ ] Use the existing step model ALL_STEPS and visibleLayers. Initial Assembly entry shows complete assembly. Explicit step sets its exact layers; manual checkbox changes display Custom layers. Keep the step selection and custom flag as view-only state.
- [ ] Place one explode control and bounded previous/play-pause/next below the persistent viewport. Use an effect interval cleaned up on pause, navigation, final step and unmount. Optional backing changes the actual step count. “Show complete assembly” restores complete layers and clears explosion/custom state.
- [ ] Remove duplicate explosion controls from viewport/old panel for Assembly. Reuse compact camera controls and maintain framing/isolation shortcuts.
- [ ] Verify first/last boundaries, replay, pause on mode exit, optional backing, layer customization and complete reset. Extend assembly tests only for newly extracted state transitions; run existing assembly/layout/history tests and typecheck/build. Commit.

## Task 8: Wider fabrication workspace and real part selection

**Files:** create src/app/FabricationWorkspace.tsx; modify src/app/MakePanel.tsx, src/app/App.tsx, src/app/Viewport.tsx and src/app/style.css.

- [ ] Extract from MakePanel the existing settings JSX, export callbacks and Strip renderer into exports with explicit plan/settings/selection props. Keep current lazy DXF import and URL revocation. Delete the old Make-tab container after new callers work.
- [ ] Build the left list from fabricationPlan(design, fab).cuts and .strips, retaining unique element/part/schedule keys. Filter by category and names/IDs. Keep a local selected part key; derive the fallback from current plan after import/settings changes so stale indexes never render a different part silently.
- [ ] Centre uses selected CutPart.outline and .toolpath for overlaid SVG paths with a computed viewBox. Add a selected-element entry for its return schedules, diagram and a wide bend table. Use the existing StripSchedule.segments/stations data, not sampled reference values.
- [ ] Track selected bend index within the current schedule. Render table row buttons; highlight their matching corner position or curve span on the strip. Clear/clamp selection when schedule identity changes. Preserve full-precision geometry while formatting labels.
- [ ] Right settings retain router/laser-specific fields and all return-strip options. Native inputs are labelled in mm/degrees and validate current ranges. Artwork review, actual issue messages, geometric-only checks and nesting/calibration disclosures are separate rows.
- [ ] Forming study enters existing bend mode for a selected supported element and retains the part/schedule key. Add Back to fabrication; empty/non-lit/excluded selections explain the missing strip. Do not invent new strip-specific 3D geometry if the renderer currently supports only element contours: label the forming view accordingly.
- [ ] Verify actual SVG outlines, holes, compensation, selected part/row, no strips, issue selection, changed artwork, CSV/DXF and return from forming. Run cutting/bending/fabrication/layout tests and typecheck/build. Inspect exported files for existing layers and mm units. Commit.

## Task 9: Clean presentation and consolidated exports

**Files:** create src/app/PresentationPanel.tsx; modify src/app/App.tsx, src/app/actions.ts, src/app/Viewport.tsx and src/app/style.css.

- [ ] Present snapshots the complete editor view and current camera before any presentation-only fit/reset. Restore it on exit. Keep design identity/history untouched and clear snapshot after restoration.
- [ ] Hide editor panels and editor-only controls; show title, Day/Night, Compare, optional construction summary, Export and Exit. Camera controls appear on hover, keyboard focus and explicit touch activation.
- [ ] Reuse the day/night still capture logic in exportPresentation to capture both comparison images at the same camera and design snapshot. Do not instantiate two animated WebGL renderers. If capture fails, keep the editor intact and show a retry action; revoke temporary object URLs when comparison refreshes or closes.
- [ ] Export menu contains Current view image, Day/night presentation sheet, Cut files (DXF), Bend schedule (CSV). Reuse exportView/exportPresentation and Task 8 exporters. Disable missing-data outputs with adjacent explanations; display pending review and current limitations without inventing approval.
- [ ] Verify camera/view restoration, environment independent of sign power, comparison parity, WebGL unavailable fallback, all exports and keyboard exit. Run tests/typecheck/build. Commit.

## Task 10: Responsive layout, readable styling and help

**Files:** modify src/app/style.css, src/app/App.tsx, src/app/WorkspaceHeader.tsx and src/app/OnboardingTour.tsx.

- [ ] Consolidate the current competing legacy media rules rather than appending another overriding copy. Base shell/grid contract:

~~~css
.studio-shell {
  height: 100dvh;
  display: grid;
  grid-template-rows: 56px 48px minmax(0, 1fr) auto;
  color: #233e4b;
  background: #f4f7f8;
  font-size: 14px;
}
.studio-workspace {
  display: grid;
  grid-template-columns: var(--left-width, 210px) minmax(320px, 1fr)
    var(--right-width, 300px);
  min-height: 0;
}
.studio-rail, .studio-properties {
  min-height: 0;
  overflow: auto;
}
.studio-workspace main {
  min-width: 0;
  min-height: 0;
}
:where(button, input, select):focus-visible {
  outline: 3px solid #397da8;
  outline-offset: 2px;
}
@media (min-width: 700px) and (max-width: 1099px) {
  .studio-workspace {
    display: flex;
    flex-direction: column;
  }
  .studio-workspace main {
    flex: 0 0 var(--preview-height, 45%);
  }
}
@media (max-width: 699px) {
  .studio-workspace { display: block; }
  .studio-shell button, .studio-shell input, .studio-shell select {
    min-height: 44px;
  }
}
~~~

- [ ] Desktop side widths are clamped to leave at least 320px canvas; collapse a side before overflow. Tablet renders a draggable divider between preview and one active drawer, clamped to preserve usable preview/tools. Preview expands and restores the previous drawer height.
- [ ] Phone renders one active Preview/Layers/Properties surface; menu actions remain accessible with labels. Fabrication tables use a full-width view with contained horizontal scrolling. Preserve navigation and current selection when switching surfaces.
- [ ] Apply navy/white/cool-neutral surfaces, warm brass active accents, 6–8px radii and an 8px spacing rhythm. Standard controls 13–14px, secondary labels at least 12px. Status colours include text. Keep numeric/unit suffixes readable.
- [ ] Rewrite tour steps around Design/Assembly/Fabrication and the real control labels. Anchor tips to targets without covering the sign; contextual glossary links remain reachable. Keep dialog Escape/focus handling and shortcuts correct after moves.
- [ ] Inspect 1440×900, 1280×720, 1024×768, 768×1024, 390×844 and browser zoom. Check independent scroll, long names, large trees, resize, menus, chooser, comparison and all task modes. Save final screenshots. Commit.

## Task 11: Final verification and handoff

**Files:** update README.md and docs/ux-review/2026-10-18/review.md with implemented behavior and final screenshot links.

- [ ] Confirm every capability in the approved spec remains reachable. Compare Design, Assembly and Fabrication against approved screenshots, with generated reference images visible in the chooser.
- [ ] Run these separately from the repository root:

~~~bash
npm test
npm run typecheck
npm run build
git diff --check
~~~

Expected: existing and new tests pass; TypeScript exits zero; Vite emits dist; diff check exits zero. Investigate any baseline-vs-change distinction rather than silently waiving failures.

- [ ] Exercise the Kirat sample plus one SVG and one raster import. Check board/group/shape/multiple selection, mixed/inherited/reset values, units/proportions, invalid drafts, undo/redo, saving success/failure, hide/isolate/reset, optional backing, compensation/bend selection, project reopen and exports.
- [ ] Check keyboard navigation end to end: visible focus, tree actions, menus, chooser, drawers, return focus, Escape ordering and shortcuts outside text fields.
- [ ] Capture final desktop and narrow screenshots and inspect them before declaring completion. Update the audit's approval/implementation status accurately; keep original evidence.
- [ ] Commit scoped source/tests/docs/assets. Report what changed, actual checks run and any remaining material limitations. Do not claim calibration, nesting, mobile verification or export validation without evidence.

## Coverage self-review

| Approved requirement | Tasks |
|---|---|
| New 3D image references with native fallback and provenance | 1, 6 |
| Shared selection and startup state | 2 |
| Draft commit/cancel/validation, units, proportions, mixed values | 3, 5, 6 |
| SVG/raster import, review and layer actions/search | 4 |
| Stable shell, task navigation, preview settings and saving | 5 |
| Essential-first properties and chooser/inheritance | 6 |
| Actual assembly steps/playback/layers/quantities | 7 |
| Wide fabrication/parts/outlines/bends/forming/export status | 8 |
| Presentation/comparison/export/state restoration | 9 |
| Visual system, tablet/phone, accessibility and tour | 10 |
| Project compatibility, history boundaries and final regression | 2–11 |

Plan review: no placeholder requirements; helper names/contracts match their later consumers. Existing module exports named in extraction steps were verified against source. Detailed JSX moves preserve existing validation and callbacks; new geometry behavior is limited to approved resizing and diagram selection. Execution has not started.
