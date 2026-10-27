# Illuminated ACP constructions and coloured-background tracing

Status: approved in chat — tracing fix and all three illuminated ACP types.

## Evidence and terminology

User reference: `/Users/vnshkumar/Downloads/Screenshot 2026-10-27 at 8.08.26 PM.png` (the actual filename uses a narrow no-break space before PM). This is flat brand artwork, not evidence of an installed lighting method. Its top-left colour is RGB 23,55,47. Running the existing contour tracer on the supplied image with white removal produced four components, including a 447,132-pixel background block. Corner-colour removal produced 17 components with eight holes; the largest component was 28,169 pixels.

Primary manufacturer references:
- https://www.kremersigns.co.uk/what-we-do/office-signage/fascia-options/led-fret-cut/ — cut aluminium/Dibond fascia backed in acrylic, rear LEDs, optional raised push-through.
- https://www.imagefirstsigns.com/imagefirst-news/routed-letters-101 — backed, flush and projecting push-through acrylic distinguished by position relative to panel face.

## Import behaviour

Default new raster imports to Auto background: meaningful alpha when present, otherwise a robust dominant border-colour estimate, with confidence shown. Retain legacy white/black/corner/alpha choices and add a manual background colour picker. Show trace overlay/count before applying; flag a near-full-image component as likely background rather than accepting it silently. Existing saved trace settings retain their meaning. Manual crop/tolerance remain available; do not imply reliable extraction of perspective photographs, gradients or complex surroundings.

Offer a labelled option to use the detected background colour for the fascia on apply. Do not silently recolour an existing project while adjusting the preview. Keep image colours and independent logo/wordmark groups. Preserve holes: the green HOMES characters in this reference are negative space in the gold strip, not six extra foreground letters. Retain dot/detail attachment and vector SVG import.

## Construction choices

Add ACP cut-out + acrylic backlit (recessed/backed), flush illuminated acrylic inlay, and—if approved—raised push-through acrylic to the shared construction catalogue. These are panel-integrated constructions, not shallow channel letters. Use actual fascia openings, rear acrylic or shouldered inserts, rear cavity/LED representation and independent power/time/dimming controls. No individual channel returns or letter backs for these types. Preserve letter counters as panel islands and flag support/bridge limitations in fabrication notes.

Recipes expose relevant acrylic thickness and projection/recess parameters in mm; clearly label illustration defaults rather than claiming verified fabrication tolerances. Check insert fit versus ACP/frame depth. Mixed conventional letters and integrated openings must coexist in one panel. Rear LEDs remain schematic and may be partially occluded by actual frame geometry; do not change frame engineering silently.

Update effective layout/scene geometry, selection, recipe diagrams/help, material/parts summaries, cutting exports and assembly/exploded layers so the same construction is represented consistently. List these categories in editor group/letter selectors and proposal options. Update persistence validation/migration for any added types/settings while retaining old projects. Final and preview use the same panel openings; increment render fingerprint version for geometry changes.

## Acceptance

Use the supplied MatriMaa image to verify separate white wordmark/gold symbol/strip shapes and preserved counters. Check import modes, manual correction, transparent and white-background regressions. Test panel Boolean openings and islands, flush vs raised/recessed placement, mixed construction, LED/power semantics, bounding/camera fit, diagrams, project round-trip and old migration, manufacturing export semantics, proposal summaries and option cache invalidation. Inspect day/night, front/angled and labelled exploded views plus an exported proposal. Run full tests/typecheck/build before commit and deployment.
