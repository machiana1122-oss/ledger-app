// Insights tab: spending by category for a period, compared with last month, and the savings history.

import { inMonth, inMonthUpToDay, sumOf, categoryTotals } from "../calc.js";
import { savingsHistory, lifetimeSaved } from "../goal.js";
import { todayStr, monthKeyOf, shiftMonthKey, dayOfMonth, monthLabel } from "../dates.js";
import { html, setHtml } from "../html.js";
import { $, money, renderCurrent } from "./shell.js";
import { colorForCategory } from "./colors.js";

let period = "month";   // "month" | "last" | "all"

export function renderInsights(state){
  const today = todayStr();
  const thisMonth = monthKeyOf(today);
  const lastMonth = shiftMonthKey(thisMonth, -1);
  const txns = period === "month" ? inMonth(state.transactions, thisMonth)
    : period === "last" ? inMonth(state.transactions, lastMonth)
    : state.transactions;
  const totals = categoryTotals(txns, "expense");

  renderComparison(state, totals, lastMonth, dayOfMonth(today));

  const list = $("insightsList");
  if (totals.length === 0){
    setHtml(list, html`<div class="empty"><strong>Nothing to show</strong>No expenses logged for this period yet.</div>`);
  } else {
    const max = totals[0].total;
    setHtml(list, totals.map(({ category, total }) => html`<div class="bar-item"><div class="top"><span>${category}</span><span class="amt">${money(total)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(total / max * 100)}%; background:${colorForCategory(category)}"></div></div></div>`));
  }

  renderSavingsHistory(state);
}

// This month so far against the same days of last month
function renderComparison(state, totals, lastMonth, day){
  const line = $("compareLine");
  const lastTotal = sumOf(inMonthUpToDay(state.transactions, lastMonth, day), "expense");
  line.hidden = period !== "month" || lastTotal <= 0;
  if (line.hidden) return;
  const diff = totals.reduce((s, t) => s + t.total, 0) - lastTotal;
  const pct = Math.round(Math.abs(diff) / lastTotal * 100);
  line.className = "compare-line" + (pct < 1 ? "" : diff > 0 ? " up" : " down");
  setHtml(line, pct < 1 ? "About even with last month, by this point."
    : html`<strong>${pct}% ${diff > 0 ? "more" : "less"}</strong> spent than by this point last month.`);
}

function renderSavingsHistory(state){
  const rows = savingsHistory(state);
  $("goalSectionHead2").hidden = rows.length === 0;
  $("goalHistoryBlock").hidden = rows.length === 0;
  if (rows.length === 0) return;

  const total = lifetimeSaved(state);
  setHtml($("goalLifetimeTotal"), html`<div class="lifetime-total ${total >= 0 ? "positive" : "negative"}">${money(total)}</div><div class="lifetime-total-label">total saved since you started${state.goal ? ", including this month so far" : ""}</div>`);
  setHtml($("goalHistoryList"), rows.map(({ monthKey, saved, target }) => {
    const diff = saved - target;
    const hit = diff >= 0;
    return html`<div class="history-row"><div class="history-row-top"><span class="month">${monthLabel(monthKey)}</span><span class="history-badge ${hit ? "hit" : "miss"}">${hit ? "Hit" : "Short"}</span></div><div class="history-row-detail">Saved ${money(saved)} of ${money(target)} target (${hit ? "+" : "-"}${money(Math.abs(diff))})</div></div>`;
  }));
}

export function initInsights(){
  document.querySelectorAll("[data-period]").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll("[data-period]").forEach(b => b.classList.toggle("active", b === btn));
    period = btn.dataset.period;
    renderCurrent();
  }));
}
