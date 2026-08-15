/**
 * Fisheye Flyout Menu — DOM controller
 *
 * Fitts's Law optimization for cascading menus:
 * - Items near the mouse get taller targets (larger W in Fitts's equation)
 * - Items far from mouse compress to minHeight
 * - Font size scales proportionally with item height
 * - Steering corridor prevents flyout dismissal during diagonal mouse travel
 *
 * Pure layout math lives in fisheye-core.js; this file handles DOM,
 * events, and menu lifecycle.
 */

import { computeFisheyeHeights, computeDefaultHeights, DEFAULT_CONFIG } from './fisheye-core.js';

// ── Default configuration ──────────────────────────────────────

const DEFAULTS = {
  baseHeight: 28,       // Default item height (px)
  maxExpand: 2.4,       // Hovered item weight relative to base
  minHeight: 21,        // Compressed item floor (px)
  falloffRadius: 4,     // Neighbor count on each side that get partial expansion
  flyoutGap: 2,         // Horizontal gap between parent and flyout (px)
  flyoutDelay: 120,     // Delay before opening flyout on hover (ms)
  separator: 'line',    // Item separator: false | 'line' | 'groove'
  separatorColor: 'rgba(255,255,255,0.08)',
  separatorThickness: 1,
  onSelect: null,       // Callback: (item) => {} — called on leaf item selection
  debug: false,         // Show height debug overlay
  overlay: false,       // Show background overlay when menu is open
  theme: 'dark',        // 'dark' | 'light' | null (use inherited CSS vars)
  barTrigger: 'click',  // 'click' | 'hover' — how the menu bar opens dropdowns
  flyoutTrigger: 'hover', // 'hover' | 'click' — how flyout submenus open
  fisheye: true,          // Enable fisheye size magnification on hover
  fontMin: 0,             // Floor for the height-scaled font size (px)
  fontMax: Infinity,      // Ceiling for the height-scaled font size (px)
};

// ── Instance state ─────────────────────────────────────────────

let CONFIG = { ...DEFAULTS };
let debugEl = null;
let openMenus = [];
let activeBarItem = null;
let menuBarActive = false;
let flyoutTimeout = null;
let lastMousePos = { x: 0, y: 0 };
let prevMouseX = 0;
let prevMouseY = 0;
let steeringCorridor = null;
let boundDocMouseDown = null;
let overlayEl = null;

document.addEventListener('mousemove', (e) => {
  lastMousePos.x = e.clientX;
  lastMousePos.y = e.clientY;
});

// ── Panel construction ─────────────────────────────────────────

/**
 * Build a menu panel from an array of item descriptors.
 * Each item: { label: string, children?: item[], swatch?: [r,g,b] }
 * Separator: the string '---'
 */
function createPanel(items, depth = 0) {
  const panel = document.createElement('div');
  panel.className = 'fisheye-panel';
  panel.dataset.depth = depth;
  panel.setAttribute('role', 'menu');

  const totalHeight = items.length * CONFIG.baseHeight;
  // Per-item base weights (item.weight, default 1) — indices track _itemEls,
  // so separators are skipped. Lets a panel allot height proportionally
  // (e.g. map-like menus where an item's size mirrors a physical extent).
  const weights = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];

    if (item === '---') {
      const sep = document.createElement('div');
      sep.className = 'fisheye-separator';
      panel.appendChild(sep);
      continue;
    }
    weights.push(item.weight > 0 ? item.weight : 1);

    const el = document.createElement('div');
    el.className = 'fisheye-item';
    el.dataset.index = idx;
    el.style.height = CONFIG.baseHeight + 'px';
    el.setAttribute('role', 'menuitem');
    el.setAttribute('tabindex', '-1');
    if (item.children?.length) {
      el.setAttribute('aria-haspopup', 'true');
      el.setAttribute('aria-expanded', 'false');
    }

    if (item.swatch) {
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = `rgb(${item.swatch.join(',')})`;
      el.appendChild(sw);
    }

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = item.label;
    el.appendChild(label);

    if (item.children?.length) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '\u25B6';
      el.appendChild(arrow);
    }

    if (CONFIG.separator && idx < items.length - 1) {
      const kind = CONFIG.separator === 'groove' ? 'groove' : 'solid';
      el.style.borderBottom = `${kind} ${CONFIG.separatorThickness}px ${CONFIG.separatorColor}`;
    }

    el.addEventListener('mouseenter', (e) => {
      lastMousePos.x = e.clientX;
      lastMousePos.y = e.clientY;
      onItemEnter(panel, el, item, idx, depth);
    });

    el.addEventListener('click', () => {
      if (item.children?.length) {
        // Click to open flyout (works in both modes)
        closeFlyoutsAboveDepth(depth);
        openFlyout(panel, el, item, depth);
      } else {
        selectItem(item);
      }
    });

    el.addEventListener('keydown', (e) => {
      onItemKeydown(e, panel, el, item, idx, depth);
    });

    // Mouse movement clears keyboard highlight across all open panels
    el.addEventListener('mousemove', () => {
      for (const p of openMenus) clearHighlight(p);
    });

    panel.appendChild(el);
  }

  panel.addEventListener('mousemove', (e) => onPanelMouseMove(panel, e));
  panel.addEventListener('mouseleave', () => onPanelMouseLeave());

  panel._items = items;
  panel._itemEls = Array.from(panel.querySelectorAll('.fisheye-item'));
  panel._totalHeight = totalHeight;
  panel._weights = weights.some(w => w !== 1) ? weights : null;
  panel._depth = depth;

  // Measure and lock width before showing
  document.body.appendChild(panel);
  panel.style.visibility = 'hidden';
  panel.style.display = 'block';
  panel.style.width = 'auto';
  const naturalWidth = panel.offsetWidth;
  panel.style.width = Math.ceil(naturalWidth * 1.3) + 'px';
  panel.style.display = '';
  panel.style.visibility = '';

  return panel;
}

// ── Fisheye height + font application ──────────────────────────

function onPanelMouseMove(panel, e) {
  const { _itemEls: itemEls } = panel;
  if (!itemEls.length) return;

  // Hit-test using rendered positions (robust during CSS transitions)
  let hoveredIdx = -1;
  for (let i = 0; i < itemEls.length; i++) {
    const rect = itemEls[i].getBoundingClientRect();
    if (e.clientY >= rect.top && e.clientY < rect.bottom) {
      hoveredIdx = i;
      break;
    }
  }

  // Between items (padding/separator gap) — keep current state
  if (hoveredIdx < 0) return;

  const heights = CONFIG.fisheye
    ? computeFisheyeHeights(itemEls.length, hoveredIdx, panel._totalHeight, CONFIG, panel._weights)
    : computeDefaultHeights(itemEls.length, panel._totalHeight, CONFIG, panel._weights);
  applyHeights(panel, heights);
  updateDebug(hoveredIdx, heights);
  updateSteeringCorridor(panel);
}

function onPanelMouseLeave() {
  // Keep fisheye state while menu system is open — avoids flash
  // to uniform heights when mouse briefly exits to menubar or gap
  if (menuBarActive) return;
}

/** Set item heights and scale font proportionally. */
function applyHeights(panel, heights) {
  const { _itemEls: itemEls } = panel;
  for (let i = 0; i < itemEls.length; i++) {
    const h = heights[i];
    itemEls[i].style.height = h + 'px';
    itemEls[i].style.fontSize = CONFIG.fisheye
      ? Math.min(Math.max(h * 0.5, CONFIG.fontMin), CONFIG.fontMax) + 'px'
      : '';
  }
}

// ── Keyboard navigation ────────────────────────────────────────

function onItemKeydown(e, panel, el, item, idx, depth) {
  const { _itemEls: itemEls, _items: items } = panel;

  switch (e.key) {
    case 'ArrowDown': {
      e.preventDefault();
      const next = idx + 1 < itemEls.length ? idx + 1 : 0;
      focusItem(panel, next);
      break;
    }
    case 'ArrowUp': {
      e.preventDefault();
      const prev = idx - 1 >= 0 ? idx - 1 : itemEls.length - 1;
      focusItem(panel, prev);
      break;
    }
    case 'ArrowRight': {
      e.preventDefault();
      if (item.children?.length) {
        // Open flyout and focus its first item
        closeFlyoutsAboveDepth(depth);
        openFlyout(panel, el, item, depth);
        const childPanel = openMenus[openMenus.length - 1];
        if (childPanel) focusItem(childPanel, 0);
        // Update aria-expanded
        el.setAttribute('aria-expanded', 'true');
      }
      break;
    }
    case 'ArrowLeft': {
      e.preventDefault();
      if (depth > 0) {
        // Close this flyout, refocus trigger in parent
        closeFlyoutsAboveDepth(depth - 1);
        steeringCorridor = null;
        // Find parent panel and refocus the item that opened this flyout
        const parentPanel = openMenus[openMenus.length - 1];
        if (parentPanel) {
          const parentItems = parentPanel._itemEls;
          // Find which parent item had aria-expanded=true
          for (let i = 0; i < parentItems.length; i++) {
            if (parentItems[i].getAttribute('aria-expanded') === 'true') {
              parentItems[i].setAttribute('aria-expanded', 'false');
              focusItem(parentPanel, i);
              break;
            }
          }
        }
      }
      break;
    }
    case 'Home': {
      e.preventDefault();
      focusItem(panel, 0);
      break;
    }
    case 'End': {
      e.preventDefault();
      focusItem(panel, itemEls.length - 1);
      break;
    }
    case 'Enter':
    case ' ': {
      e.preventDefault();
      if (item.children?.length) {
        // Treat like ArrowRight — open submenu
        closeFlyoutsAboveDepth(depth);
        openFlyout(panel, el, item, depth);
        const childPanel = openMenus[openMenus.length - 1];
        if (childPanel) focusItem(childPanel, 0);
        el.setAttribute('aria-expanded', 'true');
      } else {
        selectItem(item);
      }
      break;
    }
    case 'Escape': {
      e.preventDefault();
      closeAllMenus();
      break;
    }
  }
}

/** Focus an item by index, apply fisheye, set highlight class. */
function focusItem(panel, idx) {
  const { _itemEls: itemEls } = panel;
  if (idx < 0 || idx >= itemEls.length) return;

  // Clear old highlight
  clearHighlight(panel);

  // Set new highlight
  itemEls[idx].classList.add('highlighted');
  itemEls[idx].focus({ preventScroll: true });

  // Apply fisheye centered on this item
  const heights = CONFIG.fisheye
    ? computeFisheyeHeights(itemEls.length, idx, panel._totalHeight, CONFIG, panel._weights)
    : computeDefaultHeights(itemEls.length, panel._totalHeight, CONFIG, panel._weights);
  applyHeights(panel, heights);
  updateDebug(idx, heights);
}

/** Remove keyboard highlight and focus from all items in a panel. */
function clearHighlight(panel) {
  for (const el of panel._itemEls) {
    el.classList.remove('highlighted');
    if (document.activeElement === el) el.blur();
  }
}

// ── Selection ──────────────────────────────────────────────────

function selectItem(item) {
  closeAllMenus();
  if (CONFIG.onSelect) CONFIG.onSelect(item);
}

// ── Steering corridor ──────────────────────────────────────────
//
// Prevents flyout dismissal during diagonal mouse travel from a
// parent item to a flyout submenu. Defines a trapezoidal safe zone
// that expands from the parent panel toward the flyout. Item-enter
// events are suppressed while the mouse is inside this zone and
// moving rightward.

function isInSteeringCorridor(mx, my) {
  if (!steeringCorridor) return false;
  const { flyoutBottom, flyoutX } = steeringCorridor;

  // Two checks, both must pass:
  //
  // 1) FREE TRAVEL ZONE: the mouse is above the line from its current
  //    position to the lower-left corner of the flyout. Any point inside
  //    the triangle (cursor start, flyout top-left, flyout bottom-left)
  //    is a valid path toward the flyout.
  //
  // 2) MOVEMENT DIRECTION: horizontal movement exceeds vertical.
  //    If vertical dominates, the user is switching items, not steering.

  // Direction check
  const dx = Math.abs(mx - prevMouseX);
  const dy = Math.abs(my - prevMouseY);
  prevMouseX = mx;
  prevMouseY = my;

  if (dy >= dx) return false;

  // Free travel zone: is the mouse above the line from cursor to
  // the flyout's lower-left corner? If the mouse is below the
  // flyout bottom, it's overshot — not steering.
  if (my > flyoutBottom + 20) return false;

  // Must be heading rightward (toward the flyout)
  if (mx > flyoutX) return false;

  return true;
}

function updateSteeringCorridor(parentPanel) {
  const parentDepth = parseInt(parentPanel.dataset.depth);
  const childPanel = openMenus.find(
    p => parseInt(p.dataset.depth) === parentDepth + 1
  );

  if (!childPanel) {
    steeringCorridor = null;
    return;
  }

  const parentRect = parentPanel.getBoundingClientRect();
  const flyoutRect = childPanel.getBoundingClientRect();
  const flyoutIsRight = flyoutRect.left >= parentRect.left;

  steeringCorridor = {
    parentLeft: parentRect.left,
    triggerTop: parentRect.top,
    triggerBottom: parentRect.bottom,
    triggerX: flyoutIsRight ? parentRect.right : parentRect.left,
    flyoutTop: flyoutRect.top,
    flyoutBottom: flyoutRect.bottom,
    flyoutX: flyoutIsRight ? flyoutRect.left : flyoutRect.right,
  };
}

// ── Flyout lifecycle ───────────────────────────────────────────

function onItemEnter(panel, el, item, idx, depth) {
  // Only use steering corridor protection for items that have children.
  // Leaf items (no flyout) should always close the current flyout
  // immediately — no reason to protect passage to a flyout that
  // this item can't open.
  if (item.children?.length && isInSteeringCorridor(lastMousePos.x, lastMousePos.y)) return;

  closeFlyoutsAboveDepth(depth);
  steeringCorridor = null;

  if (!item.children?.length) return;

  // Only open flyout on hover if flyoutTrigger is 'hover'
  if (CONFIG.flyoutTrigger === 'hover') {
    clearTimeout(flyoutTimeout);
    flyoutTimeout = setTimeout(() => openFlyout(panel, el, item, depth), CONFIG.flyoutDelay);
  }
}

function openFlyout(parentPanel, triggerEl, item, parentDepth) {
  // Clear any previous trigger highlight, mark this one
  for (const el of parentPanel._itemEls) el.classList.remove('fisheye-trigger');
  triggerEl.classList.add('fisheye-trigger');

  const childPanel = createPanel(item.children, parentDepth + 1);
  childPanel.classList.add('flyout', 'open');

  const parentRect = parentPanel.getBoundingClientRect();
  const triggerRect = triggerEl.getBoundingClientRect();

  let left = parentRect.right + CONFIG.flyoutGap;
  let top = triggerRect.top;

  // Keep on screen — use actual rendered width
  const panelWidth = childPanel.offsetWidth || parseInt(childPanel.style.width) || 220;
  if (left + panelWidth > window.innerWidth) {
    // Not enough room on the right — try left side of parent
    const leftAlt = parentRect.left - panelWidth - CONFIG.flyoutGap;
    // Only flip if left side actually has room, otherwise keep right and let it overflow
    if (leftAlt >= 0) {
      left = leftAlt;
    }
  }
  if (top + childPanel._totalHeight > window.innerHeight) {
    top = Math.max(4, window.innerHeight - childPanel._totalHeight - 4);
  }

  childPanel.style.left = (left + window.scrollX) + 'px';
  childPanel.style.top = (top + window.scrollY) + 'px';

  // Initial heights — fisheye biased toward first item, or uniform
  const heights = CONFIG.fisheye
    ? computeFisheyeHeights(childPanel._itemEls.length, 0, childPanel._totalHeight, CONFIG, childPanel._weights)
    : computeDefaultHeights(childPanel._itemEls.length, childPanel._totalHeight, CONFIG, childPanel._weights);
  applyHeights(childPanel, heights);

  openMenus.push(childPanel);
  updateSteeringCorridor(parentPanel);
}

function closeFlyoutsAboveDepth(depth) {
  while (openMenus.length > 0) {
    const topPanel = openMenus[openMenus.length - 1];
    if (parseInt(topPanel.dataset.depth) > depth) {
      topPanel.remove();
      openMenus.pop();
      // Clear trigger highlight on the parent panel
      const parent = openMenus[openMenus.length - 1];
      if (parent) {
        for (const el of parent._itemEls) el.classList.remove('fisheye-trigger');
      }
    } else {
      break;
    }
  }
}

function closeAllMenus() {
  openMenus.forEach(p => p.remove());
  openMenus = [];
  if (activeBarItem) {
    activeBarItem.classList.remove('active');
    activeBarItem.setAttribute('aria-expanded', 'false');
    activeBarItem = null;
  }
  // Reset aria-expanded on all bar items
  document.querySelectorAll('.fisheye-menubar-item').forEach(
    el => el.setAttribute('aria-expanded', 'false')
  );
  menuBarActive = false;
  steeringCorridor = null;
  clearTimeout(flyoutTimeout);
  hideOverlay();
}

// ── Menu bar ───────────────────────────────────────────────────

function buildMenuBar(bar, menus) {
  bar.classList.add('fisheye-menubar');
  bar.setAttribute('role', 'menubar');

  const barItems = [];

  menus.forEach((menu, menuIdx) => {
    const barItem = document.createElement('div');
    barItem.className = 'fisheye-menubar-item';
    barItem.textContent = menu.label;
    barItem.setAttribute('role', 'menuitem');
    barItem.setAttribute('tabindex', menuIdx === 0 ? '0' : '-1');
    barItem.setAttribute('aria-haspopup', 'true');
    barItem.setAttribute('aria-expanded', 'false');

    barItem.addEventListener('click', (e) => {
      // Leaf items (no children) — fire onSelect directly
      if (!menu.children?.length) {
        e.stopPropagation();
        closeAllMenus();
        if (CONFIG.onSelect) CONFIG.onSelect(menu);
        return;
      }
    });

    barItem.addEventListener('mousedown', (e) => {
      e.preventDefault();
      barItem.focus();
      if (menu.children?.length && CONFIG.barTrigger === 'click') {
        if (activeBarItem === barItem && menuBarActive) {
          closeAllMenus();
        } else {
          openTopMenu(barItem, menu);
        }
      }
    });

    barItem.addEventListener('mouseenter', () => {
      if (CONFIG.barTrigger === 'hover') {
        // Hover mode: open on enter
        openTopMenu(barItem, menu);
      } else if (menuBarActive && activeBarItem !== barItem) {
        // Click mode: hover-to-switch once already open
        openTopMenu(barItem, menu);
      }
    });

    barItem.addEventListener('mouseleave', () => {
      if (CONFIG.barTrigger === 'hover' && !openMenus.length) {
        closeAllMenus();
      }
    });

    barItem.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowDown':
        case 'Enter':
        case ' ': {
          e.preventDefault();
          openTopMenu(barItem, menu);
          // Focus first item in the dropdown
          const panel = openMenus[0];
          if (panel) focusItem(panel, 0);
          barItem.setAttribute('aria-expanded', 'true');
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const next = (menuIdx + 1) % barItems.length;
          barItems[next].focus();
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const prev = (menuIdx - 1 + barItems.length) % barItems.length;
          barItems[prev].focus();
          break;
        }
        case 'Escape': {
          e.preventDefault();
          closeAllMenus();
          barItem.focus();
          break;
        }
      }
    });

    bar.appendChild(barItem);
    barItems.push(barItem);
  });

  boundDocMouseDown = (e) => {
    if (menuBarActive && !e.target.closest('.fisheye-menubar') && !e.target.closest('.fisheye-panel')) {
      closeAllMenus();
    }
  };
  document.addEventListener('mousedown', boundDocMouseDown);
}

function openTopMenu(barItem, menu) {
  closeAllMenus();

  activeBarItem = barItem;
  barItem.classList.add('active');
  menuBarActive = true;

  if (!menu.children?.length) return;

  const panel = createPanel(menu.children, 0);
  panel.classList.add('open');

  const rect = barItem.getBoundingClientRect();
  // Clamp to the viewport: a bar item near the right edge would otherwise
  // push its panel off-screen (narrow viewports especially).
  const left = Math.max(4, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 4));
  panel.style.left = (left + window.scrollX) + 'px';
  panel.style.top = (rect.bottom + window.scrollY) + 'px';

  const heights = CONFIG.fisheye
    ? computeFisheyeHeights(panel._itemEls.length, 0, panel._totalHeight, CONFIG, panel._weights)
    : computeDefaultHeights(panel._itemEls.length, panel._totalHeight, CONFIG, panel._weights);
  applyHeights(panel, heights);

  openMenus.push(panel);
  showOverlay();
}

// ── Background overlay ─────────────────────────────────────────

function showOverlay() {
  if (!CONFIG.overlay || !overlayEl) return;
  overlayEl.classList.add('active');
}

function hideOverlay() {
  if (!overlayEl) return;
  overlayEl.classList.remove('active');
}

// ── Debug overlay ──────────────────────────────────────────────

function updateDebug(hoveredIdx, heights) {
  if (!debugEl) return;
  debugEl.textContent = heights
    .map((h, i) => `${i === hoveredIdx ? '\u2192' : ' '} [${i}] ${h.toFixed(1)}px`)
    .join('  ');
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Create a fisheye menu bar.
 *
 * @param {HTMLElement} container - Element to build the menubar into
 * @param {object[]} menus - Array of top-level menu descriptors:
 *   { label: string, children: [{ label, children?, swatch? }, ...] }
 * @param {object} [options] - Override any CONFIG defaults + callbacks:
 *   { baseHeight, maxExpand, minHeight, falloffRadius, flyoutDelay,
 *     separator, separatorColor, separatorThickness,
 *     onSelect: (item) => {}, debug: false }
 * @returns {{ destroy: () => void }}
 */
export function create(container, menus, options = {}) {
  CONFIG = { ...DEFAULTS, ...options };

  // Apply theme class
  if (CONFIG.theme === 'light') {
    document.documentElement.classList.add('fisheye-theme-light');
  }

  // Create background overlay
  if (CONFIG.overlay) {
    overlayEl = document.createElement('div');
    overlayEl.className = 'fisheye-overlay';
    document.body.appendChild(overlayEl);
  }

  if (CONFIG.debug) {
    debugEl = document.createElement('div');
    debugEl.id = 'fisheye-debug';
    debugEl.style.cssText = 'position:fixed;bottom:12px;right:12px;background:rgba(0,0,0,0.7);color:#888;font:11px/1.4 monospace;padding:8px 12px;border-radius:4px;pointer-events:none;z-index:9999;';
    document.body.appendChild(debugEl);
  }

  buildMenuBar(container, menus);

  return {
    destroy() {
      closeAllMenus();
      if (boundDocMouseDown) {
        document.removeEventListener('mousedown', boundDocMouseDown);
      }
      container.innerHTML = '';
      if (overlayEl) { overlayEl.remove(); overlayEl = null; }
      if (debugEl) { debugEl.remove(); debugEl = null; }
      document.documentElement.classList.remove('fisheye-theme-light');
    }
  };
}
