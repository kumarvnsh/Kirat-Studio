# Client booklet verification — 27 October 2026

Implemented in `codex/client-renders-booklet`, including the approved named-options amendment.

## Automated checks

- 167 Node tests pass, including immutable option resolution, mixed letter/group construction, explicit bare-metal returns, option-scoped pairing and cache identity, repeated duplication and v6 round-trip validation, v5 migration, comparison selection, cameras, scene disposal, cancellation, context loss, cache corruption/quota fallback, layout pagination and export preflight.
- `npm run typecheck`, `npm run build` and `git diff --check` pass. Production build retains the large-chunk advisory; rendering/PDF/image code is lazy-loaded.
- `npm audit --omit=dev`: zero vulnerabilities reported.

## Render and export acceptance

- Fenesta desktop artwork used as requested: traced 49 shapes and 26 holes. Original desktop files remain untouched.
- Seven 2400 px final views rendered sequentially; separate 3840 px front output verified. Earlier seven-view production run took about 5.2 minutes on the test M4. This is one device, not a performance guarantee.
- Labelled exploded construction uses populated visible model layers; LED and power locations are explicitly schematic. Technical top remains an optional camera.
- Two-option acceptance sample uses the original front-lit design and a halo/flat-acrylic warm-metal colour study. It is a demonstration alternative, not a claim that Fenesta approved those colours.
- The expanded sample has 13 A4 pages. Its PNG ZIP contains 13 pages at 3508 × 2480; raw JPG ZIP contains nine distinct renders at 2400 × 1200. PDF metadata confirms Kirat Creations and A4 landscape. Comparison page was visually inspected for logo, both alternatives and Hindi client text.
- Shared A4 landscape layout drives vector PDF and 3508 × 2480 PNG/JPG pages. Raw render ZIP output preserves selected render resolution. Earlier eight-page PNG/JPG and seven-image raw PNG ZIPs were checked for counts, dimensions and white JPG margins.
- Production UI checked for option duplication and preservation of base artwork; desktop and 390 px mobile layout checked for horizontal overflow. Original renderer checks included cancellation, context loss/retry, stale-final blocking and cached-image recovery after reload.
- Supplied Kirat Creations SVG preserved under `public/brand/`; transparent raster derivative is used on proposal pages. The app remains Kirat Studio.

## Limits

Lighting/materials are presentation visualisations, not calibrated against measured physical signage. Built-in surroundings are modelled scenes. Exploded views explain construction and do not replace fabrication drawings. Hardware and LED/PSU placement remain preliminary. PDF lettering is shaped vector outlines for Latin/Devanagari consistency and is not searchable. GPU/texture limits, browser cache availability and unsupported font characters report actionable errors; another device needs rerendering because project JSON does not embed final images.

Earlier spot checks suggested context reuse, but deployment testing reproduced the black fascia even with fresh contexts. Further BRDF probes isolated NaNs in clear-coat evaluation. See the deployment regression investigation in renderer-decision.md; context isolation remains for resource ownership, not as a claimed fix for this numerical failure.

See `render-quality/2026-10-27/renderer-decision.md` for the renderer feasibility decision. Candidate comparisons are qualitative; framing differs from the original baseline. Client-specific sample exports are kept in ignored `output/client-booklets/fenesta/`, outside committed source.

The corrected sequence (front preview → halo night final through the same FinalRenderer instance) was rerun after context isolation and visually confirmed. Phone layout was rechecked at 390 px with the option controls present and no horizontal overflow. Exhaustive keyboard-only/short-laptop coverage and every texture/export failure injection were not separately exercised.

## Deployment corrections and selection controls

- Perspective near planes now scale with fitted subject distance. Thin fascia/frame separation is covered at 3.6, 12 and 24 m widths.
- Final rendering uses stable base PBR finishes with the extra clear-coat lobe disabled; preview materials remain unchanged. Render fingerprint v4 invalidates previous cache entries.
- Prepare renders has separate batch checkboxes, option-level Select all, Clear and Render selected (N). Selection spans options, runs sequentially, and includes job/option progress.
- Export exposes source-page inclusion plus project notes, with all/none controls. Build booklet and Export share saved inclusion. Continuation pages follow their source.
- UI checks verified noncontiguous and cross-option batch membership, page clear disabling export, and two selected source pages reflected in Build booklet.

Latest acceptance: 171 tests, typecheck and production build pass. In the production UI, Front and 3D perspective were selected and rendered sequentially at 2400 × 1200 in about 111 seconds. Both final images were inspected: white fascia and no internal frame bleed. Exporting those two selected pages with notes excluded produced an A4 landscape PDF with exactly two pages and Kirat Creations branding. Client-specific proof images/PDF are in ignored `output/render-regressions/2026-10-27/`.
