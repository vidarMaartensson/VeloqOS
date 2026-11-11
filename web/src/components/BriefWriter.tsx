import { useLayoutEffect, useRef } from 'react';
import { gsap, reducedMotion } from '../lib/motion';

const LEFT = 12;
const LINES = [{ y: 30, len: 290 }, { y: 62, len: 236 }, { y: 94, len: 150 }];
const R = 7;
const HOP_W = 46;
const HOP_H = 24;
const HOP = 0.34;
const rest = (y: number) => y - R - 3;

/** The halo from the Veloq mark bounces along three lines and draws them behind it, as if it were writing the brief. */
export function BriefWriter({ rick = false }: { rick?: boolean }) {
  const svg = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const root = svg.current;
    if (!root || reducedMotion()) return;
    const ball = root.querySelector<SVGGElement>('.bw-ball')!;
    const body = root.querySelector<SVGGElement>('.bw-body')!;
    const halo = root.querySelector<SVGCircleElement>('.bw-halo')!;
    const lines = Array.from(root.querySelectorAll<SVGLineElement>('.bw-line'));

    const ctx = gsap.context(() => {
      gsap.to(halo, { scale: 1.35, opacity: 0.15, duration: 0.9, ease: 'sine.inOut', yoyo: true, repeat: -1, transformOrigin: '50% 50%' });

      const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.2 });
      tl.set(lines, { attr: { x2: LEFT }, opacity: 1 });
      tl.set(ball, { x: LEFT, y: rest(LINES[0].y) });
      tl.set(body, { scaleX: 1, scaleY: 1, transformOrigin: '50% 100%' });

      const land = () => {
        tl.to(body, { scaleX: 1.3, scaleY: 0.7, duration: 0.07, ease: 'power2.out' });
        tl.to(body, { scaleX: 1, scaleY: 1, duration: 0.35, ease: 'elastic.out(1.2, 0.4)' }, '>');
      };

      LINES.forEach((line, i) => {
        const hops = Math.ceil(line.len / HOP_W);
        for (let k = 1; k <= hops; k++) {
          const x = LEFT + Math.min(line.len, k * HOP_W);
          const at = tl.duration() - (k === 1 && i === 0 ? 0 : 0.3);
          tl.to(ball, { x, duration: HOP, ease: 'none' }, at);
          tl.to(lines[i], { attr: { x2: x }, duration: HOP, ease: 'none' }, at);
          tl.to(ball, { y: rest(line.y) - HOP_H, duration: HOP / 2, ease: 'power2.out' }, at);
          tl.to(ball, { y: rest(line.y), duration: HOP / 2, ease: 'power2.in' }, at + HOP / 2);
          land();
        }
        const next = LINES[i + 1];
        if (next) {
          // Carriage return: a long, lazy arc back to the start of the next line.
          const at = tl.duration() - 0.25;
          tl.to(ball, { x: LEFT, duration: 0.6, ease: 'power1.inOut' }, at);
          tl.to(ball, { y: rest(line.y) - HOP_H * 1.4, duration: 0.25, ease: 'power2.out' }, at);
          tl.to(ball, { y: rest(next.y), duration: 0.35, ease: 'power2.in' }, at + 0.25);
          land();
        }
      });

      // Done: the lines fade, the ball flies home to the first line.
      const end = tl.duration() + 0.2;
      tl.to(lines, { opacity: 0, duration: 0.4, ease: 'power1.out' }, end);
      tl.to(ball, { x: LEFT, duration: 0.7, ease: 'power2.inOut' }, end);
      tl.to(ball, { y: rest(LINES[0].y) - HOP_H * 1.8, duration: 0.35, ease: 'power2.out' }, end);
      tl.to(ball, { y: rest(LINES[0].y), duration: 0.35, ease: 'bounce.out' }, end + 0.35);
    }, root);
    return () => ctx.revert();
  }, []);

  const still = reducedMotion();
  return (
    <div className="brief-writer" role="status">
      <svg ref={svg} viewBox="0 0 320 110" width="100%" fill="none" strokeLinecap="round" aria-hidden="true">
        {LINES.map((l) => (
          <line key={`base-${l.y}`} x1={LEFT} y1={l.y} x2={LEFT + l.len} y2={l.y} stroke="var(--line)" strokeWidth="2" />
        ))}
        {LINES.map((l, i) => (
          <line key={l.y} className="bw-line" x1={LEFT} y1={l.y} x2={still && i === 0 ? LEFT + l.len * 0.6 : LEFT} y2={l.y} stroke="var(--ink-muted)" strokeWidth="3" />
        ))}
        <g className="bw-ball" transform={`translate(${still ? LEFT + LINES[0].len * 0.6 : LEFT} ${rest(LINES[0].y)})`}>
          <circle className="bw-halo" r={R + 6} stroke="var(--accent)" strokeWidth="1.5" opacity="0.45" />
          <g className="bw-body">
            <circle r={R} fill="var(--accent)" />
          </g>
        </g>
      </svg>
      <span className="meta">{rick ? 'Skriver din brief. Ingen panik, jag är snabbare än du.' : 'Skriver briefen…'}</span>
    </div>
  );
}
