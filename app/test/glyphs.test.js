// Golden parity tests: assert the browser WASM engine reproduces ESPHome's glyph
// output byte-for-byte. Goldens are extracted by data/gen-goldens.py from real
// ESPHome codegen (a compiled main.cpp), and the fixture TTFs are ESPHome's own
// cached fonts — so the engine renders identical input and a match proves byte-exact
// parity with ESPHome itself, sidestepping FreeType build-config differences.
//
// All four bit depths are active: the engine renders mono (bpp=1) and quantized
// grayscale (bpp 2/4/8) byte-for-byte against ESPHome's goldens.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEngine } from '../src/ftengine.js';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const matrix = JSON.parse(await readFile(new URL('matrix.json', FIXTURES)));

// Node loader for the emscripten module (the browser default uses location/Vite base).
async function loadNodeModule() {
  const mod = await import(new URL('../public/wasm/ftrender.mjs', import.meta.url).href);
  return mod.default();
}

const engine = await createEngine(loadNodeModule);

const fieldWidth = (bpp) => (bpp <= 4 ? 1 : 2);

// MUST stay identical to render_block() in data/gen-goldens.py.
function renderBlock(codepoint, m, grid, bpp) {
  const fw = fieldWidth(bpp);
  const cp = codepoint.toString(16).toUpperCase().padStart(4, '0');
  const head = `glyph U+${cp} w=${m.w} h=${m.h} ox=${m.ox} oy=${m.oy} adv=${m.adv}`;
  const rows = [];
  for (let y = 0; y < m.h; y++) {
    let row = '';
    for (let x = 0; x < m.w; x++) row += grid[y * m.w + x].toString(16).padStart(fw, '0');
    rows.push(row);
  }
  return [head, ...rows].join('\n');
}

// Index a golden file by codepoint -> block text (header comments stripped).
function parseGoldens(text) {
  const map = new Map();
  for (const chunk of text.split('\n\n')) {
    const lines = chunk.split('\n').filter((l) => l.length > 0 && !l.startsWith('#'));
    if (lines.length === 0) continue;
    const head = lines[0].match(/^glyph U\+([0-9A-F]{4}) /);
    if (head) map.set(parseInt(head[1], 16), lines.join('\n'));
  }
  return map;
}

const fontBytes = new Map();
async function useFont(font) {
  if (!fontBytes.has(font.id)) {
    fontBytes.set(font.id, new Uint8Array(await readFile(new URL(font.file, FIXTURES))));
  }
  engine.useFont(fontBytes.get(font.id));
}

for (const font of matrix.fonts) {
  for (const size of matrix.sizes) {
    for (const bpp of matrix.bpps) {
      const file = `goldens/${font.id}_${size}px_bpp${bpp}.txt`;
      const goldens = parseGoldens(await readFile(new URL(file, FIXTURES), 'utf8'));
      for (const [codepoint, expected] of goldens) {
        const label = `${font.id} ${size}px bpp${bpp} U+${codepoint
          .toString(16)
          .toUpperCase()
          .padStart(4, '0')} '${String.fromCodePoint(codepoint)}'`;
        test(label, async () => {
          await useFont(font);
          const vm = engine.setSize(size);
          const g = engine.glyph(codepoint, bpp);
          const m = { w: g.w, h: g.h, ox: g.left, oy: vm.ascender - g.top, adv: g.advance };
          assert.equal(renderBlock(codepoint, m, g.pixels, bpp), expected);
        });
      }
    }
  }
}
