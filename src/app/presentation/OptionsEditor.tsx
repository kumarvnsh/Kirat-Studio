import { useState } from 'react';
import {
  constructionNames,
  type ConstructionType,
  type DesignState,
} from '../../domain/project.ts';
import {
  applyOption,
  type ConstructionOverride,
  type ProposalOption,
} from '../../presentation/options.ts';
export function OptionsEditor({
  option,
  design,
  onChange,
}: {
  option: ProposalOption;
  design: DesignState;
  onChange: (o: ProposalOption) => void;
}) {
  const [groupId, setGroupId] = useState(design.artwork?.groups[0]?.id ?? ''),
    [elementId, setElementId] = useState('');
  const group = design.artwork?.groups.find((g) => g.id === groupId) ?? design.artwork?.groups[0];
  const elements = design.artwork?.elements.filter((e) => e.group === group?.id) ?? [];
  const element = elements.find((e) => e.id === elementId),
    scope = element ? 'elementOverrides' : 'groupOverrides',
    id = element?.id ?? group?.id;
  const patch = id ? (option[scope][id] ?? {}) : {};
  const effective = applyOption(design, option),
    current = element
      ? effective.artwork?.elements.find((e) => e.id === element.id)
      : effective.artwork?.groups.find((g) => g.id === group?.id);
  const change = (p: ConstructionOverride) => {
    if (!id) return;
    onChange({ ...option, [scope]: { ...option[scope], [id]: { ...patch, ...p } } });
  };
  const reset = (key: keyof ConstructionOverride) => {
    if (!id) return;
    const next = { ...patch };
    delete next[key];
    onChange({ ...option, [scope]: { ...option[scope], [id]: next } });
  };
  return (
    <section className="proposal-option-editor">
      <div className="booklet-section-label">DESIGN ALTERNATIVE</div>
      <h2>Construction & colour</h2>
      <label>
        Option name
        <input
          maxLength={200}
          value={option.name}
          onChange={(e) => onChange({ ...option, name: e.target.value })}
        />
      </label>
      <label>
        Client explanation
        <textarea
          rows={3}
          maxLength={2000}
          value={option.description}
          placeholder="Explain this construction or finish to your client."
          onChange={(e) => onChange({ ...option, description: e.target.value })}
        />
      </label>
      <p className="booklet-hint">
        These choices belong to this option. The original editor design stays unchanged.
      </p>
      {group && (
        <>
          <label>
            Logo / lettering group
            <select
              value={group.id}
              onChange={(e) => {
                setGroupId(e.target.value);
                setElementId('');
              }}
            >
              {design.artwork!.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Apply to
            <select value={element?.id ?? ''} onChange={(e) => setElementId(e.target.value)}>
              <option value="">Whole group</option>
              {elements.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          {element && (
            <svg
              className="option-shape-preview"
              viewBox={`${element.bounds[0]} ${element.bounds[1]} ${element.bounds[2] - element.bounds[0]} ${element.bounds[3] - element.bounds[1]}`}
              role="img"
              aria-label={`Selected shape ${element.name}`}
            >
              <path
                fill={element.faceColor ?? element.color}
                fillRule="evenodd"
                d={element.regions
                  .map((r) =>
                    [r.outer, ...r.holes]
                      .map((loop) => 'M' + loop.map((p) => p.join(',')).join('L') + 'Z')
                      .join(''),
                  )
                  .join('')}
              />
            </svg>
          )}
          <label>
            Construction
            <select
              value={patch.type ?? ''}
              onChange={(e) =>
                e.target.value
                  ? change({ type: e.target.value as ConstructionType })
                  : reset('type')
              }
            >
              <option value="">Use original · {constructionNames[(element ?? group).type]}</option>
              {Object.entries(constructionNames).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {(['faceColor', 'returnColor'] as const).map((key) => (
            <div className="option-colour" key={key}>
              <label className="booklet-check">
                <input
                  type="checkbox"
                  checked={patch[key] !== undefined}
                  onChange={(e) =>
                    e.target.checked
                      ? change({
                          [key]:
                            current?.[key] ??
                            (key === 'faceColor'
                              ? (element?.color ?? design.settings.facecolor)
                              : '#aeb9bd'),
                        })
                      : reset(key)
                  }
                />
                Override {key === 'faceColor' ? 'face' : 'return'} colour
              </label>
              {patch[key] !== undefined && (
                <>
                  <input
                    aria-label={`${key === 'faceColor' ? 'Face' : 'Return'} colour`}
                    type="color"
                    value={patch[key] ?? '#aeb9bd'}
                    onChange={(e) => change({ [key]: e.target.value })}
                  />
                  {key === 'returnColor' && (
                    <button onClick={() => change({ returnColor: null })}>Bare metal</button>
                  )}
                </>
              )}
            </div>
          ))}
        </>
      )}
      <label className="booklet-check">
        <input
          type="checkbox"
          checked={option.boardColor !== undefined}
          onChange={(e) =>
            onChange({
              ...option,
              boardColor: e.target.checked ? design.settings.boardcolor : undefined,
            })
          }
        />
        Override fascia colour
      </label>
      {option.boardColor !== undefined && (
        <input
          aria-label="Fascia colour"
          type="color"
          value={option.boardColor}
          onChange={(e) => onChange({ ...option, boardColor: e.target.value })}
        />
      )}
    </section>
  );
}
