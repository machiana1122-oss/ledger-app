// Recurring transactions (rent, salary, subscriptions...). Nothing is logged by itself: when one is
// due, Overview asks, and the user adds it (one tap, or with changes) or skips it.
// Each rule remembers the last date that was handled (`doneThrough`), so dates are handled in order,
// and a month counts as handled once any of its dates was (so moving the day can't repeat a month).

import { monthKeyOf, shiftMonthKey, daysInMonth, dayOfMonth } from "./dates.js";
import { makeId } from "./util.js";

const MAX_CATCH_UP = 36; // after a very long break, count at most 3 years of missed dates

// The date a rule falls on in a month: its day, or the last day of shorter months
export function occurrenceDate(rule, monthKey){
  return monthKey + "-" + String(Math.min(rule.day, daysInMonth(monthKey))).padStart(2, "0");
}

const isOpen = (rule, date) => date >= rule.startDate && (!rule.doneThrough || monthKeyOf(date) > monthKeyOf(rule.doneThrough));

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

// Recurring expenses in today's month that haven't been added or skipped yet (due or still to come):
// money that's already spoken for when working out what's safe to spend
export function billsStillToCome(state, today){
  const month = monthKeyOf(today);
  return state.recurring.reduce((sum, rule) => {
    if (rule.type !== "expense") return sum;
    return isOpen(rule, occurrenceDate(rule, month)) ? sum + rule.amount : sum;
  }, 0);
}

// Logs one date of a rule as a transaction (`changes` can adjust it, e.g. a different amount)
export function addOccurrence(state, rule, date, changes){
  state.transactions.push({
    id: makeId(), type: rule.type, amount: rule.amount, category: rule.category, note: rule.note,
    date, createdAt: Date.now(), ...changes, recurringId: rule.id
  });
  markDone(rule, date);
}

export function skipOccurrence(rule, date){ markDone(rule, date); }

function markDone(rule, date){
  if (!rule.doneThrough || date > rule.doneThrough) rule.doneThrough = date;
}

// A new monthly rule from a transaction that was just logged (which counts as its first date)
export function ruleFromTransaction(txn){
  return {
    id: makeId(), type: txn.type, amount: txn.amount, category: txn.category, note: txn.note,
    frequency: "monthly", day: dayOfMonth(txn.date), startDate: txn.date, doneThrough: txn.date
  };
}

// What a rule is called on screen: its note (e.g. "Rent"), or its category
export const ruleName = rule => rule.note || rule.category;

// "1st", "2nd", "23rd", "31st"
export function ordinal(n){
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" })[n % 10] || "th";
  return n + suffix;
}
