# Kirat Studio

Signage design and assembly app: upload artwork, assign constructions, configure materials, assemble the sign, preview day/night, and produce customer presentations and fabrication information.

First target: one accurate **Kirat Creations** board. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # geometry regression checks
npm run build      # production build -> dist/
```

Requires Node 20+.

## Layout

| Path | Contents |
|---|---|
| `src/domain/project.ts` | Data model: `DesignState` / `ViewState` / `FabricationState`, board settings table, assembly `LAYERS` |
| `src/domain/recipes.ts` | Construction recipes: parameters (mm, ranges, defaults) and materials per construction type |
| `src/domain/layout.ts` | Design → dimensioned parts: board stack, frame members, per-letter stacks, LED and standoff positions; `sceneInput()` |
| `src/domain/bom.ts` | Preliminary bill of materials from the layout |
| `src/domain/lighting.ts` | Lighting model: environments (day/dusk/night), emission, exposure, LED colour temperature |
| `src/app/` | React UI (`App`, `ToolsPanel`, `Viewport`, `Inspector`), store (`store.ts`), cross-panel actions (`actions.ts`), styles |
| `src/artwork/` | SVG vector import (`svg.ts`), raster tracing (`contours.js`, `import.ts`), dot attachment and grouping (`grouping.js`) |
| `src/domain/assembly.ts` | Dependency-ordered assembly steps and the layers each reveals |
| `src/fabrication/` | Return-strip bend schedules (`bending.ts`), tool compensation and cut checks (`cutting.ts`), fabrication plan + CSV (`plan.ts`), DXF via maker.js (`dxf.ts`) |
| `src/editor/history.ts` | Immutable undo/redo over designs |
| `src/editor/artworkOps.ts` | Structure edits: rename, create / move / merge / delete / reorder groups, constructions and colours |
| `src/storage/project.ts` | Project file format v6, v1–v5 migration, validation, browser autosave |
| `src/presentation/` | Repeatable cameras, progressive final rendering, render queue, shared booklet layout, PDF and image exports |
| `src/app/presentation/` | Prepare renders → Build booklet → Export client workspace |
| `src/scene/scene.ts` | Three.js display of the layout (mm → m); HDR pipeline via pmndrs/postprocessing: exposure → bloom → AgX tone mapping; PBR finishes; stills |
| `public/` | Static assets served at `/`: `kirat-logo.svg`, the Kirat Creations sample (Canva export) |
| `tests/` | `node --test` checks (`.js` and `.ts`; Node 22 strips types natively) |
| `reference/prototype/` | Byte-exact copy of the original ChatGPT-hosted prototype (v02). Do not edit. |

Further folders from the roadmap (`catalog/`, `digital/`) get created when their first module lands.

## State rules

- **Design** (`design.present`): settings and artwork. Every edit goes through `editDesign()` and is one undo step. Saved and autosaved.
- **View**: mode, selection, isolation, stage, explode, day/night, lights, presentation. Changed with `setView()`. Never saved into the design, never undone.
- **Fabrication**: cutting and bending settings (`FabricationState`). Saved and autosaved with the project, not part of the design's undo history.
- The renderer only reads `sceneInput(design, view)`; it never writes back.
- All physical dimensions are computed once in `domain/layout.ts`. The scene, inspector and BOM read the same layout.
- Recipe params live on artwork groups (`group.params`) and reset when the group's construction changes.

## Status

Milestones A and B done. Milestone C done:

- Dimensioned board stack (GI, MS frame, optional backing sheet, ACP) with z positions and frame members.
- Recipes, editable per artwork group in the inspector: front-lit (optional trim cap), halo-lit, front + halo, full acrylic, flat acrylic / metal / ACP, vinyl. Changing a group's construction resets its params.
- Letter mounting: fixing studs through the fascia for every non-vinyl letter, plus spacers when a recipe has a standoff.
- Placeholder power plan: load from the LED grid, PSUs sized at ≤ 80% loading and parked in the bottom-right frame bay, one cable run and penetration per lit element, fit warnings (PSU deeper than the frame, bay full, LED cap).
- Per-element stack readout, board stack table, power summary and preliminary BOM; 10 assembly layers.

Artwork import: **SVG is imported as vectors** (three's `SVGLoader`): exact curves flattened to 0.1 unit tolerance on a 1400-unit canvas, holes, transforms and `<use>` references preserved; top-level `<g>` groups (Inkscape label, `data-name` or id) become artwork groups; stroke-only paths are ignored. PNG/JPG/WebP are still traced from pixels.

Milestone D (customer-ready visuals) done for presentation level:

- Independent lighting controls: time of day (Day / Dusk / Night), sign power, dimming, LED colour temperature (a design setting, undoable), camera exposure (EV).
- Emission never depends on time of day. Daylight is modelled as much brighter than an LED face and the camera exposes for it, so lit faces read as lit-but-subtle by day and glow at night.
- HDR rendering with pmndrs/postprocessing: exposure, then bloom with a luminance threshold above 1 (only emissive parts bloom: faces, halo light, LED lenses), then AgX tone mapping so saturated faces keep their colour.
- PBR finishes: clear-coated ACP, zinc GI, primed MS frame, aluminium returns, stainless halo faces, glossy cast acrylic, matte vinyl.
- Client booklet: choose installed/studio views, day/night/dusk, front/side, labelled exploded construction and elevated/3D cameras (technical top remains available); include, reorder or remove pages, branding, project details, dimensions, materials and notes.
- Named alternatives within one proposal: independent group/letter construction, face/return and fascia colours, option explanations, and selectable visual comparison pages. The editor design stays unchanged.
- Proposal pages use the supplied Kirat Creations logo by default; branding and other page content can be omitted. Exploded views label actual model layers; LED/power placement remains schematic.
- Fast raster previews and a separate progressive path-traced final render (512 samples; 2400 or 3840 px). Final capture preserves physical layout, adds actual rear-light spill and uses independent environment illumination and sign power. Render progress, cancellation, retry and outdated-image status are explicit.
- Export an A4 landscape vector PDF, composed PNG/JPG pages (3508 × 2480), or individual render images. Image batches download as ZIPs. Final exports require current final images; draft export is explicit and marked.
- Presentation configuration is saved separately in project v6. Full images are cached in this browser, outside JSON; opening a project on another device requires rerendering. Cache errors retain in-memory results for export. PDF lettering is vector outlines to preserve Latin/Devanagari shaping consistently; it is not searchable text.
- Not done: a *calibrated* preview compared against photographs of a real sample (needs measurements), site-photo placement or cloud render services. Built-in surroundings remain curated 3D scenes, not photographs.

Milestone E (fabrication preview) done at geometric level:

- Return strips: one schedule per outer contour and counter. Seam at the middle of the longest straight run; bends at their distance from the seam, angle and direction (convex / concave); small turns accumulate so curves keep their full angle; runs of small bends are grouped into curves with an estimated radius. Flat-strip diagram in the Fabrication workspace, CSV export.
- Cutting: router (tool radius) or laser (half kerf) compensation with Clipper; checks for counters too small for the tool, counter slots the tool can't reach, and strokes thinner than a minimum. Compensated paths shown over the artwork in the 2D view. Approved outlines are never changed.
- DXF (maker.js, mm): *-OUTLINE and *-CUT layers for backs, faces, flat letters and vinyl; flat strips with BEND-CONVEX / BEND-CONCAVE lines and labels. Parts at sign positions, not nested.
- Assembly: 10–11 dependency-ordered steps (frame → GI → backing → ACP; backs → returns → LEDs → faces; mount; power; test) with a parts list per step; play / previous / next / replay.
- Not yet: bend allowance and machine calibration profiles, notching, acrylic heat-bending, nesting and offcut tracking, wiring diagram.

Editor: **Design** has a collapsed, searchable **Layers** tree on the left, a persistent preview in the centre, and selection-scoped **Properties** on the right. **Assembly** provides actual ordered steps, playback and layer visibility. **Fabrication** provides searchable parts, cutting outlines, bend schedules and forming studies.

- Tree: click, Ctrl/Cmd-click, Shift-click (range); double-click to rename; eye to hide/show a letter or group (view only); drag letters onto a group to move them; drag groups to reorder; group menu for isolate, move up/down, merge, delete empty; "+ Group" makes a group from the selection.
- Properties: a group (name, construction, recipe dimensions, face colour, painted return colour, clear letter overrides), one letter (name, group, construction override, face colour override, dimensioned stack) or several letters (move, construction, colour, hide, isolate).
- Colours: picker plus the logo's own colours and common sign colours; reset returns to artwork colours / bare metal. Group and letter colours are part of the design (undoable, saved).
- 3D and 2D views: Ctrl/Cmd/Shift-click adds to the selection; isolate works on the whole selection.

Known limits, deliberately left for later milestones: module/PSU ratings are placeholders until the verified atlas (F); no ACP seam or fixing pattern, cable holes in frame members, or wiring diagram (E); the face-retention method beyond trim cap (e.g. screws, inset) is not modelled.

The header contains Project, Help, Present and Export. On phones, Project also contains undo/redo and preview settings; the bottom dock switches Layers/Steps/Parts, Properties and Preview. Numeric fields commit on Enter or blur, Escape cancels, and invalid drafts leave the design unchanged. The construction chooser includes four generated 3D references alongside live anatomy diagrams.

Units: settings and saved projects use millimetres; `scene.js` converts to metres at the rendering boundary.

## Reference prototype

`reference/prototype/` imports `./vendor/...` files that were not copied (they are stock three r180 and Clipper 6.4.2). It is kept for side-by-side comparison, not to run directly.
