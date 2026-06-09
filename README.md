# ESPHome Font Preview

Preview how any [Google Font](https://fonts.google.com/) renders as **1/2/4/8-bit
glyphs on an ESPHome display** — before you flash anything.

It runs FreeType in WebAssembly and mirrors ESPHome's own glyph path (mono via
`FT_LOAD_TARGET_MONO`, grayscale via `FT_LOAD_NO_BITMAP` quantized exactly like
ESPHome, point→pixel metrics, FreeType 2.14.3, no HarfBuzz), so the pixels you see
in the browser match the pixels the device draws.

**▶ Live demo: https://shyndman.github.io/esphome-1bit-font-preview/**

![Preview of the app rendering "Hello, world!" in Bungee Shade at 128×32](docs/preview.png)

## Features

- Browse all ~1,580 Google Fonts families with live style/weight selection.
- Pixel size + one-click **Refit** to the current display dimensions.
- **Bit depth** 1/2/4/8 — mono or anti-aliased grayscale, blended per ESPHome.
- **Measurement mode** — *Recommended* (ink + metrics) vs *Minimum* (tight ink box).
- Glyph-bounds overlay on the preview; overflow past the display frame turns red.
- Shareable URL state — the whole configuration round-trips through the address bar.
- `Shift`+`Arrow` steps numeric inputs by 10.

## Local development

```sh
cd app
npm install
npm run dev
```

The app is fully static and runs offline: the font catalog
(`app/public/fonts.json`) and the FreeType WASM (`app/public/wasm/`) are committed.
Font binaries (TTF) are fetched on demand from Google's CDN.

## Tests

```sh
npm --prefix app test
```

Golden parity tests assert the WASM engine reproduces ESPHome **byte-for-byte**. The
goldens (`app/test/fixtures/goldens/`) are extracted from real ESPHome codegen output
by [`data/gen-goldens.py`](data/gen-goldens.py), and the fixture TTFs are ESPHome's own
cached fonts — so the engine renders identical input and a match proves true parity,
sidestepping FreeType build-config differences (hinting, HarfBuzz, rasterizer options).

All four bit depths (`bpp` 1/2/4/8) are asserted byte-for-byte against ESPHome.

To regenerate after an ESPHome change: rebuild the oracle project
([`data/oracle/font-test.esp.yaml`](data/oracle/font-test.esp.yaml)) with `esphome compile`,
then run `python3 data/gen-goldens.py path/to/.esphome/build/font-test/src/main.cpp`.

## Refreshing the font catalog

The catalog is derived from [`jonathantneal/google-fonts-complete`][gfc], vendored as
a pinned git submodule, then shrunk to TTF URLs only:

```sh
git submodule update --init lib/google-fonts-complete
npm --prefix app run fonts   # -> regenerates app/public/fonts.json
```

## Rebuilding the WASM renderer

The renderer source is [`wasm/ftrender.c`](wasm/ftrender.c), linked against a
FreeType built for **byte-exact ESPHome parity**: version **2.14.3** (matching
ESPHome's Homebrew build) with **HarfBuzz disabled**. That archive comes from the
pinned [`shyndman/freetype.wasm`][ftw] submodule — discere-os's `freetype.wasm`
build wiring rebased onto FreeType's `VER-2-14-3` tag.

The compiled artifacts are committed under `app/public/wasm/`, so a rebuild is only
needed when `ftrender.c` (or the FreeType build) changes. To rebuild you need
[emscripten](https://emscripten.org/) on `PATH` (download it like any other
toolchain):

```sh
# 1. Build libfreetype.a (FreeType 2.14.3, HarfBuzz off) from the submodule
cd lib/freetype.wasm
meson setup build-wasm --cross-file scripts/emscripten.cross \
  -Ddefault_library=static -Dbuildtype=release \
  -Dharfbuzz=disabled -Dpng=disabled -Dbrotli=disabled -Dbzip2=disabled -Dzlib=internal
meson compile -C build-wasm freetype
cd ../..

# 2. Link ftrender.c against it -> app/public/wasm/ftrender.{mjs,wasm}
emcc wasm/ftrender.c lib/freetype.wasm/build-wasm/libfreetype.a \
  -I lib/freetype.wasm/include -I lib/freetype.wasm/build-wasm \
  -DFT_CONFIG_OPTIONS_H='<ftoption.h>' -DFT_CONFIG_CONFIG_H='<ftconfig.h>' -O3 \
  -sMODULARIZE -sEXPORT_ES6 -sEXPORT_NAME=createFT -sALLOW_MEMORY_GROWTH \
  -sEXPORTED_RUNTIME_METHODS=cwrap,ccall,UTF8ToString,HEAPU8 \
  -sEXPORTED_FUNCTIONS=_ft_init,_ft_new_face,_ft_set_px,_ft_load,_ft_width,_ft_height,_ft_pitch,_ft_left,_ft_top,_ft_advance,_ft_buffer,_ft_ascender,_ft_descender,_ft_line_height,_malloc,_free \
  -o app/public/wasm/ftrender.mjs
```

Then `npm --prefix app test` must stay green — the golden suite is the parity check
on the rebuild.

## Credits

- [`jonathantneal/google-fonts-complete`][gfc] — Google Fonts catalog data.
- [`discere-os/freetype.wasm`](https://github.com/discere-os/freetype.wasm) — the
  FreeType WebAssembly build wiring this fork is based on.
- [ESPHome](https://esphome.io/) — the rendering behaviour this mirrors.

[gfc]: https://github.com/jonathantneal/google-fonts-complete
[ftw]: https://github.com/shyndman/freetype.wasm
