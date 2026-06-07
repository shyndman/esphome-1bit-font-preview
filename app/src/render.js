// Lay out a string with the engine (ESPHome baseline math) and paint an LED-style grid.
// The device box (e.g. 128×32) is the fixed constraint; text is anchored TOP-LEFT so
// any overflow can only ever land on the right and bottom edges, where it's tinted red.

const DEFAULT_PITCH = 14; // device px per cell at the default scale

// Lay out `text` at `size` and report the glyph placements + true ink bounds.
// Anchored top-left: pen starts at x=0, baseline at the ascender (top of the box).
export function layout(engine, text, size) {
  const vm = engine.setSize(size);
  const glyphs = [];
  let penX = 0;
  for (const ch of text) {
    const g = engine.glyph(ch.codePointAt(0));
    glyphs.push({ g, x: penX + g.left, y: vm.ascender - g.top });
    penX += g.advance;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { g, x, y } of glyphs)
    for (let gy = 0; gy < g.h; gy++)
      for (let gx = 0; gx < g.w; gx++)
        if (g.pixels[gy * g.w + gx]) {
          const px = x + gx, py = y + gy;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
  const ink = maxX >= minX;
  return { vm, glyphs, advance: penX, ink: { has: ink, minX, minY, maxX, maxY } };
}

function measure(ink, mode) {
  if (!ink.has) return { w: 0, h: 0, offsetX: 0, offsetY: 0 };
  if (mode === 'minimum') {
    return {
      w: ink.maxX - ink.minX + 1,
      h: ink.maxY - ink.minY + 1,
      offsetX: -ink.minX,
      offsetY: -ink.minY,
    };
  }
  return { w: ink.maxX + 1, h: ink.maxY + 1, offsetX: 0, offsetY: 0 };
}

// Largest integer font size whose selected measurement is contained in `box` (both axes).
export function fitSize(engine, text, box, mode = 'recommended', min = 6, max = 256) {
  if (!text) return Math.min(max, 32);
  const fits = (size) => {
    const { ink } = layout(engine, text, size);
    const measured = measure(ink, mode);
    return measured.w <= box.w && measured.h <= box.h;
  };
  let lo = min, hi = max, best = min;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fits(mid)) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return best;
}

export function renderToCanvas(
  canvas,
  engine,
  { text, size, box, mode = 'recommended', on = '#cde7ff', off = '#10202c', bg = '#06121a', over = '#ff5a6a' },
) {
  const { ink, glyphs } = layout(engine, text, size);
  const measured = measure(ink, mode);

  // Grid extent = the device box, expanded to reveal any right/bottom overflow.
  const cols = Math.max(1, box.w, measured.w);
  const rows = Math.max(1, box.h, measured.h);
  const overflow = ink.has && (measured.w > box.w || measured.h > box.h);

  // Pack ink into a 1-bit grid (clipped to the extent; top-left aligned so coords ≥ 0).
  const grid = new Uint8Array(cols * rows);
  for (const { g, x, y } of glyphs)
    for (let gy = 0; gy < g.h; gy++)
      for (let gx = 0; gx < g.w; gx++)
        if (g.pixels[gy * g.w + gx]) {
          const px = x + gx + measured.offsetX, py = y + gy + measured.offsetY;
          if (px >= 0 && px < cols && py >= 0 && py < rows) grid[py * cols + px] = 1;
        }

  const drawn = { w: measured.w, h: measured.h };

  // Hold the default scale while it fits, then scale down by shrinking the cell
  // pitch — never by CSS-resampling the canvas. The pitch is an integer number of
  // device pixels and we always present the canvas 1:1 with physical pixels, so the
  // gap between cells is exactly one physical pixel at every scale (a fractional CSS
  // scale would make some 1px gaps vanish and others survive).
  const dpr = window.devicePixelRatio || 1;
  const parent = canvas.parentElement;
  const cs = parent && getComputedStyle(parent);
  const padX = cs ? parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) : 0;
  const availDev = Math.max(1, (parent?.clientWidth || 800) - padX) * dpr;

  // largest integer device-px pitch that fits, capped at the default scale
  const pitch = Math.max(1, Math.min(DEFAULT_PITCH, Math.floor(availDev / cols)));
  const gap = pitch >= 2 ? 1 : 0; // a 1px gap needs at least a 2px cell

  canvas.width = cols * pitch;
  canvas.height = rows * pitch;
  canvas.style.width = `${canvas.width / dpr}px`;   // 1 backing px = 1 physical px
  canvas.style.height = `${canvas.height / dpr}px`;

  const ctx = canvas.getContext('2d');

  // Pass 1: paint every cell at FULL pitch (no gaps). Cells own no part of the grid.
  //   inside box:  ink → on,   empty → off (the lit device area)
  //   outside box: ink → over (red), empty → bg (no device there)
  for (let py = 0; py < rows; py++)
    for (let px = 0; px < cols; px++) {
      const inBox = px < box.w && py < box.h;
      const lit = grid[py * cols + px];
      ctx.fillStyle = lit ? (inBox ? on : over) : (inBox ? off : bg);
      ctx.fillRect(px * pitch, py * pitch, pitch, pitch);
    }

  // Pass 2: draw the grid lines LAST, on top of the cells.
  // INVARIANT — DO NOT VIOLATE: each grid line is exactly ONE pixel thick — never
  // 0, never >1, and NEVER fractional. Because the lines are drawn independently
  // here (not left as leftover gaps behind the cells), every line spans the full
  // width/height of the canvas uniformly. `pitch` and `gap` are integers, so all
  // coordinates are integers. Do not add sub-pixel offsets, scaling, or rounding.
  if (gap) {
    ctx.fillStyle = bg;
    for (let px = 1; px < cols; px++) ctx.fillRect(px * pitch - gap, 0, gap, canvas.height);
    for (let py = 1; py < rows; py++) ctx.fillRect(0, py * pitch - gap, canvas.width, gap);
  }

  return { drawn, overflow };
}
