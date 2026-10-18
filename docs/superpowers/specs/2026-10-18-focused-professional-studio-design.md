# Focused professional studio — Kirat Studio design specification

Date: 18 October 2026
Status: screen design approved; written specification awaiting final user review.

## Objective

Make repeated signage editing faster and clearer while preserving Kirat Studio's existing artwork, construction, assembly, preview and fabrication capabilities. Prioritize a stable editing hierarchy, readable controls, consistent selection scope and a larger sign preview.

The user selected Focused professional studio, approved the workspace structure, then approved the detailed Design, Assembly and Fabrication screen mockups and interactions. This document records that design for implementation planning. The working audience assumption is signage designers and fabricators; no separate audience answer was supplied.

## Evidence and visual references

The [UX audit](../../ux-review/2026-10-18/review.md) contains current-screen observations and a screenshot index.

Approved screen references:
- [Design workspace](../../ux-review/2026-10-18/19-design-mode.png)
- [Assembly workspace](../../ux-review/2026-10-18/20-assembly-mode.png)
- [Fabrication workspace](../../ux-review/2026-10-18/21-fabrication-mode.png)

The local companion's latest screen file is `.superpowers/brainstorm/88625-1792320155/content/studio-screen-designs-v2.html`. The companion is a disposable design aid, not an application dependency. Screenshots illustrate layout; static labels, sampled quantities, generic geometry and schematic plates are not new manufacturing requirements. In particular, an outline must not be called approved while artwork review is pending.

## Scope

Reorganize existing tools into Design, Assembly and Fabrication task modes; simplify the header, inspector, units and export surfaces; clarify import and selection states; improve typography and responsive layouts; provide a cleaner presentation view.

Retain vector/raster import, text artwork, crop/retrace, grouping and reordering, per-group and per-element construction and colour, dimension/spacing edits, hide/isolate, 2D outlines, 3D preview, forming study, lighting controls, assembly steps, layer visibility, quantities, cutting compensation, return-strip settings, DXF/CSV and presentation exports.

Do not add machine calibration, bend allowance, nesting, automatic glyph recognition, new electrical calculations, calibrated rendering, project collaboration or a cloud project library. Rendering/material improvements beyond arranging existing preview controls are deferred.

## Workspace and navigation

### Persistent shell

The header contains Kirat Studio branding, project name, local-save status, Undo/Redo, Present and Export. Project provides Open project, Save project copy and Restore previous session when available. Help contains the tour, keyboard reference, glossary and research-atlas link.

Design, Assembly and Fabrication form the primary task navigation. Startup enters Design; an imported/restored project initially shows board properties, with groups collapsed. Switching task modes preserves the design, selection, camera and scroll/expansion state where applicable. Mode-specific view state may be retained in memory but must not enter design history.

The bottom status strip shows local-save feedback, the global display unit, board dimensions, shape count and artwork-review state. The status must reflect actual storage success; failure offers Save project copy. “Saved in this browser” never implies a downloaded backup.

### Design mode

- Left: import/replace artwork, source information and the board/group/shape tree.
- Centre: 3D or 2D preview, a scoped selection label and compact view controls.
- Right: properties for the board, group, individual shape or multiple shapes.

Groups begin collapsed. Show colour or shape thumbnails and counts. Search filters names/IDs, expands matching paths and reports no matches; clearing search restores the prior expansion state. No inferred character names are required for unnamed SVG shapes.

Keep rename, reorder, move between groups, group creation, merge, exclude and hide actions available through appropriate row/context menus. Use semantic buttons for interactive tree controls, visible keyboard focus, and text labels for icon-only controls.

### Assembly mode

- Left: the actual dependency-ordered steps from the existing assembly model.
- Centre: 3D preview, previous/play-pause/next, step progress, one explode slider and Show complete assembly.
- Right: current-step explanation, parts introduced at that step, layer visibility and expandable total quantities/power estimates.

The number of steps is dynamic: optional backing can add a step. Disable Previous at the first step and Next at the last. Playback stops at the final step and exposes Replay. Entering Assembly first shows the complete sign; selecting a step applies its actual visible layers. Manual visibility changes are labelled Custom layers instead of falsely implying the step is unchanged. Selecting another step reapplies its layers. Show complete assembly resets step visibility and explosion as the current reset behavior intends.

Step descriptions remain explanatory, not workshop approval. Preserve current quantity and placeholder-rating disclosures beside the values.

### Fabrication mode

- Left: searchable/filterable parts grouped by artwork group, with outline/return-strip categories.
- Centre: selected-part outline, compensated-path overlay where applicable, selected strip diagram and a readable bend table.
- Right: cutting method, tool diameter/kerf, minimum stroke, return-strip parameters, check status and DXF/CSV export entry.

Use computed geometry and schedules from existing fabrication modules. Selecting a part synchronizes the outline, diagram and table. Selecting a bend-table row highlights the corresponding diagram feature; unsupported or absent geometry shows an explicit empty state rather than a fabricated preview.

Forming study opens from a selected supported return strip, with part name, straight-to-formed progress, animation controls and Back to fabrication. Preserve the selected part on return. Flat/vinyl/excluded parts explain why no return strip exists.

“No geometric cutting issues” applies only to current checks. Show artwork review, geometric checks, machine limitations and nesting limitations separately. Exports remain available under the current application's authority model; pending review is disclosed, not converted into an invented production-approval gate.

## Artwork workflow

Import opens a focused source-aware drawer/dialog; cancellation preserves the existing project. New imports select the resulting board and show groups for review.

For SVG, show original vectors, shape/group counts, source name when known and Review outlines. Hide raster background removal, tolerance, small-shape filter and retrace controls. Replace artwork remains accessible and undoable as supported by current behavior.

For raster/text-generated artwork, expose background removal, tolerance, small-shape filtering, crop and Trace & rebuild. Keep the trace-reconstruction limitation visible. Review opens 2D outlines; the user can mark artwork reviewed using the existing approval field. “Reviewed” describes artwork review only.

Handle empty artwork, unreadable/unsupported files, oversize files and failed tracing with a specific error and retry/replace action. An unsuccessful import must preserve the last valid design.

## Properties and selection

Use one shared selection interpretation for the tree, inspector heading, viewport label, framing, hide and isolate actions:
- Board: dimensions, artwork placement/scale, board finish and expandable structural layers/material thicknesses.
- Group: group name/count, character size and spacing, construction, face/return finish, expandable recipe anatomy and group lighting.
- Shape: shape thumbnail/name/group, size and offset, construction/colour inheritance and explicit overrides.
- Multiple shapes: selection count, common values or Mixed, supported bulk changes and move-to-group actions.

Routine fields precede diagrams. Keep anatomy and advanced construction details collapsed initially. Selecting a different item brings the essential properties into view without scrolling the canvas or tree.

Group edits explain that existing letter overrides remain. Individual overridden fields show their inherited value and a reset-to-group action. Mixed-value fields must not display a misleading single value or write changes until the user enters one.

Proportion locking is explicit and applies to height/width only. It starts enabled for a single shape and uses its current aspect ratio. Group or multi-selection proportional resizing preserves each shape's own ratio from its current dimensions; unequal widths remain Mixed. Unlocking allows independent changes. Do not alter geometry merely by toggling the lock.

Changing construction resets recipe parameters according to existing recipe behavior and remains undoable. Explain the reset in the chooser before applying it. The chooser is a wider visual surface retaining the existing construction illustrations, grouped by illuminated, flat and excluded options. The inspector shows the current choice and a Change action instead of the full catalogue.

## Editing, units and feedback

Use a single global display-unit control: mm, inch or foot. Convert display/edit values at the boundary; internal design geometry and saved physical values remain millimetres. Do not repeat all three units below every field; provide alternate-unit values in accessible detail/tooltips.

Fabrication machining fields remain explicitly labelled in mm where the existing machine settings and file formats require it. Angles remain degrees; DXF output remains mm. Switching display units must not change physical geometry.

Typed numeric input is a local draft until Enter or blur. Escape restores the committed value. Valid slider/scrub changes preview immediately, with continuous gestures coalesced into sensible design undo entries. Invalid drafts show an inline error and do not change the model. A rejected field must not silently block navigation or replace the last valid scene.

Remove duplicate Apply buttons once all relevant input pathways update reliably. Use an updating indicator if geometry takes noticeable time, retain the previous valid preview and surface rendering/calculation failures with retry where possible. A view-only failure must not mark the design unsaved or corrupt it.

Keep existing history boundaries: design edits are undoable; camera, environment, visibility and selection changes are view-only; fabrication settings are saved but remain outside design undo. State this distinction in help when needed.

## Preview and presentation

Design viewport controls group 3D/2D separately from environment and sign power. Camera presets use a compact menu plus Fit and zoom. Isolate/Frame/Hide actions apply to the explicit selection scope. Camera and gesture hints match the active 2D/3D/forming view.

Day/Dusk/Night changes scene environment independently of sign power and application theme. Put global dimming/exposure/LED defaults in a Preview settings surface; group lighting stays in group properties. Preserve existing white/RGB/artwork LED modes and inheritance.

Present opens a clean canvas with project title, day/night switching, optional side-by-side comparison, an optional construction summary, export and Exit presentation. Hide editor tree, properties, tour, undo/redo and fabrication controls. Show camera controls on focus/interaction so keyboard and touch users can still reach them.

Comparison uses the same design and camera for both views and does not mutate design or discard the editor's view preferences on exit. Retain the disclosure that lighting is an uncalibrated visual approximation.

Export menu names outputs explicitly: Current view image, Day/night presentation sheet, Cut files (DXF), Bend schedule (CSV). Include format/purpose and relevant current limitations; disable only outputs with genuinely missing required data, with an explanation. Preserve existing output behavior and formats; do not imply new file metadata or manufacturing validation that current exporters do not support.

## Visual system and responsive behavior

Retain navy for structure/primary actions and warm brass for selected emphasis. Use white property surfaces and a cool neutral stage, restrained borders, consistent 6–8px control radii and an 8px spacing rhythm. Target 13–14px controls, at least 12px secondary labels and legible selected/hover/focus/error states. Pair semantic colours with text or icons. Avoid persistent all-caps microcopy.

Desktop (at least 1100 CSS px): three columns, with resizable/collapsible side panels, a flexible canvas, and independently scrollable panels. Initial widths: 210px layers, 300px properties; enforce usable minimums so the canvas never collapses. On short laptop viewports, pin shell navigation/status and scroll panel contents.

Tablet (700–1099 CSS px): a persistent preview above one resizable tool drawer. Layers/Properties/Preview switch the active surface; Assembly and Fabrication expose equivalent step/part and settings views. Default preview height is 45% of available workspace; clamp resizing to retain usable preview and tools. Preview expands and restores the previous drawer size on exit.

Phone (below 700 CSS px): one active full workspace surface with Preview/Layers/Properties navigation, a labelled header overflow menu and at least 44px touch targets. Keep mode switching accessible. Open bend/quantity tables in a dedicated full-width view with contained horizontal scrolling where necessary. Avoid shrinking desktop text to fit or hiding actions in an unlabelled horizontal header scroller.

The tablet illustration in the companion communicates hierarchy, not a verified mobile implementation. Real responsive testing is required.

## Architecture and data flow

Keep existing React/store/Three.js and domain calculations. The redesign is a focused UI reorganization:
- Workspace shell owns task navigation, menus, panel sizing and responsive drawers.
- Artwork/layers surface handles source review and structure actions.
- Selection properties surface renders board/group/shape/multi-selection editors.
- Viewport controls expose mode-appropriate view actions.
- Assembly workspace consumes the existing step/layer model.
- Fabrication workspace consumes the existing plan, cutting and bending results.
- Presentation and export surfaces coordinate existing renderer/export actions.

Use focused components with explicit selected IDs, computed data and callbacks; avoid duplicating the physical model in UI state. A shared selection descriptor derives scope and IDs from existing view state, with board/group precedence over stale primary-element labels.

Flow: committed design edit → history/store → existing layout/scene input → renderer and derived quantities. Fabrication configuration → existing fabrication calculations → selected part/outline/schedule display and exporters. Local input drafts and panel state stay outside saved design data. Any transient computed index must be invalidated when artwork, selection or fabrication settings change.

Avoid unrelated domain refactoring or project schema changes. Existing project files must open without changing their geometry or losing overrides. A newly introduced view preference must not require migrating design files.

## Acceptance and verification

1. Every retained capability has a discoverable location in the new navigation; no duplicate settings surfaces disagree.
2. Board/group/shape/multi-selection labels and actions agree in tree, canvas and properties, including after undo, replacement import, hide and isolate.
3. Dimensions commit on Enter/blur, cancel on Escape, reject invalid input inline and preview valid edits without Apply.
4. Proportion locking and unit switching preserve intended physical dimensions; group overrides and Mixed values remain truthful.
5. SVG/raster source controls, empty/import/error states and artwork review status behave as described.
6. Assembly derives real step counts and parts, respects playback bounds and distinguishes custom layer visibility.
7. Fabrication shows actual part geometry and schedules; selection highlights align; unsupported/empty parts have explicit states.
8. Present/exit and day/night comparison preserve design and editor state. Existing image/sheet/DXF/CSV export workflows remain usable and accurately labelled.
9. Local save status follows actual persistence outcome. Existing project open/save and undo/history boundaries remain intact.
10. Keyboard users can reach menus, tree actions, dialogs and drawers. Dialogs manage focus, close on Escape and return focus to their trigger; disclosures expose expanded state.
11. Visually inspect 1440×900, 1280×720, 1024×768, 768×1024 and 390×844. Check short screens, zoom, long names, large groups, scrolling, overlays, contrast and touch targets.
12. Run existing tests, TypeScript checks and production build after implementation. Add targeted behavioral regression tests for selection scope, unit/proportion edits and source-aware controls where existing coverage does not protect them. Do not add tests that merely duplicate static markup.

## Delivery boundary

Implement in reviewable increments: selection/input consistency and source-aware controls; shell/Design inspector; Assembly; Fabrication; presentation/export; responsive/accessibility verification. This order is a dependency guide, not an implementation plan. A separate plan follows review of this written specification.
