import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

function copyPwaAssets() {
  return {
    name: 'copy-pwa-assets',
    closeBundle() {
      const distDir = path.resolve(__dirname, '..', 'dist');
      const distAssetsDir = path.join(distDir, 'assets');
      fs.mkdirSync(distAssetsDir, { recursive: true });
      fs.copyFileSync(path.resolve(__dirname, 'service-worker.js'), path.join(distDir, 'service-worker.js'));
      fs.copyFileSync(path.resolve(__dirname, 'assets/icon.svg'), path.join(distAssetsDir, 'icon.svg'));
      fs.copyFileSync(path.resolve(__dirname, 'assets/icon-192.png'), path.join(distAssetsDir, 'icon-192.png'));
      fs.copyFileSync(path.resolve(__dirname, 'assets/icon-512.png'), path.join(distAssetsDir, 'icon-512.png'));
    }
  };
}

export default defineConfig({
  root: '.',
  base: '/',
  plugins: [copyPwaAssets()],
  build: {
    outDir: path.resolve(__dirname, '..', 'dist'),
    emptyOutDir: true,
    // 不预加载动态 import 的 settings / ai chunk，降低首屏请求和下载量
    modulePreload: false,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names?.[0] || assetInfo.name || '';
          if (name.endsWith('.webmanifest')) return '[name][extname]';
          if (/icon-(192|512)\.png$/.test(name)) return 'assets/[name][extname]';
          return 'assets/[name]-[hash][extname]';
        },
        manualChunks: (id) => {
          const normalizedId = id.split(path.sep).join('/');
          if (normalizedId.endsWith('/frontend/modules/settings.js')) {
            return 'settings';
          }
          if (normalizedId.endsWith('/frontend/modules/ai.js')) {
            return 'ai';
          }
          // 将 node_modules 打包到 vendor chunk
          if (id.includes('node_modules')) {
            return 'vendor';
          }
          // 将较大的模块分离到单独的 chunk
          if (id.includes('components/')) {
            return 'components';
          }
        }
      }
    },
    minify: 'esbuild', // 使用内置的 esbuild 压缩，无需额外依赖
    cssMinify: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1000
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
