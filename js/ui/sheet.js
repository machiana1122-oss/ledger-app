// The transaction sheet, used four ways:
//   add         a new transaction (optionally "Repeat every month")
//   edit        an existing transaction
//   occurrence  a recurring item that's due, prefilled so it can be adjusted before adding
//   rule        a recurring item itself (amount, category, day of the month), or stop it
// Incomes can be marked "Counts for next month" (a salary paid at the end of the month starts the
// next month that day, see months.js); a due recurring item follows its rule.
// Also deleting a transaction and stopping a recurring item (both with Undo).

import { getState, commit, requestPersistentStorage } from "../store.js";
import { parseAmount, centsToInput } from "../money.js";
import { todayStr, monthKeyOf, shiftMonthKey, monthName, shortDate } from "../dates.js";
import { monthStartedByIncome } from "../months.js";
import { addOccurrence, ruleFromTransaction, ruleName, ordinal } from "../recurring.js";
import { html, setHtml } from "../html.js";
import { makeId } from "../util.js";
import { $, showToast, confirmChange, monthStartNote } from "./shell.js";

let mode = "add";
let editingId = null;      // edit: the transaction
let rule = null;           // occurrence / rule: the recurring item
let occurrenceDate = null; // occurrence: the date it was due
let currentType = "expense";
let selectedCategory = null;

const editingTxn = () => editingId ? getState().transactions.find(t => t.id === editingId) || null : null;

// What's being edited, if anything (its category stays available even if removed in Settings)
const source = () => mode === "edit" ? editingTxn() : (mode === "occurrence" || mode === "rule") ? rule : null;

const TITLES = { add: "Add transaction", edit: "Edit transaction", occurrence: "Add recurring transaction", rule: "Edit recurring" };
const BUTTONS = { add: "Save transaction", edit: "Save changes", occurrence: "Add", rule: "Save changes" };

function open(newMode, values){
  mode = newMode;
  const state = getState();
  $("sheetTitle").textContent = mode === "occurrence" ? "Add " + ruleName(rule) : TITLES[mode];
  $("saveTxnBtn").textContent = BUTTONS[mode];
  $("deleteTxnBtn").hidden = mode !== "edit" && mode !== "rule";
  $("deleteTxnBtn").textContent = mode === "rule" ? "Stop repeating" : "Delete transaction";
  $("repeatRow").hidden = mode !== "add";
  $("repeatInput").checked = false;
  $("nextMonthInput").checked = !!values.startsNextMonth;
  $("dateRow").hidden = mode === "rule";
  $("ruleDayRow").hidden = mode !== "rule";
  $("dateInput").value = values.date || todayStr();
  if (mode === "rule") $("ruleDayInput").value = String(rule.day);
  $("sheetCurrencySign").textContent = state.currency;
  $("amountInput").value = values.amount ? centsToInput(values.amount) : "";
  $("noteInput").value = values.note || "";
  setType(values.type || "expense", values.category || null);
  $("sheetBackdrop").classList.add("show");
  $("addSheet").classList.add("show");
  document.body.style.overflow = "hidden";
}

export function openSheet(txn){
  editingId = txn ? txn.id : null;
  rule = null;
  open(txn ? "edit" : "add", txn || {});
}

export function openOccurrence(dueRule, date){
  editingId = null;
  rule = dueRule;
  occurrenceDate = date;
  open("occurrence", { type: rule.type, amount: rule.amount, category: rule.category, note: rule.note, date });
}

export function openRuleEditor(editRule){
  editingId = null;
  rule = editRule;
  open("rule", { type: rule.type, amount: rule.amount, category: rule.category, note: rule.note, startsNextMonth: rule.startsNextMonth });
}

function closeSheet(){
  $("sheetBackdrop").classList.remove("show");
  $("addSheet").classList.remove("show");
  document.body.style.overflow = "";
  $("amountInput").value = "";
  $("noteInput").value = "";
  editingId = null;
  rule = null;
}

function setType(type, preselectCategory){
  currentType = type;
  document.querySelectorAll(".type-toggle button").forEach(b => b.classList.toggle("active", b.dataset.type === type));
  renderCategoryPicker(preselectCategory);
  updateNextMonth();
}

// "Counts for next month" is offered for incomes; its hint says what it does with the chosen date
function updateNextMonth(){
  const show = currentType === "income" && mode !== "occurrence";
  $("nextMonthRow").hidden = !show;
  if (!show) return;
  let hint;
  if (!$("nextMonthInput").checked){
    hint = "Tick this for pay meant for next month, like a salary paid at the end of the month.";
  } else if (mode === "rule"){
    hint = "Each time it comes in, the next month starts that day.";
  } else {
    const date = $("dateInput").value || todayStr();
    const key = shiftMonthKey(monthKeyOf(date), 1);
    const next = monthName(key);
    // Another income may have started that month earlier (this one being edited doesn't count)
    const earlier = getState().transactions
      .filter(t => t.id !== editingId && monthStartedByIncome(t) === key && t.date < date)
      .map(t => t.date).sort()[0];
    hint = earlier
      ? next + " already started on " + shortDate(earlier) + ", so this counts for " + next + " too."
      : next + " starts " + (date === todayStr() ? "today" : "on " + shortDate(date)) + ", and everything from that day counts for " + next + ".";
  }
  $("nextMonthHint").textContent = hint;
}
const nextMonthTicked = () => currentType === "income" && mode !== "occurrence" && $("nextMonthInput").checked;

// Sets or removes the "counts for next month" mark (kept off the data when it isn't set)
function setNextMonth(item, on){
  if (on) item.startsNextMonth = true;
  else delete item.startsNextMonth;
}

function renderCategoryPicker(preselectCategory){
  const list = getState().categories[currentType].slice();
  // An item keeps its category even after that category is removed in Settings,
  // so editing something else (like the note) never changes it behind the user's back
  const original = source();
  const removedCategory = original && original.type === currentType && !list.includes(original.category) ? original.category : null;
  if (removedCategory) list.push(removedCategory);
  selectedCategory = preselectCategory && list.includes(preselectCategory) ? preselectCategory : (list[0] || null);
  setHtml($("catPicker"), list.map(c => {
    const removed = c === removedCategory;
    return html`<button type="button" class="cat-pill${removed ? " removed" : ""}${c === selectedCategory ? " active" : ""}" data-cat="${c}"${removed ? html` title="No longer in your category list"` : ""}>${c}${removed ? html`<span class="cat-pill-note">removed</span>` : ""}</button>`;
  }));
}

function save(){
  const amountField = $("amountInput");
  const amount = parseAmount(amountField.value);
  if (!(amount > 0)){ amountField.focus(); showToast("Enter an amount"); return; }
  if (!selectedCategory){ showToast("Pick a category"); return; }
  const date = $("dateInput").value || todayStr();
  const note = $("noteInput").value.trim();
  const values = { type: currentType, amount, category: selectedCategory, note };
  const nextMonth = nextMonthTicked();
  const state = getState();
  // Said when a month now starts on a different day (worked out once the change is in)
  const startNote = key => key ? ". " + monthStartNote(key) : "";

  if (mode === "edit"){
    const existing = editingTxn();
    let moved = null;
    if (existing){
      const before = { started: monthStartedByIncome(existing), date: existing.date };
      Object.assign(existing, values, { date });
      setNextMonth(existing, nextMonth);
      // Only when this edit moved a month's start: newly marked, unmarked, or its date changed
      const started = monthStartedByIncome(existing);
      moved = started && (started !== before.started || date !== before.date) ? started
        : !started && before.started ? before.started : null;
    }
    closeSheet();
    commit();
    confirmChange("Transaction updated" + startNote(moved));
  } else if (mode === "occurrence"){
    const dueRule = rule;
    const added = addOccurrence(state, dueRule, occurrenceDate, { ...values, date });
    closeSheet();
    commit();
    confirmChange("Added " + ruleName(dueRule) + startNote(monthStartedByIncome(added)));
    requestPersistentStorage();
  } else if (mode === "rule"){
    Object.assign(rule, values, { day: parseInt($("ruleDayInput").value, 10) });
    setNextMonth(rule, nextMonth);
    closeSheet();
    commit();
    confirmChange("Recurring item updated");
  } else {
    const txn = { id: makeId(), ...values, date, createdAt: Date.now() };
    setNextMonth(txn, nextMonth);
    let repeats = "";
    if ($("repeatInput").checked){
      const newRule = ruleFromTransaction(txn);
      txn.recurringId = newRule.id;
      state.recurring.push(newRule);
      repeats = ". It repeats every month on the " + ordinal(newRule.day);
    }
    state.transactions.push(txn);
    closeSheet();
    commit();
    confirmChange("Transaction added" + startNote(monthStartedByIncome(txn)) + repeats);
    requestPersistentStorage();
  }
}

export function deleteTransaction(id){
  const state = getState();
  const index = state.transactions.findIndex(t => t.id === id);
  if (index === -1) return;
  const [removed] = state.transactions.splice(index, 1);
  commit();
  // Deleting a salary that started a month moves that month's start back
  const started = monthStartedByIncome(removed);
  confirmChange("Transaction deleted" + (started ? ". " + monthStartNote(started) : ""), () => {
    getState().transactions.push(removed);
    commit();
    confirmChange("Restored");
  });
}

// Stops a recurring item. Transactions already logged from it stay.
export function stopRecurring(id){
  const state = getState();
  const index = state.recurring.findIndex(r => r.id === id);
  if (index === -1) return;
  const [stopped] = state.recurring.splice(index, 1);
  commit();
  confirmChange("Stopped repeating " + ruleName(stopped), () => {
    getState().recurring.splice(Math.min(index, getState().recurring.length), 0, stopped);
    commit();
    confirmChange("Restored");
  });
}

export function initSheet(){
  setHtml($("ruleDayInput"), Array.from({ length: 31 }, (_, i) =>
    html`<option value="${i + 1}">${ordinal(i + 1)}${i + 1 > 28 ? " (or the last day of shorter months)" : ""}</option>`));
  $("fabAdd").addEventListener("click", () => openSheet());
  $("sheetBackdrop").addEventListener("click", closeSheet);
  document.querySelectorAll(".type-toggle button").forEach(b => b.addEventListener("click", () => {
    // Switching back to the item's own type brings its category back too
    const original = source();
    setType(b.dataset.type, original && original.type === b.dataset.type ? original.category : null);
  }));
  $("catPicker").addEventListener("click", e => {
    const pill = e.target.closest(".cat-pill");
    if (!pill) return;
    $("catPicker").querySelectorAll(".cat-pill").forEach(p => p.classList.toggle("active", p === pill));
    selectedCategory = pill.dataset.cat;
  });
  $("dateInput").addEventListener("change", updateNextMonth);
  $("nextMonthInput").addEventListener("change", updateNextMonth);
  $("saveTxnBtn").addEventListener("click", save);
  $("deleteTxnBtn").addEventListener("click", () => {
    if (mode === "rule" && rule){
      const id = rule.id;
      closeSheet();
      stopRecurring(id);
    } else if (mode === "edit" && editingId){
      const id = editingId;
      closeSheet();
      deleteTransaction(id);
    }
  });
}
