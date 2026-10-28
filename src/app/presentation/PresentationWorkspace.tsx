import { useEffect, useId, useMemo, useState } from 'react';
import { useApp, useDesign, useView, setPresentation, getState } from '../store.ts';
import { viewer } from '../actions.ts';
import {
  updateShot,
  validatePresentation,
  type BookletPage,
  type Shot,
} from '../../presentation/model.ts';
import { layoutBooklet } from '../../presentation/pageLayout.ts';
import { loadBookletFont, type BookletFont } from '../../presentation/bookletFont.ts';
import { usePresentationRenders } from './usePresentationRenders.ts';
import { RenderSetup } from './RenderSetup.tsx';
import { ShotList } from './ShotList.tsx';
import { BookletEditor } from './BookletEditor.tsx';
import { PagePreview } from './PagePreview.tsx';
import { ExportDialog } from './ExportDialog.tsx';
import { OptionsEditor } from './OptionsEditor.tsx';
import { PageSelection } from './PageSelection.tsx';
import type { SiteSlide } from '../../presentation/site.ts';
import { addSiteSlides, readSiteFile, SiteSetup, SiteStage, SlidePicker } from './SiteMockup.tsx';
import { selectedShots } from '../../presentation/selection.ts';
import { duplicateOption, removeOption } from '../../presentation/options.ts';
import './presentation.css';
import './options.css';
export function PresentationWorkspace() {
  const config = useApp((s) => s.presentation),
    design = useDesign(),
    view = useView(),
    renders = usePresentationRenders();
  const [step, setStep] = useState<'prepare' | 'build' | 'export'>('prepare'),
    [selectedShot, setSelectedShot] = useState(config.shots[0]?.id ?? ''),
    [selectedPage, setSelectedPage] = useState(config.pages[0]?.id ?? ''),
    [pageIndex, setPageIndex] = useState(0),
    [font, setFont] = useState<BookletFont>(),
    [error, setError] = useState(''),
    [fontRetry, setFontRetry] = useState(0);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [siteSlides, setSiteSlides] = useState<SiteSlide[] | null>(null);
  const [siteNote, setSiteNote] = useState(''),
    siteInput = useId();
  const batch = selectedShots(config, batchIds);
  const shot = config.shots.find((s) => s.id === selectedShot) ?? config.shots[0];
  const option = config.options.find((o) => o.id === shot?.optionId) ?? config.options[0];
  const copyOption = () => {
    try {
      const id = crypto.randomUUID(),
        next = duplicateOption(config, option.id, id);
      setPresentation(next);
      setSelectedShot(next.shots.find((s) => s.optionId === id)?.id ?? selectedShot);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    let live = true;
    loadBookletFont()
      .then((f) => {
        if (live) {
          setFont(f);
          setError('');
        }
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [fontRetry]);
  const layout = useMemo(() => {
    if (!font) return { pages: [], error: '' };
    try {
      return {
        pages: layoutBooklet(config, design, font.measure, view.unit ?? 'mm'),
        error: '',
      };
    } catch (e) {
      return { pages: [], error: (e as Error).message };
    }
  }, [config, design, font, view.unit]);
  const images = useMemo(
    () => Object.fromEntries(Object.entries(renders.assets).map(([id, a]) => [id, a.url])),
    [renders.assets],
  );
  const page = layout.pages[Math.min(pageIndex, layout.pages.length - 1)];
  const includedShots = () => {
    const ids = new Set(
      config.pages.filter((p) => p.included && p.kind === 'render').map((p) => p.shotId),
    );
    for (const p of layout.pages)
      for (const i of p.items) if (i.kind === 'image') ids.add(i.shotId);
    return config.shots.filter((s) => ids.has(s.id));
  };
  useEffect(() => {
    if (!shot || step !== 'prepare' || renders.busy || renders.hashing || renders.errors[shot.id])
      return;
    const asset = renders.assets[shot.id];
    if (asset?.key === renders.keys[shot.id]) return;
    const timer = setTimeout(() => void renders.render([shot], 'preview'), 400);
    return () => clearTimeout(timer);
  }, [
    shot,
    step,
    design,
    renders.busy,
    renders.hashing,
    renders.assets,
    renders.keys,
    renders.errors,
  ]);
  const asset = shot && renders.assets[shot.id],
    stale = !!asset && asset.key !== renders.keys[shot.id];
  const change = (patch: Partial<Shot>) => {
    if (shot) setPresentation(updateShot(config, shot.id, patch));
  };
  const custom = () => {
    const v = viewer.current;
    if (v && shot)
      change({
        camera: {
          preset: 'custom',
          position: v.camera.position.toArray() as [number, number, number],
          target: v.controls.target.toArray() as [number, number, number],
        },
      });
  };
  const addShot = (dusk = false) => {
    if (!shot || config.shots.length >= 100 || config.pages.length >= 100) return;
    const id = crypto.randomUUID(),
      copy: Shot = {
        ...structuredClone(shot),
        id,
        name: dusk ? 'Installed · Dusk' : `${shot.name} copy`,
        environment: dusk ? 'dusk' : shot.environment,
        pairId: undefined,
      };
    const p: BookletPage = {
      id: `page-${id}`,
      kind: 'render',
      included: true,
      shotId: id,
      caption: copy.name,
      dimensions: false,
      materials: false,
    };
    setPresentation({
      ...config,
      shots: [...config.shots, copy],
      pages: [...config.pages, p],
    });
    setSelectedShot(id);
  };
  async function logo(file: File) {
    try {
      if (file.size > 1048576 || !['image/png', 'image/jpeg'].includes(file.type))
        throw Error('Choose a PNG or JPG logo smaller than 1 MiB.');
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(Error('Logo could not load.'));
        r.readAsDataURL(file);
      });
      const image = new Image();
      image.src = data;
      await image.decode();
      if (image.width * image.height > 16e6)
        throw Error('Logo is too large. Use an image under 16 megapixels.');
      const current = getState().presentation,
        next = {
          ...current,
          metadata: { ...current.metadata, logoData: data },
        },
        check = validatePresentation(next);
      if (check.warnings.length)
        throw Error('Logo could not be saved. Choose a smaller PNG or JPG.');
      setPresentation(next);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function addSites(slides: SiteSlide[]) {
    try {
      const r = await addSiteSlides(slides, getState().presentation, design, option.id);
      setPresentation(r.next);
      setSelectedShot(r.first);
      setSiteNote(r.note);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }
  const removeShot = (id: string) => {
    const next = {
      ...config,
      shots: config.shots.filter((s) => s.id !== id),
      pages: config.pages.filter((p) => p.shotId !== id),
    };
    setPresentation(next);
    setSelectedShot(next.shots.find((s) => s.optionId === option.id)?.id ?? next.shots[0]?.id ?? '');
  };
  const metadata = (
    <section className="booklet-metadata">
      <div className="booklet-section-label">PROJECT DETAILS</div>
      <h2>Make it yours.</h2>
      {(['project', 'client', 'revision'] as const).map((k) => (
        <label key={k}>
          {k[0].toUpperCase() + k.slice(1)}
          <input
            value={config.metadata[k]}
            maxLength={200}
            onChange={(e) =>
              setPresentation({
                ...config,
                metadata: { ...config.metadata, [k]: e.target.value },
              })
            }
          />
        </label>
      ))}
      <label>
        Client notes
        <textarea
          rows={5}
          maxLength={4000}
          value={config.metadata.notes}
          onChange={(e) =>
            setPresentation({
              ...config,
              metadata: { ...config.metadata, notes: e.target.value },
            })
          }
        />
      </label>
      {(['branding', 'projectInfo', 'notes'] as const).map((k) => (
        <label className="booklet-check" key={k}>
          <input
            type="checkbox"
            checked={config.include[k]}
            onChange={(e) =>
              setPresentation({
                ...config,
                include: { ...config.include, [k]: e.target.checked },
              })
            }
          />
          {k === 'projectInfo'
            ? 'Include project information'
            : k === 'branding'
              ? 'Include branding'
              : 'Include notes'}
        </label>
      ))}
      <label>
        Brand logo · PNG / JPG
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void logo(f);
          }}
        />
      </label>
      {config.metadata.logoData && (
        <button
          onClick={() =>
            setPresentation({
              ...config,
              metadata: { ...config.metadata, logoData: undefined },
            })
          }
        >
          Use Kirat Creations branding
        </button>
      )}
    </section>
  );
  return (
    <section className="client-workspace" aria-label="Client presentation">
      {siteSlides && (
        <SlidePicker
          slides={siteSlides}
          onClose={() => setSiteSlides(null)}
          onAdd={(chosen) => {
            setSiteSlides(null);
            void addSites(chosen);
          }}
        />
      )}
      <input
        id={siteInput}
        type="file"
        hidden
        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png"
        disabled={renders.busy}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const slides = await readSiteFile(f);
            // A deck with several slides: let the user choose which to show.
            if (slides.length > 1) setSiteSlides(slides);
            else await addSites(slides);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      />
      <div className="booklet-heading">
        <div>
          <span className="booklet-section-label">CLIENT PRESENTATION</span>
          <h1>{config.metadata.project || 'Sign proposal'}</h1>
        </div>
        <nav aria-label="Presentation steps">
          {(['prepare', 'build', 'export'] as const).map((s, i) => (
            <button
              className={step === s ? 'active' : ''}
              key={s}
              onClick={() => setStep(s)}
              aria-current={step === s ? 'step' : undefined}
            >
              <small>0{i + 1}</small>
              {s === 'prepare' ? 'Prepare renders' : s === 'build' ? 'Build booklet' : 'Export'}
            </button>
          ))}
        </nav>
        <span className="booklet-page-count">{layout.pages.length} pages</span>
      </div>
      <div className="booklet-body">
        <aside className="booklet-left">
          {step === 'prepare' ? (
            <>
              <label>
                Design option
                <select
                  value={option.id}
                  onChange={(e) =>
                    setSelectedShot(
                      config.shots.find((s) => s.optionId === e.target.value)?.id ?? '',
                    )
                  }
                >
                  {config.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="booklet-buttons">
                <button disabled={config.options.length >= 12 || renders.busy} onClick={copyOption}>
                  ＋ Duplicate option
                </button>
                <button
                  disabled={config.options.length <= 1 || renders.busy}
                  onClick={() => {
                    if (confirm(`Remove ${option.name} and its render pages from this proposal?`)) {
                      const next = removeOption(config, option.id);
                      setPresentation(next);
                      setSelectedShot(next.shots[0]?.id ?? '');
                    }
                  }}
                >
                  Remove option & pages
                </button>
              </div>
              <div className="booklet-section-label">ON SITE</div>
              <label className="site-upload" htmlFor={siteInput}>
                ＋ Site photo or recce PPT
                <small>See the sign on the real wall · .pptx, JPG or PNG</small>
              </label>
              {siteNote && <p className="booklet-hint">{siteNote}</p>}
              <div className="booklet-section-label">VIEWS & LIGHTING</div>
              <div className="booklet-buttons">
                <button
                  disabled={renders.busy}
                  onClick={() =>
                    setBatchIds((ids) => [
                      ...new Set([
                        ...ids,
                        ...config.shots.filter((s) => s.optionId === option.id).map((s) => s.id),
                      ]),
                    ])
                  }
                >
                  Select all views in option
                </button>
                <button disabled={renders.busy || !batch.length} onClick={() => setBatchIds([])}>
                  Clear selection
                </button>
              </div>
              <p className="booklet-hint">
                {batch.length} selected across options · renders queue one at a time.
              </p>
              <ShotList
                shots={config.shots.filter((s) => s.optionId === option.id)}
                selected={shot?.id ?? ''}
                onSelect={setSelectedShot}
                assets={renders.assets}
                keys={renders.keys}
                errors={renders.errors}
                checked={batchIds}
                onCheck={(id, checked) =>
                  setBatchIds((ids) =>
                    checked ? [...new Set([...ids, id])] : ids.filter((s) => s !== id),
                  )
                }
                disabled={renders.busy}
              />
              <div className="booklet-buttons">
                <button disabled={!shot || config.shots.length >= 100} onClick={() => addShot()}>
                  ＋ Duplicate view
                </button>
                <button
                  disabled={!shot || config.shots.length >= 100}
                  onClick={() => addShot(true)}
                >
                  ＋ Dusk view
                </button>
              </div>
            </>
          ) : step === 'build' ? (
            <BookletEditor
              config={config}
              onChange={setPresentation}
              selected={selectedPage}
              onSelect={(id) => {
                setSelectedPage(id);
                const i = layout.pages.findIndex((p) => p.id === id);
                if (i >= 0) setPageIndex(i);
              }}
            />
          ) : (
            <PageSelection config={config} onChange={setPresentation} disabled={renders.busy} />
          )}
        </aside>
        <main className="booklet-stage">
          {step === 'prepare' ? (
            <>
              <div className="booklet-stage-caption">
                <b>{shot?.name ?? 'Choose a view'}</b>
                <span>
                  {stale
                    ? 'Outdated · render again'
                    : asset?.quality === 'final'
                      ? 'Final render'
                      : asset
                        ? 'Fast preview'
                        : 'Preparing preview'}
                </span>
              </div>
              <div className="booklet-render-image">
                {shot?.site ? (
                  <SiteStage
                    key={shot.id}
                    shot={shot}
                    image={asset?.url}
                    onCorners={(corners) => change({ site: { ...shot.site!, corners } })}
                  />
                ) : asset ? (
                  <img src={asset.url} alt={`${shot?.name} signage ${asset.quality}`} />
                ) : (
                  <div className="booklet-empty">
                    <span>◇</span>
                    <h2>Your sign, in context.</h2>
                    <p>
                      {renders.busy
                        ? 'Preparing the first image…'
                        : 'Choose a view, then preview or render it.'}
                    </p>
                  </div>
                )}
              </div>
              {stale && (
                <p className="booklet-outdated">
                  Settings changed. This image shows an earlier version.
                </p>
              )}
              {shot && renders.errors[shot.id] && (
                <p className="booklet-error" role="alert">
                  {renders.errors[shot.id]}
                </p>
              )}
              <div className="booklet-render-actions">
                <button
                  disabled={!shot || renders.busy}
                  onClick={() => shot && void renders.render([shot], 'preview')}
                >
                  Fast preview
                </button>
                <button
                  className="booklet-primary"
                  disabled={!shot || renders.busy}
                  onClick={() => shot && void renders.render([shot], 'final')}
                >
                  Render this view
                </button>
                <button
                  disabled={renders.busy || !batch.length}
                  onClick={() => void renders.render(batch, 'final')}
                >
                  Render selected ({batch.length})
                </button>
                <button
                  disabled={renders.busy || !includedShots().length}
                  onClick={() => void renders.render(includedShots(), 'final')}
                >
                  Render booklet views
                </button>
                <label className="site-upload-button" htmlFor={siteInput}>
                  ＋ Site photo / PPT
                </label>
              </div>
              <p className="booklet-hint">
                Final renders calculate light and reflections progressively. Timing depends on your
                device. Concept visualisation; lighting is not calibrated.
              </p>
            </>
          ) : (
            <>
              <div className="booklet-stage-caption">
                <b>Booklet preview</b>
                <span>A4 landscape</span>
              </div>
              {font ? (
                <PagePreview
                  page={page}
                  font={font}
                  images={images}
                  draft={
                    !!page?.shotId &&
                    (renders.assets[page.shotId]?.quality !== 'final' ||
                      renders.assets[page.shotId]?.key !== renders.keys[page.shotId])
                  }
                />
              ) : (
                <p>Loading booklet font…</p>
              )}
              {!layout.pages.length && (
                <p className="booklet-empty">Include a page to start your booklet.</p>
              )}
              <div className="booklet-pagination">
                <button disabled={pageIndex <= 0} onClick={() => setPageIndex((v) => v - 1)}>
                  ← Previous
                </button>
                <span>
                  {layout.pages.length ? Math.min(pageIndex + 1, layout.pages.length) : 0} /{' '}
                  {layout.pages.length}
                </span>
                <button
                  disabled={pageIndex >= layout.pages.length - 1}
                  onClick={() => setPageIndex((v) => v + 1)}
                >
                  Next →
                </button>
              </div>
              <p className="booklet-hint">
                Blank image areas need a render. Preview labels and editor controls are excluded
                from your exported pages.
              </p>
            </>
          )}
        </main>
        <aside className="booklet-right">
          {step === 'prepare' && shot ? (
            <>
              {shot.site && (
                <SiteSetup
                  shot={shot}
                  onChange={change}
                  onRemove={() => {
                    if (confirm(`Remove ${shot.name} and its booklet page?`)) removeShot(shot.id);
                  }}
                />
              )}
              <OptionsEditor
                key={option.id}
                option={option}
                design={design}
                onChange={(next) =>
                  setPresentation({
                    ...config,
                    options: config.options.map((o) => (o.id === next.id ? next : o)),
                  })
                }
              />
              {!shot.site && (
                <details className="shot-settings-details" open>
                  <summary>Camera, scene & lighting</summary>
                  <RenderSetup shot={shot} onChange={change} onCustom={custom} />
                </details>
              )}
            </>
          ) : step === 'build' ? (
            metadata
          ) : font ? (
            <ExportDialog
              pages={layout.pages}
              font={font}
              assets={renders.assets}
              keys={renders.keys}
              hashing={renders.hashing}
              renderBusy={renders.busy}
              onRerender={() => {
                setStep('prepare');
                void renders.render(includedShots(), 'final');
              }}
            />
          ) : (
            <p>Loading export tools…</p>
          )}
        </aside>
      </div>
      {(error || layout.error) && (
        <div className="booklet-error" role="alert">
          {error || layout.error}
          {!font && <button onClick={() => setFontRetry((v) => v + 1)}>Retry font</button>}
        </div>
      )}
      {renders.warning && (
        <div className="booklet-error" role="status">
          {renders.warning}
        </div>
      )}
      {renders.busy && (
        <div className="booklet-render-progress" role="status">
          <span>{renders.progress.label || 'Preparing renders…'}</span>
          <progress value={renders.progress.fraction} max={1} />
          <button onClick={renders.cancel}>Cancel render</button>
        </div>
      )}
    </section>
  );
}
