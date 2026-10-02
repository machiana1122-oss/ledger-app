// Numbers worked out from the transactions. Plain functions of their inputs: they never change anything.

import { monthKeyOf, dayOfMonth, daysInMonth } from "./dates.js";

export const sumOf = (txns, type) => txns.reduce((sum, t) => t.type === type ? sum + t.amount : sum, 0);
export const inMonth = (txns, key) => txns.filter(t => monthKeyOf(t.date) === key);
export const inRange = (txns, from, to) => txns.filter(t => t.date >= from && t.date <= to);
export const inMonthUpToDay = (txns, key, day) => inMonth(txns, key).filter(t => dayOfMonth(t.date) <= day);
export const balance = txns => sumOf(txns, "income") - sumOf(txns, "expense");

// [{ category, total }], biggest first
export function categoryTotals(txns, type){
  const totals = new Map();
  for (const t of txns){
    if (t.type === type) totals.set(t.category, (totals.get(t.category) || 0) + t.amount);
  }
  return [...totals].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
}

// This month's spending if it continues at the same daily pace (null before anything is spent)
export function monthProjection(txns, today){
  const key = monthKeyOf(today);
  const spent = sumOf(inMonth(txns, key), "expense");
  if (spent <= 0) return null;
  return { spent, projected: spent / dayOfMonth(today) * daysInMonth(key) };
}
