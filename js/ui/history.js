// History tab: every transaction, grouped by month (Ledger's months, which can start early on
// payday - see months.js), with a search box and type filter.

import { getState } from "../store.js";
import { monthsOf, monthStartedByIncome } from "../months.js";
import { todayStr, monthLabel, monthName } from "../dates.js";
import { html, setHtml } from "../html.js";
import { $, money, renderCurrent, monthRange } from "./shell.js";
import { colorForCategory } from "./colors.js";
import { openSheet, deleteTransaction } from "./sheet.js";

let filter = "all";   // "all" | "income" | "expense"
let search = "";

export function renderHistory(state){
  let txns = state.transactions.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  if (filter !== "all") txns = txns.filter(t => t.type === filter);
  if (search){
    txns = txns.filter(t => t.category.toLowerCase().includes(search) || (t.note || "").toLowerCase().includes(search));
  }

  const list = $("historyList");
  if (txns.length === 0){
    setHtml(list, search || filter !== "all"
      ? html`<div class="empty"><strong>No matches</strong>Try a different search or filter.</div>`
      : html`<div class="empty"><strong>No transactions</strong>Tap the + button to log the first one.</div>`);
    return;
  }

  const months = monthsOf(state);
  const thisMonth = months.of(todayStr());
  const groups = new Map();
  for (const t of txns){
    const key = months.of(t.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  setHtml(list, [...groups].map(([key, rows]) => {
    const range = monthRange(months, key, key === thisMonth);
    return html`<div class="month-group"><div class="month-title">${monthLabel(key)}${range ? html`<span class="month-range">${range}</span>` : ""}</div>${rows.map(row)}</div>`;
  }));
}

function row(t){
  const color = colorForCategory(t.category);
  return html`<div class="txn-row" data-id="${t.id}" role="button" tabindex="0"><div class="txn-dot" style="background:${color}22; color:${color}">${t.category.charAt(0).toUpperCase()}</div><div class="txn-info"><div class="cat">${t.category}${t.recurringId ? html`<span class="repeat-mark" title="Recurring" aria-label="recurring"> ↻</span>` : ""}</div><div class="note">${t.note || t.date}${monthStartedByIncome(t) ? " · starts " + monthName(monthStartedByIncome(t)) : ""}</div></div><div class="txn-amt ${t.type}">${t.type === "income" ? "+" : "-"}${money(t.amount)}</div><button class="del-btn" aria-label="Delete" data-id="${t.id}">&times;</button></div>`;
}

function openRow(rowEl){
  const txn = getState().transactions.find(t => t.id === rowEl.dataset.id);
  if (txn) openSheet(txn);
}

export function initHistory(){
  document.querySelectorAll("[data-filter]").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach(b => b.classList.toggle("active", b === btn));
    filter = btn.dataset.filter;
    renderCurrent();
  }));
  $("historySearch").addEventListener("input", e => {
    search = e.target.value.trim().toLowerCase();
    renderCurrent();
  });
  const list = $("historyList");
  list.addEventListener("click", e => {
    const del = e.target.closest(".del-btn");
    if (del){ deleteTransaction(del.dataset.id); return; }
    const rowEl = e.target.closest(".txn-row");
    if (rowEl) openRow(rowEl);
  });
  list.addEventListener("keydown", e => {
    const rowEl = e.target.closest(".txn-row");
    if (rowEl && e.target === rowEl && (e.key === "Enter" || e.key === " ")){
      e.preventDefault();
      openRow(rowEl);
    }
  });
}
