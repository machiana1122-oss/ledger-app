// The shape of Ledger's data, and the checks that everything read from storage or from a backup
// file goes through before the app uses it - including upgrading data saved by older versions.
//
// Data versions
//   1  (no "version" field) amounts as decimals (12.5); the goal stored its weekly allowance and
//      the savings history stored each month's totals
//   2  amounts in whole cents (1250); totals and allowances are worked out from the transactions,
//      so only facts are stored: transactions, settings and what the goal was each month
//   3  adds the starting balance and recurring transactions; the weekly allowance is replaced by
//      "safe to spend per day", so the goal no longer tracks weeks

import { isValidDateStr, isValidMonthKey } from "./dates.js";
import { clone, isObj, makeId } from "./util.js";

export const SCHEMA_VERSION = 3;
export const MAX_GOAL_HISTORY = 24;
const MAX_CURRENCY_LENGTH = 4;
const ID_PATTERN = /^[\w-]{1,64}$/;

const DEFAULT_STATE = {
  version: SCHEMA_VERSION,
  currency: "$",
  // Money held before the first transaction (cents, may be negative); null until it's set
  openingBalance: null,
  categories: {
    expense: ["Food", "Transport", "Housing", "Bills", "Shopping", "Health", "Entertainment", "Other"],
    income: ["Salary", "Gift", "Freelance", "Other"]
  },
  // { id, type: "income"|"expense", amount (cents), category, note, date "YYYY-MM-DD", createdAt (ms),
  //   recurringId (only if it came from a recurring item) }
  transactions: [],
  // Recurring items: { id, type, amount (cents), category, note, frequency: "monthly", day (1-31),
  //   startDate: first date it's due, doneThrough: last date added or skipped (or null) }
  recurring: [],
  // { monthlyIncome, monthlySavings (cents), monthKey: month last rolled over to }
  goal: null,
  // What the goal was in each finished month: { monthKey, expectedIncome, savingsTarget } (cents)
  goalHistory: [],
  // Summary shown on Overview until dismissed: month { months, newMonthKey, incomeUpdatedTo }
  goalNotices: { month: null },
  // When a backup was last handed over, and until when the reminder is snoozed (ms)
  lastBackupAt: null,
  backupReminderSnoozedUntil: null
};

export function freshState(){ return clone(DEFAULT_STATE); }

// Returns { state, skipped }; { newer: true } for data from a newer version of Ledger (which this
// version can't safely read); or null when it isn't Ledger data at all.
// `skipped` holds the original transactions that were too damaged to keep.
export function sanitizeState(raw){
  if (!isObj(raw) || !Array.isArray(raw.transactions)) return null;
  const version = raw.version === undefined ? 1 : raw.version;
  if (!Number.isInteger(version) || version < 1) return null;
  if (version > SCHEMA_VERSION) return { newer: true };
  const toCents = version === 1 ? decimalToCents : wholeCents;

  const categories = isObj(raw.categories) ? raw.categories : {};
  const usedIds = new Set();
  const transactions = [];
  const skipped = [];
  for (const t of raw.transactions){
    const clean = cleanTransaction(t, usedIds, toCents);
    if (clean) transactions.push(clean);
    else skipped.push(t);
  }
  const goal = cleanGoal(raw.goal, toCents);
  return {
    state: {
      version: SCHEMA_VERSION,
      currency: cleanCurrency(raw.currency),
      openingBalance: cleanOpeningBalance(raw.openingBalance),
      categories: {
        expense: cleanCategoryList(categories.expense, DEFAULT_STATE.categories.expense),
        income: cleanCategoryList(categories.income, DEFAULT_STATE.categories.income)
      },
      transactions,
      recurring: cleanRecurringList(raw.recurring),
      goal,
      goalHistory: cleanGoalHistory(raw.goalHistory, version, toCents),
      goalNotices: goal ? cleanGoalNotices(raw.goalNotices, version, toCents) : clone(DEFAULT_STATE.goalNotices),
      lastBackupAt: cleanTimestamp(raw.lastBackupAt),
      backupReminderSnoozedUntil: cleanTimestamp(raw.backupReminderSnoozedUntil)
    },
    skipped
  };
}

// Numbers, or plain numeric text such as "20.5" from hand-edited files
function readNumber(value){
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string" && /^\s*\d+(\.\d+)?\s*$/.test(value)) return parseFloat(value);
  return NaN;
}
const decimalToCents = value => Math.round(readNumber(value) * 100); // version 1: 12.5 -> 1250
const wholeCents = value => Math.round(readNumber(value));            // version 2 and later: already cents

// A transaction is kept only if its type, amount and date can be trusted; the rest is repaired.
function cleanTransaction(t, usedIds, toCents){
  if (!isObj(t)) return null;
  const type = (t.type === "income" || t.type === "expense") ? t.type : null;
  const amount = toCents(t.amount);
  if (!type || !(amount > 0) || !isValidDateStr(t.date)) return null;
  const category = typeof t.category === "string" ? t.category.trim() : "";
  const id = (typeof t.id === "string" && ID_PATTERN.test(t.id) && !usedIds.has(t.id)) ? t.id : makeId();
  usedIds.add(id);
  const clean = {
    id,
    type,
    amount,
    category: category || "Other",
    note: typeof t.note === "string" ? t.note : "",
    date: t.date,
    createdAt: Number.isFinite(t.createdAt) ? t.createdAt : new Date(t.date + "T00:00:00").getTime()
  };
  if (typeof t.recurringId === "string" && ID_PATTERN.test(t.recurringId)) clean.recurringId = t.recurringId;
  return clean;
}

// The currency is shown inside the page everywhere, so markup characters are stripped
export function cleanCurrency(value){
  const s = typeof value === "string" ? value.replace(/[<>&"'`]/g, "").trim().slice(0, MAX_CURRENCY_LENGTH).trim() : "";
  return s || DEFAULT_STATE.currency;
}

// Whole cents; can be negative (money owed when starting out)
function cleanOpeningBalance(value){
  return Number.isFinite(value) ? Math.round(value) : null;
}

function cleanCategoryList(list, fallback){
  const out = [];
  if (Array.isArray(list)){
    for (const c of list){
      const name = typeof c === "string" ? c.trim() : "";
      if (name && !out.includes(name)) out.push(name);
    }
  }
  return out.length ? out : fallback.slice();
}

// Recurring items only exist from version 3, so their amounts are always cents
function cleanRecurringList(list){
  const out = [];
  const ids = new Set();
  for (const r of Array.isArray(list) ? list : []){
    if (!isObj(r)) continue;
    const type = (r.type === "income" || r.type === "expense") ? r.type : null;
    const amount = wholeCents(r.amount);
    const day = r.day;
    if (!type || !(amount > 0) || !Number.isInteger(day) || day < 1 || day > 31 || !isValidDateStr(r.startDate)) continue;
    const id = (typeof r.id === "string" && ID_PATTERN.test(r.id) && !ids.has(r.id)) ? r.id : makeId();
    ids.add(id);
    const category = typeof r.category === "string" ? r.category.trim() : "";
    out.push({
      id,
      type,
      amount,
      category: category || "Other",
      note: typeof r.note === "string" ? r.note : "",
      frequency: "monthly",
      day,
      startDate: r.startDate,
      doneThrough: isValidDateStr(r.doneThrough) ? r.doneThrough : null
    });
  }
  return out;
}

function cleanGoal(g, toCents){
  if (!isObj(g) || !isValidMonthKey(g.monthKey)) return null;
  const monthlyIncome = toCents(g.monthlyIncome);
  const monthlySavings = toCents(g.monthlySavings);
  if (!(monthlyIncome >= 0) || !(monthlySavings > 0)) return null;
  return { monthlyIncome, monthlySavings, monthKey: g.monthKey };
}

// One entry per month, oldest first. Version 1 stored the month's totals; only what the goal was
// is kept now (its "income" was the expected income whenever nothing had been earned).
function cleanGoalHistory(list, version, toCents){
  const byMonth = new Map();
  for (const h of Array.isArray(list) ? list : []){
    if (!isObj(h) || !isValidMonthKey(h.monthKey)) continue;
    const expectedIncome = toCents(version === 1 ? h.income : h.expectedIncome);
    const savingsTarget = toCents(h.savingsTarget);
    if (Number.isFinite(expectedIncome) && Number.isFinite(savingsTarget)){
      byMonth.set(h.monthKey, { monthKey: h.monthKey, expectedIncome, savingsTarget });
    }
  }
  return [...byMonth.keys()].sort().slice(-MAX_GOAL_HISTORY).map(k => byMonth.get(k));
}

// Only the month summary is kept: the weekly summaries of versions 1 and 2 belonged to the weekly
// allowance, which "safe to spend per day" replaced in version 3
function cleanGoalNotices(n, version, toCents){
  const out = clone(DEFAULT_STATE.goalNotices);
  if (!isObj(n)) return out;
  const m = n.month;
  if (isObj(m) && isValidMonthKey(m.newMonthKey)){
    const months = version === 1
      ? (Array.isArray(m.closed) ? m.closed.map(c => isObj(c) ? c.monthKey : null) : [])
      : (Array.isArray(m.months) ? m.months : []);
    const incomeUpdatedTo = m.incomeUpdatedTo === null || m.incomeUpdatedTo === undefined ? null : toCents(m.incomeUpdatedTo);
    if (months.length && months.every(isValidMonthKey) && (incomeUpdatedTo === null || Number.isFinite(incomeUpdatedTo))){
      out.month = { months, newMonthKey: m.newMonthKey, incomeUpdatedTo };
    }
  }
  return out;
}

function cleanTimestamp(value){ return Number.isFinite(value) && value > 0 ? value : null; }
