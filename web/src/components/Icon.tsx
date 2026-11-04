import type { ArtifactKind, ChoreIcon, InboxAction } from '../api/types';

/** 24px line icons, stroke 1.6, round caps – the Veloq icon style. */
export const PATHS = {
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  chat: 'M5 5h14v10H10l-5 4z',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2',
  shelf: 'M4 5h7v6H4zM13 5h7v14h-7zM4 13h7v6H4z',
  layers: 'M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  calendar: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4',
  memory: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3v12c0 1.7-3.1 3-7 3s-7-1.3-7-3zM5 6c0 1.7 3.1 3 7 3s7-1.3 7-3M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3',
  sync: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4',
  doc: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
  inbox: 'M4 6h16v12H4zM4 7l8 6 8-6',
  package: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  reply: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 6 6v3',
  delegate: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z',
  archive: 'M4 5h16v4H4zM6 9v10h12V9M10 13h4',
  task: 'M5 12l4 4 10-10M5 5h6M5 19h14',
  snooze: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2 2M5 3L2 6M19 3l3 3',
  stories: 'M5 6h2M5 12h2M5 18h2M10 6h9M10 12h9M10 18h9',
  calendarAdd: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4M12 13v4M10 15h4',
  disk: 'M4 6h16v5H4zM4 13h16v5H4zM7 8.5h.01M7 15.5h.01M11 8.5h6M11 15.5h6',
  skill: 'M10 4L6 20M14 9l4 3-4 3',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  open: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, strokeWidth = 1.6 }: { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export const choreIcon: Record<ChoreIcon, IconName> = {
  memory: 'memory',
  sync: 'sync',
  doc: 'doc',
  inbox: 'inbox',
  package: 'package',
  calendar: 'calendar',
  disk: 'disk',
  skill: 'skill',
};

export const actionIcon: Record<InboxAction, IconName> = {
  reply: 'reply',
  delegate: 'delegate',
  archive: 'archive',
  task: 'task',
  snooze: 'snooze',
  calendar: 'calendarAdd',
};

export function Mark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <line x1="18" y1="40" x2="50" y2="104" stroke="#F2F4F8" strokeWidth="14" strokeLinecap="round" />
      <line x1="50" y1="104" x2="90" y2="33" stroke="#3DF2C6" strokeWidth="14" strokeLinecap="round" />
      <circle cx="102" cy="13" r="8" fill="#3DF2C6" />
    </svg>
  );
}

/** Artifact thumbnails on a 240×140 grid: [ink strokes, one accent stroke]. */
export const THUMBS: Record<ArtifactKind, [string, string]> = {
  doc: ['M80 22h80v96H80zM94 42h52M94 56h52M94 70h36M94 84h46', 'M94 100h18'],
  plan: ['M64 34a6 6 0 1 0 0.1 0M64 64a6 6 0 1 0 0.1 0M64 94a6 6 0 1 0 0.1 0M64 46v12M64 76v12M86 40h88M86 70h70M86 100h80', 'M58 40l4 4 8-8'],
  map: [
    'M48 38l72 32 72-34M120 70l-42 40M120 70l48 40M48 38m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M192 36m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M78 110m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M168 110m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0',
    'M120 70m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0',
  ],
  screen: ['M98 12h44a10 10 0 0 1 10 10v96a10 10 0 0 1-10 10H98a10 10 0 0 1-10-10V22a10 10 0 0 1 10-10zM100 38h40M100 52h26M100 70h40v28h-40z', 'M113 118h14'],
  web: ['M40 24h160v92H40zM40 40h160M60 62h70M60 76h50', 'M60 96h34'],
  logo: ['M120 70m-42 0a42 42 0 1 0 84 0a42 42 0 1 0-84 0', 'M104 56l14 28 18-32'],
  system: ['M46 40h32v32H46zM88 40h32v32H88zM130 40h32v32h-32zM46 92h116', 'M172 40h24v32h-24z'],
  spike: ['M76 46l-24 24 24 24M164 46l24 24-24 24', 'M108 98l24-56'],
  icon: ['M90 36h60a20 20 0 0 1 20 20v28a20 20 0 0 1-20 20H90a20 20 0 0 1-20-20V56a20 20 0 0 1 20-20z', 'M104 72l12 12 20-24'],
};
