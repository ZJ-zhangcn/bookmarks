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
      fs.copyFileSync(path.resolve(__dirname, 'assets/icon-192.png'), path.join(distAssetsDir, 'icon-192.png'));
      fs.copyFileSync(path.resolve(__dirname, 'assets/icon-512.png'), path.join(distAssetsDir, 'icon-512.png'));
    }
  };
}

function frontendCommonjsAsEsm() {
  const sharedIconPolicyPath = path.resolve(__dirname, '..', 'shared', 'icon-policy.cjs');
  const frontendModulesDir = path.resolve(__dirname, 'modules');
  const virtualSuffix = '?frontend-esm';

  function isAllowedCommonjsModule(filePath) {
    return filePath === sharedIconPolicyPath
      || (filePath.startsWith(`${frontendModulesDir}${path.sep}`) && filePath.endsWith('.cjs'));
  }

  function toEsm(source, filePath) {
    let converted = source.replace(
      "const iconPolicy = require('../../shared/icon-policy.cjs');",
      "import iconPolicy from '../../shared/icon-policy.cjs';"
    );

    const exportsMatch = converted.match(/if\s*\(\s*typeof module !== ['"]undefined['"]\s*\)\s*\{\s*module\.exports\s*=\s*\{([\s\S]*?)\};\s*\}\s*$/)
      || converted.match(/module\.exports\s*=\s*\{([\s\S]*?)\};\s*$/);
    if (!exportsMatch) {
      throw new Error(`Unable to convert ${filePath} to an ES module for Vite dev`);
    }

    const exportedNames = exportsMatch[1]
      .split(',')
      .map(name => name.trim())
      .filter(Boolean);
    const esmExports = [
      `const __commonjsDefault = { ${exportedNames.join(', ')} };`,
      `export { ${exportedNames.join(', ')} };`,
      'export default __commonjsDefault;'
    ].join('\n');

    return converted.replace(exportsMatch[0], esmExports);
  }

  return {
    name: 'frontend-commonjs-as-esm',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.endsWith('.cjs')) return null;
      const importerPath = importer.split('?')[0];
      const resolved = path.resolve(path.dirname(importerPath), source);
      return isAllowedCommonjsModule(resolved) ? `${resolved}${virtualSuffix}` : null;
    },
    load(id) {
      if (!id.endsWith(virtualSuffix)) return null;
      const filePath = id.slice(0, -virtualSuffix.length);
      if (!isAllowedCommonjsModule(filePath)) return null;
      return toEsm(fs.readFileSync(filePath, 'utf8'), filePath);
    }
  };
}

export default defineConfig({
  root: '.',
  base: '/',
  plugins: [frontendCommonjsAsEsm(), copyPwaAssets()],
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
