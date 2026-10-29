/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_VELOQ_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
