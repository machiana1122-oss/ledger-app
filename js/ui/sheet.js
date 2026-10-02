// The transaction sheet, used four ways:
//   add         a new transaction (optionally "Repeat every month")
//   edit        an existing transaction
//   occurrence  a recurring item that's due, prefilled so it can be adjusted before adding
//   rule        a recurring item itself (amount, category, day of the month), or stop it
// Also deleting a transaction and stopping a recurring item (both with Undo).

import { getState, commit, requestPersistentStorage } from "../store.js";
import { parseAmount, centsToInput } from "../money.js";
import { todayStr } from "../dates.js";
import { addOccurrence, ruleFromTransaction, ruleName, ordinal } from "../recurring.js";
import { html, setHtml } from "../html.js";
import { makeId } from "../util.js";
import { $, showToast, confirmChange } from "./shell.js";

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
  open("rule", { type: rule.type, amount: rule.amount, category: rule.category, note: rule.note });
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
  const state = getState();

  if (mode === "edit"){
    const existing = editingTxn();
    if (existing) Object.assign(existing, values, { date });
    closeSheet();
    commit();
    confirmChange("Transaction updated");
  } else if (mode === "occurrence"){
    const dueRule = rule;
    addOccurrence(state, dueRule, occurrenceDate, { ...values, date });
    closeSheet();
    commit();
    confirmChange("Added " + ruleName(dueRule));
    requestPersistentStorage();
  } else if (mode === "rule"){
    Object.assign(rule, values, { day: parseInt($("ruleDayInput").value, 10) });
    closeSheet();
    commit();
    confirmChange("Recurring item updated");
  } else {
    const txn = { id: makeId(), ...values, date, createdAt: Date.now() };
    let message = "Transaction added";
    if ($("repeatInput").checked){
      const newRule = ruleFromTransaction(txn);
      txn.recurringId = newRule.id;
      state.recurring.push(newRule);
      message = "Transaction added. It repeats every month on the " + ordinal(newRule.day);
    }
    state.transactions.push(txn);
    closeSheet();
    commit();
    confirmChange(message);
    requestPersistentStorage();
  }
}

export function deleteTransaction(id){
  const state = getState();
  const index = state.transactions.findIndex(t => t.id === id);
  if (index === -1) return;
  const [removed] = state.transactions.splice(index, 1);
  commit();
  confirmChange("Transaction deleted", () => {
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
