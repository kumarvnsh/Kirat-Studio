import type { BookletPage, PresentationConfig } from '../../presentation/model.ts';
export function BookletEditor({
  config,
  onChange,
  selected,
  onSelect,
}: {
  config: PresentationConfig;
  onChange: (c: PresentationConfig) => void;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const patch = (id: string, p: Partial<BookletPage>) =>
    onChange({
      ...config,
      pages: config.pages.map((page) => (page.id === id ? { ...page, ...p } : page)),
    });
  const move = (id: string, delta: number) => {
    const pages = [...config.pages],
      i = pages.findIndex((p) => p.id === id),
      j = i + delta;
    if (j < 0 || j >= pages.length) return;
    [pages[i], pages[j]] = [pages[j], pages[i]];
    onChange({ ...config, pages });
  };
  const page = config.pages.find((p) => p.id === selected);
  const add = (kind: 'cover' | 'summary') => {
    const id = crypto.randomUUID();
    onChange({
      ...config,
      pages: [
        ...config.pages,
        {
          id,
          kind,
          included: true,
          caption: kind === 'cover' ? 'Cover' : 'Materials & notes',
          dimensions: false,
          materials: false,
        },
      ],
    });
    onSelect(id);
  };
  return (
    <>
      <div className="booklet-section-label">YOUR BOOKLET</div>
      <h2>Choose the story.</h2>
      <p className="booklet-hint">
        Include the pages your client needs. Move them into the right order.
      </p>
      <div className="booklet-page-list">
        {config.pages.map((p, i) => (
          <div key={p.id} className={selected === p.id ? 'selected' : ''}>
            <input
              aria-label={`Include ${p.caption || p.kind}`}
              type="checkbox"
              checked={p.included}
              onChange={(e) => patch(p.id, { included: e.target.checked })}
            />
            <button onClick={() => onSelect(p.id)}>
              <small>{String(i + 1).padStart(2, '0')}</small>
              {p.caption || p.kind}
            </button>
            <button
              aria-label={`Move ${p.caption} up`}
              disabled={i === 0}
              onClick={() => move(p.id, -1)}
            >
              ↑
            </button>
            <button
              aria-label={`Move ${p.caption} down`}
              disabled={i === config.pages.length - 1}
              onClick={() => move(p.id, 1)}
            >
              ↓
            </button>
          </div>
        ))}
      </div>
      <div className="booklet-buttons">
        <button onClick={() => add('cover')} disabled={config.pages.length >= 100}>
          ＋ Cover
        </button>
        <button onClick={() => add('summary')} disabled={config.pages.length >= 100}>
          ＋ Materials / notes
        </button>
      </div>
      {page && (
        <section className="booklet-page-settings">
          <h3>Page details</h3>
          <label>
            Page caption
            <input
              value={page.caption}
              maxLength={500}
              onChange={(e) => patch(page.id, { caption: e.target.value })}
            />
          </label>
          {page.kind === 'render' && (
            <>
              <label>
                Image
                <select
                  value={page.shotId}
                  onChange={(e) => patch(page.id, { shotId: e.target.value })}
                >
                  {config.shots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="booklet-check">
                <input
                  type="checkbox"
                  checked={page.dimensions}
                  onChange={(e) => patch(page.id, { dimensions: e.target.checked })}
                />
                Show dimensions
              </label>
              <label className="booklet-check">
                <input
                  type="checkbox"
                  checked={page.materials}
                  onChange={(e) => patch(page.id, { materials: e.target.checked })}
                />
                Include material details page
              </label>
            </>
          )}
          <button
            className="booklet-delete"
            onClick={() => {
              onChange({
                ...config,
                pages: config.pages.filter((p) => p.id !== page.id),
              });
              onSelect(config.pages.find((p) => p.id !== page.id)?.id ?? '');
            }}
          >
            Remove page
          </button>
        </section>
      )}
    </>
  );
}
