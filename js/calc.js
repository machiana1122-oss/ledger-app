// Numbers worked out from the transactions. Plain functions of their inputs: they never change anything.

import { monthKeyOf, dayOfMonth, daysInMonth, shiftMonthKey } from "./dates.js";
import { billsStillToCome } from "./recurring.js";

export const sumOf = (txns, type) => txns.reduce((sum, t) => t.type === type ? sum + t.amount : sum, 0);
export const inMonth = (txns, key) => txns.filter(t => monthKeyOf(t.date) === key);
export const inRange = (txns, from, to) => txns.filter(t => t.date >= from && t.date <= to);
export const inMonthUpToDay = (txns, key, day) => inMonth(txns, key).filter(t => dayOfMonth(t.date) <= day);

// Money held: the starting balance plus everything logged (up to `lastDate`, if given)
export function balance(state, lastDate){
  const txns = lastDate ? state.transactions.filter(t => t.date <= lastDate) : state.transactions;
  return (state.openingBalance || 0) + sumOf(txns, "income") - sumOf(txns, "expense");
}

// { income, expense, saved } for one month
export function monthTotals(txns, key){
  const month = inMonth(txns, key);
  const income = sumOf(month, "income");
  const expense = sumOf(month, "expense");
  return { income, expense, saved: income - expense };
}

// The first month with a transaction (or this month when there are none)
export function firstMonth(state, today){
  const thisMonth = monthKeyOf(today);
  return state.transactions.reduce((first, t) => {
    const key = monthKeyOf(t.date);
    return key < first ? key : first;
  }, thisMonth);
}

// The last `count` months up to this one, oldest first, not going back before the first transaction
export function recentMonths(state, today, count){
  const thisMonth = monthKeyOf(today);
  const first = firstMonth(state, today);
  const months = [];
  for (let key = thisMonth; months.length < count && key >= first; key = shiftMonthKey(key, -1)) months.unshift(key);
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
// come are added, and only the rest is projected at its daily pace. Too early to say in the first week.
export const PROJECTION_FROM_DAY = 7;
export function monthProjection(state, today){
  const day = dayOfMonth(today);
  if (day < PROJECTION_FROM_DAY) return null;
  const key = monthKeyOf(today);
  const expenses = inMonth(state.transactions, key).filter(t => t.type === "expense");
  const fixed = expenses.reduce((sum, t) => t.recurringId ? sum + t.amount : sum, 0);
  const other = expenses.reduce((sum, t) => t.recurringId ? sum : sum + t.amount, 0);
  if (fixed + other <= 0) return null;
  return { projected: fixed + billsStillToCome(state, today) + other / day * daysInMonth(key) };
}
