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

A visual regression found stale GPU state when reusing a WebGL context between halo jobs. Each render job now owns and releases its context; render cache version was incremented so old results cannot be treated as current.

See `render-quality/2026-10-27/renderer-decision.md` for the renderer feasibility decision. Candidate comparisons are qualitative; framing differs from the original baseline. Client-specific sample exports are kept in ignored `output/client-booklets/fenesta/`, outside committed source.

The corrected sequence (front preview → halo night final through the same FinalRenderer instance) was rerun after context isolation and visually confirmed. Phone layout was rechecked at 390 px with the option controls present and no horizontal overflow. Exhaustive keyboard-only/short-laptop coverage and every texture/export failure injection were not separately exercised.
