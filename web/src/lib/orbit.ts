import type { Project } from '../api/types';

/** Scene the orbit is drawn in, in px. The core sits slightly below centre to leave room for the header. */
export const SCENE = { width: 570, height: 580, cx: 285, cy: 300, rx: 228, ry: 200, choreRadius: 110, skillRadius: 160 } as const;

const ORB_SIZE: Record<Project['tier'], number> = { 3: 64, 2: 52, 1: 42 };

// Hand-tuned angles (degrees, 0 = right, clockwise) that keep labels clear of each other and the corners.
const ANGLES = [-90, -38, 10, -142, 52, 168, -64, 128, -116, 92, 208];

export interface OrbPlacement {
  project: Project;
  x: number;
  y: number;
  size: number;
  index: number;
}

/** Places projects on the ellipse. Projects beyond the hand-tuned angles are spread evenly. */
export function placeOrbs(projects: Project[]): OrbPlacement[] {
  return projects.map((project, index) => {
    const degrees = ANGLES[index] ?? -90 + (360 / projects.length) * index;
    const a = (degrees * Math.PI) / 180;
    return {
      project,
      index,
      x: round(SCENE.cx + SCENE.rx * Math.cos(a)),
      y: round(SCENE.cy + SCENE.ry * Math.sin(a)),
      size: ORB_SIZE[project.tier] ?? ORB_SIZE[2],
    };
  });
}

/** Chore nodes evenly around the core, the first at the top. Offsets are relative to the core. */
export function placeChores(count: number, radius: number = SCENE.choreRadius, startDegrees = -90): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const a = ((startDegrees + (360 / Math.max(count, 1)) * i) * Math.PI) / 180;
    return { x: round(radius * Math.cos(a)), y: round(radius * Math.sin(a)) };
  });
}

/** Skills on the outer ring, a half step off the top so the first one clears the top project. */
export function placeSkills(count: number, radius: number = SCENE.skillRadius): { x: number; y: number }[] {
  return placeChores(count, radius, -90 + 180 / Math.max(count, 1));
}

/** Pointer position inside an element as -1…1 on both axes, for the parallax layers. */
export function pointerOffset(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }) {
  const nx = ((clientX - rect.left) / rect.width - 0.5) * 2;
  const ny = ((clientY - rect.top) / rect.height - 0.5) * 2;
  return { x: clamp(nx), y: clamp(ny) };
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));
const round = (v: number) => Math.round(v * 10) / 10;
