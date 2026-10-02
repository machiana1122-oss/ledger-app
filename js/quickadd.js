// Quick add from a link, e.g. for iPhone Back Tap / Shortcuts:
//   index.html?quickadd=1&amount=12.5&category=Food&note=Lunch&type=expense

import { getState, commit } from "./store.js";
import { parseAmount } from "./money.js";
import { todayStr } from "./dates.js";
import { makeId } from "./util.js";
import { money, showToast, confirmChange } from "./ui/shell.js";

export function handleQuickAdd(){
  const params = new URLSearchParams(window.location.search);
  if (params.get("quickadd") !== "1") return;
  // Strip the link's details so a refresh doesn't log it twice
  history.replaceState({}, document.title, window.location.pathname);

  const type = params.get("type") === "income" ? "income" : "expense";
  const amount = parseAmount(params.get("amount"));
  const rawCategory = params.get("category") || "";
  const note = params.get("note") || "";
  if (!(amount > 0)){
    showToast("Quick add needs a valid amount");
    return;
  }

  const state = getState();
  const categories = state.categories[type];
  const matched = rawCategory !== "" && categories.includes(rawCategory);
  const category = matched ? rawCategory : (categories[0] || "Other");
  state.transactions.push({ id: makeId(), type, amount, category, note, date: todayStr(), createdAt: Date.now() });
  commit();
  confirmChange(matched
    ? (type === "income" ? "Income logged: " : "Expense logged: ") + money(amount) + " - " + category
    : 'Logged under "' + category + '" - "' + rawCategory + '" didn\'t match any category');
}
