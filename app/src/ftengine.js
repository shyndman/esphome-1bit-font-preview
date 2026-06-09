// Singleton FreeType wasm engine (FreeType 2.14.3, no HarfBuzz — matches Homebrew ESPHome).
// Mirrors ESPHome's glyph_to_glyphinfo: per-bpp load flags + pt_to_px metrics. bpp==1 unpacks
// the 1-bit MONO bitmap; bpp>1 quantizes the 8-bit GRAY bitmap exactly as ESPHome does.

let browserModulePromise;
// Browser module loader (default). The test harness injects a Node loader instead,
// so the engine logic below stays single-sourced across browser and `node --test`.
function loadBrowserModule() {
  // ftrender.mjs lives in <base>/wasm and resolves ftrender.wasm relative to itself.
  // Use a runtime absolute URL (origin + Vite base) so neither Vite's dev
  // import-analysis nor Rollup tries to bundle the emscripten glue, and so it
  // resolves correctly under a GitHub Pages project subpath.
  const url = `${location.origin}${import.meta.env.BASE_URL}wasm/ftrender.mjs`;
  browserModulePromise ??= import(/* @vite-ignore */ url).then((m) => m.default());
  return browserModulePromise;
}

export async function createEngine(loadModule = loadBrowserModule) {
  const m = await loadModule();
  const api = {
    init: m.cwrap('ft_init', 'number', []),
    newFace: m.cwrap('ft_new_face', 'number', ['number', 'number']),
    setPx: m.cwrap('ft_set_px', 'number', ['number']),
    load: m.cwrap('ft_load', 'number', ['number', 'number']),
    width: m.cwrap('ft_width', 'number', []),
    height: m.cwrap('ft_height', 'number', []),
    pitch: m.cwrap('ft_pitch', 'number', []),
    left: m.cwrap('ft_left', 'number', []),
    top: m.cwrap('ft_top', 'number', []),
    advance: m.cwrap('ft_advance', 'number', []),
    buffer: m.cwrap('ft_buffer', 'number', []),
    ascender: m.cwrap('ft_ascender', 'number', []),
    descender: m.cwrap('ft_descender', 'number', []),
    lineHeight: m.cwrap('ft_line_height', 'number', []),
  };
  if (api.init() !== 0) throw new Error('FT_Init failed');

  let curPtr = 0;
  return {
    // Install a font from raw TTF bytes (Uint8Array). Frees the previous one.
    useFont(bytes) {
      const ptr = m._malloc(bytes.length);
      m.HEAPU8.set(bytes, ptr);
      if (api.newFace(ptr, bytes.length) !== 0) {
        m._free(ptr);
        throw new Error('FT_New_Memory_Face failed (bad/unsupported font)');
      }
      if (curPtr) m._free(curPtr);
      curPtr = ptr;
    },
    setSize(px) {
      if (api.setPx(px) !== 0) throw new Error('FT_Set_Pixel_Sizes failed');
      return { ascender: api.ascender(), descender: api.descender(), lineHeight: api.lineHeight() };
    },
    glyph(codepoint, bpp = 1) {
      if (api.load(codepoint, bpp) !== 0) throw new Error('FT_Load_Char failed');
      const w = api.width(), h = api.height(), pitch = api.pitch(), buf = api.buffer();
      const pixels = new Uint8Array(w * h);
      if (bpp === 1) {
        // MONO bitmap: MSB-first, 1 bit/pixel -> coverage 0/1.
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const byte = m.HEAPU8[buf + y * pitch + (x >> 3)];
            pixels[y * w + x] = (byte >> (7 - (x & 7))) & 1;
          }
      } else {
        // GRAY bitmap: 1 byte/pixel. Quantize exactly as ESPHome glyph_to_glyphinfo:
        // pixel = gray_byte // (256 >> bpp)  -> coverage 0..(2^bpp - 1).
        const divisor = 256 >> bpp;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++)
            pixels[y * w + x] = (m.HEAPU8[buf + y * pitch + x] / divisor) | 0;
      }
      const maxCoverage = (1 << bpp) - 1;
      return { w, h, advance: api.advance(), left: api.left(), top: api.top(), pixels, bpp, maxCoverage };
    },
  };
}
