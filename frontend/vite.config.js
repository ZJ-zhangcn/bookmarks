import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  base: '/',
  build: {
    outDir: path.resolve(__dirname, '..', 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks: (id) => {
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
