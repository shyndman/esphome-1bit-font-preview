import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  server: { port: 5173 },
  build: {
    // The emscripten glue lives in /public/wasm and is loaded at runtime; don't bundle it.
    rollupOptions: { external: ['/wasm/ftrender.mjs'] },
  },
});
