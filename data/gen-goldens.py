#!/usr/bin/env python3
"""Extract golden glyph coverage maps from real ESPHome codegen output.

ESPHome compiles each (font, size, bpp, glyph) into a packed PROGMEM bitstream plus a
font::Glyph metrics table in its generated main.cpp. This reads that file directly --
the authoritative oracle, produced by ESPHome itself on its own FreeType build -- and
writes one ASCII hex coverage map per (font, size, bpp). app/test/glyphs.test.js then
asserts the browser WASM engine reproduces these byte-for-byte, which is the project's
byte-exact-with-ESPHome guarantee.

Using ESPHome's actual output (rather than re-running FreeType ourselves) sidesteps
FreeType build-config differences -- hinting modules, HarfBuzz, rasterizer options --
that make a same-version libfreetype produce different pixels than ESPHome's.

The matching fixture TTFs in app/test/fixtures/fonts are ESPHome's own cached files
(.esphome/font/*.ttf), so the engine renders byte-identical input.

Regenerate after rebuilding the font-test ESPHome project (data/oracle/font-test.esp.yaml):
    python3 data/gen-goldens.py [path/to/.esphome/build/font-test/src/main.cpp]
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOLDENS = ROOT / "app" / "test" / "fixtures" / "goldens"
DEFAULT_MAIN = Path(
    "/home/shyndman/dev/projects/esphome-configs/.esphome/build/font-test/src/main.cpp"
)

DATA_RE = re.compile(r"static constexpr uint8_t (\w+)\[\] PROGMEM = \{(.*)\};")
GLYPHS_RE = re.compile(r"static const font::Glyph (\w+)\[\] = \{(.*)\};")
GLYPH_RE = re.compile(r"\{(\d+), \((\w+) \+ (\d+)\), (\d+), (\d+), (\d+), (\d+), (\d+)\}")
FONT_RE = re.compile(r"new\((\w+)\) font::Font\((\w+), .*, (\d+)\);")


def field_width(bpp: int) -> int:
    """Hex chars per pixel: one for bpp 1/2/4 (max value 15), two for bpp 8 (255)."""
    return 1 if bpp <= 4 else 2


def unpack(data: list[int], offset: int, width: int, height: int, bpp: int) -> list[list[int]]:
    """Reverse ESPHome's MSB-first bit packing into a height x width coverage grid."""
    grid = []
    pos = offset * 8
    for _y in range(height):
        row = []
        for _x in range(width):
            value = 0
            for _bit in range(bpp):
                value = (value << 1) | ((data[pos >> 3] >> (7 - (pos & 7))) & 1)
                pos += 1
            row.append(value)
        grid.append(row)
    return grid


def render_block(cp: int, adv: int, ox: int, oy: int, w: int, h: int, grid, bpp: int) -> str:
    fw = field_width(bpp)
    head = f"glyph U+{cp:04X} w={w} h={h} ox={ox} oy={oy} adv={adv}"
    rows = ["".join(f"{v:0{fw}x}" for v in row) for row in grid]
    return "\n".join([head, *rows])


def main() -> None:
    main_cpp = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_MAIN
    text = main_cpp.read_text()

    data_arrays = {
        name: [int(b, 16) for b in body.replace(" ", "").split(",") if b]
        for name, body in DATA_RE.findall(text)
    }
    glyph_tables = {name: body for name, body in GLYPHS_RE.findall(text)}

    GOLDENS.mkdir(parents=True, exist_ok=True)
    for instance, glyph_arr, bpp in FONT_RE.findall(text):
        bpp = int(bpp)
        font_id, size = instance.rsplit("_", 2)[0], int(instance.rsplit("_", 2)[1])
        blocks = []
        for cp, data_name, off, adv, ox, oy, w, h in GLYPH_RE.findall(glyph_tables[glyph_arr]):
            cp, off, adv, ox, oy, w, h = map(int, (cp, off, adv, ox, oy, w, h))
            grid = unpack(data_arrays[data_name], off, w, h, bpp)
            blocks.append(render_block(cp, adv, ox, oy, w, h, grid, bpp))
        header = f"# {font_id} {size}px bpp{bpp} — extracted from ESPHome main.cpp (oracle)"
        out = GOLDENS / f"{font_id}_{size}px_bpp{bpp}.txt"
        out.write_text(header + "\n\n" + "\n\n".join(blocks) + "\n")
        print("wrote", out.relative_to(ROOT))


if __name__ == "__main__":
    main()
