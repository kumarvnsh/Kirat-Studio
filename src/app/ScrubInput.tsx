import { useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';

export function ScrubInput({
  label,
  value,
  min,
  max,
  step = 1,
  unit = 'mm',
  onChange,
  onInvalid,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (next: number, scrubbing?: boolean) => void;
  onInvalid?: (badValue: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [scrubbing, setScrubbing] = useState(false);

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const roundStep = (n: number) => {
    const decimals = (String(step).split('.')[1] ?? '').length;
    const clamped = Math.max(min, Math.min(max, Math.round(n / step) * step));
    return +clamped.toFixed(decimals);
  };

  const startScrub = (ev: PointerEvent<HTMLSpanElement>) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const el = ev.currentTarget;
    el.setPointerCapture(ev.pointerId);
    const startX = ev.clientX;
    const startVal = value;
    const span = max - min;
    // Scale sensitivity so a ~180px drag covers a comfortable range
    const pxPerStep = span > 1000 ? 0.25 : span > 150 ? 1.2 : 3;
    setScrubbing(true);

    const onMove = (moveEv: globalThis.PointerEvent) => {
      const dx = moveEv.clientX - startX;
      const mult = moveEv.shiftKey ? 5 : moveEv.altKey ? 0.2 : 1;
      const next = roundStep(startVal + (dx / pxPerStep) * step * mult);
      setText(String(next));
      onChange(next, true);
    };
    const onUp = () => {
      setScrubbing(false);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  const handleInput = (raw: string) => {
    setText(raw);
    const num = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(num) && num >= min && num <= max) {
      onChange(num, true);
    }
  };

  const handleBlur = () => {
    const num = Number(text);
    if (text.trim() === '' || !Number.isFinite(num) || num < min || num > max) {
      onInvalid?.(num);
      setText(String(value));
    } else if (num !== value) {
      onChange(num, false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setText(String(value));
      e.currentTarget.blur();
    }
  };

  return (
    <label className={'scrub-field' + (scrubbing ? ' scrubbing' : '')}>
      <span
        className="scrub-label"
        title={`Drag left/right to scrub (${min}–${max} ${unit}). Hold Shift for 5× speed.`}
        onPointerDown={startScrub}
      >
        <span className="scrub-text">{label}</span>
        <i className="scrub-arrows" aria-hidden="true">
          ↔
        </i>
      </span>
      <div className="scrub-input-wrap">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={text}
          onChange={(e) => handleInput(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {unit && <small className="scrub-unit">{unit}</small>}
      </div>
    </label>
  );
}
