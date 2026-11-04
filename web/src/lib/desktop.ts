declare global {
  interface Window {
    /** Tauri's bridge, present only inside the Mac app (desktop/). */
    __TAURI_INTERNALS__?: { invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T> };
  }
}

/**
 * Restarts the API sidecar through the Mac app, or undefined in a plain browser,
 * where nothing can start an API that is down.
 */
export function desktopRestart(): (() => Promise<void>) | undefined {
  const bridge = typeof window === 'undefined' ? undefined : window.__TAURI_INTERNALS__;
  return bridge ? () => bridge.invoke<void>('restart_api') : undefined;
}
