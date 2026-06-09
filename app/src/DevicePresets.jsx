import { For, createSignal } from "solid-js";
import * as Popover from "@kobalte/core/popover";
import { RESOLUTION_PRESETS } from "./devices.js";

// Icon-button flyout of ESPHome display presets, organized by resolution. Each
// row is a resolution; the devices that support it ride along as chips.
//   - the row itself (anywhere but a chip) -> set device size only (onResolution)
//   - device chip -> set size AND that device's max bit depth (onDevice)
//
// Props: value {w,h} (current device), onResolution({w,h}), onDevice({w,h,bpp}).
export function DevicePresets(props) {
  const [open, setOpen] = createSignal(false);
  const isActive = (r) => props.value.w === r.w && props.value.h === r.h;
  const pickResolution = (r) => {
    props.onResolution({ w: r.w, h: r.h });
    setOpen(false);
  };

  return (
    <Popover.Root open={open()} onOpenChange={setOpen} placement="bottom-start">
      <Popover.Trigger class="preset-trigger" aria-label="Display presets">
        <DisplayIcon />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content class="preset-pop">
          <ul class="preset-list">
            <For each={RESOLUTION_PRESETS}>
              {(r) => (
                <li
                  classList={{ "preset-row": true, active: isActive(r) }}
                  role="button"
                  tabindex="0"
                  onClick={() => pickResolution(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      pickResolution(r);
                    }
                  }}
                >
                  <span class="preset-res">{r.label}</span>
                  <span class="preset-chips">
                    <For each={r.devices}>
                      {(d) => (
                        <button
                          type="button"
                          class="preset-chip"
                          style={{ "--chip": d.color }}
                          title={`${d.name} \u00b7 up to ${d.maxBpp}-bit`}
                          onClick={(e) => {
                            e.stopPropagation();
                            props.onDevice({ w: r.w, h: r.h, bpp: d.maxBpp });
                            setOpen(false);
                          }}
                        >
                          {d.name}
                        </button>
                      )}
                    </For>
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function DisplayIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
