# Proposal Options and Exploded Views Implementation Plan

> **For agentic workers:** Use executing-plans inline. No delegation requested.

**Goal:** Add independent construction/colour alternatives, a comparison page, labelled exploded renders and supplied Kirat Creations branding to one client booklet.

**Architecture:** Resolve saved option overrides into an immutable effective design before existing snapshot/layout/render functions. Shots reference options; the shared page model adds option headings and comparison pages. Exploded labels are composited from actual layer bounds. Existing renderer and exporters stay authoritative.

**Tech Stack:** Existing TypeScript, React, Three.js, fontkit, PDF and image export pipeline; no new package required.

## 1. Option model and migration

- [x] Add failing `tests/proposalOptions.test.ts` tests for mixed group/letter constructions, colour overrides, recipe resets, immutable base and isolated render identities.
- [x] Implement `src/presentation/options.ts` with option types, application and duplication/removal functions. Apply group edits before per-element edits through existing artwork operations.
- [x] Extend `src/presentation/model.ts` with options, shot option IDs, comparison pages and validation; update project parsing/serialization to v6 while retaining v1–v5.
- [x] Extend model/persistence tests and run affected Node tests and typecheck. Commit passing model changes.

## 2. Exploded render and labels

- [x] Add failing tests for exploded default, layer displacement, projected callout bounds and camera fitting.
- [x] Extend `snapshot.ts` and `cameras.ts`; replace default top with exploded. Add `src/presentation/explodedLabels.ts` to derive actual layer callouts and paint them into the output canvas.
- [x] Update `finalRenderer.ts` to use exploded displaced bounds, suppress assembled halo spill for explanatory explosion, and composite labels before PNG encoding. Keep top available as an optional camera.
- [x] Run camera/scene/adapter regressions and inspect a Fenesta exploded still. Commit.

## 3. Option editor and booklet comparison

- [x] Add `src/app/presentation/OptionsEditor.tsx`: select/rename/describe/duplicate/remove options; change per-group and per-letter construction, face and return colours; fascia colour override.
- [x] Update render preparation and the render hook to resolve option-aware snapshots and keys, including paired shots scoped to their option.
- [x] Update booklet page labels and shared layout for option headings and optional comparison pages. Comparison derives actual constructions and colours, with independent option descriptions and existing inclusion controls.
- [x] Verify duplicate options create independent pages, only affected images go stale, and existing editor design is preserved. Run regression tests/typecheck/build. Commit.

## 4. Company branding and acceptance

- [x] Preserve supplied SVG under `public/brand/`, generate a transparent high-resolution PNG derivative from browser SVG rendering with trim bounds, and document provenance. Use this as the default proposal header/logo and Kirat Creations fallback text; keep editor app branding.
- [x] Verify v5 Fenesta project migration, generate at least two construction/colour options plus a labelled exploded view in one booklet, and inspect PDF and image exports with the new logo.
- [x] Run full test suite, typecheck, production build, inspect mobile/desktop and update verification documentation. Preserve generated client outputs outside committed app source. Commit the completed extension.

## Completion record

Implemented and verified 27 October 2026. See `docs/client-booklet-verification.md` for actual commands, visual checks and limits. Geometry is shared through an offscreen SignScene instance rather than duplicating the existing builder. Extension changes are committed together after integrated verification. Each final job releases its own WebGL context following the halo-view reuse regression.
