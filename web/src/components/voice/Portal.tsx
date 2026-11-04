import { createContext, useContext, useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { reducedMotion } from '../../lib/motion';
import type { Phase } from '../../state/useVoice';

/** What the panels can do with the portal: drop things in it, make it hungry, make it burst. */
export interface PortalHandle {
  el: () => HTMLElement | null;
  burst: () => void;
  setHungry: (hungry: boolean) => void;
}

export const PortalContext = createContext<{ current: PortalHandle | null }>({ current: null });
export const usePortal = () => useContext(PortalContext);

const ACCENT = (a: number) => `rgba(61,242,198,${a})`;
const INK = (a: number) => `rgba(242,244,248,${a})`;
const SPEED: Record<Phase, number> = { idle: 0.25, listening: 0.6, thinking: 1.6, speaking: 0.9 };

/**
 * The swirling rings in the middle. Idle it breathes; listening it ripples; thinking it spins with
 * three arcs; speaking it pulses; hungry (something dragged over it) it shakes and spins faster.
 */
export function Portal({ phase, ref, label }: { phase: Phase; ref?: Ref<PortalHandle>; label: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ phase, hungry: false, pulse: 0, shocks: [] as number[] });
  live.current.phase = phase;

  useImperativeHandle(ref, () => ({
    el: () => wrap.current,
    burst: () => {
      live.current.pulse = 1;
      live.current.shocks.push(0);
    },
    setHungry: (hungry) => {
      live.current.hungry = hungry;
      wrap.current?.classList.toggle('hungry', hungry);
    },
  }), []);

  useEffect(() => {
    const cv = canvas.current;
    // jsdom has no canvas; nothing to draw there.
    if (!cv || /jsdom/i.test(navigator.userAgent)) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const reduce = reducedMotion();

    let W = 0, H = 0, dpr = 1;
    const fit = () => {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width;
      H = r.height;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    };
    const resize = new ResizeObserver(fit);
    resize.observe(cv);
    fit();

    const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
    const move = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      ptr.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
      ptr.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
    };
    window.addEventListener('pointermove', move);

    const dots = Array.from({ length: 90 }, () => ({ a: Math.random() * 6.283, r: 0.2 + Math.random() * 0.9, s: 0.4 + Math.random() * 0.8 }));
    let amp = 0.06, spin = 0, last = performance.now(), nextPulse = 0, raf = 0;

    const frame = (now: number) => {
      const s = live.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;

      let target = 0.05 + 0.02 * Math.sin(t * 1.2);
      if (s.phase === 'listening') target = 0.22 + 0.3 * Math.abs(Math.sin(t * 6.3) * Math.sin(t * 2.1));
      if (s.phase === 'thinking') target = 0.1;
      if (s.phase === 'speaking') {
        if (now > nextPulse) {
          s.pulse = Math.max(s.pulse, 0.55 + Math.random() * 0.45);
          nextPulse = now + 110 + Math.random() * 170;
        }
        target = 0.22 + s.pulse * 0.55;
      }
      if (s.hungry) target = 0.45 + 0.15 * Math.sin(t * 18);
      target = Math.max(target, s.pulse * 0.6);
      s.pulse *= Math.pow(0.02, dt);
      amp += (target - amp) * Math.min(1, dt * (s.phase === 'speaking' || s.hungry ? 14 : 5));
      const speed = (SPEED[s.phase] + (s.hungry ? 1.6 : 0)) * (reduce ? 0.15 : 1);
      spin += dt * speed;
      ptr.x += (ptr.tx - ptr.x) * dt * 4;
      ptr.y += (ptr.ty - ptr.y) * dt * 4;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2 + ptr.x * 10, cy = H / 2 + ptr.y * 10, R = Math.min(W, H) * 0.3;

      ctx.setLineDash([1, 7]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = INK(0.1);
      ctx.beginPath(); ctx.arc(W / 2 - ptr.x * 4, H / 2 - ptr.y * 4, R * 1.48, 0, 6.283); ctx.stroke();
      ctx.strokeStyle = INK(0.07);
      ctx.beginPath(); ctx.arc(W / 2 - ptr.x * 6, H / 2 - ptr.y * 6, R * 1.6, 0, 6.283); ctx.stroke();
      ctx.setLineDash([]);

      if (!reduce) {
        for (const p of dots) {
          p.a += dt * speed * p.s * (2.2 - p.r);
          p.r -= dt * speed * 0.09 * p.s;
          if (p.r < 0.12) { p.r = 1.05 + Math.random() * 0.1; p.a = Math.random() * 6.283; }
          const rr = R * p.r * (1 + amp * 0.3);
          ctx.fillStyle = ACCENT(0.55 * Math.min(1, p.r) * (0.4 + amp));
          ctx.fillRect(cx + Math.cos(p.a) * rr, cy + Math.sin(p.a) * rr * 0.96, 1.6, 1.6);
        }
      }

      for (let i = 5; i >= 0; i--) {
        const base = R * (1 - i * 0.095), k = amp * R * 0.28 * (1 - i * 0.11);
        ctx.beginPath();
        for (let step = 0; step <= 200; step++) {
          const a = (step / 200) * 6.283;
          const n = Math.sin(a * 3 + spin * 2 + i) * 0.5 + Math.sin(a * 5 - spin * 3.1 + i * 2.1) * 0.3 + Math.sin(a * 9 + spin * 5.3 + i) * 0.2;
          const r = base + n * k + Math.sin(t * 1.4 + i) * 1.5, rot = a + spin * (0.3 + i * 0.07);
          const x = cx + Math.cos(rot) * r, y = cy + Math.sin(rot) * r;
          if (step) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.lineWidth = i === 0 ? 2.4 : 1.4 - i * 0.12;
        ctx.strokeStyle = ACCENT(i === 0 ? 0.95 : 0.6 - i * 0.08);
        ctx.stroke();
      }
      if (s.phase === 'thinking') {
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        for (let j = 0; j < 3; j++) {
          const a0 = spin * 2.4 + j * 2.094;
          ctx.strokeStyle = ACCENT(0.8 - j * 0.2);
          ctx.beginPath(); ctx.arc(cx, cy, R * 1.2, a0, a0 + 0.7); ctx.stroke();
        }
      }
      if (s.phase === 'listening' || s.hungry) {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = ACCENT(0.35 + amp * 0.6);
        ctx.beginPath(); ctx.arc(cx, cy, R * (1.18 + amp * 0.25), 0, 6.283); ctx.stroke();
      }
      s.shocks = s.shocks.map((x) => x + dt).filter((x) => x < 0.9);
      for (const x of s.shocks) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = ACCENT(0.8 * (1 - x / 0.9));
        ctx.beginPath(); ctx.arc(cx, cy, R * (0.3 + x * 1.6), 0, 6.283); ctx.stroke();
      }
      ctx.fillStyle = ACCENT(0.9);
      ctx.beginPath(); ctx.arc(cx, cy, 3 + amp * 6, 0, 6.283); ctx.fill();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      window.removeEventListener('pointermove', move);
    };
  }, []);

  return (
    <div className="portal" ref={wrap} data-phase={phase} role="img" aria-label={label}>
      <canvas ref={canvas} />
      <span className="portal-drop" aria-hidden="true">Släpp för att rensa</span>
    </div>
  );
}
