import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const sourceRoot = resolve(__dirname, 'src');

export default defineConfig(({ command }) => ({
  main: {
    define: {
      __APP_UPDATE_PUBLISHER__: JSON.stringify(process.env.WINDOWS_PUBLISHER_NAME?.trim() ?? ''),
    },
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
    server: {
      warmup: {
        // Electron 创建窗口期间先转换入口和概览，首个请求可以复用 Vite 的模块缓存。
        clientFiles: [
          './src/renderer/main.tsx',
          './src/renderer/components/Overview.tsx',
          './src/renderer/styles.css',
        ],
      },
    },
    optimizeDeps: {
      // 首屏依赖确定后即可响应浏览器，后续页面仍由 Vite 自动发现依赖。
      include: ['react-dom/client', 'i18next', 'react-i18next', 'lucide-react'],
      holdUntilCrawlEnd: false,
    },
    resolve: {
      alias: {
        '@': sourceRoot,
        // 开发预构建读取图标库的单文件入口，避免在 Windows 遍历上千个图标模块。
        ...(command === 'serve'
          ? { 'lucide-react': createRequire(import.meta.url).resolve('lucide-react') }
          : {}),
      },
    },
    build: {
      minify: 'esbuild',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
  },
}));
