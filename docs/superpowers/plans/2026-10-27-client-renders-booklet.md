# Client Renders and Presentation Booklet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Work inline unless the user requests delegation.

**Goal:** Produce realistic, repeatable sign renders and configurable client booklets exported as PDF and individual images.

**Architecture:** Keep the domain layout authoritative. A presentation configuration drives an isolated render adapter and sequential job queue; a shared page layout feeds browser preview, PDF and page images. Fingerprinted render assets remain separate from saved configuration.

**Tech Stack:** Existing React/TypeScript, Three.js, postprocessing, Vite and Node test runner; IndexedDB for render blobs. Select a final rendering backend after Task 2. Evaluate PDF and ZIP packages at Task 10, checking current official documentation and compatibility before installation.

**Approved spec:** `docs/superpowers/specs/2026-10-27-client-renders-booklet-design.md`.

**Execution boundary:** This document is planning only. Renderer-dependent details must be resolved by the feasibility checkpoint before production render work. Do not advertise final quality or a universal rendering duration before that checkpoint passes.

---

## File ownership and dependency order

All paths below are relative to `/Users/vnshkumar/Documents/Kirat-Studio`.

| Area | Files | Responsibility |
|---|---|---|
| Presentation model | `src/presentation/model.ts`, `validation.ts`, `fingerprints.ts` | Saved configuration, validation, snapshot identity |
| Camera/scene inputs | `src/presentation/cameras.ts`, `snapshot.ts` | Projection, framing, complete assembly independent of editor |
| Shared scene | `src/scene/signGeometry.ts`, `signMaterials.ts`; existing `scene.ts`, `scenery.ts` | Extract geometry/material ownership only where required |
| Final rendering | `src/presentation/renderAdapter.ts`, `finalRenderer.ts`, `renderQueue.ts` | Backend boundary, progressive render, lifecycle |
| Cache | `src/storage/renderAssets.ts` | IndexedDB blobs and quota recovery |
| Layout/export | `src/presentation/pageLayout.ts`, `pageCanvas.ts`, `pdfExport.ts`, `imageExport.ts`, `exportPackage.ts` | One page model, fonts, PDF, PNG/JPG, ZIP |
| UI | `src/app/presentation/PresentationWorkspace.tsx`, `RenderSetup.tsx`, `ShotList.tsx`, `BookletEditor.tsx`, `PagePreview.tsx`, `ExportDialog.tsx`, `presentation.css` | Prepare → Build → Export |
| Integration | `src/app/store.ts`, `actions.ts`, `App.tsx`, `WorkspaceHeader.tsx`, `PresentationPanel.tsx`, `src/storage/project.ts` | Persistence, entry/exit, legacy exporter replacement |
| Evidence | `docs/render-quality/2026-10-27/`, `docs/client-booklet-verification.md` | Baselines, candidate captures, measured device/timings, export inspection |

Tasks 1–2 establish the rendering decision. Task 3 defines contracts; Tasks 4–7 consume them in order. Task 8 needs model and layout, Task 9 integrates UI and rendering, Task 10 adds export, Tasks 11–12 complete persistence and verification. Commit each passing task; do not combine unrelated changes.

## Task 1: Establish baseline and representative fixtures

**Files:** create `tests/fixtures/presentation.ts`, `docs/render-quality/2026-10-27/baseline.md`; use existing `tests/layout.test.ts`, `tests/lighting.test.ts` patterns.

- [x] Run `npm test`, `npm run typecheck`, `npm run build` separately; record any existing failures before changing code. Expected: tests pass, typecheck exits 0, Vite writes `dist/`.
- [x] Build deterministic fixture designs for front-lit, halo, front-plus-halo, full-acrylic and flat metal, including a counter/hole, saturated face colour, painted return override and mounting standoff. Reuse valid project/recipe defaults instead of fabricating unsupported dimensions.
- [x] Add fixture tests proving `computeLayout()` preserves the hole, effective override, part thickness and wall spacing; run `node --test tests/presentationFixtures.test.ts`, first observing failure before adding the fixture implementation.
- [x] Run the app with `npm run dev -- --host 127.0.0.1`; capture actual current day/night views at matched 2400-pixel output and a fixed three-quarter camera. Save PNGs and exact fixture/camera settings under the evidence directory.
- [x] Record browser, GPU/device, scene dimensions and timings. Review current halo glow implementation around `scene.ts:728` and document which effects are approximations that cannot be blindly reused by another backend.
- [x] Commit fixtures and baseline evidence: `test: establish client rendering baselines`.

## Task 2: Bounded final-render feasibility checkpoint

**Files:** create `docs/render-quality/2026-10-27/renderer-decision.md`; prototype in ignored `.superpowers/render-feasibility/` before promoting production code.

- [x] Evaluate enhanced raster capture using supersampling, improved environment/reflection lighting, contact/occlusion, controlled bloom and material detail. Keep sign geometry and exposure comparisons fixed.
- [x] Evaluate a progressive physically based candidate against current official documentation: Three.js version compatibility, browser/GPU support, orthographic cameras, emissive wall spill, acrylic transmission, colour pipeline, accumulation and cancellation. Record exact candidate/version and asset licences; do not install an unverified dependency globally.
- [x] Capture all five fixtures with both candidates at matched 2400-pixel size, including day/night and orthographic top. Use a maximum two-minute evaluation budget per capture on the identified device; record unfinished convergence as an observation, not success.
- [x] Inspect edges, contact shadow, colour retention, metal reflections, acrylic, and halo distance from wall. Compare crop-for-crop against Task 1 and record each pass/failure plus memory and elapsed time.
- [x] Choose one final backend only if it meets the approved quality contract. Document renderer version, supported materials, disposal, progress semantics, cancellation strategy and output colour handling. If neither qualifies, stop dependent renderer tasks and present the concrete gap for a revised decision. Continue only independent model/layout work.
- [x] Commit the decision and comparison evidence: `docs: select final render pipeline from visual evaluation`. Update backend-specific steps in Tasks 5–7 with the proven adapter calls before executing them; this is a dependency checkpoint, not permission to guess an API.

## Task 3: Define presentation model and fingerprints

**Files:** create `src/presentation/model.ts`, `validation.ts`, `fingerprints.ts`, `tests/presentationModel.test.ts`, `tests/presentationFingerprints.test.ts`.

- [x] Write tests for default ordered day/night and selected studio shots, both top variants, invalid enum recovery, nonfinite dimensions, duplicate IDs, unknown page references, excessive text, and bounded logo data. Run both test files and observe the missing-module failure.
- [x] Define contracts:

```ts
export type CameraPreset = 'front' | 'left' | 'right' | 'top' | 'elevated' | 'threeQuarter' | 'custom';
export type RenderQuality = 'preview' | 'final';
export type RenderStatus = 'preview' | 'queued' | 'rendering' | 'final' | 'outdated' | 'failed' | 'cancelled';
export type Point3 = [number, number, number];
export type ShotCamera = { preset: CameraPreset; position?: Point3; target?: Point3 };
export type PresentationScene = {
  kind: 'studio' | 'shopfront' | 'facade' | 'wall' | 'interior';
  wallFinish: 'plaster' | 'concrete' | 'brick';
  groundFinish: 'paving' | 'concrete';
};
export type Shot = {
  id: string; name: string; scene: PresentationScene; camera: ShotCamera;
  pairId?: string; environment: 'day' | 'dusk' | 'night';
  power: boolean; dimming: number; exposureEV: number;
  width: 2400 | 3840; aspect: number;
};
export type BookletPage = {
  id: string; kind: 'cover' | 'render' | 'summary'; included: boolean;
  shotId?: string; caption: string; dimensions: boolean; materials: boolean;
};
export type PresentationConfig = {
  shots: Shot[]; pages: BookletPage[];
  metadata: { project: string; client: string; revision: string; notes: string; logoData?: string };
  include: { branding: boolean; projectInfo: boolean; notes: boolean };
};
```

- [x] Implement `defaultPresentation()`, `validatePresentation(raw)` returning `{value, warnings}`, and explicit limits: 100 shots/pages, 200-character titles/client/revision, 4000-character notes, 500-character captions, 1 MiB decoded PNG/JPG logo, aspect 0.25–4, dimming 0–1 and exposure −4–4 EV. Invalid presentation falls back with warnings while valid design survives.
- [x] Implement canonical sorted-key serialization and SHA-256 shot fingerprints over render-relevant design + effective scene/shot inputs + backend version. Exclude names, artwork-review flag, page order, client metadata and other nonvisual fields. Keep a separate page-layout fingerprint.
- [x] Test that equivalent key ordering produces the same key; geometry/colour/camera/power edits change it; title/order changes do not. Snapshot input must be cloned before hashing/rendering, so later mutation cannot change a running job.
- [x] Run the two tests and typecheck; commit `feat: define presentation configuration and render identities`.

## Task 4: Isolated scene snapshots and deterministic cameras

**Files:** create `src/presentation/snapshot.ts`, `cameras.ts`, `tests/presentationCameras.test.ts`, `tests/presentationSnapshot.test.ts`; inspect `src/domain/layout.ts`, `project.ts`, `src/scene/scenery.ts`.

- [x] Add tests that presentation snapshots ignore editor isolation, explosion, layer hiding and selection, preserving all included design elements and excluding construction type `omit`. Verify input design/view deep equality before/after.
- [x] Implement `createPresentationSnapshot(design, shot)` from a cloned design, `defaultView()` and explicit complete-assembly overrides. Resolve layout once through existing `sceneInput()`/`computeLayout()`; do not duplicate physical mathematics.
- [x] Define camera axes from layout convention: x right, y up, z out of wall. Front looks along −z, left/right along ±x, top along −y with up along −z. Derive orthographic extents by projecting all eight world-bound corners; apply 10% padding and aspect. Include meaningful stud/mounting depth in studio bounds.
- [x] Test projected corners stay inside clip space for wide, tall, small and flat fixtures, including technical top with a nonparallel up vector. Perspective framing must include depth and adjusted near/far planes. Use a 35° FOV and the same fit algorithm for paired cameras.
- [x] Implement shared pair camera editing so linked shots resolve identical camera transforms. A custom saved camera must reject zero direction and nonfinite vectors. Installed framing uses environment bounds; studio uses sign bounds.
- [x] Run the camera/snapshot tests and existing scene preset/layout tests; commit `feat: add repeatable presentation cameras and snapshots`.

## Task 5: Share geometry and improve built-in environments

**Files:** create `src/scene/signGeometry.ts`, `signMaterials.ts`; modify `src/scene/scene.ts`, `scenery.ts`; create `tests/presentationScene.test.ts`; place owned/licensed assets in `public/images/environments/` with provenance README.

- [x] Write regression tests comparing physical part bounds, region holes and material assignment before/after extraction. Add disposal checks modelled on `tests/scenePresets.test.ts`; run to confirm failures before moving code.
- [x] Extract only renderer-neutral sign geometry/material inputs needed by the selected backend. Preserve part IDs, unit conversion, contours, mounting, overrides and current editor picking. Keep editor interaction and postprocessing in `SignScene`.
- [x] Add facade and wall environments to presentation scene construction without changing legacy saved view enum semantics. Add curated finish controls and measured texture scale. Separate environment material base colour from day/night illumination so night does not repaint the wall material.
- [x] Replace unowned/global resource disposal with explicit ownership of geometry, materials, texture and environment-map resources. Ensure a failed scene build releases partial resources and editor rendering stays available.
- [x] Compare Task 1 captures after extraction; then tune reflections, material detail, contact and antialiasing with the selected pipeline. Preserve geometry exactly. Document realistic framing warnings for extreme signs.
- [x] Run `node --test tests/scenePresets.test.ts tests/presentationScene.test.ts tests/layout.test.ts` and typecheck; commit `feat: prepare shared signage scenes for final rendering`.

## Task 6: Implement the selected progressive render adapter

**Files:** create `src/presentation/renderAdapter.ts`, `finalRenderer.ts`, `tests/renderAdapter.test.ts`; update dependency manifest/lock only for the selected backend.

- [x] Define adapter lifecycle before implementation:

```ts
export interface RenderAdapter<Input> {
  render(input: Input, options: {
    signal: AbortSignal;
    onProgress: (progress: { fraction?: number; label: string }) => void;
  }): Promise<{ blob: Blob; width: number; height: number }>;
  dispose(): void;
}
```

- [x] Use the snapshot return type from Task 4 as Input. Test abort before start, abort during accumulation, context loss, unsupported material errors and disposal using an injected deterministic backend; never claim Node mocks verify GPU image quality.
- [x] Implement the exact backend calls proven in Task 2. Yield between accumulation batches, check AbortSignal before readback, render at selected width/derived height, and return a PNG blob. A backend without a trustworthy percentage reports stages instead of invented progress.
- [x] Preserve a fast interactive preview; final mode runs on a separate canvas/context or isolated owned renderer proven to preserve editor state. Provide explicit memory failure and context loss messages; no silent preview fallback.
- [x] Capture matched 2400/3840 outputs for day/night and both projection types; verify actual pixel sizes, cancellation responsiveness and resource release over repeated jobs.
- [x] Run adapter tests/typecheck and visually compare Task 2 references; commit `feat: add progressive final signage rendering`.

## Task 7: Sequential queue, invalidation and render asset cache

**Files:** create `src/presentation/renderQueue.ts`, `src/storage/renderAssets.ts`, `tests/renderQueue.test.ts`, `tests/renderAssets.test.ts`.

- [x] Test with controllable promises: only one render is active, cancel stops pending shots, retry retains completed shots, late completion cannot mark a changed shot current, and returning to an identical fingerprint can reuse a valid asset.
- [x] Implement an immutable job record keyed by fingerprint and run token. Store status independently from configuration. Compare the current shot fingerprint when accepting results; never attach an old image merely by shot ID.
- [x] Add IndexedDB get/put/delete/prune with an injectable storage boundary. Keep Blob data out of React configuration and JSON. Bound cache to 256 MiB with least-recently-used eviction; on quota failure prune and retry once, then retain the image in memory and report cache unavailable.
- [x] Test missing DB, blocked/open errors, corrupt records and quota retry. Treat cache misses after project reopen as needing rerender, not invalid project files. Revoke object URLs on eviction, project switch and workspace disposal.
- [x] Verify actual browser persistence, refresh, and queue cancellation; commit `feat: manage presentation render jobs and cached images`.

## Task 8: Shared booklet page layout and summaries

**Files:** create `src/presentation/pageLayout.ts`, `pageCanvas.ts`, `tests/bookletLayout.test.ts`; use layout-derived constructions and `src/domain/units.ts`.

- [x] Write tests for included-page order, no-cover first-page title, omitted optional fields, long text, Unicode, transparent logo bounds, summary overflow and missing shot references. Empty booklet must return an actionable issue.
- [x] Define page coordinates in millimetres: 297 × 210, 12 mm outer margins, 8 mm footer, image fit using contain, with explicit aspect-preserving rectangles. Layout returns typed text/image/line primitives and page count. Browser/PDF/canvas must consume these same primitives.
- [x] Bundle a licensed Unicode font covering Latin and Devanagari with a provenance file. Use one font measurement/shaping service for wrapping and export. Test Hindi client/project titles; if a PDF library cannot shape them, render shaped text to transparent assets consistently in all output paths instead of dropping glyphs.
- [x] Resolve effective material summaries from actual layout elements, not group defaults alone. Technical front overlays show width/height, side/top depth and applicable wall spacing. Keep dimension lines outside the object silhouette and within margins.
- [x] Paginate materials/notes continuation pages from the selected summary page. Never silently truncate content. Include stable continuation labels and final page numbers.
- [x] Implement `pageCanvas.ts` at 3508 × 2480 for A4 landscape, with white background, selected branding, optional information, concept disclosure and Draft watermark only for explicit draft export.
- [x] Run layout tests; inspect generated long-content fixtures at native output size; commit `feat: share booklet page layout across previews and exports`.

## Task 9: Prepare renders and build booklet UI

**Files:** create `src/app/presentation/PresentationWorkspace.tsx`, `RenderSetup.tsx`, `ShotList.tsx`, `BookletEditor.tsx`, `PagePreview.tsx`, `presentation.css`; modify `src/app/App.tsx`, `WorkspaceHeader.tsx`, `PresentationPanel.tsx`, `store.ts`.

- [x] Create Prepare/Build/Export navigation in a dedicated presentation workspace with labelled return to editor. Keep session preview/job state separate from saved config; closing the workspace cancels active jobs and preserves completed cache/configuration.
- [x] Bind scene/finish, camera, linked pair, power, environment, exposure, resolution and preview/final controls to Task 3 configuration. Show shot names, thumbnails and actual render status. Render-selected and render-all controls feed the sequential queue.
- [x] Build page include checkboxes, explicit move-up/down actions, shot chooser, caption editing, dimension/material toggles and global metadata/branding controls. Add/remove optional cover, dusk and summary pages; do not add summary-board editing.
- [x] Render page previews from Task 8 primitives, with lazy thumbnails and current page navigation. Mark outdated render images visibly without discarding them; only current final assets qualify for final export.
- [x] Replace the fixed-sheet menu entry with Client booklet; retain current-view PNG and fabrication export actions. Exiting restores editor camera/selection and original task mode. Update help/tour wording that names the old sheet.
- [ ] Verify keyboard focus, Escape/return focus, reorder via keyboard, progress announcements, 1440×900 desktop and 390×844 narrow-screen setup/list/preview navigation. Preserve readable controls instead of shrinking the three-column editor.
- [x] Run existing workspace tests, typecheck and build; commit `feat: add client render preparation and booklet editing`.

## Task 10: PDF, image and ZIP exports

**Files:** create `src/presentation/pdfExport.ts`, `imageExport.ts`, `exportPackage.ts`, `src/app/presentation/ExportDialog.tsx`, `tests/bookletExport.test.ts`; modify `package.json` and lockfile for verified PDF/ZIP dependencies.

- [x] Check current official documentation for candidate PDF and ZIP libraries. Verify browser ESM compatibility, Unicode font/shaping strategy, vector text/lines, JPEG/PNG embedding, cancellation and memory characteristics; record selected versions/licences in verification notes.
- [x] Write tests against page primitives/export manifests: only included pages, correct order, physical A4 size, stable numbered names, missing/outdated assets rejected for final, explicit draft accepted with watermark, JPG white background, shot image versus composed page image distinguished.
- [x] Render PDF from shared primitives, keeping supported text/dimensions vector and embedding render blobs at the computed rectangles. Encode PNG/JPG shots or composed pages, using JPEG quality 0.94. Batch images go into a ZIP with sanitized numbered filenames and duplicate-name protection.
- [x] Generate one page at a time; release intermediate canvas and decoded images before the next. Cancel between pages and before download. Export failures retain queue/cache/config and expose retry. Do not imply a successful client send or guaranteed file save.
- [x] Implement preflight listing each included page's missing/outdated/failed render with rerender actions. Explicit Draft export may use available preview images but still rejects missing images. Keep final and draft filenames distinct.
- [x] Inspect actual exported PDFs with a PDF rendering tool and images at native size. Compare preview, PDF and page raster for crop, accents, Hindi text, logo aspect, dimension alignment, page count and order. Open the ZIP and verify every entry and actual resolution.
- [x] Run export/layout tests, typecheck and build; commit `feat: export client booklets as PDF and image packages`.

## Task 11: Versioned project persistence and reopen recovery

**Files:** modify `src/storage/project.ts`, `src/app/store.ts`, `actions.ts`, `WorkspaceHeader.tsx`; extend `tests/project.test.ts`; create `tests/presentationPersistence.test.ts`.

- [x] Add failing tests for v1–v4 migration with identical design/fabrication, v5 presentation round-trip, invalid presentation recovery with warnings, cache-free reopen and branding image limits. Old tests calling `serialise()` without presentation must remain supported through defaults.
- [x] Set project format to v5, adding presentation configuration separately from design and fabrication. Preserve v1–v4 parsing branches. Return recoverable presentation warnings separately from fatal design parse errors.
- [x] Extend store and load/save/autosave plumbing to include presentation edits without touching design history. Explicitly reset previous project's config/runtime jobs on project replacement. Recompute current fingerprints and load available cached blobs asynchronously.
- [x] Project title changes update presentation and header labels, removing the hard-coded Kirat Creations label without changing imported artwork identity. When cache images are absent, show saved booklet configuration and a render-needed message.
- [x] Confirm decoded 1 MiB branding image plus bounded text stays compatible with the 16 MB project-upload guard. Browser storage failure keeps Save project copy available and must not report Saved.
- [x] Run `node --test tests/project.test.ts tests/presentationPersistence.test.ts tests/history.test.ts` and typecheck; commit `feat: save and restore client presentation settings`.

## Task 12: Visual acceptance, recovery checks and documentation

**Files:** create `docs/client-booklet-verification.md`; update `README.md`, `docs/ROADMAP.md`, approved spec delivery status after verification.

- [x] Run all tests, typecheck and production build, recording command results. Do not call the feature complete if these fail.
- [x] On the identified GPU/browser, render all five fixture constructions in installed day/night plus studio orthographic and perspective views. Capture before/after crops, elapsed times, output sizes and observed material limitations. Confirm geometry, holes, colours and standoffs match layout.
- [x] Edit geometry during a render, undo, change pair camera, reorder pages, rename client, cancel/retry, switch project and reopen saved JSON. Confirm invalidation boundaries and no editor state changes.
- [ ] Simulate WebGL context loss, failed texture, unavailable IndexedDB, quota exhaustion and export failure. Verify useful retry paths and preservation of configuration/completed assets. Confirm unsupported final materials cannot masquerade as final-ready.
- [x] Export a minimal booklet, a long Unicode/material-summary booklet, and a draft. Render PDFs for inspection; compare PNG/JPG page and raw-shot outputs, ZIP names, page order, 297 × 210 mm page size and 3508 × 2480 page-image dimensions.
- [ ] Inspect desktop, short laptop and phone layouts, keyboard-only navigation and focus return. Verify concept disclosure and user-selected content controls actually affect output.
- [x] Document supported hardware observations, rerender-on-other-device behaviour and uncalibrated-lighting limits. Remove or redirect obsolete fixed-sheet documentation; keep fabrication exports and manufacturing limitations accurate.
- [x] Commit `docs: verify client rendering and booklet export workflow` only after evidence supports the completion claims.

## Plan self-review

Coverage: rendering and built-in scenes → Tasks 1–6; selectable technical/perspective views → Tasks 3–4 and 9; booklet ordering/content → Tasks 8–9; PDF/PNG/JPG and draft/final rules → Task 10; progress/cancel/outdated/cache → Tasks 6–7; schema compatibility/autosave → Task 11; error recovery, responsive access and actual exported-file inspection → Task 12.

The intentional rendering dependency is resolved by measured evidence in Task 2. No universal render time, untested backend compatibility or calibrated photometry is promised. Implementation must update backend-specific details after that checkpoint and preserve the defined adapter boundary. This plan adds no app code and does not start execution.

## Completion record

Implemented and verified 27 October 2026. See `docs/client-booklet-verification.md` for actual commands, visual checks and limits. Geometry is shared through an offscreen SignScene instance rather than duplicating the existing builder. Extension changes are committed together after integrated verification. Each final job releases its own WebGL context following the halo-view reuse regression.

The unchecked compound acceptance items were only partly exercised: desktop/mobile layout, cancellation/context loss/retry, stale assets, cache corruption/quota fallback passed; exhaustive keyboard focus, short-laptop layout and every injected texture/export failure were not separately run. These are additional coverage limits, not missing user-facing features.
