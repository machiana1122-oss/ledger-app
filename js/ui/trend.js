// The month-by-month chart on Insights: money in (gold) and out (rust) for each month, as SVG.
// Each month can be tapped (or chosen with the keyboard) to show its numbers under the chart.
// It's drawn at the width it's shown at, so on a wide screen the bars spread out while the text
// keeps its size (stretching a small drawing would blow the labels up).

import { html } from "../html.js";
import { shortMonthLabel } from "../dates.js";

const TOP = 8;       // space above the tallest bar

// months: [{ key, income, expense, title }]; width: the space it's shown in (CSS pixels)
export function trendSvg(months, selectedKey, label, width = 320){
  const WIDTH = Math.max(240, Math.round(width));
  const HEIGHT = Math.round(Math.min(220, Math.max(150, WIDTH * 0.32)));
  const BASE = HEIGHT - 26;     // the line the bars stand on
  const LABEL_Y = HEIGHT - 8;
  const max = Math.max(1, ...months.map(m => Math.max(m.income, m.expense)));
  const slot = WIDTH / months.length;
  const barWidth = Math.min(16, slot * 0.32);
  const height = value => (BASE - TOP) * value / max;
  const groups = months.map((m, i) => {
    const centre = i * slot + slot / 2;
    const inHeight = height(m.income);
    const outHeight = height(m.expense);
    const selected = m.key === selectedKey;
    return html`<g class="trend-month${selected ? " selected" : ""}" data-month="${m.key}" role="button" tabindex="0" aria-pressed="${selected ? "true" : "false"}" aria-label="${m.title}"><title>${m.title}</title><rect class="trend-hit" x="${(i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${HEIGHT}"></rect><rect class="trend-in" x="${(centre - barWidth - 1).toFixed(1)}" y="${(BASE - inHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${inHeight.toFixed(1)}" rx="2"></rect><rect class="trend-out" x="${(centre + 1).toFixed(1)}" y="${(BASE - outHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${outHeight.toFixed(1)}" rx="2"></rect><text class="trend-label" x="${centre.toFixed(1)}" y="${LABEL_Y}" text-anchor="middle">${shortMonthLabel(m.key)}</text></g>`;
  });
  return html`<svg class="trend" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="group" aria-label="${label}"><line class="trend-axis" x1="0" y1="${BASE}" x2="${WIDTH}" y2="${BASE}"></line>${groups}</svg>`;
}
