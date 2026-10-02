// Insights tab: money in and out month by month, spending by category for a period (compared with
// last month), and the savings history. Months are Ledger's months (see months.js).

import { sumOf, categoryTotals, monthTotals, recentMonths } from "../calc.js";
import { monthsOf } from "../months.js";
import { savingsHistory, lifetimeSaved } from "../goal.js";
import { todayStr, shiftMonthKey, addDays, daysBetween, monthLabel } from "../dates.js";
import { html, setHtml } from "../html.js";
import { $, money, renderCurrent } from "./shell.js";
import { categoryColors } from "./colors.js";
import { trendSvg } from "./trend.js";

let period = "month";   // "month" | "last" | "all"
let trendLength = 6;    // months in the chart
let trendSelected = null; // the month whose numbers are shown, or null for this month

export function renderInsights(state){
  const today = todayStr();
  const months = monthsOf(state);
  const thisMonth = months.of(today);
  const lastMonth = shiftMonthKey(thisMonth, -1);
  const txns = period === "month" ? months.txns(thisMonth)
    : period === "last" ? months.txns(lastMonth)
    : state.transactions;
  const totals = categoryTotals(txns, "expense");

  renderTrend(state, thisMonth, today);
  renderComparison(months, totals, thisMonth, today);

  const list = $("insightsList");
  if (totals.length === 0){
    setHtml(list, html`<div class="empty"><strong>Nothing to show</strong>No expenses logged for this period yet.</div>`);
  } else {
    const max = totals[0].total;
    const colorOf = categoryColors(state);
    setHtml(list, totals.map(({ category, total }) => html`<div class="bar-item"><div class="top"><span>${category}</span><span class="amt">${money(total)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(total / max * 100)}%; background:${colorOf(category)}"></div></div></div>`));
  }

  renderSavingsHistory(state);
}

// Money in and out for the last few months; the average leaves out this month, which isn't over yet
function renderTrend(state, thisMonth, today){
  const months = recentMonths(state, today, trendLength).map(key => {
    const t = monthTotals(state, key);
    return { key, ...t, title: monthLabel(key) + ": in " + money(t.income) + ", out " + money(t.expense) + ", saved " + money(t.saved) };
  });
  const selected = months.find(m => m.key === trendSelected) || months[months.length - 1];
  setHtml($("trendChart"), trendSvg(months, selected.key, "Money in and out, month by month. Choose a month to see its numbers."));
  setHtml($("trendDetail"), html`<strong>${monthLabel(selected.key)}${selected.key === thisMonth ? " so far" : ""}</strong><span class="trend-figures"><span class="income">In ${money(selected.income)}</span> · <span class="expense">Out ${money(selected.expense)}</span> · <span class="${selected.saved < 0 ? "expense" : ""}">Saved ${money(selected.saved)}</span></span>`);
  const finished = months.filter(m => m.key !== thisMonth);
  $("trendAverage").hidden = finished.length === 0;
  if (finished.length){
    const average = finished.reduce((sum, m) => sum + m.saved, 0) / finished.length;
    $("trendAverage").textContent = "On average you saved " + money(average) + " a month over the last " +
      (finished.length === 1 ? "full month" : finished.length + " full months") + ".";
  }
}

// This month so far against the same number of days into last month
function renderComparison(months, totals, thisMonth, today){
  const line = $("compareLine");
  const lastMonth = shiftMonthKey(thisMonth, -1);
  const sameDay = addDays(months.start(lastMonth), daysBetween(months.start(thisMonth), today));
  const lastTotal = sumOf(months.txns(lastMonth).filter(t => t.date <= sameDay), "expense");
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

function selectTrendMonth(el){
  const hadFocus = el === document.activeElement;
  trendSelected = el.dataset.month;
  renderCurrent();
  // Keep keyboard focus on the same month after redrawing
  if (hadFocus){
    const again = $("trendChart").querySelector('[data-month="' + trendSelected + '"]');
    if (again) again.focus();
  }
}

export function initInsights(){
  document.querySelectorAll("[data-trend]").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll("[data-trend]").forEach(b => b.classList.toggle("active", b === btn));
    trendLength = Number(btn.dataset.trend);
    renderCurrent();
  }));
  const chart = $("trendChart");
  chart.addEventListener("click", e => {
    const month = e.target.closest("[data-month]");
    if (month) selectTrendMonth(month);
  });
  chart.addEventListener("keydown", e => {
    const month = e.target.closest("[data-month]");
    if (month && (e.key === "Enter" || e.key === " ")){
      e.preventDefault();
      selectTrendMonth(month);
    }
  });

  document.querySelectorAll("[data-period]").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll("[data-period]").forEach(b => b.classList.toggle("active", b === btn));
    period = btn.dataset.period;
    renderCurrent();
  }));
}
