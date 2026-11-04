import { gsap } from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(Draggable, Flip);

export { gsap, Draggable, Flip };

/** The system asks for less motion. Also true where matchMedia is missing (tests). */
export const reducedMotion = () =>
  typeof window === 'undefined' || typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function center(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
}

export const tileEl = (tile: string) => document.querySelector<HTMLElement>(`[data-tile="${tile}"]`);

/** A short ring of accent around a panel. */
export function flash(el: Element | null) {
  if (!el) return;
  el.classList.remove('flash');
  void (el as HTMLElement).offsetWidth;
  el.classList.add('flash');
}

const NS = 'http://www.w3.org/2000/svg';

/** Draws a line of light from the portal to a panel, then flashes the panel. */
export function beam(from: Element | null, tile: string) {
  const to = tileEl(tile);
  const layer = document.getElementById('beams');
  if (!from || !to || !layer) return;
  if (reducedMotion()) return flash(to);

  const p = center(from);
  const t = center(to);
  const tx = Math.max(t.r.left + 24, Math.min(p.x, t.r.right - 24));
  const ty = Math.max(t.r.top + 24, Math.min(p.y, t.r.bottom - 24));
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', `M${p.x},${p.y} Q${(p.x + tx) / 2},${Math.min(p.y, ty) - 60} ${tx},${ty}`);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'var(--accent)');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  layer.append(path);
  const length = path.getTotalLength?.() ?? 600;
  gsap.timeline({ onComplete: () => path.remove() })
    .fromTo(path, { strokeDasharray: length, strokeDashoffset: length, opacity: 0.9 }, { strokeDashoffset: 0, duration: 0.55, ease: 'power2.inOut' })
    .to(path, { opacity: 0, duration: 0.5 }, '+=0.15');
  window.setTimeout(() => flash(to), 450);
}

/** A little burst of accent dots, e.g. when a story lands in Klart. */
export function sparks(x: number, y: number, count = 14) {
  if (reducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const s = document.createElement('i');
    s.className = 'spark';
    document.body.append(s);
    const a = Math.random() * Math.PI * 2;
    const d = 30 + Math.random() * 50;
    gsap.fromTo(
      s,
      { left: x - 3, top: y - 3, scale: 1, opacity: 1 },
      { x: Math.cos(a) * d, y: Math.sin(a) * d, scale: 0, opacity: 0, duration: 0.7 + Math.random() * 0.4, ease: 'power3.out', onComplete: () => s.remove() },
    );
  }
}

/** Something new flies in from the portal's centre. */
export function fromPortal(portal: Element | null, el: Element | null) {
  if (!portal || !el || reducedMotion()) return;
  const p = center(portal);
  const c = center(el);
  gsap.from(el, { x: p.x - c.x, y: p.y - c.y, scale: 0.2, opacity: 0, rotation: -20, duration: 1, ease: 'back.out(1.5)', clearProps: 'transform,opacity' });
}
