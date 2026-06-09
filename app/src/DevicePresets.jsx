import { For, Show, createSignal } from "solid-js";
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

  // --- 2D roving focus over the resolution/chip grid ---------------------
  // The open menu is a grid: each .preset-row <li> is col 0 (the resolution);
  // its .preset-chip buttons are cols >=1. Exactly one cell holds tabindex=0;
  // navigation moves real DOM focus, which also scrolls the cell into view.
  let popRef; // the .preset-pop Content container (parent of the <ul>)
  let currentCell = null;

  const syncRoving = (el) => {
    if (!el || el === currentCell) return;
    if (currentCell) currentCell.tabIndex = -1;
    el.tabIndex = 0;
    currentCell = el;
  };
  const focusCell = (el) => {
    if (!el) return;
    syncRoving(el);
    el.focus();
  };
  const rowFor = (value) => {
    const rows = [...popRef.querySelectorAll(".preset-row")];
    const idx = RESOLUTION_PRESETS.findIndex(
      (r) => r.w === value.w && r.h === value.h,
    );
    return rows[idx >= 0 ? idx : 0];
  };

  // mouse focus (click a chip) reuses the roving pointer so keyboard resumes there
  const onFocusIn = (e) => {
    const cell = e.target.closest?.(".preset-chip, .preset-row");
    if (cell && popRef.contains(cell)) syncRoving(cell);
  };

  const onKeyDown = (e) => {
    const rows = [...popRef.querySelectorAll(".preset-row")];
    if (!rows.length) return;
    const active = e.target.closest?.(".preset-chip, .preset-row");
    // Focus may sit on the .preset-pop container (e.g. a click on its padding);
    // any navigation key then re-homes onto the active/first resolution.
    if (!active) {
      if (
        ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End",
          "PageDown", "PageUp"].includes(e.key)
      ) {
        e.preventDefault();
        focusCell(rowFor(props.value));
      }
      return;
    }
    const isChip = active.classList.contains("preset-chip");
    const row = isChip ? active.closest(".preset-row") : active;
    const rowIdx = rows.indexOf(row);
    const cells = [row, ...row.querySelectorAll(".preset-chip")];
    const colIdx = isChip ? cells.indexOf(active) : 0;
    const lastRow = rows.length - 1;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusCell(rows[Math.min(lastRow, rowIdx + 1)]); // col resets to 0
        break;
      case "ArrowUp":
        e.preventDefault();
        focusCell(rows[Math.max(0, rowIdx - 1)]);
        break;
      case "ArrowRight":
        e.preventDefault();
        focusCell(cells[Math.min(cells.length - 1, colIdx + 1)]);
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusCell(cells[Math.max(0, colIdx - 1)]);
        break;
      case "Home":
        e.preventDefault();
        focusCell(rows[0]);
        break;
      case "End":
        e.preventDefault();
        focusCell(rows[lastRow]);
        break;
      case "PageDown":
      case "PageUp": {
        e.preventDefault();
        const rowH = row.offsetHeight || 1;
        const step = Math.max(1, Math.floor(popRef.clientHeight / rowH) - 1);
        const target =
          e.key === "PageDown"
            ? Math.min(lastRow, rowIdx + step)
            : Math.max(0, rowIdx - step);
        focusCell(rows[target]); // col 0
        break;
      }
      case "Enter":
      case " ":
        // Chips are native <button>s: let their built-in activation fire onClick
        // (Space scroll is already suppressed by the button). The resolution row
        // is a role=button <li>, so it needs manual activation + Space guard.
        if (!isChip) {
          e.preventDefault();
          pickResolution(RESOLUTION_PRESETS[rowIdx]);
        }
        break;
    }
  };

  const setPopRef = (el) => {
    popRef = el;
    el.addEventListener("keydown", onKeyDown);
    el.addEventListener("focusin", onFocusIn);
  };

  // Own initial focus inside Kobalte's modal FocusScope mount: prevent its
  // default (which would focus the container, leaving arrow keys dead) and put
  // focus on the active resolution (or the first row) ourselves.
  const onOpenAutoFocus = (e) => {
    e.preventDefault();
    currentCell = null;
    focusCell(rowFor(props.value));
  };

  return (
    <Popover.Root open={open()} onOpenChange={setOpen} placement="bottom-start">
      <Popover.Trigger class="preset-trigger" aria-label="Display presets">
        <DisplayIcon />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          class="preset-pop"
          ref={setPopRef}
          onOpenAutoFocus={onOpenAutoFocus}
        >
          <ul class="preset-list">
            <For each={RESOLUTION_PRESETS}>
              {(r) => (
                <li
                  classList={{ "preset-row": true, active: isActive(r) }}
                  role="button"
                  tabindex="-1"
                  onClick={() => pickResolution(r)}
                >
                  <span class="preset-res">{r.label}</span>
                  <span class="preset-chips">
                    <For each={r.devices}>
                      {(d) => (
                        <button
                          type="button"
                          class="preset-chip"
                          tabindex="-1"
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
                  <Show when={isActive(r)}>
                    <span class="preset-check" aria-hidden="true">
                      {"\u2713"}
                    </span>
                  </Show>
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
