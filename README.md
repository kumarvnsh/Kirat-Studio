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
| `src/app/` | React UI (`App`, `ToolsPanel`, `Viewport`, `Inspector`), store (`store.ts`), cross-panel actions (`actions.ts`), styles |
| `src/artwork/` | Contour tracing (`contours.js`), dot attachment and grouping (`grouping.js`), raster import pipeline (`import.ts`) |
| `src/editor/history.ts` | Immutable undo/redo over designs |
| `src/storage/project.ts` | Project file format v4, v1–v3 migration, validation, browser autosave |
| `src/scene/scene.ts` | Three.js display of the layout; converts mm → m, owns lighting and interaction only |
| `public/` | Static assets served at `/` (Kirat sample logo, not yet added) |
| `tests/` | `node --test` checks (`.js` and `.ts`; Node 22 strips types natively) |
| `reference/prototype/` | Byte-exact copy of the original ChatGPT-hosted prototype (v02). Do not edit. |

Further folders from the roadmap (`assembly/`, `fabrication/`, `catalog/`, `digital/`) get created when their first module lands.

## State rules

- **Design** (`design.present`): settings and artwork. Every edit goes through `editDesign()` and is one undo step. Saved and autosaved.
- **View**: mode, selection, isolation, stage, explode, day/night, lights, presentation. Changed with `setView()`. Never saved into the design, never undone.
- **Fabrication**: reserved slot in the file format (Milestone E).
- The renderer only reads `sceneInput(design, view)`; it never writes back.
- All physical dimensions are computed once in `domain/layout.ts`. The scene, inspector and BOM read the same layout.
- Recipe params live on artwork groups (`group.params`) and reset when the group's construction changes.

## Status

Milestones A and B done (Kirat group naming waits for `public/kirat-reference.png`). Milestone C in progress:

- Done: dimensioned board stack (GI, MS frame, optional backing sheet, ACP) with z positions; recipes for front-lit, halo-lit, flat acrylic / metal / ACP and vinyl, editable per group in the inspector; standoffs for halo and any recipe with a standoff; per-element stack readout (each part's distance from the fascia); preliminary BOM in the Build tab; 9 assembly layers.
- Not yet: trim cap / face retention, front-and-halo and full-acrylic recipes, letter fixing hardware detail, PSU and wiring positions, a fixing pattern for the ACP.

Units: settings and saved projects use millimetres; `scene.js` converts to metres at the rendering boundary.

## Reference prototype

`reference/prototype/` imports `./vendor/...` files that were not copied (they are stock three r180 and Clipper 6.4.2). It is kept for side-by-side comparison, not to run directly.
