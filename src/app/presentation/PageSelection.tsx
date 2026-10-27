import type { PresentationConfig } from '../../presentation/model.ts';
import { setPageInclusion } from '../../presentation/selection.ts';

export function PageSelection({
  config,
  onChange,
  disabled,
}: {
  config: PresentationConfig;
  onChange: (c: PresentationConfig) => void;
  disabled: boolean;
}) {
  return (
    <section className="export-page-selection">
      <div className="booklet-section-label">EXPORT PAGES</div>
      <h2>Choose pages to share.</h2>
      <p className="booklet-hint">
        These choices also update Build booklet. Detail continuation pages follow their source page.
      </p>
      <div className="booklet-buttons">
        <button
          disabled={disabled}
          onClick={() =>
            onChange(
              setPageInclusion(
                config,
                config.pages.map((p) => p.id),
                true,
              ),
            )
          }
        >
          Select all pages
        </button>
        <button
          disabled={disabled}
          onClick={() => onChange(setPageInclusion(config, [], false, true))}
        >
          Clear pages
        </button>
      </div>
      {config.metadata.notes && (
        <label className="booklet-check export-page-choice">
          <input
            type="checkbox"
            disabled={disabled}
            checked={config.include.notes}
            onChange={(e) =>
              onChange({ ...config, include: { ...config.include, notes: e.target.checked } })
            }
          />
          <span>Include project notes</span>
        </label>
      )}
      {config.pages.map((p, i) => {
        const shot = config.shots.find((s) => s.id === p.shotId);
        const option = config.options.find((o) => o.id === shot?.optionId);
        return (
          <label className="booklet-check export-page-choice" key={p.id}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={p.included}
              onChange={(e) => onChange(setPageInclusion(config, [p.id], e.target.checked))}
            />
            <span>
              {String(i + 1).padStart(2, '0')} · {option ? `${option.name} · ` : ''}
              {p.caption || p.kind}
            </span>
          </label>
        );
      })}
    </section>
  );
}
