/* Minimal FreeType mono render API for the browser, mirroring ESPHome's
 * glyph_to_glyphinfo (bpp=1): FT_LOAD_RENDER | FT_LOAD_TARGET_MONO, pt_to_px metrics.
 * Compiled to wasm; JS reads the MONO bitmap buffer directly. */
#include <emscripten.h>
#include <ft2build.h>
#include FT_FREETYPE_H

static FT_Library g_lib;
static FT_Face    g_face;

static long pt_to_px(long pt) { return (pt + 63) / 64; }

EMSCRIPTEN_KEEPALIVE int ft_init(void) { return FT_Init_FreeType(&g_lib); }

EMSCRIPTEN_KEEPALIVE int ft_new_face(const unsigned char *data, int len) {
    if (g_face) { FT_Done_Face(g_face); g_face = 0; }
    return FT_New_Memory_Face(g_lib, data, len, 0, &g_face);
}

EMSCRIPTEN_KEEPALIVE int ft_set_px(int px) { return FT_Set_Pixel_Sizes(g_face, px, 0); }

EMSCRIPTEN_KEEPALIVE int ft_load(unsigned int codepoint) {
    return FT_Load_Char(g_face, codepoint, FT_LOAD_RENDER | FT_LOAD_TARGET_MONO);
}

/* glyph accessors (valid after ft_load) */
EMSCRIPTEN_KEEPALIVE int ft_width(void)   { return g_face->glyph->bitmap.width; }
EMSCRIPTEN_KEEPALIVE int ft_height(void)  { return g_face->glyph->bitmap.rows; }
EMSCRIPTEN_KEEPALIVE int ft_pitch(void)   { return g_face->glyph->bitmap.pitch; }
EMSCRIPTEN_KEEPALIVE int ft_left(void)    { return g_face->glyph->bitmap_left; }
EMSCRIPTEN_KEEPALIVE int ft_top(void)     { return g_face->glyph->bitmap_top; }
EMSCRIPTEN_KEEPALIVE int ft_advance(void) { return (int)pt_to_px(g_face->glyph->metrics.horiAdvance); }
EMSCRIPTEN_KEEPALIVE const unsigned char *ft_buffer(void) { return g_face->glyph->bitmap.buffer; }

/* face metrics (valid after ft_set_px) */
EMSCRIPTEN_KEEPALIVE int ft_ascender(void)  { return (int)pt_to_px(g_face->size->metrics.ascender); }
EMSCRIPTEN_KEEPALIVE int ft_descender(void) { return (int)pt_to_px(g_face->size->metrics.descender); }
EMSCRIPTEN_KEEPALIVE int ft_line_height(void){ return (int)pt_to_px(g_face->size->metrics.height); }
