import { useEffect, useRef, useState } from 'react';
import { exportIssues, downloadBlob, type RenderAsset } from '../../presentation/exportPackage.ts';
import type { LayoutPage } from '../../presentation/pageLayout.ts';
import type { BookletFont } from '../../presentation/bookletFont.ts';
export function ExportDialog({
  pages,
  font,
  assets,
  keys,
  hashing,
  renderBusy,
  onRerender,
}: {
  pages: LayoutPage[];
  font: BookletFont;
  assets: Record<string, RenderAsset>;
  keys: Record<string, string>;
  hashing: boolean;
  renderBusy: boolean;
  onRerender: () => void;
}) {
  const [format, setFormat] = useState<'pdf' | 'png' | 'jpg'>('pdf'),
    [raw, setRaw] = useState(false),
    [draft, setDraft] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const issues = exportIssues(pages, assets, draft, keys);
  const available = raw
    ? pages.some((p) => p.items.some((i) => i.kind === 'image'))
    : pages.length > 0;
  async function run() {
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setMessage('');
    setProgress(0);
    try {
      const images = Object.fromEntries(Object.entries(assets).map(([id, a]) => [id, a.url]));
      let blob: Blob;
      if (format === 'pdf') {
        const { pdfExport } = await import('../../presentation/pdfExport.ts');
        blob = await pdfExport(pages, font, images, draft, c.signal, setProgress);
      } else {
        const { imageExport } = await import('../../presentation/imageExport.ts');
        blob = await imageExport(pages, font, images, format, raw, draft, c.signal, setProgress);
      }
      c.signal.throwIfAborted();
      await downloadBlob(
        blob,
        `sign-proposal${draft ? '-DRAFT' : ''}.${format === 'pdf' ? 'pdf' : 'zip'}`,
      );
      setMessage('File generated. Download started.');
    } catch (e) {
      setMessage(
        (e as Error).name === 'AbortError'
          ? 'Export cancelled. Your renders and booklet are preserved.'
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }
  return (
    <section className="booklet-export">
      <div className="booklet-section-label">CLIENT DELIVERY</div>
      <h2>Ready to share.</h2>
      <p className="booklet-hint">
        {pages.length} composed pages · A4 landscape ·{' '}
        {format === 'pdf' ? 'Vector PDF' : 'Images in a ZIP file'}
      </p>
      <label>
        Format
        <select
          value={format}
          disabled={busy}
          onChange={(e) => setFormat(e.target.value as typeof format)}
        >
          <option value="pdf">PDF booklet</option>
          <option value="png">PNG images</option>
          <option value="jpg">JPG images</option>
        </select>
      </label>
      {format !== 'pdf' && (
        <label>
          Image content
          <select
            value={raw ? 'raw' : 'pages'}
            disabled={busy}
            onChange={(e) => setRaw(e.target.value === 'raw')}
          >
            <option value="pages">Composed booklet pages · 3508 × 2480</option>
            <option value="raw">Individual render images · selected resolution</option>
          </select>
        </label>
      )}
      <label className="booklet-check">
        <input
          type="checkbox"
          checked={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.checked)}
        />
        Export a marked draft using available previews
      </label>
      {issues.length > 0 && (
        <div className="booklet-issues" role="status">
          <b>Before exporting</b>
          <ul>
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
          <button disabled={renderBusy || busy} onClick={onRerender}>
            Render included views
          </button>
        </div>
      )}
      {!available && <p>Include at least one {raw ? 'render' : 'booklet'} page.</p>}
      <button
        className="booklet-primary"
        disabled={busy || renderBusy || hashing || issues.length > 0 || !available}
        onClick={() => void run()}
      >
        {busy ? 'Generating…' : `Export ${draft ? 'draft ' : ''}${format.toUpperCase()}`}
      </button>
      {busy && (
        <>
          <progress value={progress} max={1} />
          <button onClick={() => controller.current?.abort()}>Cancel export</button>
        </>
      )}
      {message && <p role="status">{message}</p>}
      <p className="booklet-hint">
        Final exports require current final renders. A draft is always labelled. Files download
        locally for you to send to your client.
      </p>
    </section>
  );
}
