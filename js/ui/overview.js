// Overview tab: balance, this month in and out, the savings goal card and spending by category.

import { getState, commit } from "../store.js";
import { balance, inMonth, sumOf, categoryTotals, monthProjection } from "../calc.js";
import { goalBudget, spentInMonth, weekAllowance, weekSpent, weeksLeftInMonth, finishedMonth } from "../goal.js";
import { todayStr, monthKeyOf, startOfWeek, monthLabel } from "../dates.js";
import { html, setHtml } from "../html.js";
import { plural } from "../util.js";
import { $, money } from "./shell.js";
import { colorForCategory } from "./colors.js";
import { donutSvg } from "./donut.js";
import { renderBackupReminder } from "./backup.js";

export function renderOverview(state){
  const today = todayStr();
  renderBackupReminder(state);

  const total = balance(state.transactions);
  const balanceEl = $("balanceNum");
  balanceEl.textContent = money(total);
  balanceEl.classList.toggle("negative", total < 0);
  fitBalance();

  const thisMonth = inMonth(state.transactions, monthKeyOf(today));
  $("monthIncome").textContent = money(sumOf(thisMonth, "income"));
  $("monthExpense").textContent = money(sumOf(thisMonth, "expense"));

  const projection = monthProjection(state.transactions, today);
  $("paceLine").hidden = !projection;
  if (projection) setHtml($("paceLine"), html`At this pace, you're on track for about <strong>${money(projection.projected)}</strong> in expenses this month.`);

  renderGoal(state, today);
  renderSpending(thisMonth);
}

// ---------- Savings goal ----------
function renderGoal(state, today){
  const goal = state.goal;
  $("goalSectionHead").hidden = !goal;
  $("goalCard").hidden = !goal;
  if (!goal) return;

  const notices = state.goalNotices;
  setHtml($("goalBannerWrap"), [
    notices.month ? banner("month", monthNotice(state, notices.month)) : "",
    notices.week ? banner("week", weekNotice(state, notices.week.weekStart, today)) : ""
  ]);

  const budget = goalBudget(goal);
  const spent = spentInMonth(state.transactions, goal.monthKey);
  const spentPct = budget > 0 ? Math.round(spent / budget * 100) : (spent > 0 ? 999 : 0);
  const thisWeek = startOfWeek(today);
  const allowance = weekAllowance(state.transactions, goal, thisWeek);
  const spentThisWeek = weekSpent(state.transactions, goal, thisWeek);
  const weekPart = allowance >= 0
    ? html`<div class="goal-progress-top"><span>This week: ${money(spentThisWeek)} of ${money(allowance)}</span></div>${progressBar(allowance > 0 ? spentThisWeek / allowance * 100 : (spentThisWeek > 0 ? 999 : 0))}`
    : html`<p class="goal-warning">This month's budget is already fully spent (or your numbers don't leave room to spend). Adjust your goal in Settings if that looks off.</p>`;

  setHtml($("goalBody"), html`<div class="goal-progress-top"><span>${money(spent)} of ${money(budget)} spent this month</span><span class="muted">${Math.max(0, spentPct)}%</span></div>${progressBar(spentPct, "spaced")}${weekPart}<p class="goal-note">${plural(weeksLeftInMonth(goal, today), "week")} left in ${monthLabel(goal.monthKey)}</p>`);
}

function progressBar(pct, extraClass){
  const width = Math.max(0, Math.min(100, pct));
  return html`<div class="bar-track ${extraClass || ""}"><div class="bar-fill ${pct > 100 ? "over" : "on-track"}" style="width:${width}%"></div></div>`;
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

function weekNotice(state, weekStart, today){
  const goal = state.goal;
  const spent = weekSpent(state.transactions, goal, weekStart);
  const diff = weekAllowance(state.transactions, goal, weekStart) - spent;
  const next = money(weekAllowance(state.transactions, goal, startOfWeek(today)));
  return diff >= 0
    ? "You spent " + money(spent) + " last week, " + money(diff) + " under your allowance. This week's allowance: " + next + "."
    : "You spent " + money(spent) + " last week, " + money(-diff) + " over your allowance. This week's allowance is now " + next + ".";
}

// ---------- Spending by category ----------
function renderSpending(thisMonth){
  const totals = categoryTotals(thisMonth, "expense");
  const donut = $("donut");
  donut.hidden = totals.length === 0;
  if (totals.length === 0){
    setHtml(donut, "");
    setHtml($("catLegend"), html`<div class="empty"><strong>Nothing logged yet</strong>Tap the + button to add your first transaction and see it broken down here.</div>`);
    return;
  }
  const sum = totals.reduce((s, t) => s + t.total, 0);
  const items = totals.map(({ category, total }) => ({ category, total, pct: Math.round(total / sum * 100), color: colorForCategory(category) }));
  setHtml(donut, donutSvg(items.map(i => ({ value: i.total, color: i.color, title: i.category + ": " + money(i.total) + " (" + i.pct + "%)" })), "Spending by category"));
  setHtml($("catLegend"), items.map(i => html`<div class="cat-row"><span class="dot" style="background:${i.color}"></span><span class="name">${i.category}</span><span class="pct">${i.pct}%</span><span class="amt">${money(i.total)}</span></div>`));
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

export function initOverview(){
  $("goalBannerWrap").addEventListener("click", e => {
    const button = e.target.closest("[data-dismiss]");
    if (!button) return;
    getState().goalNotices[button.dataset.dismiss] = null;
    commit();
  });
  window.addEventListener("resize", fitBalance);
  // The web fonts can arrive after the first draw and change the text width
  if (document.fonts){
    if (document.fonts.ready) document.fonts.ready.then(fitBalance);
    if (document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", fitBalance);
  }
}
