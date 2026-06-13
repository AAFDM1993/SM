import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        portal: resolve(__dirname, 'portal/index.html'),
        dashboard: resolve(__dirname, 'portal/dashboard.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
