import { panelIntegrated } from '../domain/recipes.ts';
import * as T from 'three';
import { WebGLPathTracer, GradientEquirectTexture } from 'three-gpu-pathtracer';
import { SignScene } from '../scene/scene.ts';
import { addHaloEmitters, prepareFinalCoatings } from '../scene/signMaterials.ts';
import { preparePresentationEnvironment } from '../scene/presentationEnvironment.ts';
import { presentationCamera } from './cameras.ts';
import { accumulateSamples, renderDimensions, type RenderOptions } from './renderAdapter.ts';
import { canvasBlob } from './pageCanvas.ts';
import { loadImage } from '../artwork/import.ts';
import { explodedLabels, labelledExplodedCanvas } from './explodedLabels.ts';
import type { PresentationSnapshot } from './snapshot.ts';
import { boardCorners, composite, type Pt } from './site.ts';
export class FinalRenderer {
  private scene: SignScene | null = null;
  private host: HTMLDivElement | null = null;
  private active = false;
  dispose() {
    this.scene?.dispose();
    this.scene = null;
    this.host?.remove();
    this.host = null;
  }
  async render(
    snapshot: PresentationSnapshot,
    options: RenderOptions,
    quality: 'preview' | 'final' = 'final',
  ) {
    if (this.active) throw Error('Another render is running. Wait or cancel it.');
    this.active = true;
    let tracer: WebGLPathTracer | undefined, environment: T.Texture | undefined;
    const { signal, onProgress } = options,
      { shot, input, design } = snapshot;
    try {
      signal.throwIfAborted();
      onProgress({ label: 'Preparing geometry and materials…' });
      if (!this.scene) {
        this.host = document.createElement('div');
        this.scene = new SignScene(
          this.host,
          () => {},
          (message) => {
            throw Error(message);
          },
          { offscreen: true },
        );
      }
      const v = this.scene;
      // Every job owns and releases its WebGL context, geometry and materials.
      let art: HTMLCanvasElement | null = null;
      if (design.artwork?.imageData) {
        const image = await loadImage(design.artwork.imageData);
        signal.throwIfAborted();
        art = document.createElement('canvas');
        art.width = design.artwork.imageWidth;
        art.height = design.artwork.imageHeight;
        art.getContext('2d')!.drawImage(image, 0, 0);
      }
      v.build(input, art);
      v.highlight(false);
      if (quality === 'final') prepareFinalCoatings(v.group);
      const remove: T.Mesh[] = [];
      v.group.traverse((o) => {
        if (!(o instanceof T.Mesh)) return;
        if (o.userData.extraTexture) {
          if (quality === 'final') remove.push(o);
          return;
        }
        const materials = [o.material].flat();
        for (const m of materials) {
          if (!(m instanceof T.MeshStandardMaterial)) continue;
          if (m.transparent) {
            m.transparent = false;
            m.opacity = 1;
            if (m instanceof T.MeshPhysicalMaterial) {
              m.transmission = 0.85;
              m.ior = 1.49;
            } else {
              const glass = new T.MeshPhysicalMaterial({
                color: m.color,
                roughness: 0.12,
                transmission: 0.85,
                ior: 1.49,
                thickness: 0.005,
              });
              o.material = glass;
              m.dispose();
            }
          }
        }
      });
      for (const m of remove) {
        m.removeFromParent();
        m.geometry.dispose();
        for (const mat of [m.material].flat()) mat.dispose();
        (m.userData.extraTexture as T.Texture).dispose();
      }
      if (quality === 'final' && shot.camera.preset !== 'exploded') addHaloEmitters(v.group, input);
      preparePresentationEnvironment(v, shot.scene, shot);
      const isNight = shot.environment === 'night',
        isDusk = shot.environment === 'dusk';
      const env = new GradientEquirectTexture(256);
      env.topColor.set(isNight ? '#9eacbf' : isDusk ? '#d9b4a0' : '#dce8f7');
      env.bottomColor.set(isNight ? '#647387' : '#8d969e');
      env.update();
      environment = env;
      const daylightScale = isNight ? 1 : isDusk ? 1.6 : 6;
      v.scene.environment = env;
      v.scene.environmentIntensity = (isNight ? 0.4 : isDusk ? 0.7 : 1.4) * daylightScale;
      v.scene.background = new T.Color(
        shot.scene.kind === 'studio' || shot.camera.preset === 'exploded'
          ? isNight
            ? '#202c3b'
            : '#e0e4e5'
          : isNight
            ? '#192531'
            : isDusk
              ? '#777483'
              : '#c9d8e3',
      );
      v.sun.visible = v.hemi.visible = v.fill.visible = false;
      v.scenery!.roomLight.visible = false;
      const key = new T.RectAreaLight(
        isDusk ? '#ffd4a0' : '#fff1dc',
        (isNight ? 2.5 : isDusk ? 4 : 7) * daylightScale,
        4,
        3,
      );
      key.position.set(-2, 4, 4);
      key.lookAt(0, 0, 0);
      v.scene.add(key);
      const fill = new T.RectAreaLight('#d5e4f5', (isNight ? 0.5 : 2) * daylightScale, 3, 4);
      fill.position.set(4, 1, 3);
      fill.lookAt(0, 0, 0);
      v.scene.add(fill);
      const bounds =
        shot.scene.kind === 'studio'
          ? new T.Box3().setFromObject(v.group)
          : v.scenery!.frameBounds.clone();
      const site = shot.site && (await sitePlan(shot, quality, bounds));
      signal.throwIfAborted();
      if (site) {
        // Only the sign renders, front-on and exactly board-sized, over a transparent background.
        v.scenery!.group.visible = false;
        v.scene.background = null;
        v.renderer.setClearColor(0x000000, 0);
      }
      const camera = site?.camera ?? presentationCamera(bounds, shot.camera, shot.aspect);
      const { width, height } =
        site?.render ?? renderDimensions(quality === 'final' ? shot.width : 1000, shot.aspect);
      const renderer = v.renderer;
      if (Math.max(width, height) > renderer.capabilities.maxTextureSize)
        throw Error('This device cannot render that size. Choose 2400 px or a wider frame.');
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      // Khronos PBR Neutral keeps material colours true (AgX lifted dark colours and washed them
      // out, which made signs look faded beside a real photo).
      renderer.toneMapping = T.NeutralToneMapping;
      renderer.toneMappingExposure =
        ((isNight ? 1.3 : isDusk ? 1 : 0.75) * 2 ** shot.exposureEV) / daylightScale;
      signal.throwIfAborted();
      if (quality === 'preview') {
        onProgress({ label: 'Rendering preview…' });
        renderer.render(v.scene, camera);
      } else {
        tracer = new WebGLPathTracer(renderer);
        tracer.tiles.set(3, 3);
        tracer.bounces = 6;
        tracer.filterGlossyFactor = 0.5;
        tracer.renderDelay = 0;
        tracer.fadeDuration = 0;
        tracer.minSamples = 1;
        tracer.rasterizeScene = false;
        tracer.setScene(v.scene, camera);
        await accumulateSamples(
          {
            get samples() {
              return tracer!.samples;
            },
            renderSample: () => tracer!.renderSample(),
            isContextLost: () => renderer.getContext().isContextLost(),
          },
          512,
          signal,
          onProgress,
        );
        // A complete sample fills every tile; render once more to present the current target.
        tracer.pausePathTracing = true;
        tracer.renderSample();
      }
      signal.throwIfAborted();
      onProgress({ fraction: 1, label: 'Encoding image…' });
      const output = site
        ? site.paint(renderer.domElement, isNight)
        : shot.camera.preset === 'exploded'
          ? await labelledExplodedCanvas(
              renderer.domElement,
              explodedLabels(
                v.layers,
                camera,
                input.layout.elements.some((e) => panelIntegrated(e.type)),
              ),
            )
          : renderer.domElement;
      const blob = await canvasBlob(output);
      signal.throwIfAborted();
      return { blob, width: output.width, height: output.height };
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') this.dispose();
      throw error;
    } finally {
      tracer?.dispose();
      environment?.dispose();
      this.dispose();
      this.active = false;
    }
  }
}

// Site mockup: the output is the photo; the board render is sized to how large it appears there.
async function sitePlan(shot: PresentationSnapshot['shot'], quality: 'preview' | 'final', bounds: T.Box3) {
  const { photo, corners, wall, board } = shot.site!;
  const image = await loadImage(photo),
    long = quality === 'final' ? shot.width : 1000,
    aspect = image.naturalWidth / image.naturalHeight,
    out = aspect >= 1 ? [long, Math.round(long / aspect)] : [Math.round(long * aspect), long];
  const quad = boardCorners(
    corners.map(([x, y]): Pt => [x * out[0], y * out[1]]),
    wall,
    board,
  );
  const across = Math.max(Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]), Math.hypot(quad[2][0] - quad[3][0], quad[2][1] - quad[3][1]));
  // Twice the on-photo size, so the composite samples down; capped for the GPU.
  let rw = Math.min(4096, Math.max(64, Math.round(across * 2))),
    rh = Math.round((rw * board[1]) / board[0]);
  if (rh > 4096) [rw, rh] = [Math.round((rw * 4096) / rh), 4096];
  const [W, H] = [board[0] / 1000, board[1] / 1000],
    depth = Math.max(0.1, bounds.max.z - bounds.min.z);
  const camera = new T.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0.01, depth + 2);
  camera.position.set(0, 0, bounds.max.z + 1);
  camera.lookAt(0, 0, bounds.max.z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return {
    camera,
    render: { width: rw, height: Math.max(8, rh) },
    paint(rendered: HTMLCanvasElement, night: boolean) {
      const canvas = document.createElement('canvas');
      [canvas.width, canvas.height] = out;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0, out[0], out[1]);
      if (night) {
        // ponytail: a flat dusk wash over a daytime photo; real night photos look better.
        ctx.fillStyle = 'rgba(8, 16, 34, 0.68)';
        ctx.fillRect(0, 0, out[0], out[1]);
      }
      const sign = document.createElement('canvas');
      [sign.width, sign.height] = [rendered.width, rendered.height];
      const sctx = sign.getContext('2d', { willReadFrequently: true })!;
      sctx.drawImage(rendered, 0, 0);
      const dst = ctx.getImageData(0, 0, out[0], out[1]);
      composite(dst, sctx.getImageData(0, 0, sign.width, sign.height), quad);
      ctx.putImageData(dst, 0, 0);
      return canvas;
    },
  };
}
