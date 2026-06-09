import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig(({ command, isPreview }) => ({
  // Served from a project subpath on GitHub Pages, so build + preview use it.
  // (`vite preview` reports command 'serve', so key off isPreview too.) Dev stays at root.
  base: command === 'build' || isPreview ? '/esphome-1bit-font-preview/' : '/',
  plugins: [solid()],
  server: { port: 5173 },
  build: {
    // The emscripten glue lives in /public/wasm and is loaded at runtime; don't bundle it.
    rollupOptions: { external: ['/wasm/ftrender.mjs'] },
  },
}));
