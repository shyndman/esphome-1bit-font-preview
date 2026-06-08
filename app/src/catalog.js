// Load and query the optimized Google Fonts catalog (data/fonts.json).

// Families we don't support (e.g. broken font metrics that render clipped).
const EXCLUDED = new Set([
  'Revalia', // lineHeight (28px@32) < ascender (34px): glyphs overflow the box, clipped
  // Icon fonts: glyphs are pictograms keyed to ligatures/PUA codepoints, not text.
  'Material Icons',
  'Material Icons Outlined',
  'Material Icons Round',
  'Material Icons Sharp',
  'Material Icons Two Tone',
  'Material Symbols Outlined',
  'Material Symbols Rounded',
  'Material Symbols Sharp',
]);

let cache;
export async function loadCatalog() {
  if (!cache) cache = await (await fetch(`${import.meta.env.BASE_URL}fonts.json`)).json();
  return cache;
}

export function familyNames(catalog) {
  return Object.keys(catalog.fonts)
    .filter((n) => !EXCLUDED.has(n))
    .sort((a, b) => a.localeCompare(b));
}

export function familyInfo(catalog, name) {
  return catalog.fonts[name];
}

// weights available for a given family + style ("normal" | "italic"), as sorted numbers
export function weightsFor(catalog, name, style) {
  const v = catalog.fonts[name]?.variants?.[style];
  return v ? Object.keys(v).map(Number).sort((a, b) => a - b) : [];
}

export function ttfUrl(catalog, name, style, weight) {
  return catalog.fonts[name]?.variants?.[style]?.[String(weight)];
}
