// Singleton FreeType wasm engine (FreeType 2.14.3, no HarfBuzz — matches Homebrew ESPHome).
// Mirrors ESPHome's glyph_to_glyphinfo: FT_LOAD_RENDER | FT_LOAD_TARGET_MONO, pt_to_px metrics.

let modulePromise;
function getModule() {
  // ftrender.mjs lives in /public/wasm and resolves ftrender.wasm relative to itself.
  // Use a runtime absolute URL so neither Vite's dev import-analysis nor Rollup
  // tries to bundle the emscripten glue.
  const url = `${location.origin}/wasm/ftrender.mjs`;
  modulePromise ??= import(/* @vite-ignore */ url).then((m) => m.default());
  return modulePromise;
}

export async function createEngine() {
  const m = await getModule();
  const api = {
    init: m.cwrap('ft_init', 'number', []),
    newFace: m.cwrap('ft_new_face', 'number', ['number', 'number']),
    setPx: m.cwrap('ft_set_px', 'number', ['number']),
    load: m.cwrap('ft_load', 'number', ['number']),
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
    glyph(codepoint) {
      if (api.load(codepoint) !== 0) throw new Error('FT_Load_Char failed');
      const w = api.width(), h = api.height(), pitch = api.pitch(), buf = api.buffer();
      const pixels = new Uint8Array(w * h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const byte = m.HEAPU8[buf + y * pitch + (x >> 3)];
          pixels[y * w + x] = (byte >> (7 - (x & 7))) & 1;
        }
      return { w, h, advance: api.advance(), left: api.left(), top: api.top(), pixels };
    },
  };
}
