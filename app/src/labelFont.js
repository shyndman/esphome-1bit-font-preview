// Render each picker label in its own font, downloading ONLY the glyphs needed for
// that label (the family name). Uses Google Fonts CSS2 `text=` subsetting, so e.g.
// the "Roboto" row pulls a woff2 containing just R,o,b,t — not the whole font.

const requested = new Set();

function nearestNormalWeight(info) {
  const ws = Object.keys(info?.variants?.normal || {}).map(Number);
  if (!ws.length) return null; // italic-only family: skip (we want normal/regular)
  return ws.includes(400) ? 400 : ws.reduce((a, b) => (Math.abs(b - 400) < Math.abs(a - 400) ? b : a));
}

// Inject a glyph-subset @font-face for `family`'s name. Idempotent per family.
export function ensureLabelFont(catalog, family) {
  if (requested.has(family)) return;
  requested.add(family);
  const weight = nearestNormalWeight(catalog.fonts[family]);
  if (weight == null) return;

  const fam = family.replace(/ /g, '+');
  const text = [...new Set(family)].join(''); // unique chars in the label only
  const href =
    `https://fonts.googleapis.com/css2?family=${fam}:wght@${weight}` +
    `&text=${encodeURIComponent(text)}&display=swap`;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
