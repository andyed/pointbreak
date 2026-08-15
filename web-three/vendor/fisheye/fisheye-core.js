/**
 * Fisheye Flyout Menu — Pure computation functions
 *
 * Extracted for testability. No DOM dependencies.
 * All functions take config as a parameter instead of reading a closure.
 */

/**
 * Default config values (used when caller doesn't provide overrides).
 */
export const DEFAULT_CONFIG = {
  baseHeight: 28,
  maxExpand: 2.4,
  minHeight: 20,
  falloffRadius: 4,
};

/**
 * Compute per-item heights with fisheye magnification.
 *
 * Simple approach: assign weights based on distance from hovered item,
 * normalize to fill totalHeight, clamp to minHeight, dump any excess
 * back into the hovered item. No boundary pinning — the uniform default
 * layout means the weight distribution is symmetric and well-behaved.
 *
 * @param {number} n           - Number of items
 * @param {number} hoveredIdx  - Index of the hovered item (-1 for default)
 * @param {number} totalHeight - Total pixel budget for all items
 * @param {object} config      - { maxExpand, minHeight, falloffRadius }
 * @returns {number[]}
 */
export function computeFisheyeHeights(n, hoveredIdx, totalHeight, config = DEFAULT_CONFIG, baseWeights = null) {
  if (n === 0) return [];
  if (hoveredIdx < 0) return computeDefaultHeights(n, totalHeight, config, baseWeights);

  const { maxExpand, minHeight, falloffRadius } = config;

  // Build weights: linear falloff from hovered item, multiplied by the item's
  // base weight so non-uniform base layouts keep their proportions under
  // magnification. baseWeights are relative (any positive scale).
  const weights = new Array(n);
  for (let i = 0; i < n; i++) {
    const dist = Math.abs(i - hoveredIdx);
    const base = baseWeights ? baseWeights[i] : 1;
    if (dist === 0) {
      weights[i] = base * maxExpand;
    } else if (dist <= falloffRadius) {
      const t = 1 - dist / (falloffRadius + 1);
      weights[i] = base * (1 + (maxExpand - 1) * t);
    } else {
      weights[i] = base;
    }
  }

  // Normalize to totalHeight
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const heights = weights.map(w => (w / weightSum) * totalHeight);

  // Clamp to minHeight, collect deficit
  let deficit = 0;
  for (let i = 0; i < n; i++) {
    if (heights[i] < minHeight) {
      deficit += minHeight - heights[i];
      heights[i] = minHeight;
    }
  }

  // Pay deficit proportionally from items above minHeight
  if (deficit > 0) {
    let totalExcess = 0;
    for (let i = 0; i < n; i++) totalExcess += heights[i] - minHeight;
    if (totalExcess > 0) {
      const ratio = Math.min(1, deficit / totalExcess);
      for (let i = 0; i < n; i++) {
        const shrink = (heights[i] - minHeight) * ratio;
        heights[i] -= shrink;
      }
    }
  }

  // Fix any floating-point drift
  const total = heights.reduce((a, b) => a + b, 0);
  heights[hoveredIdx] += totalHeight - total;

  return heights;
}

/**
 * Default (unhovered) distribution. Uniform unless baseWeights are given,
 * in which case items share totalHeight proportionally, floored at
 * config.minHeight with the deficit repaid by the items above the floor.
 */
export function computeDefaultHeights(n, totalHeight, config = DEFAULT_CONFIG, baseWeights = null) {
  if (n === 0) return [];
  if (n === 1) return [totalHeight];
  if (!baseWeights) {
    const h = totalHeight / n;
    return new Array(n).fill(h);
  }

  const { minHeight } = config;
  const weightSum = baseWeights.reduce((a, b) => a + b, 0);
  const heights = baseWeights.map(w => (w / weightSum) * totalHeight);

  let deficit = 0;
  for (let i = 0; i < n; i++) {
    if (heights[i] < minHeight) {
      deficit += minHeight - heights[i];
      heights[i] = minHeight;
    }
  }
  if (deficit > 0) {
    let totalExcess = 0;
    for (let i = 0; i < n; i++) totalExcess += heights[i] - minHeight;
    if (totalExcess > 0) {
      const ratio = Math.min(1, deficit / totalExcess);
      for (let i = 0; i < n; i++) {
        heights[i] -= (heights[i] - minHeight) * ratio;
      }
    }
  }
  return heights;
}

/**
 * Test if point (px, py) is inside triangle (a, b, c).
 */
export function pointInTriangle(px, py, a, b, c) {
  const d1 = (px - b.x) * (a.y - b.y) - (a.x - b.x) * (py - b.y);
  const d2 = (px - c.x) * (b.y - c.y) - (b.x - c.x) * (py - c.y);
  const d3 = (px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

/**
 * Cumulative boundary y-positions from heights.
 * boundaries[0] = 0, boundaries[n] = totalHeight.
 */
export function cumulativeBoundaries(heights) {
  const boundaries = [0];
  for (let i = 0; i < heights.length; i++) {
    boundaries.push(boundaries[i] + heights[i]);
  }
  return boundaries;
}

/**
 * Which item index is at mouseY (relative to panel top)?
 *
 * Walks the cumulative-y of the *current* heights array — caller must
 * pass the heights that match what's currently rendered. For panels
 * where heights are reshaped on every mousemove (the cascading-menu
 * case), this works because heights and rendered DOM stay in sync.
 *
 * For long flat lists (e.g., the 148-palette picker in demos/palette/)
 * where re-running this per mousemove would be O(N), precompute a
 * focus-center map once on open and binary-search it instead — see
 * demos/palette/index.html for the pattern.
 */
export function itemIndexAtY(mouseY, heights) {
  let cumY = 0;
  for (let i = 0; i < heights.length; i++) {
    if (mouseY >= cumY && mouseY < cumY + heights[i]) return i;
    cumY += heights[i];
  }
  return -1;
}
