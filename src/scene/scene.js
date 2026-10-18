import * as T from 'three';
import ClipperLib from 'clipper-lib';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { inside, bentPath, perimeter } from '../artwork/contours.js';
export const layerNames = [
  'GI rear cover',
  'Steel support frame',
  'ACP fascia',
  'Letter backs',
  'Return walls',
  'Symbolic LEDs',
  'Faces / graphics',
];
export function shapeFromRegion(region) {
  const outer = region.outer.map((p) => new T.Vector2(...p));
  if (!T.ShapeUtils.isClockWise(outer)) outer.reverse();
  const s = new T.Shape(outer);
  for (const h of region.holes) {
    let v = h.map((p) => new T.Vector2(...p));
    if (T.ShapeUtils.isClockWise(v)) v.reverse();
    s.holes.push(new T.Path(v));
  }
  return s;
}
function treeShapes(tree) {
  let out = [];
  function visit(node) {
    for (const n of node.Childs()) {
      if (!n.IsHole() && n.Contour().length >= 3) {
        out.push(
          shapeFromRegion({
            outer: n.Contour().map((p) => [p.X / 1e6, p.Y / 1e6]),
            holes: n
              .Childs()
              .filter((h) => h.IsHole())
              .map((h) => h.Contour().map((p) => [p.X / 1e6, p.Y / 1e6])),
          }),
        );
      }
      visit(n);
    }
  }
  visit(tree);
  return out;
}
export function strokeShapes(loop, gauge) {
  const C = ClipperLib;
  let p = loop.map((v) => ({ X: Math.round(v[0] * 1e6), Y: Math.round(v[1] * 1e6) }));
  if (!C.Clipper.Orientation(p)) p.reverse();
  const offsets = (d) => {
    const o = new C.ClipperOffset(2, 0.1);
    o.AddPath(p, C.JoinType.jtMiter, C.EndType.etClosedPolygon);
    const r = new C.Paths();
    o.Execute(r, d * 1e6);
    return r;
  };
  const plus = offsets(gauge / 2),
    minus = offsets(-gauge / 2),
    clip = new C.Clipper();
  clip.AddPaths(plus, C.PolyType.ptSubject, true);
  clip.AddPaths(minus, C.PolyType.ptClip, true);
  const tree = new C.PolyTree();
  clip.Execute(C.ClipType.ctDifference, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return treeShapes(tree);
}
function bandGeometry(path, gauge, depth, progress) {
  const ps = bentPath(path, progress),
    verts = [],
    indices = [];
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
    if (i) {
      const k = i * 4;
      for (const [a, b, c, d] of [
        [0, 1, 5, 4],
        [2, 6, 7, 3],
        [0, 4, 6, 2],
        [1, 3, 7, 5],
      ]) {
        const v = k - 4;
        indices.push(v + a, v + b, v + c, v + a, v + c, v + d);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
export class SignScene {
  constructor(host, onSelect) {
    this.host = host;
    this.onSelect = onSelect;
    this.renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    host.append(this.renderer.domElement);
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(35, 1, 0.01, 100);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 30;
    this.controls.target.set(0, 0, 0);
    this.controls.addEventListener('change', () => this.draw());
    this.hemi = new T.HemisphereLight(0xc9e5f0, 0x5d6253, 2);
    this.scene.add(this.hemi);
    this.sun = new T.DirectionalLight(0xfff0d6, 3);
    this.sun.position.set(-3, 5, 5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -8, right: 8, top: 5, bottom: -5, near: 0.1, far: 20 });
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.003;
    this.scene.add(this.sun);
    this.fill = new T.DirectionalLight(0xd6ecff, 1.5);
    this.fill.position.set(4, 1, 2);
    this.scene.add(this.fill);
    const env = new RoomEnvironment();
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(env, 0.04).texture;
    this.scene.environment = this.env;
    env.dispose();
    pmrem.dispose();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new T.Vector2(host.clientWidth || 800, host.clientHeight || 600),
      0.75,
      0.38,
      0.85,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.group = new T.Group();
    this.scene.add(this.group);
    this.ray = new T.Raycaster();
    let down;
    this.renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const r = this.renderer.domElement.getBoundingClientRect();
      this.ray.setFromCamera(
        new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, (-(e.clientY - r.top) / r.height) * 2 + 1),
        this.camera,
      );
      const hit = this.ray
        .intersectObjects(this.group.children, true)
        .find((h) => h.object.userData.part && h.object.visible && h.object.parent.visible);
      if (hit) this.onSelect(hit.object.userData.part);
    });
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.loop = () => {
      requestAnimationFrame(this.loop);
      this.controls.update();
    };
    this.loop();
  }
  resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.draw();
  }
  draw() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
  clear() {
    this.outline = null;
    this.forming = null;
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.userData.extraTexture) o.userData.extraTexture.dispose();
      if (o.material) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      }
    });
    this.group.clear();
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
  }
  material(color, metalness = 0, roughness = 0.5) {
    return new T.MeshStandardMaterial({ color, metalness, roughness, side: T.FrontSide });
  }
  build(state, artCanvas) {
    this.state = state;
    this.clear();
    const W = state.width / 1000,
      H = state.height / 1000,
      F = state.frame / 1000,
      GI = state.gi / 1000,
      ACP = state.acp / 1000,
      D = state.depth / 1000,
      B = state.back / 1000,
      A = state.face / 1000,
      wall = state.gauge / 1000;
    this.groups = layerNames.map((name, i) => {
      const g = new T.Group();
      g.name = name;
      g.userData.layer = i;
      this.group.add(g);
      return g;
    });
    this.layers = this.groups;
    let count = 0,
      returnLength = 0;
    const mesh = (geometry, material, layer, z, part = null) => {
      const m = new T.Mesh(geometry, material);
      m.position.z = z;
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.part = part;
      this.groups[layer].add(m);
      return m;
    };
    const box = (w, h, d, mat, layer, x, y, z) => {
      const m = mesh(new T.BoxGeometry(w, h, d), mat, layer, z);
      m.position.x = x;
      m.position.y = y;
      return m;
    };
    const steel = this.material('#606d71', 0.85, 0.3);
    box(W, H, GI, this.material('#88989c', 0.75, 0.5), 0, 0, 0, -F / 2 - GI / 2);
    const tube = (length, horizontal, x, y) => {
      const outer = [
          [-F / 2, -F / 2],
          [F / 2, -F / 2],
          [F / 2, F / 2],
          [-F / 2, F / 2],
        ],
        inner = F / 2 - state.framewall / 1000;
      const s = shapeFromRegion({
        outer,
        holes: [
          [
            [-inner, -inner],
            [-inner, inner],
            [inner, inner],
            [inner, -inner],
          ],
        ],
      });
      const g = new T.ExtrudeGeometry(s, { depth: length, bevelEnabled: false });
      g.translate(0, 0, -length / 2);
      if (horizontal) g.rotateY(Math.PI / 2);
      else g.rotateX(Math.PI / 2);
      const m = mesh(g, steel, 1, 0);
      m.position.set(x, y, 0);
    };
    tube(W, true, 0, (H - F) / 2);
    tube(W, true, 0, -(H - F) / 2);
    for (const x of [-(W - F) / 2, (W - F) / 2, -W / 6, W / 6]) tube(H - 2 * F, false, x, 0);
    box(W, H, ACP, this.material(state.boardcolor, 0.18, 0.48), 2, 0, 0, F / 2 + ACP / 2);
    const wallMesh = new T.Mesh(
      new T.PlaneGeometry(Math.max(W * 2, 10), Math.max(H * 3, 5)),
      this.material(state.night ? '#17232e' : '#bcc7ca', 0, 0.98),
    );
    wallMesh.position.z = -0.14;
    wallMesh.receiveShadow = true;
    this.group.add(wallMesh);
    this.wallMesh = wallMesh;
    const bounds = state.artBounds || [0, 0, state.imageWidth, state.imageHeight],
      bw = bounds[2] - bounds[0],
      bh = bounds[3] - bounds[1];
    const scale = Math.min((W * state.artscale) / 100 / bw, (H * 0.75) / bh),
      cx = (bounds[0] + bounds[2]) / 2,
      cy = (bounds[1] + bounds[3]) / 2;
    this.scale = scale;
    const map = (p) => [(p[0] - cx) * scale, (cy - p[1]) * scale];
    this.mapper = map;
    const base = F / 2 + ACP + 0.001;
    this.base = base;
    if (artCanvas) {
      this.texture = new T.CanvasTexture(artCanvas);
      this.texture.colorSpace = T.SRGBColorSpace;
      this.texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    }
    this.worldParts = [];
    for (const p of state.components) {
      if (p.type === 'omit' || (state.mode === 'bend' && p.id !== state.selected)) continue;
      const regions = p.regions.map((r) => ({
          outer: r.outer.map(map),
          holes: r.holes.map((h) => h.map(map)),
        })),
        shapes = regions.map(shapeFromRegion);
      if (!shapes.length) continue;
      this.worldParts.push({ id: p.id, regions });
      const faceMat = this.material(state.keepart ? '#ffffff' : state.facecolor, 0, 0.32);
      if (state.keepart && this.texture) faceMat.map = this.texture;
      if (p.type === 'front' && state.lights !== false) {
        faceMat.emissive.set(state.keepart ? '#ffffff' : state.facecolor);
        faceMat.emissiveIntensity = state.night ? 3.8 * (state.brightness ?? 1) : 0.025;
        if (state.keepart) faceMat.emissiveMap = this.texture;
      }
      const extrusion = (depth, mat, layer, z) => {
        const g = new T.ExtrudeGeometry(shapes, {
          depth,
          bevelEnabled: layer === 6 && depth >= 0.001,
          bevelSize: Math.min(0.0003, depth / 8),
          bevelThickness: Math.min(0.0002, depth / 10),
          bevelSegments: 2,
          curveSegments: 8,
        });
        if (state.keepart && this.texture && layer === 6) {
          const pos = g.attributes.position,
            uv = g.attributes.uv;
          for (let i = 0; i < pos.count; i++) {
            const px = pos.getX(i) / scale + cx,
              py = cy - pos.getY(i) / scale;
            uv.setXY(i, px / state.imageWidth, 1 - py / state.imageHeight);
          }
          uv.needsUpdate = true;
        }
        return mesh(g, mat, layer, z, p.id);
      };
      if (p.type === 'front' || p.type === 'halo') {
        extrusion(B, this.material('#75878c', 0.05, 0.8), 3, base);
        for (const r of regions)
          for (const loop of [r.outer, ...r.holes]) {
            returnLength += perimeter(loop);
            const shapes = strokeShapes(loop, wall);
            if (shapes.length) {
              const g = new T.ExtrudeGeometry(shapes, { depth: D, bevelEnabled: false });
              mesh(g, this.material('#aab9bf', 0.92, 0.25), 4, base + B, p.id);
            }
          }
        const fm = p.type === 'halo' ? this.material('#bdc8c9', 0.9, 0.25) : faceMat;
        extrusion(A, fm, 6, base + B + D);
        for (const r of regions) {
          const xs = r.outer.map((v) => v[0]),
            ys = r.outer.map((v) => v[1]),
            minx = Math.min(...xs),
            maxx = Math.max(...xs),
            miny = Math.min(...ys),
            maxy = Math.max(...ys);
          const grid = 0.085;
          for (let y = miny + Math.min(grid / 2, (maxy - miny) / 2); y < maxy; y += grid) {
            for (let x = minx + Math.min(grid / 2, (maxx - minx) / 2); x < maxx; x += grid) {
              if (count >= 360) break;
              if (inside([x, y], r.outer) && !r.holes.some((h) => inside([x, y], h))) {
                const m = box(
                  0.021,
                  0.009,
                  0.007,
                  this.material('#e7eee4', 0, 0.4),
                  5,
                  x,
                  y,
                  base + B + 0.004,
                );
                m.userData.part = p.id;
                const lens = mesh(
                  new T.SphereGeometry(0.003, 6, 4),
                  this.material('#fff5cc', 0, 0.2),
                  5,
                  base + B + 0.009,
                  p.id,
                );
                lens.scale.set(1, 1, 0.5);
                lens.position.x = x;
                lens.position.y = y;
                count++;
              }
            }
          }
          if (p.type === 'halo' && state.night && state.lights !== false) {
            const width = maxx - minx + 0.1,
              height = maxy - miny + 0.1,
              c = document.createElement('canvas');
            c.width = 256;
            c.height = Math.max(32, Math.round((256 * height) / width));
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#fff1b8';
            ctx.shadowColor = '#fff1b8';
            ctx.shadowBlur = 15;
            ctx.beginPath();
            const path = (loop) =>
              loop.forEach((v, i) => {
                const x = ((v[0] - minx + 0.05) / width) * c.width,
                  y = ((maxy + 0.05 - v[1]) / height) * c.height;
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
            const m = mesh(
              new T.PlaneGeometry(width, height),
              new T.MeshBasicMaterial({
                map: tex,
                transparent: true,
                opacity: 0.8,
                depthWrite: false,
                toneMapped: false,
              }),
              3,
              base - 0.0001,
              p.id,
            );
            m.position.set((minx + maxx) / 2, (miny + maxy) / 2, base - 0.0001);
            m.userData.extraTexture = tex;
          }
        }
      } else if (p.type === 'metal') {
        extrusion(A, this.material('#b8c8cf', 0.95, 0.22), 6, base);
      } else if (p.type === 'acplogo') {
        extrusion(ACP, faceMat, 6, base + 0.01);
      } else if (p.type === 'vinyl') {
        extrusion(0.00015, faceMat, 6, base);
      } else {
        extrusion(A, faceMat, 6, base);
      }
    }
    this.ledcount = count;
    this.returnLength = returnLength;
    this.spillLights = [];
    if (state.night && state.lights !== false && state.mode !== 'bend') {
      const lit = state.components.filter((p) => p.type === 'front' || p.type === 'halo');
      const bins = new Map();
      for (const p of lit) {
        const x = (p.bounds[0] + p.bounds[2]) / 2,
          y = (p.bounds[1] + p.bounds[3]) / 2;
        const pos = map([x, y]),
          bin = Math.round(((pos[0] + W / 2) / W) * 5);
        if (!bins.has(bin)) bins.set(bin, { x: pos[0], y: pos[1] });
      }
      for (const pos of bins.values()) {
        const light = new T.PointLight('#ffdcac', 0.4 * (state.brightness ?? 1), Math.max(0.7, H * 1.3), 2);
        light.position.set(pos.x, pos.y, base + B + D + 0.16);
        light.userData.spill = true;
        this.groups[5].add(light);
        this.spillLights.push(light);
      }
    }
    this.setNight(state.night);
    this.setVisibility(state);
    if (state.mode === 'bend') this.buildBend(state);
    this.draw();
  }
  setNight(n) {
    this.scene.background = new T.Color(n ? '#101925' : '#d1d9d9');
    this.scene.environmentIntensity = n ? 0.045 : 0.65;
    this.hemi.intensity = n ? 0.13 : 0.85;
    this.sun.intensity = n ? 0.1 : 2.15;
    this.fill.intensity = n ? 0.12 : 0.8;
    this.renderer.toneMappingExposure = n ? 1.05 : 1.05;
    if (this.bloom) {
      this.bloom.enabled = n && this.state?.lights !== false && this.state?.mode !== 'bend';
      this.bloom.strength = 0.65 * (this.state?.brightness ?? 1);
      this.bloom.radius = 0.4;
      this.bloom.threshold = 0.8;
    }
    this.draw();
  }
  setVisibility(s) {
    this.groups.forEach((g, i) => {
      g.visible = s.step >= i + 1 && s.layers[i] !== false;
      g.position.z = (s.explode / 100) * i * 0.16;
      g.children.forEach((o) => (o.visible = true));
    });
    if (s.isolate && s.selected) {
      this.groups.forEach((g, i) => {
        g.visible = i >= 3 && s.step >= i + 1 && s.layers[i] !== false;
        g.children.forEach((o) => (o.visible = o.userData.part === s.selected));
      });
    }
    this.highlight(s.selected);
    this.draw();
  }
  highlight(id) {
    if (this.outline) {
      this.group.remove(this.outline);
      this.outline.geometry.dispose();
      this.outline.material.dispose();
      this.outline = null;
    }
    if (
      !id ||
      this.state?.mode === 'bend' ||
      this.state?.presentation ||
      this.state?.selectionActive === false
    )
      return;
    const part = this.worldParts?.find((p) => p.id === id);
    if (!part) return;
    let top = -Infinity;
    for (const layer of this.groups) {
      if (!layer.visible) continue;
      for (const o of layer.children) {
        if (o.visible && o.userData.part === id) {
          const box = new T.Box3().setFromObject(o);
          top = Math.max(top, box.max.z);
        }
      }
    }
    if (!Number.isFinite(top)) return;
    const g = new T.BufferGeometry(),
      vs = [];
    for (const r of part.regions)
      for (const loop of [r.outer, ...r.holes])
        for (let i = 0; i < loop.length; i++)
          vs.push(...loop[i], top + 0.001, ...loop[(i + 1) % loop.length], top + 0.001);
    g.setAttribute('position', new T.Float32BufferAttribute(vs, 3));
    this.outline = new T.LineSegments(
      g,
      new T.LineBasicMaterial({ color: '#efb367', depthTest: false, transparent: true, opacity: 0.8 }),
    );
    this.outline.renderOrder = 10;
    this.group.add(this.outline);
  }
  buildBend(s) {
    this.groups.forEach((g) => (g.visible = false));
    if (this.outline) {
      this.group.remove(this.outline);
      this.outline = null;
    }
    const p = this.worldParts.find((p) => p.id === s.selected);
    if (!p) return;
    const forming = new T.Group();
    forming.name = 'forming';
    this.group.add(forming);
    this.forming = forming;
    for (const r of p.regions)
      for (const loop of [r.outer, ...r.holes]) {
        const g = bandGeometry(loop, s.gauge / 1000, s.depth / 1000, s.bend / 100);
        const m = new T.Mesh(g, this.material('#c0cbd0', 0.88, 0.27));
        m.position.z = this.base;
        forming.add(m);
        const pts = [...loop, loop[0]].map((v) => new T.Vector3(v[0], v[1], this.base - 0.005));
        forming.add(
          new T.Line(
            new T.BufferGeometry().setFromPoints(pts),
            new T.LineBasicMaterial({ color: '#d58d49', transparent: true, opacity: 0.65 }),
          ),
        );
      }
    this.draw();
  }
  fit(kind = 'perspective') {
    const s = this.state;
    if (!s) return;
    const W = s.width / 1000,
      H = s.height / 1000;
    let center = new T.Vector3(0, 0, 0.035 + (s.explode / 100) * 0.4),
      w = W,
      h = H,
      depth = 0.12 + (s.explode / 100) * 0.96;
    if (s.mode === 'bend' && this.forming) {
      const b = new T.Box3().setFromObject(this.forming);
      b.getCenter(center);
      const size = b.getSize(new T.Vector3());
      w = Math.max(size.x, 0.3);
      h = Math.max(size.y, 0.3);
      depth = size.z;
    }
    if (s.isolate && s.mode !== 'bend') {
      const bounds = new T.Box3();
      for (const layer of this.groups) {
        if (!layer.visible) continue;
        for (const obj of layer.children)
          if (obj.visible && obj.userData.part === s.selected) bounds.expandByObject(obj);
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
    if (kind === 'front') this.camera.position.copy(center).add(new T.Vector3(0, 0, dist));
    else if (kind === 'rear')
      this.camera.position.copy(center).add(new T.Vector3(-dist * 0.12, dist * 0.12, -dist));
    else this.camera.position.copy(center).add(new T.Vector3(dist * 0.17, dist * 0.115, dist));
    this.camera.lookAt(center);
    this.controls.update();
    this.draw();
  }

  export() {
    this.draw();
    return this.renderer.domElement.toDataURL('image/png');
  }
}
