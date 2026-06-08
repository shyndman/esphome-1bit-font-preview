import {
  createSignal,
  createResource,
  createEffect,
  onCleanup,
  untrack,
  Show,
  For,
} from "solid-js";
import { loadCatalog, familyNames, weightsFor, ttfUrl } from "./catalog.js";
import { createEngine } from "./ftengine.js";
import { renderToCanvas, fitSize } from "./render.js";
import { FontPicker } from "./FontPicker.jsx";
import { readUrlState, writeUrlState, PARAM_DEFAULTS } from "./urlState.js";

// Common SSD1306-class OLED panels (and clones). The box is the fixed constraint.
const DEVICES = [
  { label: "128×32", w: 128, h: 32 },
  { label: "128×64", w: 128, h: 64 },
  { label: "128×128", w: 128, h: 128 },
];

const WEIGHT_LABELS = {
  100: "Thin",
  200: "Extra-Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semi-Bold",
  700: "Bold",
  800: "Extra-Bold",
  900: "Black",
};

const FIT_MODES = [
  { value: "recommended", label: "Recommended" },
  { value: "minimum", label: "Minimum" },
];

// Hold Shift while pressing Up/Down on a numeric input to jump by 10 instead of 1.
const SHIFT_STEP = 10;
function shiftStep(e, value, setValue, min, max) {
  if (!e.shiftKey) return;
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  e.preventDefault();
  const delta = e.key === "ArrowUp" ? SHIFT_STEP : -SHIFT_STEP;
  setValue(Math.min(max, Math.max(min, value + delta)));
}

const ttfCache = new Map();
async function fetchTtf(url) {
  if (!ttfCache.has(url)) {
    const buf = await (await fetch(url)).arrayBuffer();
    ttfCache.set(url, new Uint8Array(buf));
  }
  return ttfCache.get(url);
}

export default function App() {
  const [catalog] = createResource(loadCatalog);
  const [engine] = createResource(createEngine);

  // Hydrate the user-controlled state from the URL once at startup. `size` is
  // not persisted: auto-refit recomputes it (see serialize effect below).
  const initial = readUrlState();
  const [family, setFamily] = createSignal(initial.family);
  const [style, setStyle] = createSignal(initial.style);
  const [weight, setWeight] = createSignal(initial.weight);
  const [size, setSize] = createSignal(32);
  const [text, setText] = createSignal(initial.text);
  const [device, setDevice] = createSignal({ w: initial.w, h: initial.h });
  const [fitMode, setFitMode] = createSignal(initial.mode);
  const [error, setError] = createSignal("");
  const [dims, setDims] = createSignal(null);

  let canvas;

  // bump on viewport resize so the render effect recomputes the fit
  const [viewport, setViewport] = createSignal(0);
  const onResize = () => setViewport((n) => n + 1);
  window.addEventListener("resize", onResize);
  onCleanup(() => window.removeEventListener("resize", onResize));

  const names = () => (catalog() ? familyNames(catalog()) : []);
  const weights = () =>
    catalog() ? weightsFor(catalog(), family(), style()) : [];

  // keep weight valid for the selected family/style
  createEffect(() => {
    const w = weights();
    if (w.length && !w.includes(weight()))
      setWeight(w.includes(400) ? 400 : w[0]);
  });

  // keep family valid once the catalog resolves (a shared URL may name a family
  // we don't ship); fall back to the default rather than wedging the picker.
  createEffect(() => {
    const ns = names();
    if (ns.length && !ns.includes(family())) setFamily(PARAM_DEFAULTS.family);
  });

  // load the selected face into the engine
  const [face] = createResource(
    () =>
      catalog() && engine()
        ? {
            c: catalog(),
            e: engine(),
            family: family(),
            style: style(),
            weight: weight(),
          }
        : null,
    async (s) => {
      const url = ttfUrl(s.c, s.family, s.style, s.weight);
      if (!url) return null;
      const bytes = await fetchTtf(url);
      s.e.useFont(bytes);
      return url; // token to trigger re-render
    },
  );

  // Refit: pick the largest size whose selected measurement is contained in the current device box.
  const refit = () => {
    if (!engine() || !face()) return;
    setSize(fitSize(engine(), untrack(text), untrack(device), fitMode()));
  };

  // Auto-refit when the font face changes (family/style/weight) — a new face is a
  // new constraint problem. Text and device size deliberately do NOT refit, so you
  // can type/play past the box and watch the overflow before refitting by hand.
  createEffect(() => {
    face(); // dependency
    untrack(refit);
  });

  // (re)render whenever face / size / text / device / fit mode / viewport changes
  createEffect(() => {
    if (!engine() || !face() || !canvas) return;
    text();
    size();
    device();
    fitMode();
    viewport();
    try {
      setDims(
        renderToCanvas(canvas, engine(), {
          text: text(),
          size: size(),
          box: device(),
          mode: fitMode(),
        }),
      );
      setError("");
    } catch (e) {
      setError(String(e.message || e));
    }
  });

  // Mirror the persisted state back to the URL, debounced so rapid typing/drag
  // doesn't thrash history. `size` is deliberately not read: it isn't persisted,
  // so auto-refit never touches the URL.
  let urlTimer;
  createEffect(() => {
    const snapshot = {
      text: text(),
      family: family(),
      style: style(),
      weight: weight(),
      w: device().w,
      h: device().h,
      mode: fitMode(),
    };
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => writeUrlState(snapshot), 250);
  });
  onCleanup(() => clearTimeout(urlTimer));

  return (
    <div class="app">
      <h1>ESPHome 1-bit Font Preview</h1>
      <p class="sub">FreeType 2.14.3 · no HarfBuzz · byte-exact with ESPHome</p>

      <div class="controls">
        <div class="row">
          <label class="field text">
            <span>Text</span>
            <input
              type="text"
              value={text()}
              onInput={(e) => setText(e.currentTarget.value)}
            />
          </label>
        </div>

        <div class="row">
          <label class="field family">
          <span>Family</span>
          <Show
            when={catalog()}
            fallback={<div class="loading">loading catalog…</div>}
          >
            <FontPicker
              catalog={catalog()}
              names={names()}
              value={family()}
              onChange={setFamily}
            />
          </Show>
          </label>

          <label class="field gstyle">
          <span>Style</span>
          <select
            value={style()}
            onChange={(e) => setStyle(e.currentTarget.value)}
          >
            <option value="normal">Normal</option>
            <option value="italic">Italic</option>
          </select>
          </label>

          <label class="field gweight">
          <span>Weight ({weights().length})</span>
          <select
            class="weight"
            value={weight()}
            onChange={(e) => setWeight(Number(e.currentTarget.value))}
          >
            <For each={weights()}>
              {(w) => (
                <option value={w} selected={w === weight()}>
                  {w} · {WEIGHT_LABELS[w]}
                </option>
              )}
            </For>
          </select>
          </label>

          <label class="field gsize">
          <span>Size (px)</span>
          <input
            type="number"
            min="6"
            max="256"
            value={size()}
            onInput={(e) => setSize(Number(e.currentTarget.value) || 8)}
            onKeyDown={(e) => shiftStep(e, size(), setSize, 6, 256)}
          />
          </label>
        </div>

        <div class="row">
          <label class="field gdisplay">
          <span class="device-label">
            Display (px)
            <span class="presets">
              <For each={DEVICES}>
                {(d) => (
                  <button
                    type="button"
                    classList={{
                      preset: true,
                      active: device().w === d.w && device().h === d.h,
                    }}
                    onClick={() => setDevice({ w: d.w, h: d.h })}
                  >
                    {d.label}
                  </button>
                )}
              </For>
            </span>
          </span>
          <div class="device-row">
            <input
              type="number"
              min="8"
              max="512"
              value={device().w}
              onInput={(e) =>
                setDevice((d) => ({ ...d, w: Number(e.currentTarget.value) || 8 }))
              }
              onKeyDown={(e) =>
                shiftStep(e, device().w, (v) => setDevice((d) => ({ ...d, w: v })), 8, 512)
              }
            />
            <span class="x">×</span>
            <input
              type="number"
              min="8"
              max="512"
              value={device().h}
              onInput={(e) =>
                setDevice((d) => ({ ...d, h: Number(e.currentTarget.value) || 8 }))
              }
              onKeyDown={(e) =>
                shiftStep(e, device().h, (v) => setDevice((d) => ({ ...d, h: v })), 8, 512)
              }
            />
            <button type="button" class="refit" onClick={refit}>
              Refit
            </button>
          </div>
          </label>

          <div class="field fitmode">
            <span>Measure</span>
            <div class="modeseg" role="radiogroup" aria-label="Measurement mode">
              <For each={FIT_MODES}>
                {(m) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={fitMode() === m.value}
                    classList={{ modebtn: true, active: fitMode() === m.value }}
                    onClick={() => setFitMode(m.value)}
                  >
                    {m.label}
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>
      </div>

      <div class="screen">
        <Show when={!error()} fallback={<div class="error">{error()}</div>}>
          <div class="canvas-wrap">
            <canvas ref={canvas} />
            <Show when={dims()}>
              <span
                classList={{ "bound-tag": true, overflow: dims().overflow }}
                style={{
                  left: `${dims().corner.x}px`,
                  top: `${dims().corner.y}px`,
                }}
              >
                {dims().drawn.w}×{dims().drawn.h}
              </span>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}
