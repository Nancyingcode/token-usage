import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const sourceRoot = resolve(__dirname, 'src');

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@': sourceRoot,
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/main/main.ts'),
        },
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        '@': sourceRoot,
      },
    },
    build: {
      rollupOptions: {
        input: {
          preload: resolve(__dirname, 'src/preload/preload.ts'),
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    root: '.',
    resolve: {
      alias: {
        '@': sourceRoot,
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
  },
});
