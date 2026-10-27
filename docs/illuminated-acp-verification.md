# Illuminated ACP and coloured-background tracing — 27 October 2026

Approved scope and terminology are recorded in `superpowers/specs/2026-10-27-illuminated-acp-and-colour-tracing-design.md`.

## Implementation

- New raster import defaults to Auto background, using meaningful border transparency or a dominant border colour. Legacy white, black, corner and alpha modes remain; manual colour removal is added. The trace dialog previews geometry, holes and background confidence before apply. A labelled checkbox applies the detected colour to the fascia as part of the same undoable artwork edit. Cancellation preserves the existing artwork.
- Contrasting colours within spatial groups split into independently editable construction groups; nearby anti-alias shades stay together. Existing vector import is retained.
- Three shared construction types: `acpbacklit`, `acpflush`, `pushthrough`. Backed acrylic is recessed behind the panel; flush acrylic ends at the actual ACP front; push-through projects beyond it. Rear shoulders use expanded regions, and LEDs sit behind the fascia. Individual channel returns/studs are absent.
- A Clipper difference produces the physical ACP openings and retained counter islands. The same panel regions and acrylic part outlines feed the 3D renderer and fabrication plan/DXF. Gross ACP stock remains gross area in BOM; acrylic part areas include their retaining overlap.
- New types have their own Illuminated ACP chooser section, live anatomy, correct recipe parameters, lighting controls, proposal names/details and exploded callouts. Return-colour and channel-depth controls are hidden for these types.
- Project v7 retains v1–v6 migration and saves manual background colours. Render version v5 invalidates older geometry images.

## Acceptance evidence

The supplied MatriMaa PNG was tested through actual browser file inputs in the production build. It yielded 16 editable shapes and eight openings after detail attachment, preserving the HOMES negative-space lettering. Strongly contrasting colours produced three construction groups. The white wordmark was selected through the construction chooser and changed to flush illuminated inlay; irrelevant depth/return controls disappeared. The detected fascia colour was applied explicitly. Browser canvas colour management yields #06382f; this can differ from unconverted file RGB samples.

Generated all three types in front/day, installed/night and labelled exploded preview views. Flush inlay was additionally rendered through the final renderer in all three views at 1200 × 600 for acceptance. Inspected the final day, night and exploded images. The exported branded A4 landscape proposal contains exactly three pages; PDF metadata and a rasterised page were inspected. DXF contains FASCIA-OUTLINE and FASCIA-CUT plus acrylic parts; panel-integrated types generate no channel bend strips.

Client-specific proof images, project JSON, PDF and DXF are preserved in ignored `output/client-booklets/matrimaa/` rather than committed source. Original user artwork is unchanged.

## Practical limits

This reference is flat artwork, so it cannot identify the construction of an installed sign by itself. Manufacturer definitions informed the categories, not an assertion about the user's image. Defaults are illustration parameters. Acrylic retention/shoulders, counter islands, bonding/bridges, rear frame interference and LED clearance still need fabrication review. Opaque front backing and components outside the tray cavity produce warnings. LEDs/power remain schematic and illumination is uncalibrated. Automatic background detection is suited to flat artwork; complex photographs or gradients need crop/manual correction and outline review. Saved project images are processed artwork, so original background recovery requires the original image.
