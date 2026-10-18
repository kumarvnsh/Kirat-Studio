import { returnContours } from '../fabrication/forming.ts';
// Three.js display of a computed layout. Reads SceneInput, never changes the design.
// Layout is in millimetres; this file converts to metres (M) at the boundary.
import * as T from 'three';
import ClipperLib from 'clipper-lib';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BloomEffect,
  Effect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import { BLOOM_THRESHOLD, cameraExposure, emission, environments, kelvinToHex } from '../domain/lighting.ts';
import { bentPath } from '../artwork/contours.js';
import { LAYERS, type LayerId, type Point, type Region } from '../domain/project.ts';
import { LED_SIZE, type ElementLayout, type LetterPart, type SceneInput } from '../domain/layout.ts';
import { frontLit, haloLit, recipes } from '../domain/recipes.ts';
import { PSU_SIZE } from '../domain/layout.ts';
import { buildScenery, disposeScenery, contextFrame, type Scenery } from './scenery.ts';
import { normalizeScenePreset } from '../domain/scenePresets.ts';

const M = 0.001;
const selectionOf = (s: { selection: string[]; selected: string | null }) =>
  new Set(s.selection.length ? s.selection : s.selected ? [s.selected] : []);

// Camera exposure, applied in HDR before bloom and tone mapping.
class ExposureEffect extends Effect {
  constructor() {
    super(
      'Exposure',
      'uniform float exposure; void mainImage(const in vec4 c, const in vec2 uv, out vec4 o) { o = vec4(c.rgb * exposure, c.a); }',
      { uniforms: new Map([['exposure', new T.Uniform(1)]]) },
    );
  }
  set exposure(v: number) {
    this.uniforms.get('exposure')!.value = v;
  }
}
const EXPLODE_STEP = 0.12; // metres between layers at 100% explode
const toM = (r: Region): Region => ({
  outer: r.outer.map(([x, y]) => [x * M, y * M]),
  holes: r.holes.map((h) => h.map(([x, y]) => [x * M, y * M] as Point)),
});

export function shapeFromRegion(region: Region) {
  let outer = region.outer.map((p) => new T.Vector2(...p));
  if (!T.ShapeUtils.isClockWise(outer)) outer.reverse();
  // Rotate `outer` so `outer[0]` is strictly inside the contour's bounding box whenever possible.
  // Three.js's bundled Earcut starts its bbox loop at index 1 (`for (let i = dim; i < outerLen; i += dim)`),
  // so if `outer[0]` is a unique minX/maxX/minY/maxY extremum (such as the top apex of letter 'o'),
  // its Morton z-order code overflows 32767 and corrupts hole triangulation on the face.
  if (outer.length > 3) {
    const xs = outer.map((v) => v.x),
      ys = outer.map((v) => v.y),
      minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    let bestIdx = 0,
      bestMargin = -Infinity;
    for (let i = 0; i < outer.length; i++) {
      const v = outer[i],
        margin = Math.min(v.x - minX, maxX - v.x, v.y - minY, maxY - v.y);
      if (margin > bestMargin) {
        bestMargin = margin;
        bestIdx = i;
      }
    }
    if (bestIdx > 0 && bestMargin > 0) {
      outer = [...outer.slice(bestIdx), ...outer.slice(0, bestIdx)];
    }
  }
  const s = new T.Shape(outer);
  for (const h of region.holes) {
    const v = h.map((p) => new T.Vector2(...p));
    if (T.ShapeUtils.isClockWise(v)) v.reverse();
    s.holes.push(new T.Path(v));
  }
  return s;
}

function treeShapes(tree: any) {
  const out: T.Shape[] = [];
  const visit = (node: any) => {
    for (const n of node.Childs()) {
      if (!n.IsHole() && n.Contour().length >= 3)
        out.push(
          shapeFromRegion({
            outer: n.Contour().map((p: any) => [p.X / 1e6, p.Y / 1e6]),
            holes: n
              .Childs()
              .filter((h: any) => h.IsHole())
              .map((h: any) => h.Contour().map((p: any) => [p.X / 1e6, p.Y / 1e6])),
          }),
        );
      visit(n);
    }
  };
  visit(tree);
  return out;
}

// Thin wall of `gauge` width centred on a contour (metres).
export function strokeShapes(loop: Point[], gauge: number) {
  const C = ClipperLib;
  const p = loop.map((v) => ({ X: Math.round(v[0] * 1e6), Y: Math.round(v[1] * 1e6) }));
  if (!C.Clipper.Orientation(p)) p.reverse();
  const offsets = (d: number) => {
    const o = new C.ClipperOffset(2, 0.1);
    o.AddPath(p, C.JoinType.jtMiter, C.EndType.etClosedPolygon);
    const r = new C.Paths();
    o.Execute(r, d * 1e6);
    return r;
  };
  const clip = new C.Clipper();
  clip.AddPaths(offsets(gauge / 2), C.PolyType.ptSubject, true);
  clip.AddPaths(offsets(-gauge / 2), C.PolyType.ptClip, true);
  const tree = new C.PolyTree();
  clip.Execute(C.ClipType.ctDifference, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return treeShapes(tree);
}

// Strip following a contour, partially "unbent" by progress 0..1.
function bandGeometry(path: Point[], gauge: number, depth: number, progress: number) {
  const ps: Point[] = bentPath(path, progress),
    verts: number[] = [],
    indices: number[] = [];
  for (let i = 0; i < ps.length; i++) {
    const a = ps[Math.max(0, i - 1)],
      b = ps[Math.min(ps.length - 1, i + 1)],
      len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1,
      nx = ((-(b[1] - a[1]) / len) * gauge) / 2,
      ny = (((b[0] - a[0]) / len) * gauge) / 2,
      p = ps[i];
    verts.push(
      p[0] + nx,
      p[1] + ny,
      0,
      p[0] - nx,
      p[1] - ny,
      0,
      p[0] + nx,
      p[1] + ny,
      depth,
      p[0] - nx,
      p[1] - ny,
      depth,
    );
    if (i)
      for (const [q, r, s, t] of [
        [0, 1, 5, 4],
        [2, 6, 7, 3],
        [0, 4, 6, 2],
        [1, 3, 7, 5],
      ]) {
        const v = i * 4 - 4;
        indices.push(v + q, v + r, v + s, v + q, v + s, v + t);
      }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export class SignScene {
  host: HTMLElement;
  onSelect: (id: string | null, add: boolean, doubleClick?: boolean) => void;
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(35, 1, 0.05, 35);
  controls: OrbitControls;
  hemi = new T.HemisphereLight(0xc9e5f0, 0x5d6253, 2);
  sun = new T.DirectionalLight(0xfff0d6, 3);
  fill = new T.DirectionalLight(0xd6ecff, 1.5);
  composer: EffectComposer;
  bloom: BloomEffect;
  exposure = new ExposureEffect();
  group = new T.Group();
  layers = new Map<LayerId, T.Group>();
  state: SceneInput | null = null;
  texture: T.CanvasTexture | null = null;
  outline: T.LineSegments | null = null;
  forming: T.Group | null = null;
  worldParts: { id: string; regions: Region[] }[] = [];
  wall: T.Mesh | null = null;
  scenery: Scenery | null = null;
  sceneryKey = '';
  onSceneError: (message: string) => void;
  lightUpdaters: ((s: SceneInput) => void)[] = [];
  lastSize: [number, number] = [0, 0];
  dirty = true;

  constructor(host: HTMLElement, onSelect: (id: string | null, add: boolean, doubleClick?: boolean) => void, onSceneError = (_message: string) => {}) {
    this.host = host;
    this.onSelect = onSelect;
    this.onSceneError = onSceneError;
    // Tone mapping comes from the effect chain; renderer antialiasing stays disabled.
    this.renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.NoToneMapping;
    host.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.2;
    this.controls.maxDistance = 30;
    this.controls.addEventListener('change', () => this.draw());
    this.scene.add(this.hemi);
    this.sun.position.set(-3, 5, 5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -8, right: 8, top: 5, bottom: -5, near: 0.1, far: 20 });
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.002;
    this.scene.add(this.sun);
    this.fill.position.set(4, 1, 2);
    this.scene.add(this.fill);
    const env = new RoomEnvironment(),
      pmrem = new T.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(env, 0.04).texture;
    env.dispose();
    pmrem.dispose();
    // HDR pipeline. Bloom only picks up radiance above BLOOM_THRESHOLD, i.e. emissive parts.
    this.composer = new EffectComposer(this.renderer, { frameBufferType: T.HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new BloomEffect({
      luminanceThreshold: BLOOM_THRESHOLD,
      luminanceSmoothing: 0.2,
      mipmapBlur: true,
      intensity: 0.25,
      radius: 0.25,
    });
    // Exposure first, in its own pass: bloom samples the pass input, not earlier effects in the same pass.
    this.composer.addPass(new EffectPass(this.camera, this.exposure));
    this.composer.addPass(
      new EffectPass(this.camera, this.bloom, new ToneMappingEffect({ mode: ToneMappingMode.AGX })),
    );
    this.scene.add(this.group);
    const ray = new T.Raycaster();
    const pickableLayers: LayerId[] = ['faces', 'returns', 'backs', 'mounting'];
    const pickPart = (clientX: number, clientY: number) => {
      const r = this.renderer.domElement.getBoundingClientRect();
      if (!r.width || !r.height) return undefined;
      ray.setFromCamera(
        new T.Vector2(((clientX - r.left) / r.width) * 2 - 1, (-(clientY - r.top) / r.height) * 2 + 1),
        this.camera,
      );
      const targets: T.Object3D[] = [];
      for (const id of pickableLayers) {
        const g = this.layers.get(id);
        if (g?.visible) targets.push(g);
      }
      return ray
        .intersectObjects(targets, true)
        .find((h) => h.object.userData.part && h.object.visible && h.object.parent?.visible);
    };
    let down: [number, number] | null = null;
    let lastHoverPick = 0;
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      down = [e.clientX, e.clientY];
      this.renderer.domElement.style.cursor = 'grabbing';
    });
    this.renderer.domElement.addEventListener('pointermove', (e) => {
      if (e.buttons !== 0) {
        this.renderer.domElement.style.cursor = 'grabbing';
        return;
      }
      const now = performance.now();
      if (now - lastHoverPick < 40) return;
      lastHoverPick = now;
      const hit = pickPart(e.clientX, e.clientY);
      this.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
    });
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      this.renderer.domElement.style.cursor = 'grab';
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const hit = pickPart(e.clientX, e.clientY);
      const add = e.shiftKey || e.metaKey || e.ctrlKey;
      if (hit) this.onSelect(hit.object.userData.part, add);
      else if (!add) this.onSelect(null, false);
    });
    this.renderer.domElement.addEventListener('dblclick', (e) => {
      const hit = pickPart(e.clientX, e.clientY);
      if (hit) {
        this.onSelect(hit.object.userData.part, false, true);
        this.focusSelection();
      } else {
        this.fit('perspective');
      }
    });
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize(true);
    const loop = () => {
      requestAnimationFrame(loop);
      const moved = this.controls.update();
      if (moved || this.dirty) {
        this.dirty = false;
        this.composer.render();
      }
    };
    loop();
  }

  resize(force = false) {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    if (!force && this.lastSize[0] === w && this.lastSize[1] === h) return;
    this.lastSize = [w, h];
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.renderNow();
  }

  draw() {
    this.dirty = true;
  }

  private renderNow() {
    this.dirty = false;
    this.composer.render();
  }

  clear() {
    this.outline = null;
    this.forming = null;
    this.lightUpdaters = [];
    this.group.traverse((o: any) => {
      o.geometry?.dispose();
      o.userData.extraTexture?.dispose();
      if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    });
    this.group.clear();
    this.texture?.dispose();
    this.texture = null;
  }

  material(color: T.ColorRepresentation, metalness = 0, roughness = 0.5) {
    return new T.MeshStandardMaterial({ color, metalness, roughness, side: T.FrontSide });
  }

  // Physically based finishes. Values are presentation estimates, not measured BRDFs.
  finish(
    kind:
      | 'painted'
      | 'acp'
      | 'gi'
      | 'frame'
      | 'aluminium'
      | 'stainless'
      | 'acrylic'
      | 'trim'
      | 'vinyl'
      | 'paint',
    color?: T.ColorRepresentation,
  ) {
    const P = (o: T.MeshPhysicalMaterialParameters) =>
      new T.MeshPhysicalMaterial({ side: T.FrontSide, ...o });
    switch (kind) {
      case 'acp': // PVDF-coated panel: painted, light clearcoat
        return P({
          color,
          metalness: 0.05,
          roughness: 0.42,
          clearcoat: 0.55,
          clearcoatRoughness: 0.28,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 2,
        });
      case 'gi':
        return P({
          color: '#a9b2b5',
          metalness: 1,
          roughness: 0.48,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });
      case 'frame': // primed MS
        return P({ color: '#3d4347', metalness: 0.35, roughness: 0.6 });
      case 'aluminium':
        return P({ color: color ?? '#c5ccd0', metalness: 1, roughness: 0.32 });
      case 'stainless':
        return P({ color: '#cdd3d6', metalness: 1, roughness: 0.24 });
      case 'painted': // powder-coated / painted metal
        return P({ color, metalness: 0.2, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.3 });
      case 'acrylic': // glossy cast acrylic surface
        return P({ color, metalness: 0, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.14 });
      case 'trim':
        return P({
          color: '#2f3336',
          metalness: 0,
          roughness: 0.5,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -2,
        });
      case 'vinyl':
        return P({
          color,
          metalness: 0,
          roughness: 0.62,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -4,
        });
      case 'paint':
        return P({ color, metalness: 0, roughness: 0.95 });
    }
  }

  build(s: SceneInput, artCanvas: HTMLCanvasElement | null) {
    this.state = s;
    this.clear();
    const L = s.layout,
      st = s.settings,
      W = st.width * M,
      H = st.height * M;
    this.layers = new Map(
      LAYERS.map((l, i) => {
        const g = new T.Group();
        g.name = l.name;
        g.userData.index = i;
        this.group.add(g);
        return [l.id, g];
      }),
    );
    const mesh = (
      geometry: T.BufferGeometry,
      material: T.Material,
      layer: LayerId,
      z: number,
      part: string | null = null,
      castShadow = true,
      receiveShadow = true,
    ) => {
      const m = new T.Mesh(geometry, material);
      m.position.z = z;
      m.castShadow = castShadow;
      m.receiveShadow = receiveShadow;
      m.userData.part = part;
      this.layers.get(layer)!.add(m);
      return m;
    };

    // Board: sheets as boxes, frame as hollow tubes.
    // Small visual z-offsets separate gi/backing/acp from the steel frame tubes to prevent coplanar z-fighting.
    const sheetColour: Partial<Record<LayerId, T.Material>> = {
      gi: this.finish('gi'),
      backing: this.finish('aluminium', '#b4bbbe'),
      acp: this.finish('acp', st.boardcolor),
    };
    const sheetZBias: Partial<Record<LayerId, number>> = {
      gi: -0.0005,
      backing: 0.0003,
      acp: 0.0006,
    };
    for (const b of L.board) {
      if (b.layer === 'frame') continue;
      mesh(
        new T.BoxGeometry(W, H, (b.z1 - b.z0) * M),
        sheetColour[b.layer]!,
        b.layer,
        ((b.z0 + b.z1) / 2) * M + (sheetZBias[b.layer] ?? 0),
      );
    }
    const F = st.frame * M,
      inner = F / 2 - st.framewall * M,
      steel = this.finish('frame'),
      tubeShape = shapeFromRegion({
        outer: [
          [-F / 2, -F / 2],
          [F / 2, -F / 2],
          [F / 2, F / 2],
          [-F / 2, F / 2],
        ],
        holes: [
          [
            [-inner, -inner],
            [-inner, inner],
            [inner, inner],
            [inner, -inner],
          ],
        ],
      });
    for (const f of L.frame) {
      const len = f.length * M,
        g = new T.ExtrudeGeometry(tubeShape, { depth: len, bevelEnabled: false });
      g.translate(0, 0, -len / 2);
      if (f.axis === 'x') g.rotateY(Math.PI / 2);
      else g.rotateX(Math.PI / 2);
      mesh(g, steel, 'frame', 0).position.set(f.x * M, f.y * M, 0);
    }
    this.setScene(s);

    if (artCanvas) {
      this.texture = new T.CanvasTexture(artCanvas);
      this.texture.colorSpace = T.SRGBColorSpace;
      this.texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    }
    this.worldParts = [];
    const lit = s.lights !== false;
    for (const e of L.elements) {
      if (s.mode === 'bend' && e.id !== s.selected) continue;
      const regions = e.regions.map(toM);
      this.worldParts.push({ id: e.id, regions });
      for (const p of e.parts) this.buildPart(s, e, p, regions, mesh, lit);
    }

    // Front-lit faces emit through their acrylic. Do not approximate that with
    // unoccluded point lights in front of the sign: they create camera-facing
    // specular hotspots and illuminate unrelated vinyl/metal surfaces.
    // Rear-lit constructions get contour-shaped fascia spill in haloGlow().
    this.buildPower(s);
    this.setEnvironment(s);
    this.setVisibility(s);
    if (s.mode === 'bend') this.buildBend(s);
    this.draw();
  }

  private buildPart(
    s: SceneInput,
    e: ElementLayout,
    p: LetterPart,
    regions: Region[],
    mesh: (
      g: T.BufferGeometry,
      m: T.Material,
      l: LayerId,
      z: number,
      part?: string | null,
      castShadow?: boolean,
      receiveShadow?: boolean,
    ) => T.Mesh,
    lit: boolean,
  ) {
    const st = s.settings,
      L = s.layout,
      rawDepth = (p.z1 - p.z0) * M,
      // Lift letter parts 1mm above the board fascia and step stacked seams by 0.2mm to eliminate z-fighting.
      partZBias =
        p.kind === 'back'
          ? 0.001
          : p.kind === 'returns'
            ? 0.0012
            : p.kind === 'face'
              ? 0.0014
              : p.kind === 'trim'
                ? 0.0016
                : e.type === 'vinyl'
                  ? 0.0015
                  : 0.0012,
      z0 = p.z0 * M + partZBias,
      depth = e.type === 'vinyl' ? Math.max(rawDepth, 0.0008) : rawDepth,
      shapes = regions.map(shapeFromRegion);
    // Face colour: the letter's/group's chosen colour, else the artwork's own colours, else the default.
    const art = !e.faceColor && st.keepart && this.texture,
      base = e.faceColor ?? (art ? '#ffffff' : st.facecolor);
    const extrude = (mat: T.Material, textured: boolean, castShadow = true) => {
      const g = new T.ExtrudeGeometry(shapes, {
        depth,
        bevelEnabled: textured && depth >= 0.001,
        bevelSize: Math.min(0.0003, depth / 8),
        bevelThickness: Math.min(0.0002, depth / 10),
        bevelSegments: 2,
        curveSegments: 8,
      });
      if (textured && art) {
        // Map back to traced-image pixels so faces show the original artwork colours even when scaled/spaced.
        const pos = g.attributes.position,
          uv = g.attributes.uv,
          [x0, y0, x1, y1] = e.bounds,
          [px0, py0, px1, py1] = e.pixelBounds ?? [0, 0, s.imageWidth, s.imageHeight],
          bw = Math.max(1e-6, x1 - x0),
          bh = Math.max(1e-6, y1 - y0);
        for (let i = 0; i < pos.count; i++) {
          const xm = pos.getX(i) / M,
            ym = pos.getY(i) / M,
            px = e.pixelBounds ? px0 + ((xm - x0) / bw) * (px1 - px0) : xm / L.scale + L.cx,
            py = e.pixelBounds ? py0 + ((y1 - ym) / bh) * (py1 - py0) : L.cy - ym / L.scale;
          uv.setXY(i, px / s.imageWidth, 1 - py / s.imageHeight);
        }
        uv.needsUpdate = true;
      }
      return mesh(g, mat, p.layer, z0, e.id, castShadow, true);
    };
    // Each group is its own circuit: master power x group on/off, master dimming x group dimming.
    // In "artwork" mode RGB LEDs reproduce the letter's own colours, so the artwork drives the emission.
    const light = e.light,
      matchArt = light?.mode === 'artwork',
      ledColour = matchArt ? '#ffffff' : (light?.color ?? kelvinToHex(st.ledTemp)),
      glowOf = (cur: SceneInput) =>
        emission(cur.lights !== false && (light?.on ?? true), cur.dimming * (light?.dimming ?? 1)),
      glow = glowOf(s),
      emitArt = matchArt ? !!(st.keepart && this.texture) : !!art,
      emitBase = matchArt ? (emitArt ? '#ffffff' : light!.color) : base;
    // Bare stainless unless a colour is chosen, then painted metal.
    const metalFace = () => (e.faceColor ? this.finish('painted', e.faceColor) : this.finish('stainless'));
    const faceMat = () => {
      const m = this.finish('acrylic', base) as T.MeshPhysicalMaterial;
      if (art) m.map = this.texture;
      if (frontLit(e.type)) {
        // Light through the face = LED colour × face colour (artwork texture or uniform colour).
        m.emissive.set(ledColour).multiply(new T.Color(emitBase));
        m.emissiveIntensity = glow;
        if (emitArt) m.emissiveMap = this.texture;
        this.lightUpdaters.push((cur) => {
          m.emissiveIntensity = glowOf(cur);
        });
      }
      return m;
    };

    const ring = (width: number, mat: T.Material) => {
      for (const r of regions)
        for (const loop of [r.outer, ...r.holes]) {
          const ss = strokeShapes(loop, width);
          if (ss.length)
            mesh(new T.ExtrudeGeometry(ss, { depth, bevelEnabled: false }), mat, p.layer, z0, e.id);
        }
    };
    const pins = (radius: number, mat: T.Material, castShadow = true) => {
      for (const [x, y] of e.fixings) {
        const g = new T.CylinderGeometry(radius, radius, depth, 12);
        g.rotateX(Math.PI / 2);
        mesh(g, mat, 'mounting', z0 + depth / 2, e.id, castShadow, castShadow).position.set(
          x * M,
          y * M,
          z0 + depth / 2,
        );
      }
    };

    if (p.kind === 'stud') pins(0.0025, this.material('#8d969a', 0.9, 0.35), false);
    else if (p.kind === 'standoff') pins(0.006, this.material('#b9c2c4', 0.9, 0.3), true);
    else if (p.kind === 'back') {
      const mat = haloLit(e.type)
        ? new T.MeshStandardMaterial({ color: '#dfe8ea', roughness: 0.1, transparent: true, opacity: 0.45 })
        : this.material('#75878c', 0.05, 0.8);
      extrude(mat, false);
      if (haloLit(e.type))
        this.haloGlow(regions, L.letterBase * M + 0.0015, e.id, mesh, light?.color ?? ledColour, glow, glowOf);
    } else if (p.kind === 'leds') {
      const body = this.material('#e7eee4', 0, 0.4),
        lens = this.material('#fff5cc', 0, 0.2);
      lens.emissive.set(light?.color ?? ledColour);
      lens.emissiveIntensity = glow * 1.5;
      this.lightUpdaters.push((cur) => {
        lens.emissiveIntensity = glowOf(cur) * 1.5;
      });
      for (const [x, y] of e.leds) {
        mesh(
          new T.BoxGeometry(LED_SIZE.w * M, LED_SIZE.h * M, LED_SIZE.d * M),
          body,
          'leds',
          z0 + (LED_SIZE.d * M) / 2,
          e.id,
          false,
          false,
        ).position.set(x * M, y * M, z0 + (LED_SIZE.d * M) / 2);
        const l = mesh(new T.SphereGeometry(0.003, 6, 4), lens, 'leds', z0 + LED_SIZE.d * M, e.id, false, false);
        l.scale.set(1, 1, 0.5);
        l.position.set(x * M, y * M, z0 + LED_SIZE.d * M);
      }
    } else if (p.kind === 'returns') {
      // Full acrylic letters glow through their sides; metal returns stay dark.
      if (e.type === 'fullacrylic') {
        const m = this.finish('acrylic', base) as T.MeshPhysicalMaterial;
        m.emissive.set(ledColour).multiply(new T.Color(matchArt ? light!.color : base));
        m.emissiveIntensity = glow * 0.6; // sides pass less light than the face
        this.lightUpdaters.push((cur) => {
          m.emissiveIntensity = glowOf(cur) * 0.6;
        });
        ring(e.params.gauge * M, m);
      } else
        ring(
          e.params.gauge * M,
          e.returnColor ? this.finish('painted', e.returnColor) : this.finish('aluminium'),
        );
    } else if (p.kind === 'trim') ring((2 * e.params.trimcap + e.params.gauge) * M, this.finish('trim'));
    else if (p.kind === 'face') extrude(e.type === 'halo' ? metalFace() : faceMat(), e.type !== 'halo');
    else if (e.type === 'metal') extrude(metalFace(), false);
    else if (e.type === 'vinyl') {
      const m = this.finish('vinyl', base) as T.MeshPhysicalMaterial;
      if (art) m.map = this.texture;
      extrude(m, !!art, false);
    } else extrude(faceMat(), true);
  }

  // Placeholder PSUs in the frame bay and cable runs from each lit letter.
  private buildPower(s: SceneInput) {
    if (s.mode === 'bend') return;
    const g = this.layers.get('power')!,
      psuMat = this.material('#c9ced0', 0.8, 0.35),
      cableMat = this.material('#1d1f20', 0, 0.7);
    for (const [x, y, z] of s.layout.power.psus) {
      const m = new T.Mesh(new T.BoxGeometry(PSU_SIZE.w * M, PSU_SIZE.h * M, PSU_SIZE.d * M), psuMat);
      m.position.set(x * M, y * M, z * M);
      m.castShadow = true;
      g.add(m);
    }
    for (const c of s.layout.power.cables) {
      const path = new T.CurvePath<T.Vector3>();
      for (let i = 1; i < c.points.length; i++)
        path.add(
          new T.LineCurve3(
            new T.Vector3(...c.points[i - 1].map((v) => v * M)),
            new T.Vector3(...c.points[i].map((v) => v * M)),
          ),
        );
      const m = new T.Mesh(new T.TubeGeometry(path, 8 * c.points.length, 0.0025, 6, false), cableMat);
      m.userData.part = c.element;
      g.add(m);
    }
  }

  // Light pool on the fascia behind a halo letter.
  // Drawn white and tinted by the material, which carries HDR intensity so bloom picks it up.
  private haloGlow(
    regions: Region[],
    z: number,
    id: string,
    mesh: (...a: any[]) => T.Mesh,
    colour: string,
    intensity: number,
    glowOf?: (cur: SceneInput) => number,
  ) {
    for (const r of regions) {
      const xs = r.outer.map((v) => v[0]),
        ys = r.outer.map((v) => v[1]),
        [minx, maxx, miny, maxy] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)],
        width = maxx - minx + 0.1,
        height = maxy - miny + 0.1,
        c = document.createElement('canvas');
      c.width = 256;
      c.height = Math.max(32, Math.round((256 * height) / width));
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      const path = (loop: Point[]) =>
        loop.forEach(([vx, vy], i) => {
          const x = ((vx - minx + 0.05) / width) * c.width,
            y = ((maxy + 0.05 - vy) / height) * c.height;
          if (!i) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
      path(r.outer);
      ctx.closePath();
      for (const h of r.holes) {
        path(h);
        ctx.closePath();
      }
      ctx.fill('evenodd');
      const tex = new T.CanvasTexture(c);
      tex.colorSpace = T.SRGBColorSpace;
      const mat = new T.MeshBasicMaterial({
        map: tex,
        color: new T.Color(colour).multiplyScalar(intensity * 0.6),
        transparent: true,
        opacity: intensity > 0 ? 0.85 : 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
      });
      if (glowOf) {
        this.lightUpdaters.push((cur) => {
          const g = glowOf(cur);
          mat.color.set(colour).multiplyScalar(g * 0.6);
          mat.opacity = g > 0 ? 0.85 : 0;
        });
      }
      const m = mesh(new T.PlaneGeometry(width, height), mat, 'mounting', z, id, false, false);
      m.position.set((minx + maxx) / 2, (miny + maxy) / 2, z);
      m.userData.extraTexture = tex;
    }
  }

  // Fast-path update for master power (`lights`) and `dimming` without rebuilding geometry.
  setLighting(s: SceneInput) {
    this.state = s;
    for (const fn of this.lightUpdaters) fn(s);
    this.draw();
  }

  setScene(s: SceneInput) {
    this.state = s;
    const preset = normalizeScenePreset(s.scenePreset);
    const wallZ = s.layout.board[0].z0 * M - 0.1;
    const key = [preset, s.settings.width, s.settings.height, wallZ].join(':');
    if (key !== this.sceneryKey || !this.scenery) {
      let next: Scenery;
      try {
        next = buildScenery(preset, s.settings.width * M, s.settings.height * M, wallZ);
      } catch (error) {
        console.error('Unable to build signage scenery', error);
        next = buildScenery('studio', s.settings.width * M, s.settings.height * M, wallZ);
        this.onSceneError('Scene unavailable. Showing the Studio setting.');
      }
      if (this.scenery) disposeScenery(this.scenery);
      this.scenery = next;
      this.sceneryKey = key;
      this.scene.add(next.group);
      this.wall = next.wall;
    }
    this.scenery.group.visible = s.mode === '3d';
    this.draw();
  }

  // Environment (time of day) and camera exposure. Never touches emission.
  setEnvironment(s: SceneInput) {
    this.state = s;
    const e = environments[s.environment];
    this.setScene(s);
    this.scenery!.roomLight.intensity = s.scenePreset === 'interior' && !this.scenery!.frameBounds.isEmpty() ? 2.2 : 0;
    this.scene.background = new T.Color(e.background);
    this.scene.environmentIntensity = e.ambient;
    this.hemi.intensity = e.hemi;
    this.sun.intensity = e.sun;
    this.sun.color.set(e.sunColor);
    this.sun.position.set(...e.sunPosition);
    this.fill.intensity = e.fill;
    this.exposure.exposure = cameraExposure(s.environment, s.exposure);
    (this.wall?.material as T.MeshPhysicalMaterial | undefined)?.color.set(e.wall);
    this.bloom.blendMode.opacity.value = s.mode === 'bend' ? 0 : 1;
    this.draw();
  }

  setVisibility(s: SceneInput) {
    if (this.scenery) this.scenery.group.visible = s.mode === '3d';
    if (s.mode === 'bend') { this.layers.forEach(layer => { layer.visible = false; }); this.highlight(false); this.draw(); return; }
    const sel = selectionOf(s),
      hidden = new Set(s.hidden);
    LAYERS.forEach((l, i) => {
      const g = this.layers.get(l.id)!,
        shown = s.visibleLayers.has(l.id) && s.layers[i] !== false;
      g.position.z = (s.explode / 100) * i * EXPLODE_STEP;
      if (s.isolate && sel.size) {
        g.visible = l.kind === 'letter' && shown;
        g.children.forEach((o) => (o.visible = sel.has(o.userData.part) && !hidden.has(o.userData.part)));
      } else {
        g.visible = shown;
        g.children.forEach((o) => (o.visible = !hidden.has(o.userData.part)));
      }
    });
    this.highlight();
    this.draw();
  }

  // Outline every selected element at the top of what is visible. Pass `false` to clear.
  highlight(show = true) {
    if (this.outline) {
      this.group.remove(this.outline);
      this.outline.geometry.dispose();
      (this.outline.material as T.Material).dispose();
      this.outline = null;
    }
    const s = this.state;
    if (!show || !s || s.mode === 'bend' || s.presentation || !s.selectionActive) return;
    const sel = selectionOf(s),
      vs: number[] = [];
    for (const part of this.worldParts.filter((p) => sel.has(p.id))) {
      let top = -Infinity;
      for (const layer of this.layers.values()) {
        if (!layer.visible) continue;
        for (const o of layer.children)
          if (o.visible && o.userData.part === part.id)
            top = Math.max(top, new T.Box3().setFromObject(o).max.z);
      }
      if (!Number.isFinite(top)) continue;
      for (const r of part.regions)
        for (const loop of [r.outer, ...r.holes])
          for (let i = 0; i < loop.length; i++)
            vs.push(...loop[i], top + 0.001, ...loop[(i + 1) % loop.length], top + 0.001);
    }
    if (!vs.length) return;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(vs, 3));
    this.outline = new T.LineSegments(
      g,
      new T.LineBasicMaterial({ color: '#efb367', depthTest: false, transparent: true, opacity: 0.8 }),
    );
    this.outline.renderOrder = 10;
    this.group.add(this.outline);
  }

  // Forming study: the selected element's return strips, progressively bent.
  buildBend(s: SceneInput) {
    this.state = s;
    if (this.forming) {
      this.forming.traverse((o: any) => {
        o.geometry?.dispose();
        if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      });
      this.group.remove(this.forming);
      this.forming = null;
    }
    this.layers.forEach((g) => (g.visible = false));
    const e = s.layout.elements.find((x) => x.id === s.selected),
      part = this.worldParts.find((p) => p.id === s.selected);
    if (!e || !part) return;
    const defaults = recipes.front.params,
      gauge = (e.params.gauge ?? defaults.gauge.value) * M,
      depth = (e.params.depth ?? defaults.depth.value) * M,
      z = (e.parts.find((p) => p.kind === 'returns')?.z0 ?? s.layout.letterBase) * M;
    const forming = new T.Group();
    forming.name = 'forming';
    this.group.add(forming);
    this.forming = forming;
    for (const loop of returnContours(part.regions, s.bendStrip)) {
        const m = new T.Mesh(
          bandGeometry(loop, gauge, depth, s.bend / 100),
          this.material('#c0cbd0', 0.88, 0.27),
        );
        m.position.z = z;
        forming.add(m);
        const pts = [...loop, loop[0]].map((v) => new T.Vector3(v[0], v[1], z - 0.005));
        forming.add(
          new T.Line(
            new T.BufferGeometry().setFromPoints(pts),
            new T.LineBasicMaterial({ color: '#d58d49', transparent: true, opacity: 0.65 }),
          ),
        );
      }
    this.draw();
  }

  zoom(scale: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const nextLen = Math.max(
      this.controls.minDistance,
      Math.min(this.controls.maxDistance, offset.length() * scale),
    );
    offset.setLength(nextLen);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.draw();
  }

  private frameContext(direction: T.Vector3): boolean {
    const bounds = this.scenery?.frameBounds;
    if (!this.scenery?.group.visible || !bounds || bounds.isEmpty() || this.state?.isolate) return false;
    const frame = contextFrame(bounds, this.camera.aspect, this.camera.fov, direction);
    this.camera.position.copy(frame.position);
    this.controls.target.copy(frame.center);
    this.camera.near = frame.near;
    this.camera.far = frame.far;
    this.controls.maxDistance = Math.max(30, frame.distance * 2);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(frame.center);
    this.controls.update();
    this.draw();
    return true;
  }

  fit(kind: 'perspective' | 'front' | 'rear' | 'side' | 'top' = 'perspective') {
    const s = this.state;
    if (!s) return;
    const direction = kind === 'front' ? new T.Vector3(0, 0, 1)
      : kind === 'rear' ? new T.Vector3(-.12, .12, -1)
      : kind === 'side' ? new T.Vector3(.92, .08, .38)
      : kind === 'top' ? new T.Vector3(0, .9, .42) : new T.Vector3(.17, .115, 1);
    if (s.mode === '3d' && this.frameContext(direction)) return;
    this.controls.maxDistance = 30;
    this.camera.near = .05;
    this.camera.far = 35;
    this.camera.updateProjectionMatrix();
    const n = LAYERS.length - 1;
    let center = new T.Vector3(0, 0, 0.035 + (s.explode / 100) * EXPLODE_STEP * n * 0.5),
      w = s.settings.width * M,
      h = s.settings.height * M,
      depth = 0.12 + (s.explode / 100) * EXPLODE_STEP * n;
    if (s.mode === 'bend' && this.forming) {
      const b = new T.Box3().setFromObject(this.forming),
        size = b.getSize(new T.Vector3());
      b.getCenter(center);
      w = Math.max(size.x, 0.3);
      h = Math.max(size.y, 0.3);
      depth = size.z;
    }
    if (s.isolate && s.mode !== 'bend') {
      const sel = selectionOf(s);
      const bounds = new T.Box3();
      for (const layer of this.layers.values()) {
        if (!layer.visible) continue;
        for (const o of layer.children) if (o.visible && sel.has(o.userData.part)) bounds.expandByObject(o);
      }
      if (!bounds.isEmpty()) {
        bounds.getCenter(center);
        const size = bounds.getSize(new T.Vector3());
        w = Math.max(size.x, 0.15);
        h = Math.max(size.y, 0.15);
        depth = size.z;
      }
    }
    const need = Math.max(w / this.camera.aspect, h),
      dist =
        (need / (2 * Math.tan((this.camera.fov * Math.PI) / 360))) * (kind === 'front' ? 1.15 : 1.22) +
        depth * 0.65;
    this.controls.target.copy(center);
    const off =
      kind === 'front'
        ? new T.Vector3(0, 0, dist)
        : kind === 'rear'
          ? new T.Vector3(-dist * 0.12, dist * 0.12, -dist)
          : kind === 'side'
            ? new T.Vector3(dist * 0.92, dist * 0.08, dist * 0.38)
            : kind === 'top'
              ? new T.Vector3(0, dist * 0.9, dist * 0.42)
              : new T.Vector3(dist * 0.17, dist * 0.115, dist);
    this.camera.position.copy(center).add(off);
    this.camera.lookAt(center);
    this.controls.update();
    this.draw();
  }

  // Frame the currently selected element(s) in the 3D view without isolating them.
  focusSelection() {
    const s = this.state;
    if (!s || s.mode === 'bend') return this.fit('perspective');
    const sel = selectionOf(s);
    if (!sel.size) return this.fit('perspective');
    const bounds = new T.Box3();
    for (const layer of this.layers.values()) {
      if (!layer.visible) continue;
      for (const o of layer.children) if (o.visible && sel.has(o.userData.part)) bounds.expandByObject(o);
    }
    if (bounds.isEmpty()) return this.fit('perspective');
    const center = bounds.getCenter(new T.Vector3()),
      size = bounds.getSize(new T.Vector3()),
      w = Math.max(size.x, 0.18),
      h = Math.max(size.y, 0.18),
      depth = Math.max(size.z, 0.08),
      need = Math.max(w / this.camera.aspect, h),
      dist = (need / (2 * Math.tan((this.camera.fov * Math.PI) / 360))) * 1.45 + depth * 0.8;
    const dir = this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-4) dir.set(0.17, 0.115, 1);
    dir.normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.lookAt(center);
    this.controls.update();
    this.draw();
  }

  // High-resolution still in a given environment: framed for the still's aspect from the current
  // viewing direction, no selection outline. Restores camera, size, environment and highlight afterwards.
  renderStill(width: number, height: number, environment: SceneInput['environment']): string {
    const state = this.state!, size = this.renderer.getSize(new T.Vector2()), ratio = this.renderer.getPixelRatio();
    const position = this.camera.position.clone(), target = this.controls.target.clone();
    const aspect = this.camera.aspect, near = this.camera.near, far = this.camera.far, maxDistance = this.controls.maxDistance;
    let captureFailed = false;
    try {
      this.highlight(false);
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      this.composer.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      const direction = position.clone().sub(target).normalize();
      if (!this.frameContext(direction)) {
        const need = Math.max((state.settings.width * M) / this.camera.aspect, state.settings.height * M);
        const distance = need / (2 * Math.tan((this.camera.fov * Math.PI) / 360)) * 1.12 + .1;
        this.camera.position.copy(target).addScaledVector(direction, distance);
        this.camera.lookAt(target);
      }
      this.setEnvironment({ ...state, environment });
      this.renderNow();
      return this.renderer.domElement.toDataURL('image/png');
    } catch (error) {
      captureFailed = true;
      throw error;
    } finally {
      this.camera.near = near;
      this.camera.far = far;
      this.controls.maxDistance = maxDistance;
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.camera.lookAt(target);
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(size.x, size.y, false);
      this.composer.setSize(size.x, size.y);
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
      this.setEnvironment(state);
      this.highlight();
      try {
        this.renderNow();
      } catch (error) {
        // Preserve the capture error if rendering the restored preview also fails.
        if (!captureFailed) throw error;
      }
    }
  }

  export() {
    this.renderNow();
    return this.renderer.domElement.toDataURL('image/png');
  }
}
