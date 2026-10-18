# Kirat Studio — visual and UX review
Date: 18 October 2026

## Scope and evidence
Reviewed the repository README, recent commits, React screen structure, responsive CSS, and the running app at localhost:5173. Captured 16 current-app screenshots at 1280 × 720: Artwork, Board, Build, Make, 2D, forming study, night, presentation, help, tour, group dimensions, construction choices, materials/lighting, assembly layers, quantities, and board inspector. The initial narrow app view was also observed, but no saved mobile screenshot or device-specific testing was completed. Export file contents, fresh import, destructive actions, and every individual construction permutation were outside this visual review.

No application source was changed. Findings are visual/interaction observations, not user research. The intended primary audience is still awaiting clarification; the proposed direction assumes frequent use by signage designers and fabricators.

## Overall recommendation
Keep the navy and warm brass identity and the construction illustrations. Simplify the editing hierarchy: layers on the left, a larger sign preview in the middle, and properties for the current selection on the right. Separate Design, Assembly, and Fabrication tasks. Use an optional guided path for onboarding.

## Prioritized findings

| Priority | Current evidence | UX consequence | Suggested change |
|---|---|---|---|
| High | Artwork screen shows background removal, tolerance, pixel filtering and Trace & rebuild alongside a notice that SVG trace settings do not apply (01-artwork.png). | Users must discover which visible tools are relevant. | Show SVG source, groups, shape count and outline review for vectors; show raster tracing controls only for raster imports. |
| High | Expanded tree lists generic Element names and occupies much of the right panel (01-artwork.png). | Users scroll before reaching useful properties. | Collapse groups initially, show counts and shape thumbnails, provide search, and allow the layer pane to resize independently. |
| High | Group selection changed properties to Main wordmark while the viewport badge continued to show Element 01 (11-group-properties.png). | Selection scope looks inconsistent; users may hesitate before editing. | Derive viewport badge, tree highlight and properties heading from the same explicit board/group/shape selection scope. Verify group selection, multi-selection, isolation and clearing. |
| High | Units are repeated in the viewport, structure header, Board tab and every dimension readout. Apply appears in the tree, properties header and section footer. | Controls compete and edit commitment is unclear. | One global display unit, optional alternate-unit tooltip, and a consistent live-update model with visible save/update feedback. Commit typed values on Enter/blur; show validation beside the field. |
| High | Size inputs follow an anatomy illustration and explanatory text; construction choices occupy a tall list (11, 12). | Frequent edits require long navigation. | Put name, size, spacing, construction and finish first. Keep the current construction visible; open the full visual picker on Change. Collapse anatomy and technical recipe details. |
| High | Make combines tool settings, return parameters, strip diagram, bend table and exports in a narrow sidebar (04-make.png). | Specialist detail is hard to inspect and compare. | Give fabrication a wide workspace: part list, selected outline/strip preview and bend table. Settings stay in a compact side panel. |
| Medium | Labels and help text are frequently 7–11px in CSS, with light text on pale backgrounds. | Dense screens require extra visual effort. | Aim for 13–14px standard controls, 12px secondary labels, clearer foreground contrast, and fewer all-caps micro labels. Verify at real laptop and tablet sizes. |
| Medium | Header offers Save, Open, Presentation, Sheet and Export, plus tour, shortcuts and undo/redo. | Output names and next actions are ambiguous. | Project menu for Open/Save copy, persistent local-save status, Present action and one Export menu with named outputs and short descriptions. |
| Medium | Build includes lighting, assembly playback, explosion, layer visibility, power and a long BOM (03, 14, 15). | Several separate jobs share one scrolling panel. | Assembly mode gets timeline, explode and layers. Preview settings sit together. Quantities get an expandable table or dedicated tab. |
| Medium | Viewport has a multi-button camera dock, repeated explode control, multi-line statistics and tiny persistent instructions. | Chrome competes with the sign. | Compact camera preset menu plus Fit and zoom; contextual isolate actions; a slim status strip; gesture help on demand. |
| Medium | Day preview looks washed out; night preview has broad bloom and low-contrast unlit tagline (01, 07, 08). | Material and detail inspection is harder. | Separate a neutral inspection environment from a client preview. Offer a controlled, subtler glow preset and optional wall context. Compare against reference photography before claiming fidelity. |
| Medium | Presentation retains tour, shortcuts, disabled undo/redo, mode switches and technical camera controls (08). | Client review still feels like the editor. | A clean client preview with day/night comparison, project title, construction summary and export/exit controls. Reveal camera controls on interaction. |
| Medium | Tour text says Play Assembly and Presentation sheet while live UI says Replay assembly and Sheet. | Instructions require users to translate labels. | Match actual control names; anchor short tips beside the target and keep essential instructions out of the sign area. |
| Medium | Responsive CSS fixes preview to 48dvh above a second scrolling panel; header actions scroll horizontally below 900px. | Smaller-height screens may leave little editing room; actions can be undiscoverable. | Tablet uses one active inspector drawer with a resizable preview. Phone prioritizes review, quick adjustments and a clear overflow menu. Validate on real narrow and short viewports. |
| Medium | Artwork review pending is a small label while exports are available; Make describes approved outlines even when review is pending (04). | Users can confuse geometric checks with production readiness. | Show separate, truthful states: artwork reviewed, geometry checks, estimated electrical data and machine calibration. Include current status in export summaries; never imply manufacturing approval from “no cutting issues.” |

## Screen recommendations
- Artwork: source-aware import card, clear Replace artwork action, outline review checklist, continue to board.
- Board: presets plus width/height and finish first; structural recipe in an advanced section. Avoid a second independent settings surface in the inspector.
- Groups/shapes: obvious scope heading; linked proportions toggle; inherited-vs-overridden values; reset-to-group action beside overrides.
- Construction picker: preserve the existing visual cards, but show them in a wider chooser with illumination and material comparisons.
- Assembly: visible named steps and progress; previous/next disabled at bounds; one explosion control; parts for the active step.
- Fabrication: wide selected-part preview, searchable part list, bend schedule table and export status summary.
- 2D: source-aware “Artwork outlines” title, zoom/fit controls and mode-specific navigation hints instead of 3D orbit instructions.
- Forming: selected part name, perimeter/strip dimensions, accessible playback control and an explicit path back to assembly.
- Help: separate searchable shortcuts and glossary; contextual definitions for ACP, GI, returns and standoff at point of use.
- Presentation: large sign, restrained UI, day/night comparison and a readable construction legend.

## Three directions
A. Focused professional studio (recommended): stable layers/canvas/properties layout, Design/Assembly/Fabrication modes. Best for frequent editing, moderate layout rework.
B. Guided sign builder: step-based import → board → construction → review. Best for new staff, slower for repeated cross-step adjustment.
C. Presentation-led canvas: large preview with floating contextual tools. Best for visual/client sessions, less efficient for dense fabrication work.

## Proposed visual language
Navy for structure and primary actions; warm brass for active focus and accents; cool neutral stage; white property surfaces. Use consistent 6–8px control radii, 8px spacing rhythm, restrained borders, and clear selected/hover/focus states. Keep status colours semantic and pair them with text. Decouple environment lighting from application theme.

## Review order if a redesign is approved
1. Selection consistency, source-aware Artwork screen, control hierarchy and readable typography.
2. Stable workspace, simplified inspector and consolidated export/units/save feedback.
3. Dedicated fabrication layout and cleaner customer presentation.
4. Responsive and keyboard validation across board/group/shape/multi-select states.

## Screenshot index
- [Artwork](01-artwork.png)
- [Board](02-board.png)
- [Build](03-build.png)
- [Make](04-make.png)
- [2D outlines](05-2d-trace.png)
- [Forming study](06-forming-study.png)
- [Night preview](07-night.png)
- [Presentation](08-presentation.png)
- [Help and glossary](09-shortcuts.png)
- [Tour](10-tour.png)
- [Group dimensions and selection mismatch](11-group-properties.png)
- [Construction picker](12-construction-options.png)
- [Materials and lighting](13-materials-lighting.png)
- [Assembly layers](14-assembly-layers.png)
- [Parts summary](15-parts-summary.png)
- [Board inspector](16-board-inspector.png)

## Approval status
The user selected Focused professional studio, approved its screen designs and written specification, and requested new image_gen construction references. Four generated references are saved in `public/images/construction-references/`; their prompts and provenance are documented there. The implementation plan is saved in `docs/superpowers/plans/2026-10-18-focused-professional-studio.md`. The application UI has not yet been redesigned.

- [Generated construction-reference gallery](22-generated-letter-references.png)


## Implemented local studio — 2026-10-18

The approved Focused professional studio direction is implemented in the local React/Vite application. No ChatGPT Sites deployment is involved. The existing geometry, project v4 compatibility and exporters remain in use.

- Design: searchable collapsed layers, persistent preview, scoped essential-first properties, linked dimension editing, validated numeric drafts, source-aware artwork review and illustrated construction chooser.
- Assembly: real dependency-ordered steps, cumulative visibility, playback and per-step quantities.
- Fabrication: searchable cut/strip parts, compensated outlines, selectable bend features, selected-contour forming study, DXF and CSV exports.
- Presentation: clean editor-free view and day/night comparison using the same camera.
- Responsive: desktop columns, tablet preview/drawer and phone dock. Collapsed panels can be reopened across modes and phone dock actions restore their panels.

### Verification evidence

88 automated tests pass; TypeScript and production build pass. Existing Vite large-chunk warning remains. Browser checks covered untouched unit conversion (no history edit), rejected numeric drafts, Escape/commit/undo, SVG-specific controls, generated raster text and undo, review-dialog close into 2D, assembly step selection, selected counter strip and bend row, forming/back navigation, DXF and CSV downloads, day/night comparison, and phone property navigation. No console errors were captured. Layout widths were checked at 1440, 1280, 1024, 768 and 390 pixels, with no horizontal document overflow at the measured narrow widths. Spec and code quality reviews identified and verified fixes for mode transitions, exports, panel recovery and numeric data safety.

The browser raster check used generated text; external raster file upload, browser zoom, exhaustive keyboard navigation and save-failure simulation were not repeated in this pass. Existing import/storage tests cover their underlying parsing and compatibility. Lighting remains a concept preview; fabrication remains geometric, without machine calibration or nesting.

### Implemented screenshots

- [Desktop Design](implemented/design.jpg)
- [Assembly](implemented/assembly.jpg)
- [Fabrication and selected bend](implemented/fabrication.jpg)
- [Presentation comparison](implemented/presentation.jpg)
- [Phone properties](implemented/phone-properties.jpg)
- [Tablet](implemented/tablet.jpg)
- [SVG import](implemented/vector-import.jpg)
- [Raster text import](implemented/raster-import.jpg)
- [Construction references](implemented/construction-chooser.jpg)

Local integration: fast-forwarded the original main checkout, re-ran all 88 tests and typecheck, then verified localhost:5173 renders the new studio and restores its existing browser autosave. [Original local URL screenshot](implemented/local-5173.jpg).
