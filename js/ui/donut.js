// The spending donut, drawn as SVG: one ring segment per item. A picked item's segment stands out
// and the others fade (Overview shows its numbers in the middle of the ring). Hovering a segment
// with a mouse also shows its name and amount.

import { html } from "../html.js";

const RADIUS = 75;
const THICKNESS = 28; // leaves a hole of about 68% of the width, like the old Chart.js donut
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 1.5;      // thin gap between segments

// items: [{ key, value, color, title }] - values must be positive; `picked` is a key or null
export function donutSvg(items, label, picked){
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let start = 0;
  const segments = items.map(item => {
    const length = item.value / total * CIRCUMFERENCE;
    // A lone segment is a full ring; tiny ones get no gap so they stay visible
    const drawn = items.length > 1 && length > GAP * 2 ? length - GAP : length;
    const segment = html`<circle class="donut-seg${item.key === picked ? " picked" : ""}" data-key="${item.key}" cx="100" cy="100" r="${RADIUS}" stroke="${item.color}" stroke-width="${THICKNESS}" stroke-dasharray="${drawn.toFixed(2)} ${(CIRCUMFERENCE - drawn).toFixed(2)}" stroke-dashoffset="${(-start).toFixed(2)}"><title>${item.title}</title></circle>`;
    start += length;
    return segment;
  });
  return html`<svg class="donut${picked !== null && picked !== undefined ? " has-pick" : ""}" viewBox="0 0 200 200" role="img" aria-label="${label}"><g transform="rotate(-90 100 100)">${segments}</g></svg>`;
}
