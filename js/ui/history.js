// History tab: every transaction, grouped by month (Ledger's months, which can start early on
// payday - see months.js) with each month's totals, a search box and type filter, and the total
// of what a search or filter finds. On a laptop the rows line up as a table (styles.css).

import { getState } from "../store.js";
import { sumOf } from "../calc.js";
import { monthsOf } from "../months.js";
import { todayStr, monthLabel } from "../dates.js";
import { html, setHtml } from "../html.js";
import { $, money, renderCurrent, monthRange } from "./shell.js";
import { categoryColors } from "./colors.js";
import { txnRow, newestFirst } from "./txnrow.js";
import { openSheet, deleteTransaction } from "./sheet.js";

let filter = "all";   // "all" | "income" | "expense"
let search = "";

export function renderHistory(state){
  let txns = state.transactions.slice().sort(newestFirst);
  if (filter !== "all") txns = txns.filter(t => t.type === filter);
  if (search){
    txns = txns.filter(t => t.category.toLowerCase().includes(search) || (t.note || "").toLowerCase().includes(search));
  }
  const filtered = search !== "" || filter !== "all";

  // What a search or filter found, in total ("6 found · out 245.00")
  const summary = $("historySummary");
  summary.hidden = !filtered || txns.length === 0;
  if (!summary.hidden) setHtml(summary, html`${txns.length} found${inOut(txns)}`);

  const list = $("historyList");
  if (txns.length === 0){
    setHtml(list, filtered
      ? html`<div class="empty"><strong>No matches</strong>Try a different search or filter.</div>`
      : html`<div class="empty"><strong>No transactions</strong>Add your first one and it will show up here.</div>`);
    return;
  }

  const months = monthsOf(state);
  const thisMonth = months.of(todayStr());
  const colorOf = categoryColors(state);
  const groups = new Map();
  for (const t of txns){
    const key = months.of(t.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  // The column titles only show on a laptop, where the rows line up as a table
  const head = html`<div class="txn-head" aria-hidden="true"><span>Date</span><span></span><span>Category</span><span>Note</span><span class="num">Amount</span><span></span></div>`;
  setHtml(list, [head, ...[...groups].map(([key, rows]) => {
    const range = monthRange(months, key, key === thisMonth);
    // Each month's totals are for the rows shown, so a search shows that month's part of it
    return html`<div class="month-group"><div class="month-head"><div class="month-title">${monthLabel(key)}${range ? html`<span class="month-range">${range}</span>` : ""}</div><div class="month-totals">${inOut(rows, true)}</div></div>${rows.map(t => txnRow(t, colorOf(t.category)))}</div>`;
  })]);
}

// " · in 3,100.00 · out 684.00" (the parts that aren't zero); `first` leaves off the leading dot
function inOut(txns, first){
  const parts = [];
  const income = sumOf(txns, "income");
  const expense = sumOf(txns, "expense");
  if (income) parts.push(html`<span class="income">in ${money(income)}</span>`);
  if (expense) parts.push(html`<span class="expense">out ${money(expense)}</span>`);
  return parts.map((part, i) => i === 0 && first ? part : html` · ${part}`);
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
