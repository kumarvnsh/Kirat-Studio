import type { Shot } from '../../presentation/model.ts';
import type { RenderAsset } from '../../presentation/exportPackage.ts';
export function ShotList({
  shots,
  selected,
  onSelect,
  assets,
  keys,
  errors,
}: {
  shots: Shot[];
  selected: string;
  onSelect: (id: string) => void;
  assets: Record<string, RenderAsset>;
  keys: Record<string, string>;
  errors: Record<string, string>;
}) {
  return (
    <div className="booklet-shot-list">
      {shots.map((s, i) => {
        const a = assets[s.id];
        return (
          <button
            className={selected === s.id ? 'selected' : ''}
            key={s.id}
            onClick={() => onSelect(s.id)}
          >
            <span className="shot-thumb">
              {a ? (
                <img src={a.url} alt="" loading="lazy" decoding="async" />
              ) : (
                <span>{String(i + 1).padStart(2, '0')}</span>
              )}
            </span>
            <span>
              <b>{s.name}</b>
              <small>
                {errors[s.id]
                  ? 'Failed'
                  : !a
                    ? 'Needs render'
                    : a.key !== keys[s.id]
                      ? 'Outdated'
                      : a.quality === 'final'
                        ? 'Final ready'
                        : 'Preview'}{' '}
                · {s.scene.kind}
              </small>
            </span>
          </button>
        );
      })}
    </div>
  );
}
