// The savings goal: its numbers, worked out from the transactions every time (so they can never
// drift from the data), and the month/week rollover that records what the goal was each month.

import { sumOf, inMonth, inRange } from "./calc.js";
import { addDays, daysInMonth, dayOfMonth, monthKeyOf, shiftMonthKey, startOfWeek } from "./dates.js";
import { MAX_GOAL_HISTORY } from "./schema.js";

export const goalBudget = goal => goal.monthlyIncome - goal.monthlySavings;
export const spentInMonth = (txns, key) => sumOf(inMonth(txns, key), "expense");
export const incomeInMonth = (txns, key) => sumOf(inMonth(txns, key), "income");

function monthBounds(key){
  return { first: key + "-01", last: key + "-" + String(daysInMonth(key)).padStart(2, "0") };
}

// What can be spent in the week starting `weekStart`: the month's budget that was left when the
// week began, shared over the weeks left in the month. Only days inside the goal's month count.
export function weekAllowance(txns, goal, weekStart){
  const { first } = monthBounds(goal.monthKey);
  const from = weekStart > first ? weekStart : first;
  const weeksLeft = Math.max(1, Math.ceil((daysInMonth(goal.monthKey) - dayOfMonth(from) + 1) / 7));
  const spentBefore = sumOf(inRange(txns, first, addDays(from, -1)), "expense");
  return (goalBudget(goal) - spentBefore) / weeksLeft;
}

// Spending in the week starting `weekStart`, counting only days inside the goal's month
export function weekSpent(txns, goal, weekStart){
  const { first, last } = monthBounds(goal.monthKey);
  const from = weekStart > first ? weekStart : first;
  const weekEnd = addDays(weekStart, 6);
  const to = weekEnd < last ? weekEnd : last;
  return from > to ? 0 : sumOf(inRange(txns, from, to), "expense");
}

// Weeks left in the goal's month, counting the current one
export function weeksLeftInMonth(goal, today){
  const days = daysInMonth(goal.monthKey);
  const day = monthKeyOf(today) === goal.monthKey ? dayOfMonth(today) : days;
  return Math.max(1, Math.ceil((days - day + 1) / 7));
}

// One row per finished month that has transactions, newest first. Worked out from the
// transactions each time, so correcting an old transaction corrects the history too.
export function savingsHistory(state){
  return state.goalHistory
    .filter(h => inMonth(state.transactions, h.monthKey).length > 0)
    .map(h => {
      const earned = incomeInMonth(state.transactions, h.monthKey);
      // No income logged that month: count the income that was expected
      const income = earned > 0 ? earned : h.expectedIncome;
      return { monthKey: h.monthKey, saved: income - spentInMonth(state.transactions, h.monthKey), target: h.savingsTarget };
    })
    .reverse();
}

// Everything saved in the history, plus this month so far
export function lifetimeSaved(state){
  let total = savingsHistory(state).reduce((sum, row) => sum + row.saved, 0);
  if (state.goal) total += incomeInMonth(state.transactions, state.goal.monthKey) - spentInMonth(state.transactions, state.goal.monthKey);
  return total;
}

// A finished month's numbers for the summary on Overview (budget is null if it's no longer in the history)
export function finishedMonth(state, key){
  const entry = state.goalHistory.find(h => h.monthKey === key);
  return {
    logged: inMonth(state.transactions, key).length > 0,
    spent: spentInMonth(state.transactions, key),
    budget: entry ? entry.expectedIncome - entry.savingsTarget : null
  };
}

// Closes every month (and week) that ended since the goal was last checked: records what the
// goal was in each finished month, and leaves a summary on Overview until it's dismissed.
// Changes `state` only - the caller saves and redraws. Returns true if anything changed.
export function applyGoalRollover(state, today){
  const goal = state.goal;
  if (!goal) return false;
  const nowMonth = monthKeyOf(today);
  const nowWeek = startOfWeek(today);

  if (goal.monthKey > nowMonth){
    // The device clock went backwards (or the backup came from a device set later): restart this month
    goal.monthKey = nowMonth;
    goal.weekStart = nowWeek;
    return true;
  }

  if (goal.monthKey < nowMonth){
    const startIncome = goal.monthlyIncome;
    const months = [];
    // The history only keeps MAX_GOAL_HISTORY months, so there's no point going back further
    const oldestUseful = shiftMonthKey(nowMonth, -MAX_GOAL_HISTORY);
    const first = goal.monthKey < oldestUseful ? oldestUseful : goal.monthKey;
    // Months closed now are recorded from scratch, so they can never be listed twice
    state.goalHistory = state.goalHistory.filter(h => h.monthKey < first || h.monthKey >= nowMonth);
    for (let m = first; m < nowMonth; m = shiftMonthKey(m, 1)){
      state.goalHistory.push({ monthKey: m, expectedIncome: goal.monthlyIncome, savingsTarget: goal.monthlySavings });
      months.push(m);
      // Next month's expected income follows what was actually earned
      const earned = incomeInMonth(state.transactions, m);
      if (earned > 0) goal.monthlyIncome = earned;
    }
    state.goalHistory.sort((a, b) => a.monthKey < b.monthKey ? -1 : 1);
    state.goalHistory = state.goalHistory.slice(-MAX_GOAL_HISTORY);
    state.goalNotices.month = {
      months,
      newMonthKey: nowMonth,
      incomeUpdatedTo: goal.monthlyIncome !== startIncome ? goal.monthlyIncome : null
    };
    // A week summary from the old month no longer applies
    state.goalNotices.week = null;
    goal.monthKey = nowMonth;
    goal.weekStart = nowWeek;
    return true;
  }

  if (!goal.weekStart || goal.weekStart > nowWeek){
    goal.weekStart = nowWeek;
    return true;
  }
  if (goal.weekStart < nowWeek){
    // Sum up last week only if it was the last week seen (not after a longer break)
    const lastWeek = addDays(nowWeek, -7);
    state.goalNotices.week = goal.weekStart === lastWeek ? { weekStart: lastWeek } : null;
    goal.weekStart = nowWeek;
    return true;
  }
  return false;
}
