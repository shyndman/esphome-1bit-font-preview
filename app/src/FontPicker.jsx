import { For, Show, onCleanup, onMount, createEffect, createSignal } from 'solid-js';
import * as Combobox from '@kobalte/core/combobox';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { ensureLabelFont } from './labelFont.js';

const ROW_H = 44;
const IDLE_MS = 600;

// Virtualized listbox body: Kobalte hands us the filtered `items()` collection.
function VirtualListbox(props) {
  let listboxRef;
  let virtualizer;
  let idleTimer;

  // load a glyph-subset font for every family in view, plus one page above/below.
  // ensureLabelFont dedupes, so re-running on scroll never re-requests a family.
  const loadVisible = () => {
    const vis = virtualizer.getVirtualItems();
    if (!vis.length) return;
    const total = itemsRef()?.getSize() ?? 0;
    const pageRows = Math.max(1, Math.floor((listboxEl?.clientHeight || 320) / ROW_H));
    const first = Math.max(0, vis[0].index - pageRows);
    const last = Math.min(total - 1, vis[vis.length - 1].index + pageRows);
    for (let i = first; i <= last; i++) {
      const fam = itemsRef()?.at(i)?.rawValue;
      if (fam) ensureLabelFont(props.catalog, fam);
    }
  };

  const onScroll = () => {
    props.onScrollStart?.();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      props.onScrollIdle?.();
      loadVisible(); // scrolling settled → fetch fonts for the now-visible rows
    }, IDLE_MS);
  };
  onCleanup(() => clearTimeout(idleTimer));

  return (
    <Combobox.Listbox
      ref={(el) => { listboxRef = el; listboxEl = el; }}
      class="cb-listbox"
      onScroll={onScroll}
      scrollToItem={(key) => {
        const node = virtualizer && itemsRef()?.getItem(key);
        if (node) virtualizer.scrollToIndex(node.index);
      }}
    >
      {(items) => {
        // expose items() to scrollToItem above
        itemsRef = items;
        virtualizer = createVirtualizer({
          get count() { return items().getSize(); },
          getScrollElement: () => listboxRef,
          estimateSize: () => ROW_H,
          overscan: 8,
        });
        // initial open + every filter change: load fonts for the first visible rows
        createEffect(() => {
          items(); // track filter
          const t = setTimeout(loadVisible, 80); // let the virtualizer measure first
          onCleanup(() => clearTimeout(t));
        });
        return (
          <div class="cb-virt" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            <For each={virtualizer.getVirtualItems()}>
              {(row) => {
                const node = items().at(row.index);
                return (
                  <Show when={node}>
                    <Combobox.Item
                      item={node}
                      class="cb-item"
                      style={{ height: `${row.size}px`, transform: `translateY(${row.start}px)` }}
                    >
                      <Combobox.ItemLabel class="cb-name" style={{ 'font-family': `'${node.rawValue}', sans-serif` }}>
                        {node.rawValue}
                      </Combobox.ItemLabel>
                      <span class="cb-cat">{props.catalog.fonts[node.rawValue]?.category}</span>
                      <Combobox.ItemIndicator class="cb-check">✓</Combobox.ItemIndicator>
                    </Combobox.Item>
                  </Show>
                );
              }}
            </For>
          </div>
        );
      }}
    </Combobox.Listbox>
  );
}

// module-scoped handles shared between the input (in FontPicker) and the listbox body
let itemsRef = () => undefined;
let listboxEl; // the scrollable listbox element, when the dropdown is open

// PageUp/PageDown on the focused input moves the active option by a page, like the
// Arrow keys do. We suppress Kobalte's own (incorrect) Page handling via
// preventDefault/stopPropagation, then drive its correct single-step Arrow logic
// N times so it also handles scroll-into-view.
function pageKeyDown(e) {
  if (e.key !== 'PageDown' && e.key !== 'PageUp') return;
  if (!listboxEl || !listboxEl.isConnected) return;
  e.preventDefault();
  e.stopPropagation();
  const rows = Math.max(1, Math.floor(listboxEl.clientHeight / ROW_H) - 1);
  const arrow = e.key === 'PageDown' ? 'ArrowDown' : 'ArrowUp';
  const input = e.currentTarget;
  for (let i = 0; i < rows; i++) {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: arrow, bubbles: true, cancelable: true }));
  }
}

export function FontPicker(props) {
  const [open, setOpen] = createSignal(false);

  // Track Ctrl in capture phase so it's accurate before Kobalte's own handlers run.
  let ctrlHeld = false;
  onMount(() => {
    const upd = (e) => (ctrlHeld = e.ctrlKey);
    addEventListener('keydown', upd, true);
    addEventListener('keyup', upd, true);
    onCleanup(() => {
      removeEventListener('keydown', upd, true);
      removeEventListener('keyup', upd, true);
    });
  });

  const onInputKeyDown = (e) => {
    // Ctrl + Up/Down: commit the previous/next family as the selection
    if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      e.stopPropagation();
      const names = props.names;
      const i = names.indexOf(props.value);
      const j = Math.max(0, Math.min(names.length - 1, (i < 0 ? 0 : i) + (e.key === 'ArrowDown' ? 1 : -1)));
      if (names[j] && names[j] !== props.value) props.onChange(names[j]);
      return;
    }
    pageKeyDown(e);
  };

  return (
    <Combobox.Root
      options={props.names}
      value={props.value}
      onChange={(v) => v && props.onChange(v)}
      open={open()}
      onOpenChange={(o) => { if (o && ctrlHeld) return; setOpen(o); }}
      virtualized
      placeholder={`Search ${props.names.length.toLocaleString()} fonts…`}
      class="cb-root"
    >
      <Combobox.Control class="cb-control" aria-label="Font family">
        <Combobox.Input class="cb-input" onKeyDown={onInputKeyDown} />
        <Combobox.Trigger class="cb-trigger">
          <Combobox.Icon>▾</Combobox.Icon>
        </Combobox.Trigger>
      </Combobox.Control>
      <Combobox.Portal>
        <Combobox.Content class="cb-content">
          <VirtualListbox catalog={props.catalog} />
        </Combobox.Content>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
