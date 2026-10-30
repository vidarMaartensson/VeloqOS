declare global {
  interface Window {
    /** Set by the Mac app (desktop/) before the page loads, since its API port is picked at launch. */
    __VELOQ_API_BASE__?: string;
  }
}

/** The Mac app's injected base wins over the build-time VITE_API_BASE, which wins over the Vite proxy. */
export function resolveApiBase(injected: string | undefined, configured: string | undefined): string {
  return injected || configured || '/api';
}

export const API_BASE = resolveApiBase(
  typeof window === 'undefined' ? undefined : window.__VELOQ_API_BASE__,
  import.meta.env.VITE_API_BASE,
);
