// Ledger's months. A month follows the calendar, except that an income marked "counts for next
// month" (a salary paid at the end of a month) starts the next month on the day it arrives: from
// that day on, everything counts for the next month. If such a salary arrives on 28 September,
// October runs from 28 September until the day before November starts.
// A month never starts after the 1st, so a salary that comes late moves nothing.
//
// Everything that works per month (totals, the goal, charts, History) asks this module which
// month a date counts for.

import { monthKeyOf, shiftMonthKey, addDays } from "./dates.js";

// The month an income marked "counts for next month" starts, or null for any other transaction
export const monthStartedByIncome = t => t.type === "income" && t.startsNextMonth ? shiftMonthKey(monthKeyOf(t.date), 1) : null;

// The months as they are for the current transactions (one pass over them, so cheap to make)
export function monthsOf(state){
  // Months that start before the 1st: month key -> the day it starts
  const early = new Map();
  for (const t of state.transactions){
    const key = monthStartedByIncome(t);
    if (key && (!early.has(key) || t.date < early.get(key))) early.set(key, t.date);
  }
  const next = key => shiftMonthKey(key, 1);
  const start = key => early.get(key) || key + "-01";

  return {
    // The first day of a month
    start,
    // The last day of a month: the day before the next one starts. For this month that's as far
    // as is known yet (see thisMonthEnd in recurring.js for when it's expected to end).
    end: key => addDays(start(next(key)), -1),
    // The month a date counts for
    of(date){
      const key = monthKeyOf(date);
      return date >= start(next(key)) ? next(key) : key;
    },
    // True when a month starts before the 1st (so the month before it ends early)
    startsEarly: key => early.has(key),
    // The transactions that count for a month
    txns(key){
      const from = start(key);
      const to = start(next(key));
      return state.transactions.filter(t => t.date >= from && t.date < to);
    }
  };
}
