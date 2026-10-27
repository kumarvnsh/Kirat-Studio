# Kirat Studio roadmap

Kirat Studio should become a complete signage design and assembly application: upload artwork, assign construction types, configure real materials, assemble the sign, preview day/night, and generate customer presentations and fabrication information.

The first milestone is **one polished, accurate Kirat Creations board**. That becomes the reference for expanding into other signage types.

## Architecture rule

**Project data defines the sign; the 3D scene displays it.** Changing a material, rebuilding geometry, or restoring a camera must not change the customer's design.

Keep separate:

- **Design state:** dimensions, artwork, constructions, materials, placement.
- **View state:** camera, isolation, selection, exploded view, day/night.
- **Fabrication state:** seams, bends, tool settings, allowances.
- **Catalog data:** actual product specifications and references.

Store dimensions in millimetres and convert at the rendering boundary. Version the saved project format so older designs stay usable.

Foundation: TypeScript, Vite, React (interface), Three.js (viewport). Migrate the prototype's Three.js geometry gradually.

## Milestones

| Milestone | Completion condition |
|---|---|
| **A — Transfer** | Organized source, assets, dependencies, setup guide, reproducible build |
| **B — Stable Kirat sample** | Consistent tagline, reliable selection/isolation, save/load, undo |
| **C — Accurate construction** | Separate dimensioned layers and configurable letter recipes |
| **D — Customer-ready visuals** | Refined materials, believable day/night, presentation exports |
| **E — Fabrication preview** | Bending, cutting, assembly steps, preliminary BOM |
| **F — Verified atlas** | Product-backed materials and detailed component models |
| **G — More sign families** | Additional recipes reuse the same geometry and data system |
| **H — Digital signage** | Display simulator, followed by CMS and tested player |

Immediate scope: **A through D** using the Kirat Creations sample.

## Known prototype problems (fix before expanding)

| Problem | Required correction |
|---|---|
| Some tagline letters protrude | Assign construction to an approved artwork group; remove pixel-area-only guessing |
| Small dots become unrelated parts | Associate disconnected shapes with their letter or artwork group |
| Isolation becomes confusing | Persistent Exit Isolation control, Escape, Show All |
| Night illumination weak or inconsistent | Separate electrical power, material emission, environmental light, exposure |
| Materials look generic | Accurate scale, thickness, edges, roughness, reflections |
| Settings behave unpredictably | Centralized state and repeatable reset behaviour |

Add undo/redo, autosave and a recoverable backup early.

## Artwork import

**Upload → clean artwork → set real size → organize groups → assign construction → approve → generate parts.**

- SVG and transparent PNG first, then JPG; DXF and selected vector PDF later.
- SVG: use vector paths; preserve holes, transforms and groups.
- Raster: adjustable background removal, outline tracing with holes, smoothing with original-image overlay, manual cleanup/grouping, one known dimension for scale, approval before use as fabrication artwork.
- A PNG gives a useful reconstruction; it cannot guarantee the exact original curves or font.
- Kirat sample groups: **Symbol**, **Main wordmark**, **Tagline**. The tagline gets one construction consistently; individual overrides allowed.

## Kirat sample board (rear to front, a sample recipe, not mandatory)

| Component | Representation |
|---|---|
| Building surface and mounting hardware | Separate installation assembly |
| Rear GI cover | Sheet behind the main steel frame |
| MS frame | Hollow sections, cross-members, brackets |
| Front backing sheet (optional) | Optional construction component |
| ACP fascia | Panel with own thickness and fixing pattern |
| Letter mounting hardware | Spacers, studs, screws, cable penetrations |
| Letter backs | Separate cut parts |
| LED modules and wiring | Inside illuminated letter cavities |
| Channelium returns | Thin walls following outer and inner contours |
| Acrylic faces | Separate shaped faces |
| Vinyl / printed films | Applied surface layers |

Power supply and enclosure need positions and service access. Each component needs identity, dimensions, material, mounting relationship, assembly step and BOM entry.

Initial Kirat recipe (proposed): front-lit main lettering, separately configurable symbol, flat tagline. **Open decision:** how the multicolour symbol is physically produced (printed translucent film, coloured material, separate illuminated sections, other).

## Construction recipes

Flat vinyl · flat acrylic letters · flat metal letters · front-lit channel letters · halo-lit letters · front-and-halo letters · full acrylic letters · ACP cut letters · ACP push-through · lightboxes · flex signs · neon-style LED. Later: wayfinding, pylons, projecting signs, totems, architectural, vehicle graphics, display units.

## Materials and parts atlas

Families: MS sections, GI, aluminium, stainless; ACP, acrylic, PVC foam, polycarbonate; films; laminates, tapes, adhesives, sealants; channelium profiles, trims, spacers, studs; LED modules/strips/edge-lit/neon profiles; PSUs, dimmers, controllers, timers; wires, connectors, glands, junction boxes; fasteners and brackets; digital display panels, cabinets, controllers, players.

Per product: manufacturer and code; dimensions and variants; technical properties; datasheet and source date; reference images and usage rights; Indian supplier/import availability; verification status. Start small and verified.

## Models

Parametric geometry for frames, sheets, letters, returns, spacers, repeated hardware. GLB assets for purchased components (correct dimensions/origin, mounting points, materials, LOD, source/revision, catalog link). Simplify repeated hardware during general editing.

## Fabrication simulation

- **Channelium bending:** contour choice, profile/depth/gauge/seam, strip path and bend locations, flat strip with markers, progressive bend animation, closure preview, manual adjustments, hand-bending stations. Needs measured calibration profiles before outputs are machine-ready.
- **Acrylic bending:** separate process (heating region, bend line, radius, jig).
- **ACP/acrylic cutting:** outer vs internal contours, toolpath preview, kerf/tool-radius compensation, narrow-stroke and inaccessible-corner checks, nesting later. Approved artwork stays separate from compensated paths.

## Assembly simulator

Dependency-driven steps (frame → GI → backing/ACP → letter parts → LEDs/wiring → mount → power → test). Timeline with previous/next/pause/replay, exploded and section views, transparency, isolation, measurements, per-step parts list. Presentation mode vs fabrication mode.

## Day and night

Independent controls: time of day, sign power, dimming, LED colour, environment, exposure. Front-lit, halo-lit and edge-lit must differ. Correct colour management (linear working space, `OutputPass`). Two levels: fast presentation preview and a calibrated preview compared against photos of a real sample. Bloom alone does not establish brightness or uniformity.

## Electrical planning and outputs

Module quantity/layout, supply voltage, circuits, connected load, PSU selection with derating, cable routes, compatibility checks. Outputs: BOM, frame/sheet dimensions, face/back outlines, return-strip and bend schedules, LED layout and wiring, assembly instructions, day/night images, quotation inputs, revision history. Label estimates until validated.

## Digital signage

Stage 1 simulator: LCD and modular LED, dimensions/bezel/cabinets, resolution and scaling, pixel pitch, playlists, brightness/viewing distance, mounting assemblies. Stage 2 cloud CMS + player (media, playlists, schedules, screen groups, users, revisions, playback records; player caching, health, recovery). Keep the CMS a separate module.

### Client booklet extension — 27 October 2026

Named construction/colour options, visual comparison pages, labelled exploded views and Kirat Creations proposal branding are implemented. Project format v6 retains older project migration. See `client-booklet-verification.md` for checks and limits.

### Illuminated ACP and colour tracing — 27 October 2026

Automatic/manual background removal with trace preview and contrasting-colour groups; acrylic-backed ACP cut-outs, flush inlays and raised push-through inserts. Actual routed panel geometry, rear parts/LEDs, anatomy, DXF and proposal support. Project format v7 retains v1–v6 migration. See illuminated-acp-verification.md.
