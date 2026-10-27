# Final-render decision

27 October 2026. Select `three-gpu-pathtracer` 0.0.24 with Three.js 0.180 and `three-mesh-bvh` 0.9.8 for final images. Keep raster for editing/preview only. The current upstream WebGPU release requires a Three.js upgrade, so this bounded change pins the compatible WebGL2 release.

Primary API evidence: https://github.com/gkjohnson/three-gpu-pathtracer/blob/v0.0.24/README.md. APIs verified locally: WebGLPathTracer(renderer), setScene(scene,camera), tiles.set(3,3), bounces, filterGlossyFactor, renderSample(), samples, dispose(). Orthographic capture verified in the top-view PNGs. Emissive mesh wall spill, opal acrylic surfaces and painted metal are supported by the evaluated materials. Clear backs use transmission rather than an opacity-only approximation. No calibrated luminance claim is made.

Evidence: five construction fixtures, matched 2400 × 1200 outputs, day/night plus orthographic top, saved as `*-path.png`; sample counts and individual timings in `probe-timings.json`. Chrome 155, ANGLE Metal Apple M4. Perspective evaluation uses 128 samples, top 64; each fixture completed within the 120-second evaluation bound. Initial development captures exposed inadequate convergence in a first night image; the batch uses complete accumulated samples and every saved output was inspected via the comparison sheet and representative full-size images. A simple sphere probe isolated renderer output from scene conversion during investigation.

Supersampled raster comparisons (`*-raster.png`) render at 4800 × 2400 then downsample to 2400 × 1200. They improve edges but retain the existing approximate halo and limited indirect light. The selected path produces coherent board contact shadows, surface response and actual spill around the hole and perimeter. It avoids interpreting the existing blurred halo texture as a physical emitter.

The 128-sample evaluation still has visible grain in dark spill. Production final uses 512 samples and a glossy filter factor of 0.5, with cancellation checked between tiles, rather than treating the evaluation images as client-ready. Device timing is observational, not a promise. GPU peak allocation was not measured; release/disposal and repeated 2400/3840 captures must be checked during final verification.

Implementation refinement: reuse the authoritative existing SignScene builder in an offscreen instance with no animation/resize observer, and add focused material/emitter preparation functions. Avoid copying its geometry construction into a second builder. This preserves contours and mounting dimensions while keeping camera, queue and final backend independently testable. The offscreen scene owns resources; dispose its path tracer, environment maps, textures, geometry, renderer and context when closed.

Final adapter: prepare snapshot and complete assembled scene; replace preview-only halo planes with rear-facing contour emitters at the actual standoff plane; create a linear equirectangular environment and broad key/fill area lights; set the deterministic perspective/orthographic camera; accumulate 512 samples with tiled yielding; AgX-map once to sRGB; encode PNG after a full frame. Check AbortSignal and context state before capture. A failed shader/context or unsupported material reports failure, with no silent preview substitution.

Built-in environment refinements and Fenesta brand-colour checking remain implementation verification work, not conclusions from synthetic fixture images. Use the original local Fenesta PNG only as test input; do not bundle it as an app asset.

## Deployment regression investigation

The first reported artifact was raster depth conflict: a fixed 0.001 m near plane yielded fewer than one 24-bit depth level across 0.8 mm at the fitted 3.6 m sign distance. The camera now scales its near plane from the nearest subject extent; tests require over 100 levels at 3.6, 12 and 24 m widths.

Fresh WebGL contexts did not eliminate intermittent black fascia. Shader probes confirmed correct albedo and normals. Bypassing shadow attenuation and changing the random sampler still reproduced black output, excluding those as sufficient explanations. Separate BRDF probes identified NaN output in clear-coat evaluation while diffuse, base specular and sheen evaluation remained finite. The final-render fallback disables only the additional clear-coat lobe, retaining base PBR roughness, metalness, colour, maps and emission. Raster previews retain their original materials. Rendering remains uncalibrated.

An additional investigation found absolute versus relative node-address differences between an embedded legacy any-hit helper and three-mesh-bvh 0.9.x. That helper is not called by the active render shader, so this is not attributed as the black-board cause and does not justify an unrelated dependency change.
