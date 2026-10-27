import { useEffect, useRef, useState } from 'react';
import { useApp, useDesign } from '../store.ts';
import { shotFingerprint } from '../../presentation/fingerprints.ts';
import { createPresentationSnapshot } from '../../presentation/snapshot.ts';
import { RenderQueue } from '../../presentation/renderQueue.ts';
import { FinalRenderer } from '../../presentation/finalRenderer.ts';
import { renderAssets } from '../../storage/renderAssets.ts';
import type { RenderAsset } from '../../presentation/exportPackage.ts';
import type { Shot } from '../../presentation/model.ts';
export function usePresentationRenders() {
  const design = useDesign(),
    config = useApp((s) => s.presentation),
    generation = useApp((s) => s.projectGeneration);
  const [assets, setAssets] = useState<Record<string, RenderAsset>>({}),
    [keys, setKeys] = useState<Record<string, string>>({}),
    [hashing, setHashing] = useState(true);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState({ fraction: 0, label: '' }),
    [errors, setErrors] = useState<Record<string, string>>({});
  const [warning, setWarning] = useState('');
  const queue = useRef(new RenderQueue()),
    renderer = useRef<FinalRenderer | null>(null),
    urls = useRef(new Set<string>()),
    operation = useRef<AbortController | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current?.abort();
      queue.current.cancel();
      renderer.current?.dispose();
      urls.current.forEach(URL.revokeObjectURL);
      urls.current.clear();
    };
  }, []);
  useEffect(() => {
    operation.current?.abort();
    queue.current.cancel();
    setAssets({});
    setErrors({});
    setKeys({});
    urls.current.forEach(URL.revokeObjectURL);
    urls.current.clear();
  }, [generation]);
  useEffect(() => {
    let live = true;
    setHashing(true);
    (async () => {
      const pairs = await Promise.all(
        config.shots.map(async (s) => [s.id, await shotFingerprint(design, s)] as const),
      );
      if (!live) return;
      setKeys(Object.fromEntries(pairs));
      setHashing(false);
      for (const [id, key] of pairs) {
        const blob = await renderAssets.get(key);
        if (!live) return;
        if (blob) {
          setAssets((current) => {
            if (current[id]?.key === key && current[id]?.quality === 'final') return current;
            const url = URL.createObjectURL(blob);
            urls.current.add(url);
            if (current[id]) {
              URL.revokeObjectURL(current[id].url);
              urls.current.delete(current[id].url);
            }
            return { ...current, [id]: { key, url, blob, quality: 'final' } };
          });
        }
      }
      if (live) setWarning(renderAssets.warning);
    })().catch((e) => {
      if (live) {
        setWarning((e as Error).message);
        setHashing(false);
      }
    });
    return () => {
      live = false;
    };
  }, [design, config.shots, generation]);
  async function render(shots: Shot[], quality: 'preview' | 'final') {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setErrors({});
    setWarning('');
    const snapshots = shots.map((s) => createPresentationSnapshot(design, s));
    try {
      const jobs = await Promise.all(
        snapshots.map(async (snapshot) => ({
          snapshot,
          key: await shotFingerprint(snapshot.design, snapshot.shot),
        })),
      );
      renderer.current ??= new FinalRenderer();
      controller.signal.throwIfAborted();
      await queue.current.run(
        jobs,
        async (job, signal) => {
          const id = job.snapshot.shot.id;
          if (quality === 'final' && assets[id]?.key === job.key && assets[id]?.quality === 'final')
            return null;
          try {
            return await renderer.current!.render(
              job.snapshot,
              {
                signal,
                onProgress: (p) => {
                  if (mounted.current)
                    setProgress({
                      fraction: p.fraction ?? 0,
                      label: `${job.snapshot.shot.name} · ${p.label}`,
                    });
                },
              },
              quality,
            );
          } catch (e) {
            if ((e as Error).name !== 'AbortError' && mounted.current)
              setErrors((v) => ({ ...v, [id]: (e as Error).message }));
            throw e;
          }
        },
        (job, result) => {
          if (!result || !mounted.current) return;
          const url = URL.createObjectURL(result.blob);
          urls.current.add(url);
          setAssets((current) => {
            const previous = current[job.snapshot.shot.id];
            if (
              previous?.key === job.key &&
              previous.quality === 'final' &&
              quality === 'preview'
            ) {
              URL.revokeObjectURL(url);
              urls.current.delete(url);
              return current;
            }
            if (previous) {
              URL.revokeObjectURL(previous.url);
              urls.current.delete(previous.url);
            }
            return {
              ...current,
              [job.snapshot.shot.id]: {
                key: job.key,
                url,
                blob: result.blob,
                quality,
              },
            };
          });
          if (quality === 'final')
            void renderAssets.put(job.key, result.blob).then(() => {
              if (mounted.current) setWarning(renderAssets.warning);
            });
        },
        controller.signal,
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError' && mounted.current) setWarning((e as Error).message);
    } finally {
      if (operation.current === controller) operation.current = null;
      if (mounted.current) {
        setBusy(false);
        setProgress({ fraction: 0, label: '' });
      }
    }
  }
  return {
    assets,
    keys,
    hashing,
    busy,
    progress,
    errors,
    warning,
    render,
    cancel: () => {
      operation.current?.abort();
      queue.current.cancel();
    },
  };
}
