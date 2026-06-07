// Shrink google-fonts.json for our use: keep TTF URLs only, dedupe unicode ranges.
import { readFileSync as rf, writeFileSync as wf } from 'node:fs';
import { gzipSync as gz } from 'node:zlib';

const SRC = 'data/google-fonts.json';
const OUT = 'data/fonts.json';

const d = JSON.parse(rf(SRC, 'utf8'));

// most-common unicode range per subset name -> shared global map
const counts = {};
for (const f in d)
  for (const s in (d[f].unicodeRange || {})) {
    (counts[s] ??= {});
    const r = d[f].unicodeRange[s];
    counts[s][r] = (counts[s][r] || 0) + 1;
  }
const subsetRanges = {};
for (const s in counts)
  subsetRanges[s] = Object.entries(counts[s]).sort((a, b) => b[1] - a[1])[0][0];

const fonts = {};
for (const name of Object.keys(d)) {
  const e = d[name];
  const variants = {};
  for (const style in e.variants) {
    variants[style] = {};
    for (const w in e.variants[style]) {
      const ttf = e.variants[style][w]?.url?.ttf;
      if (ttf) variants[style][w] = ttf; // flatten: weight -> ttf url string
    }
  }
  // Keep canonical subsets + variants(ttf). Per-font unicodeRange is dropped:
  // it's Google's webfont slicing (incl. math/symbols/null pseudo-subsets) and
  // unneeded — glyph availability comes from the real TTF via FreeType.
  fonts[name] = { category: e.category, subsets: e.subsets || [], variants };
}

const result = { subsetRanges, fonts };
const json = JSON.stringify(result);
wf(OUT, json);

const before = rf(SRC).length, after = Buffer.byteLength(json);
const gzBefore = gz(rf(SRC)).length, gzAfter = gz(json).length;
const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log(`families: ${Object.keys(fonts).length}, subsets: ${Object.keys(subsetRanges).length}`);
console.log(`raw:  ${kb(before)} -> ${kb(after)}  (${(100 * (1 - after / before)).toFixed(1)}% smaller)`);
console.log(`gzip: ${kb(gzBefore)} -> ${kb(gzAfter)}  (${(100 * (1 - gzAfter / gzBefore)).toFixed(1)}% smaller)`);
