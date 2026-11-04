import { useLayoutEffect, useRef } from 'react';
import { gsap, reducedMotion } from '../../lib/motion';

export interface Kpi {
  key: string;
  label: string;
  value: number | null;
  unit?: string;
  /** The panel a click takes you to. */
  tile: string;
}

/** Counts from its last value to the new one. */
function Count({ value }: { value: number | null }) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  useLayoutEffect(() => {
    if (!el.current || value === null) return;
    if (reducedMotion()) {
      el.current.textContent = String(value);
      shown.current = value;
      return;
    }
    const box = { v: shown.current };
    const tween = gsap.to(box, {
      v: value,
      duration: 1.1,
      ease: 'power3.out',
      onUpdate: () => {
        if (el.current) el.current.textContent = String(Math.round(box.v));
      },
    });
    shown.current = value;
    gsap.fromTo(el.current, { scale: 1.12 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1,0.5)' });
    return () => {
      tween.kill();
    };
  }, [value]);
  return <span ref={el} className="num">{value === null ? '–' : String(value)}</span>;
}

export function KpiStrip({ items, onJump }: { items: Kpi[]; onJump: (tile: string) => void }) {
  return (
    <div className="kpis" data-tile="overview">
      {items.map((k) => (
        <button key={k.key} className="kpi" onClick={() => onJump(k.tile)} aria-label={`${k.label}: ${k.value ?? 'okänt'}${k.unit ? ` ${k.unit}` : ''}`}>
          <span className="label">{k.label}</span>
          <span className="kpi-val">
            <Count value={k.value} />
            {k.unit && <span className="unit">{k.unit}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
