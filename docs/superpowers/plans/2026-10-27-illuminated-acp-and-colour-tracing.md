# Illuminated ACP and colour tracing implementation

Approved: all three constructions and tracing changes, 27 October 2026. Execute inline in existing worktree.

1. Add failing mask tests for opaque dark/white backgrounds, transparency, manual colour and preserved negative-space holes. Implement border detection and metadata; add a raster trace preview/apply dialog. Apply detected fascia colour only on confirmation. Preserve legacy trace modes and saved settings.
2. Add recipe/layout tests for recessed, flush and push-through acrylic, no channel returns/studs, rear LEDs, counters and mixed construction. Add shared catalogue types/metadata, recipes and immutable layout. Add panel Boolean difference including counter islands and fit warnings.
3. Use shared panel regions in 3D/2D and cutting DXF, acrylic backer/insert parts in BOM/cutting/assembly, and schematic rear LEDs. Update construction anatomy/chooser, project validation and proposal summaries; bump render version.
4. Verify MatriMaa preview/import, three selectable recipes, geometry boundaries and exports. Inspect day/night/exploded rendering and a branded proposal. Run full tests/typecheck/build. Commit, fast-forward local main and push for Netlify; confirm deployed asset revision.
