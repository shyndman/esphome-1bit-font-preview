// Resolution-focused view of the ESPHome display catalog. The source data is
// device-first (each device lists the resolutions it supports); the flyout wants
// the inverse, so we pivot to resolution -> supporting devices once at load.
import devices from "./esphome-devices.json";

const displayName = (deviceName) => deviceName.replace(/ family$/, "");

// One stable color per device, hues spread by the golden angle so neighbours stay
// distinct; uniform saturation/lightness keeps the set calm against the dark UI.
const DEVICE_COLORS = (() => {
  const names = [...new Set(devices.map((d) => displayName(d.deviceName)))].sort();
  const colors = new Map();
  names.forEach((n, i) =>
    colors.set(n, `hsl(${Math.round((i * 137.508) % 360)} 60% 70%)`),
  );
  return colors;
})();

// [{ w, h, label: "128×64", devices: [{ name, maxBpp, color }] }], sorted by pixel
// area ascending (small OLEDs first). Devices with no fixed resolution drop out.
export const RESOLUTION_PRESETS = pivot(devices);

function pivot(list) {
  const byRes = new Map();
  for (const dev of list) {
    for (const [w, h] of dev.resolutions) {
      const key = `${w}x${h}`;
      let entry = byRes.get(key);
      if (!entry) {
        entry = { w, h, label: `${w}×${h}`, devices: [] };
        byRes.set(key, entry);
      }
      const name = displayName(dev.deviceName);
      entry.devices.push({
        name,
        maxBpp: dev.maxBpp,
        color: DEVICE_COLORS.get(name),
      });
    }
  }
  return [...byRes.values()].sort((a, b) => a.w * a.h - b.w * b.h);
}
