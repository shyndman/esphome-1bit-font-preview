// URL <-> app state. The query string is the shared source of truth: hydrate
// signals from it on load, mirror signal changes back. `size` is intentionally
// excluded — auto-refit recomputes it, so it never round-trips through the URL.

const STYLES = new Set(["normal", "italic"]);
const MODES = new Set(["recommended", "minimum"]);

const W_MIN = 8;
const W_MAX = 512;

// Single source of truth for defaults. Keys are URL param names. `w`/`h` track
// DEVICES[1] (128×64), the app's default device.
export const PARAM_DEFAULTS = {
  text: "Hello, world!",
  family: "Roboto",
  style: "normal",
  weight: 400,
  w: 128,
  h: 64,
  mode: "recommended",
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Parse `location.search` into a fully-defaulted state object. Never throws:
// missing/invalid params fall back to their default. `family`/`weight` are
// validated against the catalog later, in App, since the catalog loads async.
export function readUrlState() {
  const p = new URLSearchParams(location.search);

  const num = (key) => {
    const raw = p.get(key);
    if (raw === null || raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const enumOr = (key, set) => {
    const v = p.get(key);
    return v !== null && set.has(v) ? v : PARAM_DEFAULTS[key];
  };

  const weight = num("weight");
  const w = num("w");
  const h = num("h");

  return {
    text: p.get("text") ?? PARAM_DEFAULTS.text,
    family: p.get("family") ?? PARAM_DEFAULTS.family,
    style: enumOr("style", STYLES),
    weight: weight ?? PARAM_DEFAULTS.weight,
    w: w !== null ? clamp(w, W_MIN, W_MAX) : PARAM_DEFAULTS.w,
    h: h !== null ? clamp(h, W_MIN, W_MAX) : PARAM_DEFAULTS.h,
    mode: enumOr("mode", MODES),
  };
}

// Serialize state back to the URL via replaceState, omitting any param that
// equals its default so a fresh app keeps a clean pathname-only URL.
export function writeUrlState(state) {
  const p = new URLSearchParams();
  for (const key of Object.keys(PARAM_DEFAULTS)) {
    if (state[key] !== PARAM_DEFAULTS[key]) p.set(key, String(state[key]));
  }
  const qs = p.toString();
  history.replaceState(
    null,
    "",
    qs ? `${location.pathname}?${qs}` : location.pathname,
  );
}
