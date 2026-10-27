import { useEffect, useState } from 'react';
import { traceImage, type TraceOptions } from '../artwork/import.ts';
import { Dialog } from './Dialog.tsx';
import { applyRasterTrace } from './actions.ts';
export function TracePreview({
  image,
  initial,
  onClose,
}: {
  image: HTMLImageElement;
  initial: TraceOptions;
  onClose: () => void;
}) {
  const [options, setOptions] = useState(initial),
    [useBackground, setUseBackground] = useState(true);
  const [result, setResult] = useState<ReturnType<typeof traceImage>>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    setBusy(true);
    const timer = setTimeout(() => {
      try {
        setResult(traceImage(image, options));
        setError('');
      } catch (e) {
        setResult(undefined);
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [image, options]);
  const patch = (p: Partial<TraceOptions>) => setOptions((o) => ({ ...o, ...p }));
  return (
    <Dialog title="Review traced artwork" wide onClose={onClose}>
      <p>Remove the background, check the shapes and openings, then apply them to the sign.</p>
      <div className="trace-preview-grid">
        <div>
          <label>
            Background to remove
            <select
              value={options.background}
              onChange={(e) => patch({ background: e.target.value })}
            >
              <option value="auto">Auto · transparency / border colour</option>
              <option value="custom">Choose background colour</option>
              <option value="white">White / near-white</option>
              <option value="black">Black / near-black</option>
              <option value="corner">Top-left pixel</option>
              <option value="alpha">Keep opaque pixels</option>
            </select>
          </label>
          {options.background === 'custom' && (
            <label>
              Background colour
              <input
                type="color"
                value={options.backgroundColor ?? '#ffffff'}
                onChange={(e) => patch({ backgroundColor: e.target.value })}
              />
            </label>
          )}
          <label>
            Background tolerance · {options.threshold}
            <input
              type="range"
              min={5}
              max={150}
              value={options.threshold}
              onChange={(e) => patch({ threshold: +e.target.value })}
            />
          </label>
          <label>
            Small-shape filter
            <input
              type="number"
              min={3}
              max={500}
              value={options.minpixels}
              onChange={(e) => patch({ minpixels: Math.min(500, Math.max(3, +e.target.value)) })}
            />
          </label>
          <details>
            <summary>Crop (%)</summary>
            <div className="pair">
              {(['x', 'y', 'w', 'h'] as const).map((key, i) => (
                <label key={key}>
                  {['Left', 'Top', 'Width', 'Height'][i]}
                  <input
                    type="number"
                    min={key === 'w' || key === 'h' ? 1 : 0}
                    max={100}
                    value={options.crop[key]}
                    onChange={(e) => patch({ crop: { ...options.crop, [key]: +e.target.value } })}
                  />
                </label>
              ))}
            </div>
          </details>
          {result?.background.color && (
            <label className="check">
              <input
                type="checkbox"
                checked={useBackground}
                onChange={(e) => setUseBackground(e.target.checked)}
              />
              Use {result.background.color} as fascia colour
            </label>
          )}
          {result && (
            <p>
              {result.artwork.elements.length} shapes ·{' '}
              {result.artwork.elements.reduce(
                (n, e) => n + e.regions.reduce((n, r) => n + r.holes.length, 0),
                0,
              )}{' '}
              openings.{' '}
              {result.background.mode === 'alpha'
                ? 'Transparency retained.'
                : `Background confidence ${Math.round(result.background.confidence * 100)}%.`}
            </p>
          )}
          {result && (result.background.confidence < 0.6 || result.likelyBackground) && (
            <p role="status" className="callout warn">
              The background may be part of the trace. Choose its colour or adjust the crop before
              applying.
            </p>
          )}
          {result?.truncated && (
            <p className="callout warn">
              Smallest shapes capped at 100. Refine the crop or shape filter.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
        <div className="trace-preview-art">
          {result && (
            <svg
              viewBox={`0 0 ${result.artwork.imageWidth} ${result.artwork.imageHeight}`}
              role="img"
              aria-label="Traced artwork with cut outlines"
            >
              <image
                href={result.artwork.imageData}
                width={result.artwork.imageWidth}
                height={result.artwork.imageHeight}
              />
              {result.artwork.elements.flatMap((e) =>
                e.regions.map((r, i) => (
                  <path
                    key={e.id + '-' + i}
                    fill="none"
                    stroke="#d15234"
                    strokeWidth={0.7}
                    vectorEffect="non-scaling-stroke"
                    d={[r.outer, ...r.holes]
                      .map((l) => 'M' + l.map((p) => p.join(',')).join('L') + 'Z')
                      .join('')}
                  />
                )),
              )}
            </svg>
          )}
          {busy && <p role="status">Tracing…</p>}
        </div>
      </div>
      <div className="row">
        <button onClick={onClose}>Cancel</button>
        <button
          className="accent"
          disabled={busy || !result}
          onClick={async () => {
            await applyRasterTrace(image, options, useBackground);
            onClose();
          }}
        >
          Apply traced shapes
        </button>
      </div>
    </Dialog>
  );
}
