// The spending donut, drawn as SVG: one ring segment per item. Hovering a segment shows its
// name and amount; the legend underneath lists the same numbers for touch screens.

import { html } from "../html.js";

const RADIUS = 75;
const THICKNESS = 28; // leaves a hole of about 68% of the width, like the old Chart.js donut
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 1.5;      // thin gap between segments

// items: [{ value, color, title }] - values must be positive
export function donutSvg(items, label){
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let start = 0;
  const segments = items.map(item => {
    const length = item.value / total * CIRCUMFERENCE;
    // A lone segment is a full ring; tiny ones get no gap so they stay visible
    const drawn = items.length > 1 && length > GAP * 2 ? length - GAP : length;
    const segment = html`<circle class="donut-seg" cx="100" cy="100" r="${RADIUS}" stroke="${item.color}" stroke-width="${THICKNESS}" stroke-dasharray="${drawn.toFixed(2)} ${(CIRCUMFERENCE - drawn).toFixed(2)}" stroke-dashoffset="${(-start).toFixed(2)}"><title>${item.title}</title></circle>`;
    start += length;
    return segment;
  });
  return html`<svg class="donut" viewBox="0 0 200 200" role="img" aria-label="${label}"><g transform="rotate(-90 100 100)">${segments}</g></svg>`;
}
