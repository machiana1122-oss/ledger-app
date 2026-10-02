// Recurring transactions (rent, salary, subscriptions...). Nothing is logged by itself: when one is
// due, Overview asks, and the user adds it (one tap, or with changes) or skips it.
// Each rule remembers the last date that was handled (`doneThrough`), so dates are handled in order,
// and a month counts as handled once any of its dates was (so moving the day can't repeat a month).
// A recurring income can be marked "counts for next month" (a salary paid at the end of the month):
// each time it's added, the next month starts that day (see months.js).

import { monthKeyOf, shiftMonthKey, daysInMonth, dayOfMonth, addDays } from "./dates.js";
import { monthsOf } from "./months.js";
import { makeId } from "./util.js";

const MAX_CATCH_UP = 36; // after a very long break, count at most 3 years of missed dates

// The date a rule falls on in a month: its day, or the last day of shorter months
export function occurrenceDate(rule, monthKey){
  return monthKey + "-" + String(Math.min(rule.day, daysInMonth(monthKey))).padStart(2, "0");
}

const isOpen = (rule, date) => date >= rule.startDate && (!rule.doneThrough || monthKeyOf(date) > monthKeyOf(rule.doneThrough));

// The dates a rule falls on from one date to another (both included)
function datesBetween(rule, from, to){
  const dates = [];
  for (let key = monthKeyOf(from); key <= monthKeyOf(to); key = shiftMonthKey(key, 1)){
    const date = occurrenceDate(rule, key);
    if (date >= from && date <= to) dates.push(date);
  }
  return dates;
}

// The first date not yet added or skipped (it may be in the past)
export function nextDate(rule){
  const from = rule.doneThrough && rule.doneThrough > rule.startDate ? rule.doneThrough : rule.startDate;
  const date = occurrenceDate(rule, monthKeyOf(from));
  return isOpen(rule, date) ? date : occurrenceDate(rule, shiftMonthKey(monthKeyOf(from), 1));
}

// Dates of a rule that are due by `today` and not handled yet, oldest first
export function dueDates(rule, today){
  const dates = [];
  for (let date = nextDate(rule); date <= today && dates.length < MAX_CATCH_UP; date = occurrenceDate(rule, shiftMonthKey(monthKeyOf(date), 1))){
    dates.push(date);
  }
  return dates;
}

// What Overview shows: per rule, its oldest due date and how many more are waiting, oldest first
export function dueItems(state, today){
  return state.recurring
    .map(rule => ({ rule, dates: dueDates(rule, today) }))
    .filter(item => item.dates.length > 0)
    .map(item => ({ rule: item.rule, date: item.dates[0], more: item.dates.length - 1 }))
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

// The month a rule's date starts, if it's an income that counts for next month (otherwise null)
export function monthStartedBy(rule, date){
  return rule.type === "income" && rule.startsNextMonth ? shiftMonthKey(monthKeyOf(date), 1) : null;
}

// When this month is expected to end. Normally on the day before the next month starts (the end of
// the calendar month, or earlier if next month's salary is already logged), but if a recurring
// income that starts the next month is expected before that, the day before it arrives.
// Returns { end, payday }: payday is that expected date, or null.
export function thisMonthEnd(state, today){
  const months = monthsOf(state);
  const key = months.of(today);
  let end = months.end(key);
  let payday = null;
  for (const rule of state.recurring){
    if (rule.type !== "income" || !rule.startsNextMonth) continue;
    // Its date in this calendar month, if it's still to come (or due today) and not handled yet
    const date = occurrenceDate(rule, key);
    if (date >= today && date <= end && isOpen(rule, date) && (!payday || date < payday)) payday = date;
  }
  if (payday) end = payday > today ? addDays(payday, -1) : today;
  return { end, payday };
}

// Recurring expenses in this month that haven't been added or skipped yet (due or still to come):
// money that's already spoken for when working out what's safe to spend
export function billsStillToCome(state, today){
  const months = monthsOf(state);
  const from = months.start(months.of(today));
  const { end } = thisMonthEnd(state, today);
  return state.recurring.reduce((sum, rule) => {
    if (rule.type !== "expense") return sum;
    return sum + datesBetween(rule, from, end).filter(date => isOpen(rule, date)).length * rule.amount;
  }, 0);
}

// Logs one date of a rule as a transaction (`changes` can adjust it, e.g. a different amount or date).
// An income that counts for next month starts the month after its scheduled date, unless it came
// so late that it's already in that month.
export function addOccurrence(state, rule, date, changes){
  const txn = {
    id: makeId(), type: rule.type, amount: rule.amount, category: rule.category, note: rule.note,
    date, createdAt: Date.now(), ...changes, recurringId: rule.id
  };
  const starts = monthStartedBy(rule, date);
  if (starts && txn.type === "income" && monthKeyOf(txn.date) === monthKeyOf(date)) txn.startsNextMonth = true;
  state.transactions.push(txn);
  markDone(rule, date);
  return txn;
}

export function skipOccurrence(rule, date){ markDone(rule, date); }

function markDone(rule, date){
  if (!rule.doneThrough || date > rule.doneThrough) rule.doneThrough = date;
}

// A new monthly rule from a transaction that was just logged (which counts as its first date)
export function ruleFromTransaction(txn){
  const rule = {
    id: makeId(), type: txn.type, amount: txn.amount, category: txn.category, note: txn.note,
    frequency: "monthly", day: dayOfMonth(txn.date), startDate: txn.date, doneThrough: txn.date
  };
  if (txn.type === "income" && txn.startsNextMonth) rule.startsNextMonth = true;
  return rule;
}

// What a rule is called on screen: its note (e.g. "Rent"), or its category
export const ruleName = rule => rule.note || rule.category;

// "1st", "2nd", "23rd", "31st"
export function ordinal(n){
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" })[n % 10] || "th";
  return n + suffix;
}
