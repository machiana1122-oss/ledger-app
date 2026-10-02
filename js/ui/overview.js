// Overview tab: recurring items that are due, a month picker, the balance, money in / out / saved,
// the savings goal and spending by category. Months are Ledger's months, which can start early
// on payday (see months.js).

import { getState, commit, requestPersistentStorage } from "../store.js";
import { balance, monthTotals, categoryTotals, firstMonth, currentMonth, monthProjection } from "../calc.js";
import { monthsOf, monthStartedByIncome } from "../months.js";
import { goalStatus, savingsHistory, finishedMonth } from "../goal.js";
import { dueItems, dueDates, addOccurrence, skipOccurrence, ruleName, monthStartedBy } from "../recurring.js";
import { todayStr, monthLabel, monthName, shiftMonthKey, shortDate } from "../dates.js";
import { html, setHtml } from "../html.js";
import { plural } from "../util.js";
import { $, money, confirmChange, switchTab, renderCurrent, monthRange, monthStartNote } from "./shell.js";
import { categoryColors } from "./colors.js";
import { donutSvg } from "./donut.js";
import { renderBackupReminder } from "./backup.js";
import { openOccurrence } from "./sheet.js";

let viewMonth = null;   // the month being looked at, or null for this month
let pickedCategory = null; // the category picked in the spending chart, or null for the total

export function renderOverview(state){
  const today = todayStr();
  const months = monthsOf(state);
  const thisMonth = months.of(today);
  const earliest = firstMonth(state, today);
  if (viewMonth && (viewMonth >= thisMonth || viewMonth < earliest)) viewMonth = null;
  const month = viewMonth || thisMonth;
  const isThisMonth = month === thisMonth;

  renderBackupReminder(state);
  renderDue(state, today, isThisMonth);

  $("viewMonthLabel").textContent = monthLabel(month);
  const range = monthRange(months, month, isThisMonth);
  $("viewMonthRange").textContent = range;
  $("viewMonthRange").hidden = !range;
  $("prevMonthBtn").disabled = month <= earliest;
  $("nextMonthBtn").disabled = isThisMonth;
  $("thisMonthBtn").hidden = isThisMonth;

  const total = isThisMonth ? balance(state) : balance(state, months.end(month));
  $("balanceLabel").textContent = isThisMonth ? "Balance" : "Balance at the end of " + monthLabel(month);
  const balanceEl = $("balanceNum");
  balanceEl.textContent = money(total);
  balanceEl.classList.toggle("negative", total < 0);
  fitBalance();
  $("openingHintBtn").hidden = state.openingBalance !== null || state.transactions.length === 0;

  const totals = monthTotals(state, month);
  $("monthIncome").textContent = money(totals.income);
  $("monthExpense").textContent = money(totals.expense);
  $("monthSaved").textContent = money(totals.saved);
  $("monthSaved").classList.toggle("negative", totals.saved < 0);

  // With a goal, its card says what's safe to spend; without one, a projection of the month
  const projection = isThisMonth && !state.goal ? monthProjection(state, today) : null;
  $("paceLine").hidden = !projection;
  if (projection) setHtml($("paceLine"), html`At this pace, you're on track for about <strong>${money(projection.projected)}</strong> in expenses this month.`);

  if (isThisMonth) renderGoal(state, today);
  else renderPastGoal(state, month);
  renderSpending(state, months, month, isThisMonth);
}

// ---------- Recurring items that are due ----------
function renderDue(state, today, show){
  const items = show ? dueItems(state, today) : [];
  $("dueCard").hidden = items.length === 0;
  const waiting = items.reduce((n, item) => n + 1 + item.more, 0);
  $("dueAddAllBtn").hidden = waiting < 2;
  $("dueAddAllBtn").textContent = "Add all " + waiting;
  setHtml($("dueList"), items.map(({ rule, date, more }) => html`<div class="due-item"><button type="button" class="due-info" data-rule="${rule.id}" data-date="${date}"><span class="due-name">${ruleName(rule)}</span><span class="due-meta"><span class="${rule.type}">${rule.type === "income" ? "+" : "-"}${money(rule.amount)}</span> · due ${shortDate(date)}${monthStartedBy(rule, date) ? " · starts " + monthName(monthStartedBy(rule, date)) : ""}${more ? html` · ${more} more after this` : ""}</span></button><button type="button" class="btn btn-ghost btn-small" data-action="skip" data-rule="${rule.id}" data-date="${date}">Skip</button><button type="button" class="btn btn-gold btn-small" data-action="add" data-rule="${rule.id}" data-date="${date}">Add</button></div>`));
}

function addDue(rule, date){
  const state = getState();
  const before = rule.doneThrough;
  const added = addOccurrence(state, rule, date);
  commit();
  requestPersistentStorage();
  confirmChange("Added " + ruleName(rule) + (added.startsNextMonth ? ". " + monthStartNote(monthStartedByIncome(added)) : ""), () => {
    getState().transactions = getState().transactions.filter(t => t !== added);
    rule.doneThrough = before;
    commit();
    confirmChange("Undone");
  });
}

function skipDue(rule, date){
  const before = rule.doneThrough;
  skipOccurrence(rule, date);
  commit();
  confirmChange("Skipped " + ruleName(rule) + " for " + shortDate(date), () => {
    rule.doneThrough = before;
    commit();
    confirmChange("Undone");
  });
}

function addAllDue(){
  const state = getState();
  const today = todayStr();
  const before = new Map(state.recurring.map(rule => [rule, rule.doneThrough]));
  const added = [];
  for (const rule of state.recurring){
    for (const date of dueDates(rule, today)) added.push(addOccurrence(state, rule, date));
  }
  if (!added.length) return;
  commit();
  requestPersistentStorage();
  // Mention the newest month a salary started
  const started = added.map(monthStartedByIncome).filter(Boolean).sort().pop();
  confirmChange("Added " + plural(added.length, "recurring transaction") + (started ? ". " + monthStartNote(started) : ""), () => {
    const s = getState();
    s.transactions = s.transactions.filter(t => !added.includes(t));
    before.forEach((doneThrough, rule) => { rule.doneThrough = doneThrough; });
    commit();
    confirmChange("Undone");
  });
}

// ---------- Savings goal ----------
function renderGoal(state, today){
  const goal = state.goal;
  $("goalSectionHead").hidden = !goal;
  $("goalCard").hidden = !goal;
  if (!goal) return;

  const notices = state.goalNotices;
  setHtml($("goalBannerWrap"), notices.month ? banner("month", monthNotice(state, notices.month)) : "");

  const s = goalStatus(state, today);
  const thisMonthName = monthLabel(goal.monthKey);
  // When next month's salary is due before the calendar month ends, this month ends the day before
  const nextName = monthName(shiftMonthKey(goal.monthKey, 1));
  const forDays = !s.payday ? "for the " + plural(s.daysLeft, "day") + " left in " + thisMonthName
    : s.payday === today ? "for today, until " + nextName + " starts"
    : "for the " + plural(s.daysLeft, "day") + " left until " + nextName + " starts on " + shortDate(s.payday);
  let headline;
  if (s.left > 0){
    headline = html`<p class="safe-label">Safe to spend</p><p class="safe-amount"><strong>${money(s.perDay)}</strong> a day</p><p class="safe-sub">${forDays}, to save ${money(s.target)}</p>`;
  } else if (s.left === 0){
    headline = html`<p class="safe-label">Safe to spend</p><p class="safe-amount"><strong>Nothing more</strong> this month</p><p class="safe-sub">Your budget is used up exactly, so you're still on track to save ${money(s.target)}.</p>`;
  } else {
    headline = html`<p class="safe-label over">Over budget</p><p class="safe-amount over"><strong>${money(-s.left)}</strong> over</p><p class="safe-sub">${s.onTrackToSave > 0 ? "If you stop here, you'd save " + money(s.onTrackToSave) + " instead of " + money(s.target) + "." : "There's nothing left to save this month."}</p>`;
  }
  // The bar: spent, then the bills still to come, out of what can be spent this month
  const pct = amount => s.budget > 0 ? Math.max(0, Math.min(100, amount / s.budget * 100)) : 100;
  const spentPct = pct(s.spent);
  const billsPct = Math.min(100 - spentPct, pct(s.billsToCome));
  const details = [money(s.spent) + " spent"];
  if (s.billsToCome > 0) details.push(money(s.billsToCome) + " in bills to come");
  details.push(money(s.budget) + " to spend in " + thisMonthName);

  setHtml($("goalBody"), html`${headline}<div class="bar-track split spaced" role="img" aria-label="${details.join(", ")}"><div class="bar-fill ${s.left < 0 ? "over" : "on-track"}" style="width:${spentPct.toFixed(1)}%"></div><div class="bar-fill bills" style="width:${billsPct.toFixed(1)}%"></div></div><p class="goal-note">${details.join(" · ")}</p>`);
}

// Past months show how the goal went, if it was set then
function renderPastGoal(state, month){
  const row = savingsHistory(state).find(r => r.monthKey === month);
  $("goalSectionHead").hidden = !row;
  $("goalCard").hidden = !row;
  if (!row) return;
  setHtml($("goalBannerWrap"), "");
  const hit = row.saved >= row.target;
  setHtml($("goalBody"), html`<div class="goal-result"><span>Saved ${money(row.saved)} of ${money(row.target)} target</span><span class="history-badge ${hit ? "hit" : "miss"}">${hit ? "Hit" : "Short"}</span></div>`);
}

function banner(kind, content){
  return html`<div class="goal-banner"><div>${content}</div><button type="button" data-dismiss="${kind}" aria-label="Dismiss">&times;</button></div>`;
}

// Notices are worked out when drawn, so they always match the transactions and the current currency
function monthNotice(state, notice){
  const ending = "Starting fresh for " + monthLabel(notice.newMonthKey) + "." +
    (notice.incomeUpdatedTo !== null ? " Income updated to " + money(notice.incomeUpdatedTo) + " based on what you logged." : "");
  if (notice.months.length === 1) return html`${finishedMonthSentence(state, notice.months[0])} ${ending}`;
  // Long absences show only the most recent months
  const shown = notice.months.length > 4 ? notice.months.slice(-3) : notice.months;
  const hidden = notice.months.length - shown.length;
  return html`Here's how the last ${notice.months.length} months went:<ul class="goal-banner-list">${hidden ? html`<li>${plural(hidden, "earlier month")} not shown</li>` : ""}${shown.map(key => html`<li>${finishedMonthLine(state, key)}</li>`)}</ul>${ending}`;
}

function finishedMonthSentence(state, key){
  const label = monthLabel(key);
  const m = finishedMonth(state, key);
  if (!m.logged) return "Nothing was logged in " + label + ".";
  if (m.budget === null) return "In " + label + ", you spent " + money(m.spent) + ".";
  const diff = m.budget - m.spent;
  return diff >= 0
    ? "In " + label + ", you spent " + money(m.spent) + " of your " + money(m.budget) + " budget - " + money(diff) + " left over."
    : "In " + label + ", you spent " + money(m.spent) + ", " + money(-diff) + " over your " + money(m.budget) + " budget.";
}

function finishedMonthLine(state, key){
  const label = monthLabel(key);
  const m = finishedMonth(state, key);
  if (!m.logged) return label + ": nothing logged";
  if (m.budget === null) return label + ": spent " + money(m.spent);
  const diff = m.budget - m.spent;
  return label + ": spent " + money(m.spent) + " of " + money(m.budget) + " (" + money(Math.abs(diff)) + (diff >= 0 ? " left over)" : " over)");
}

// ---------- Spending by category ----------
// Tapping a category (its part of the ring, or its row) shows its numbers in the middle of the
// ring; tapping it again, or anywhere else in the chart, goes back to the total.
function renderSpending(state, months, month, isThisMonth){
  const totals = categoryTotals(months.txns(month), "expense");
  const donut = $("donut");
  donut.hidden = totals.length === 0;
  if (totals.length === 0){
    setHtml(donut, "");
    setHtml($("catLegend"), isThisMonth
      ? html`<div class="empty"><strong>Nothing logged yet</strong>Tap the + button to add your first transaction and see it broken down here.</div>`
      : html`<div class="empty"><strong>No spending</strong>Nothing was spent in ${monthLabel(month)}.</div>`);
    return;
  }
  const colorOf = categoryColors(state);
  const sum = totals.reduce((s, t) => s + t.total, 0);
  const items = totals.map(({ category, total }) => ({ category, total, pct: Math.round(total / sum * 100), color: colorOf(category) }));
  // A category that has no spending in this month can't stay picked
  const picked = items.find(i => i.category === pickedCategory) || null;
  if (!picked) pickedCategory = null;
  const middle = picked
    ? html`<span class="donut-center-label">${picked.category}</span><span class="donut-center-amount">${money(picked.total)}</span><span class="donut-center-sub">${picked.pct}% of spending</span>`
    : html`<span class="donut-center-label">${isThisMonth ? "Spent so far" : "Spent"}</span><span class="donut-center-amount">${money(sum)}</span>`;
  setHtml(donut, html`${donutSvg(items.map(i => ({ key: i.category, value: i.total, color: i.color, title: i.category + ": " + money(i.total) + " (" + i.pct + "%)" })), "Spending by category", pickedCategory)}<div class="donut-center" aria-live="polite">${middle}</div>`);
  // Big amounts shrink to fit inside the ring
  const amount = donut.querySelector(".donut-center-amount");
  for (let size = 17; amount.clientWidth && amount.scrollWidth > amount.clientWidth && size > 11; size--) amount.style.fontSize = (size - 1) + "px";
  setHtml($("catLegend"), items.map(i => {
    const on = i.category === pickedCategory;
    return html`<div class="cat-row${on ? " picked" : ""}" data-cat="${i.category}" role="button" tabindex="0" aria-pressed="${on ? "true" : "false"}"><span class="dot" style="background:${i.color}"></span><span class="name">${i.category}</span><span class="pct">${i.pct}%</span><span class="amt">${money(i.total)}</span></div>`;
  }));
}

function pickCategory(category){
  // Keyboard focus stays on the same row after redrawing
  const focused = document.activeElement && document.activeElement.closest ? document.activeElement.closest(".cat-row") : null;
  const refocus = focused ? focused.dataset.cat : null;
  pickedCategory = category;
  renderCurrent();
  if (refocus !== null){
    const row = [...$("catLegend").querySelectorAll(".cat-row")].find(r => r.dataset.cat === refocus);
    if (row) row.focus();
  }
}

// Keeps the balance on one line by shrinking it as needed (long amounts, narrow phones).
// If it still doesn't fit at the smallest size, or Overview isn't visible, it may wrap.
function fitBalance(){
  const el = $("balanceNum");
  el.style.fontSize = "";
  el.style.whiteSpace = "nowrap";
  if (el.clientWidth){
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth && size > 26){
      size -= 2;
      el.style.fontSize = size + "px";
    }
  }
  if (!el.clientWidth || el.scrollWidth > el.clientWidth) el.style.whiteSpace = "";
}

function showMonth(month){
  viewMonth = month;
  renderCurrent();
}

export function initOverview(){
  $("goalBannerWrap").addEventListener("click", e => {
    const button = e.target.closest("[data-dismiss]");
    if (!button) return;
    getState().goalNotices[button.dataset.dismiss] = null;
    commit();
  });

  const thisMonth = () => currentMonth(getState(), todayStr());
  $("prevMonthBtn").addEventListener("click", () => showMonth(shiftMonthKey(viewMonth || thisMonth(), -1)));
  $("nextMonthBtn").addEventListener("click", () => {
    const next = shiftMonthKey(viewMonth || thisMonth(), 1);
    showMonth(next >= thisMonth() ? null : next);
  });
  $("thisMonthBtn").addEventListener("click", () => showMonth(null));
  $("openingHintBtn").addEventListener("click", () => {
    switchTab("settings");
    $("openingBalanceInput").focus();
  });

  $("dueList").addEventListener("click", e => {
    const el = e.target.closest("[data-rule]");
    if (!el) return;
    const rule = getState().recurring.find(r => r.id === el.dataset.rule);
    if (!rule) return;
    const action = el.dataset.action;
    if (action === "add") addDue(rule, el.dataset.date);
    else if (action === "skip") skipDue(rule, el.dataset.date);
    else openOccurrence(rule, el.dataset.date);
  });
  $("dueAddAllBtn").addEventListener("click", addAllDue);

  // A tap on a segment picks it (again: back to the total); anywhere else in the chart clears it
  $("donut").addEventListener("click", e => {
    const segment = e.target.closest(".donut-seg");
    pickCategory(segment && segment.dataset.key !== pickedCategory ? segment.dataset.key : null);
  });
  const legend = $("catLegend");
  const toggleRow = row => pickCategory(row.dataset.cat === pickedCategory ? null : row.dataset.cat);
  legend.addEventListener("click", e => {
    const row = e.target.closest(".cat-row");
    if (row) toggleRow(row);
  });
  legend.addEventListener("keydown", e => {
    const row = e.target.closest(".cat-row");
    if (row && e.target === row && (e.key === "Enter" || e.key === " ")){
      e.preventDefault();
      toggleRow(row);
    }
  });

  window.addEventListener("resize", fitBalance);
  // The web fonts can arrive after the first draw and change the text width
  if (document.fonts){
    if (document.fonts.ready) document.fonts.ready.then(fitBalance);
    if (document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", fitBalance);
  }
}
