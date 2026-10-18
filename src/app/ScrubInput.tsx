import { useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  formatAllUnits,
  LENGTH_UNITS,
  mmToUnit,
  stepForUnit,
  unitToMm,
  type LengthUnit,
} from '../domain/units.ts';
import { say, setView, useView } from './store.ts';

export function UnitSelector({ compact = false }: { compact?: boolean }) {
  const unit: LengthUnit = useView().unit ?? 'mm';
  return (
    <div className={'unit-selector' + (compact ? ' compact' : '')} role="group" aria-label="Measurement unit">
      {!compact && <span className="unit-selector-label">Unit</span>}
      {LENGTH_UNITS.map((u) => (
        <button
          key={u.id}
          type="button"
          className={unit === u.id ? 'active' : ''}
          title={`Display and edit dimensions in ${u.label} (${u.short})`}
          onClick={() => {
            setView({ unit: u.id });
            say(`Measurement unit switched to ${u.label} (${u.short}). All 3 units (mm · in · ft) shown live.`);
          }}
        >
          {u.label}
        </button>
      ))}
    </div>
  );
}

export function ScrubInput({
  label,
  value,
  min,
  max,
  step = 1,
  unit = 'mm',
  showAllUnits,
  onChange,
  onInvalid,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  showAllUnits?: boolean;
  onChange: (next: number, scrubbing?: boolean) => void;
  onInvalid?: (badValue: number) => void;
}) {
  const activeLengthUnit: LengthUnit = useView().unit ?? 'mm';
  const isLength = unit === 'mm';
  const displayUnit = isLength ? activeLengthUnit : unit;
  const showMulti = showAllUnits ?? isLength;

  const toDisp = (mm: number) => (isLength ? mmToUnit(mm, activeLengthUnit) : mm);
  const toMm = (disp: number) => (isLength ? unitToMm(disp, activeLengthUnit) : disp);
  const dispStep = isLength ? stepForUnit(step, activeLengthUnit) : step;
  const dispMin = toDisp(min);
  const dispMax = toDisp(max);

  const [text, setText] = useState(() => String(toDisp(value)));
  const [focused, setFocused] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(String(toDisp(value)));
    }
  }, [value, activeLengthUnit, focused]);

  const roundMmStep = (mmVal: number) => {
    const decimals = (String(step).split('.')[1] ?? '').length;
    const clamped = Math.max(min, Math.min(max, Math.round(mmVal / step) * step));
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
    const pxPerStep = span > 1000 ? 0.25 : span > 150 ? 1.2 : 3;
    setScrubbing(true);

    const onMove = (moveEv: globalThis.PointerEvent) => {
      const dx = moveEv.clientX - startX;
      const mult = moveEv.shiftKey ? 5 : moveEv.altKey ? 0.2 : 1;
      const nextMm = roundMmStep(startVal + (dx / pxPerStep) * step * mult);
      setText(String(toDisp(nextMm)));
      onChange(nextMm, true);
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
    if (raw.trim() !== '' && Number.isFinite(num)) {
      const mmVal = roundMmStep(toMm(num));
      if (toMm(num) >= min && toMm(num) <= max) {
        onChange(mmVal, true);
      }
    }
  };

  const handleBlur = () => {
    setFocused(false);
    const num = Number(text);
    if (text.trim() === '' || !Number.isFinite(num)) {
      onInvalid?.(num);
      setText(String(toDisp(value)));
      return;
    }
    const rawMm = toMm(num);
    const clampedMm = roundMmStep(rawMm);
    if (rawMm < min || rawMm > max) {
      onInvalid?.(rawMm);
    }
    setText(String(toDisp(clampedMm)));
    if (clampedMm !== value) {
      onChange(clampedMm, false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setText(String(toDisp(value)));
      e.currentTarget.blur();
    }
  };

  return (
    <label className={'scrub-field' + (scrubbing ? ' scrubbing' : '')}>
      <span
        className="scrub-label"
        title={`Drag left/right to scrub (${dispMin}–${dispMax} ${displayUnit}). Hold Shift for 5× speed.`}
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
          min={dispMin}
          max={dispMax}
          step={dispStep}
          value={text}
          onFocus={() => setFocused(true)}
          onChange={(e) => handleInput(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {displayUnit && <small className="scrub-unit">{displayUnit}</small>}
      </div>
      {showMulti && (
        <small className="scrub-all-units" title="Equivalent values in mm, inch, and foot">
          {formatAllUnits(value)}
        </small>
      )}
    </label>
  );
}
