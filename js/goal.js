// The savings goal: its numbers, worked out from the transactions every time (so they can never
// drift from the data), and the month rollover that records what the goal was each month.
// Months are Ledger's months, which can start early on payday (see months.js).

import { sumOf } from "./calc.js";
import { daysBetween, shiftMonthKey } from "./dates.js";
import { monthsOf } from "./months.js";
import { billsStillToCome, thisMonthEnd } from "./recurring.js";
import { MAX_GOAL_HISTORY } from "./schema.js";

export const goalBudget = goal => goal.monthlyIncome - goal.monthlySavings;
export const spentInMonth = (state, key) => sumOf(monthsOf(state).txns(key), "expense");
export const incomeInMonth = (state, key) => sumOf(monthsOf(state).txns(key), "income");

// This month's goal in numbers. What's safe to spend each day is the budget left after what's been
// spent and the recurring bills still to come, shared over the days left (today included) until
// the month is expected to end (`payday` is set when that's the day next month's salary is due).
export function goalStatus(state, today){
  const goal = state.goal;
  const budget = goalBudget(goal);
  const spent = spentInMonth(state, goal.monthKey);
  const billsToCome = billsStillToCome(state, today);
  const { end, payday } = thisMonthEnd(state, today);
  const daysLeft = Math.max(1, daysBetween(today, end) + 1);
  const left = budget - spent - billsToCome;
  return {
    budget,
    spent,
    billsToCome,
    left,                                   // negative when over budget
    daysLeft,
    payday,
    perDay: left > 0 ? left / daysLeft : 0,
    target: goal.monthlySavings,
    // Saved by the end of the month if nothing more than the safe amount is spent
    onTrackToSave: left >= 0 ? goal.monthlySavings : goal.monthlySavings + left
  };
}

// One row per finished month that has transactions, newest first. Worked out from the
// transactions each time, so correcting an old transaction corrects the history too.
export function savingsHistory(state){
  const months = monthsOf(state);
  return state.goalHistory
    .map(h => ({ h, txns: months.txns(h.monthKey) }))
    .filter(({ txns }) => txns.length > 0)
    .map(({ h, txns }) => {
      const earned = sumOf(txns, "income");
      // No income logged that month: count the income that was expected
      const income = earned > 0 ? earned : h.expectedIncome;
      return { monthKey: h.monthKey, saved: income - sumOf(txns, "expense"), target: h.savingsTarget };
    })
    .reverse();
}

// Everything saved in the history, plus this month so far
export function lifetimeSaved(state){
  let total = savingsHistory(state).reduce((sum, row) => sum + row.saved, 0);
  if (state.goal) total += incomeInMonth(state, state.goal.monthKey) - spentInMonth(state, state.goal.monthKey);
  return total;
}

// A finished month's numbers for the summary on Overview (budget is null if it's no longer in the history)
export function finishedMonth(state, key){
  const txns = monthsOf(state).txns(key);
  const entry = state.goalHistory.find(h => h.monthKey === key);
  return {
    logged: txns.length > 0,
    spent: sumOf(txns, "expense"),
    budget: entry ? entry.expectedIncome - entry.savingsTarget : null
  };
}

// Keeps the goal on the month today counts for. When months have finished since it was last
// checked, it records what the goal was in each one and leaves a summary on Overview until it's
// dismissed. A month can also start again: when next month's salary is removed or moved later (or
// the device clock goes back), the month it had started is undone.
// Changes `state` only - the caller saves and redraws. Returns true if anything changed.
export function applyGoalRollover(state, today){
  const goal = state.goal;
  if (!goal) return false;
  const months = monthsOf(state);
  const nowMonth = months.of(today);
  if (goal.monthKey === nowMonth) return false;

  if (goal.monthKey > nowMonth){
    // Back to how this month was before it was closed: forget what was recorded for it and later
    // months (and the summary about them), and restore the goal it had then
    const entry = state.goalHistory.find(h => h.monthKey === nowMonth);
    if (entry){
      goal.monthlyIncome = entry.expectedIncome;
      goal.monthlySavings = entry.savingsTarget;
    }
    state.goalHistory = state.goalHistory.filter(h => h.monthKey < nowMonth);
    state.goalNotices.month = null;
    goal.monthKey = nowMonth;
    return true;
  }

  const startIncome = goal.monthlyIncome;
  const closed = [];
  // The history only keeps MAX_GOAL_HISTORY months, so there's no point going back further
  const oldestUseful = shiftMonthKey(nowMonth, -MAX_GOAL_HISTORY);
  const first = goal.monthKey < oldestUseful ? oldestUseful : goal.monthKey;
  // Months closed now are recorded from scratch, so they can never be listed twice
  state.goalHistory = state.goalHistory.filter(h => h.monthKey < first);
  for (let m = first; m < nowMonth; m = shiftMonthKey(m, 1)){
    state.goalHistory.push({ monthKey: m, expectedIncome: goal.monthlyIncome, savingsTarget: goal.monthlySavings });
    closed.push(m);
    // Next month's expected income follows what was actually earned
    const earned = sumOf(months.txns(m), "income");
    if (earned > 0) goal.monthlyIncome = earned;
  }
  state.goalHistory = state.goalHistory.slice(-MAX_GOAL_HISTORY);
  state.goalNotices.month = {
    months: closed,
    newMonthKey: nowMonth,
    incomeUpdatedTo: goal.monthlyIncome !== startIncome ? goal.monthlyIncome : null
  };
  goal.monthKey = nowMonth;
  return true;
}
