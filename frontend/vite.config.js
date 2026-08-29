import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

function toPublicAssetPath(fileName) {
  return `/${String(fileName || '').replace(/^\/+/, '')}`;
}

function createPwaServiceWorker(bundle, source, fixedAssets = []) {
  const appShell = new Set([
    '/',
    '/index.html',
    '/manifest.webmanifest',
    '/assets/icon-192.png',
    '/assets/icon-512.png'
  ]);

  for (const output of Object.values(bundle)) {
    if (output.type === 'chunk') {
      appShell.add(toPublicAssetPath(output.fileName));
      continue;
    }
    if (/\.(css|js|png|svg|webmanifest)$/.test(output.fileName)) {
      appShell.add(toPublicAssetPath(output.fileName));
    }
  }

  const sortedAppShell = [...appShell].sort();
  const cacheHash = crypto.createHash('sha256');
  cacheHash.update(sortedAppShell.join('|'));
  for (const output of Object.values(bundle).sort((a, b) => a.fileName.localeCompare(b.fileName))) {
    cacheHash.update(output.fileName);
    cacheHash.update(output.type === 'chunk' ? output.code : output.source);
  }
  for (const assetPath of fixedAssets.sort()) {
    cacheHash.update(assetPath);
    cacheHash.update(fs.readFileSync(assetPath));
  }
  const cacheVersion = cacheHash.digest('hex').slice(0, 12);

  return source
    .replace(
      /const CACHE_NAME = globalThis\.__PWA_CACHE_NAME__ \|\| '[^']+';/,
      `const CACHE_NAME = 'bookmark-nav-pwa-${cacheVersion}';`
    )
    .replace(
      /const APP_SHELL = globalThis\.__PWA_APP_SHELL__ \|\| \[[\s\S]*?\n\];/,
      `const APP_SHELL = ${JSON.stringify(sortedAppShell, null, 4)};`
    );
}

function copyPwaAssets() {
  return {
    name: 'copy-pwa-assets',
    generateBundle(_options, bundle) {
      const distDir = path.resolve(__dirname, '..', 'dist');
      const distAssetsDir = path.join(distDir, 'assets');
      const icon192Path = path.resolve(__dirname, 'assets/icon-192.png');
      const icon512Path = path.resolve(__dirname, 'assets/icon-512.png');
      fs.mkdirSync(distAssetsDir, { recursive: true });
      fs.copyFileSync(icon192Path, path.join(distAssetsDir, 'icon-192.png'));
      fs.copyFileSync(icon512Path, path.join(distAssetsDir, 'icon-512.png'));

      const serviceWorkerSource = fs.readFileSync(path.resolve(__dirname, 'service-worker.js'), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'service-worker.js',
        source: createPwaServiceWorker(bundle, serviceWorkerSource, [icon192Path, icon512Path])
      });
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
