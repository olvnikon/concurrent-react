import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig(({ mode }) => ({
  root: project + 'demos',
  // A profiling build retains React's instrumentation in optimized code.
  resolve: mode === 'profiling' ? { alias: { 'react-dom/client': 'react-dom/profiling' } } : {},
  define: { __BUILD_LABEL__: JSON.stringify(mode) },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: { allow: [project], deny: ['**/.git/**', '**/react/**', '**/react-source-v19.3.0/**'] },
  },
  build: { outDir: project + 'dist', emptyOutDir: true, sourcemap: true },
}));
