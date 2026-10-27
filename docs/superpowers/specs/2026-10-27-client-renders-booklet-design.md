# Client renders and presentation booklet

Date: 27 October 2026
Status: design sections and written specification approved by the user on 27 October 2026.

## Objective and agreed choices

Make Kirat Studio renders convincing enough for client proposals and replace the fixed day/night sheet with a configurable presentation booklet. The user selected installed scenes plus clean studio views, built-in environments first, fast editing previews plus separate final rendering, and a multipage booklet with individual image exports. Both orthographic technical top and elevated perspective views are required.

Approved workflow: Prepare renders → Build booklet → Export. No implementation is authorized by this document alone; the next step after written-spec approval is an implementation plan.

## Current evidence

The app uses React, Three.js and postprocessing. `src/scene/scene.ts` owns geometry display, PBR materials, exposure, bloom, tone mapping and synchronous PNG still capture. `src/scene/scenery.ts` builds simple studio, shopfront and interior surroundings. `src/domain/lighting.ts` separates environment, power, LED colour and exposure, with visually tuned values.

`src/app/PresentationPanel.tsx` offers single-view presentation, day/night comparison and construction summary. `src/app/actions.ts` exports a fixed 2400-pixel PNG with two views from the current camera and hard-coded project branding. There is no PDF exporter or configurable booklet. Project format v4 stores design and fabrication, but no presentation configuration.

Layout sketches: `.superpowers/brainstorm/31047-1793099250/content/package-approaches.html`. These illustrate information arrangement only; they do not establish render realism. The user selected approach B, the booklet, rather than a combined summary-board builder.

## Scope

One connected feature delivered in increments: rendering quality and repeatable views supply images to a configurable booklet and shared PDF/image export pipeline. Include built-in installation environments, studio views, saved presentation settings, render job management and export verification.

Exclude uploaded site-photo placement, AI reinterpretation of signage, cloud rendering, public share links, quoting/pricing, fabrication documents, automatic physical lighting calibration, arbitrary page design and summary-board layout editing. Sending files to clients remains a user action.

## User workflow

### Prepare renders

Enter a dedicated presentation preparation surface from Present or the presentation export entry. Keep the editor's design, selection and camera intact on exit. Start from the complete assembled design; editor isolation, hidden layers, exploded assembly and selection outlines must not accidentally appear in client renders. Presentation scene and camera changes are independent of editor view preferences.

Choose Installed or Studio. Installed offers shopfront, facade and wall environments; retain the existing interior scene as an available compatible environment. Offer a curated set of wall/facade finishes, ground finishes and surroundings controls appropriate to each environment, rather than a general building editor. Environments adapt to sign size while keeping architectural cues plausible; warn when an extreme aspect ratio produces poor framing.

Choose camera presets: front, left side, right side, technical top, elevated perspective and three-quarter 3D. Front, side and technical top use orthographic projection; elevated and three-quarter views use perspective. Installed framing includes surroundings; studio framing fits the sign. Allow an adjusted perspective camera to be saved as a custom shot. Technical views show the real assembled geometry, without inventing visible depth for flat products. Rear and exploded views are outside the initial scope.

Select day, dusk or night and sign power independently. Default installed booklet pages use matched day/night cameras. A linked pair retains identical scene, sign geometry, finishes and camera; only environment lighting/exposure changes unless the user explicitly edits the pair's power settings. Changing a shared camera updates both shots and invalidates both renders.

Editing uses the interactive preview. Final render captures a fixed design/configuration snapshot and runs progressively, with visible progress, cancel and per-shot retry. Render a queue sequentially to bound memory and GPU load. Do not promise a completion time before measurements. A completed preview must not silently be presented as final quality.

### Build booklet

Use one restrained, landscape A4 template with consistent margins, typography, captions and page numbers. One large render per render page keeps the sign readable. Start with installed day and installed night, followed by selected studio front, side, technical top, elevated and three-quarter views. Optional dusk and materials/summary pages can be added. Cover is optional; the first included page carries the project title when no cover is used.

The user can include/exclude and reorder pages, choose the render for a page, and edit client/project title, revision, branding and notes. Never assume every project is named Kirat Creations. Each render page exposes dimension, material summary and caption visibility. Branding, project information and notes have explicit include controls. Default branding is Kirat Studio text; a local logo image can replace it. No prices, internal BOM, electrical estimates or fabrication details are inserted automatically.

Dimensions use the existing physical layout and display-unit formatting. Technical front shows width/height, side/top show meaningful depth and wall spacing; omit inapplicable measurements. Dimensions remain vector page overlays, not changes to geometry. Material summaries resolve actual effective constructions and overrides; omit excluded shapes and do not imply every element matches its group's default.

Show a live paginated preview using the same layout model as export. Rendered images are labelled with their state: preview, rendering, final, outdated or failed. Preserve booklet edits and completed images through retries and cancellation. Empty booklets explain that at least one page must be included.

### Export

Export the selected booklet as PDF, individual rendered images, or individual composed page images. Offer PNG and JPG for image outputs. Render images contain the shot; page images include the booklet's chosen captions, branding and overlays. Batch images download as a ZIP with stable numbered filenames. A PDF contains precisely the included pages in the preview order.

Default final render width is 3840 pixels; offer 2400 and 3840 with the frame aspect determining height. Composed A4 landscape page images use 3508 × 2480 pixels (300 dpi equivalent). Preserve vector text and dimensions in the PDF and embed sufficiently sized render images without distortion. PNG/JPG page outputs share the PDF's physical layout and crop. JPEG uses a white page background; PNG transparency is outside the initial scope. Avoid loading every full-size page into memory at once.

Before export, show missing, failed or outdated image issues with rerender actions. Final export requires all included render pages to have current final images. Explicit draft export is available and clearly marked Draft in output; never silently substitute previews. A PDF generation failure retains renders and page edits and offers retry. Show success only after file generation and download handoff, without claiming client delivery.

## Rendering quality contract

Preserve artwork outlines, holes, colours, construction dimensions, mounting and wall spacing from the authoritative domain layout. Do not use generative enhancement that changes the sign. Improve material roughness/normal detail, reflection environments, edge response, contact shadows and antialiasing without changing physical construction merely to improve appearance.

Installed scenes must have credible scale, wall/ground texture and controlled material reflections. Day illumination should retain face colour and material readability. Night should retain readable surroundings, avoid clipped face colours and use restrained glow. Halo light must visibly relate to the receiving wall and standoff distance. Keep environment illumination and sign power independent.

The implementation plan must begin with a bounded renderer feasibility evaluation using the existing design geometry. Compare an enhanced raster final path with a progressive physically based path on front-lit, halo, front-plus-halo, full-acrylic and flat/metal examples. Evaluate emissive wall spill, clear acrylic/material compatibility, orthographic support, denoising/convergence, GPU memory and cancellation. Record matched baseline and candidate images and timings on an identified device. Select one final backend using evidence before building the full render queue; avoid maintaining two final backends without need. A physically based path is a candidate, not an unverified dependency commitment.

The final path must produce visibly improved edge quality, contact/occlusion and material response over the current still export at matched size. Where emission or transparency is unsupported, explicitly report the limitation instead of quietly changing the construction. If no candidate meets these requirements, report the gap and revise this rendering decision before proceeding with a misleading final-quality mode. Keep a concise concept-visualisation disclosure; the output does not certify measured luminance or fabrication approval.

## Architecture and data flow

Maintain the domain layout as the sole source of physical geometry. Extract focused scene/material/camera adapters from the existing scene owner only as required by this feature; avoid unrelated refactoring.

1. Presentation configuration: validated scene settings, camera/lighting shot definitions, booklet pages and metadata. It owns user intent, not GPU resources.
2. Render adapter: consumes immutable layout/scene/shot inputs, builds resources for the chosen backend and exposes start/progress/cancel/result/dispose. It does not mutate editor state.
3. Render queue and asset cache: schedules shots, retains completed assets, reports status and rejects results from cancelled or superseded jobs.
4. Page layout model: computes page geometry, text wrapping, render crop and overlays once, consumed by browser preview, PDF and raster-page export.
5. Export coordinator: validates included pages and streams/batches generation and download packaging with progress and failure recovery.

Flow: design + saved presentation settings → immutable render snapshot → layout/camera/material adapter → render queue → versioned image assets → shared page layout → preview/PDF/images.

Fingerprint each shot from render-relevant design, effective materials, scene, camera, lighting, resolution, quality and renderer version. Include a page overlay/layout fingerprint separately: changing a client name or page order must not rerender the sign. Any change affecting appearance invalidates corresponding shots, including undo and project replacement. A render finishing after a design change remains associated with its original snapshot and cannot become current accidentally.

## Persistence and compatibility

Add a presentation section separate from design and fabrication in the next project schema version. Keep design history semantics unchanged: presentation controls do not add design undo entries. Autosave and downloaded project copies include configuration, page order, metadata and bounded branding image data. Validate enums, dimensions, text lengths and asset sizes; invalid presentation data produces a recoverable warning and defaults without discarding valid design geometry.

Migrate v1–v4 projects with default presentation settings and preserve geometry, overrides and fabrication settings. Persist completed render blobs in a browser asset cache with quota handling, keyed by fingerprints. Full render images are not embedded in the project JSON. A project opened on another browser/device restores the booklet configuration and asks to regenerate unavailable renders. Clearly distinguish saved configuration from cached images; cache failure must not prevent exporting current in-memory results. Dispose stale GPU resources and revoke unused object URLs.

## Errors, usability and limits

Handle missing artwork, unavailable renderer, lost WebGL context, unsupported final materials, memory limits, failed textures, cache quota and export failure with specific messages and retry actions. Keep the last valid preview and user settings. Never show a finished status for a partial file or failed shot. Cancelling affects the current queue, not the design or previously completed assets.

Keyboard users can operate page selection, reorder controls, preview, dialogs and render cancellation. On narrow screens, switch between setup, page list and page preview rather than shrinking the desktop arrangement. Show page and shot names alongside thumbnails, accessible progress and clear disabled reasons.

## Acceptance and verification

- Existing project files open with unchanged physical design, construction overrides and fabrication configuration. New presentation configuration round-trips through save/open and autosave.
- Front, side and technical top projections are orthographic and consistently framed for wide, tall, small and flat signs. Perspective views retain correct depth. Optional dimensions match domain geometry.
- Paired day/night shots share the camera and scene. Power and environment remain independent. Client rendering does not inherit editor isolate, explode or hidden-layer state and does not alter the editor on exit.
- Matched visual comparisons across representative constructions demonstrate the final quality contract, including colour readability, metal/acrylic response, halo wall spill, shadow contact and clean edges. Record device, resolution and duration without presenting timings as universal guarantees.
- Render snapshot invalidation handles design edits, undo, lighting changes and project replacement. Metadata/page-order edits reuse valid images. Cancel/retry and context-loss handling preserve completed assets and booklet edits.
- PDF page count/order and PNG/JPG page crop, text, overlays and branding agree with the preview. Inspect long titles, notes, many materials, Unicode, logo aspect ratios and absent optional information; text must wrap or paginate without clipping.
- Inspect actual exported PDF pages at readable zoom and image outputs at native size, including a day/night pair and technical view. Verify PDF physical page size, image resolution and multi-image ZIP names/content.
- Verify empty, unavailable-image, outdated-image, draft and failed-export states. Final export never silently substitutes stale or preview assets.
- Run applicable regression tests, TypeScript checks and production build. Add meaningful tests for fingerprints, camera framing, schema migration, page layout/pagination and queue state transitions; complement them with real visual checks.

## Delivery order for implementation planning

First validate final-render feasibility and quality against baseline captures. Then define presentation schema and scene/camera adapters, implement render preparation and jobs, build booklet editing on the shared page layout, add PDF/image export, and finish persistence, compatibility, error recovery and visual verification. Each increment serves the same client booklet workflow. Detailed tasks and dependency choices belong in the implementation plan after written-spec approval.
