// Numbers worked out from the transactions. Plain functions of their inputs: they never change anything.
// "Month" means one of Ledger's months, which can start early on payday (see months.js).

import { daysBetween, shiftMonthKey } from "./dates.js";
import { monthsOf } from "./months.js";
import { billsStillToCome, thisMonthEnd } from "./recurring.js";

export const sumOf = (txns, type) => txns.reduce((sum, t) => t.type === type ? sum + t.amount : sum, 0);

// The transactions that count for a month
export const monthTxns = (state, key) => monthsOf(state).txns(key);

// The month today counts for
export const currentMonth = (state, today) => monthsOf(state).of(today);

// Money held: the starting balance plus everything logged (up to `lastDate`, if given)
export function balance(state, lastDate){
  const txns = lastDate ? state.transactions.filter(t => t.date <= lastDate) : state.transactions;
  return (state.openingBalance || 0) + sumOf(txns, "income") - sumOf(txns, "expense");
}

// { income, expense, saved } for one month
export function monthTotals(state, key){
  const month = monthTxns(state, key);
  const income = sumOf(month, "income");
  const expense = sumOf(month, "expense");
  return { income, expense, saved: income - expense };
}

// The first month with a transaction (or this month when there are none)
export function firstMonth(state, today){
  const months = monthsOf(state);
  return state.transactions.reduce((first, t) => {
    const key = months.of(t.date);
    return key < first ? key : first;
  }, months.of(today));
}

// The last `count` months up to this one, oldest first, not going back before the first transaction
export function recentMonths(state, today, count){
  const months = [];
  const first = firstMonth(state, today);
  for (let key = currentMonth(state, today); months.length < count && key >= first; key = shiftMonthKey(key, -1)) months.unshift(key);
  return months;
}

// [{ category, total }], biggest first
export function categoryTotals(txns, type){
  const totals = new Map();
  for (const t of txns){
    if (t.type === type) totals.set(t.category, (totals.get(t.category) || 0) + t.amount);
  }
  return [...totals].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
}

// This month's likely spending. Recurring bills count once (they don't repeat daily), bills still to
// come are added, and only the rest is projected at its daily pace, up to when the month is expected
// to end. Too early to say in the first week.
export const PROJECTION_FROM_DAY = 7;
export function monthProjection(state, today){
  const months = monthsOf(state);
  const key = months.of(today);
  const start = months.start(key);
  const day = daysBetween(start, today) + 1;   // how many days into the month today is
  if (day < PROJECTION_FROM_DAY) return null;
  const length = daysBetween(start, thisMonthEnd(state, today).end) + 1;
  const expenses = months.txns(key).filter(t => t.type === "expense");
  const fixed = expenses.reduce((sum, t) => t.recurringId ? sum + t.amount : sum, 0);
  const other = expenses.reduce((sum, t) => t.recurringId ? sum : sum + t.amount, 0);
  if (fixed + other <= 0) return null;
  return { projected: fixed + billsStillToCome(state, today) + other / day * length };
}
