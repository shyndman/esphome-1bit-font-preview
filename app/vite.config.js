import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig(({ command }) => ({
  // Served from a project subpath on GitHub Pages; dev stays at root.
  base: command === 'build' ? '/esphome-1bit-font-preview/' : '/',
  plugins: [solid()],
  server: { port: 5173 },
  build: {
    // The emscripten glue lives in /public/wasm and is loaded at runtime; don't bundle it.
    rollupOptions: { external: ['/wasm/ftrender.mjs'] },
  },
}));
