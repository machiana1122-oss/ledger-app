// One transaction as a row, the way History and the laptop Overview's "Recent transactions" show
// it: the category (with ↻ when it came from a recurring item), under it the date first (so a long
// note is what gets cut off, never the date), then the note and whether the income starts a
// month, and the amount. On a laptop, History lays the same row out as table columns (styles.css).

import { monthStartedByIncome } from "../months.js";
import { monthName, shortDate } from "../dates.js";
import { html } from "../html.js";
import { money } from "./shell.js";

// Newest first: by date, then by when it was logged
export const newestFirst = (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt;

export function txnRow(t, color, { deletable = true } = {}){
  const started = monthStartedByIncome(t);
  const details = [t.note, started ? "starts " + monthName(started) : ""].filter(Boolean).join(" · ");
  return html`<div class="txn-row" data-id="${t.id}" role="button" tabindex="0"><div class="txn-dot" style="background:${color}22; color:${color}">${t.category.charAt(0).toUpperCase()}</div><div class="txn-info"><div class="cat">${t.category}${t.recurringId ? html`<span class="repeat-mark" title="Recurring" aria-label="recurring"> ↻</span>` : ""}</div><div class="note"><span class="txn-date">${shortDate(t.date)}</span>${details ? html`<span class="txn-sep"> · </span><span class="txn-note">${details}</span>` : ""}</div></div><div class="txn-amt ${t.type}">${t.type === "income" ? "+" : "-"}${money(t.amount)}</div>${deletable ? html`<button class="del-btn" aria-label="Delete" data-id="${t.id}">&times;</button>` : ""}</div>`;
}
