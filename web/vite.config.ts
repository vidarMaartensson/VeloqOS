/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 7470,
    strictPort: true,
    proxy: {
      // Veloq OS uses its own ports (API 7480, web 7470) to stay clear of other projects.
      // scripts/start.sh sets VELOQ_API_PORT if 7480 is taken anyway.
      '/api': `http://localhost:${process.env.VELOQ_API_PORT ?? 7480}`,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
