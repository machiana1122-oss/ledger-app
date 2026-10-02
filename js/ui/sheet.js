// The add/edit transaction sheet, and deleting a transaction (with Undo).

import { getState, commit, requestPersistentStorage } from "../store.js";
import { parseAmount, centsToInput } from "../money.js";
import { todayStr } from "../dates.js";
import { html, setHtml } from "../html.js";
import { makeId } from "../util.js";
import { $, showToast, confirmChange } from "./shell.js";

let editingId = null;          // the transaction being edited, or null when adding
let currentType = "expense";
let selectedCategory = null;

const editingTxn = () => editingId ? getState().transactions.find(t => t.id === editingId) || null : null;

export function openSheet(txn){
  const state = getState();
  editingId = txn ? txn.id : null;
  $("sheetTitle").textContent = txn ? "Edit transaction" : "Add transaction";
  $("saveTxnBtn").textContent = txn ? "Save changes" : "Save transaction";
  $("deleteTxnBtn").hidden = !txn;
  $("dateInput").value = txn ? txn.date : todayStr();
  $("sheetCurrencySign").textContent = state.currency;
  $("amountInput").value = txn ? centsToInput(txn.amount) : "";
  $("noteInput").value = txn ? txn.note : "";
  setType(txn ? txn.type : "expense", txn ? txn.category : null);
  $("sheetBackdrop").classList.add("show");
  $("addSheet").classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeSheet(){
  $("sheetBackdrop").classList.remove("show");
  $("addSheet").classList.remove("show");
  document.body.style.overflow = "";
  $("amountInput").value = "";
  $("noteInput").value = "";
  editingId = null;
}

function setType(type, preselectCategory){
  currentType = type;
  document.querySelectorAll(".type-toggle button").forEach(b => b.classList.toggle("active", b.dataset.type === type));
  renderCategoryPicker(preselectCategory);
}

function renderCategoryPicker(preselectCategory){
  const list = getState().categories[currentType].slice();
  // A transaction keeps its category even after that category is removed in Settings,
  // so editing something else (like the note) never changes it behind the user's back
  const original = editingTxn();
  const removedCategory = original && original.type === currentType && !list.includes(original.category) ? original.category : null;
  if (removedCategory) list.push(removedCategory);
  selectedCategory = preselectCategory && list.includes(preselectCategory) ? preselectCategory : (list[0] || null);
  setHtml($("catPicker"), list.map(c => {
    const removed = c === removedCategory;
    return html`<button type="button" class="cat-pill${removed ? " removed" : ""}${c === selectedCategory ? " active" : ""}" data-cat="${c}"${removed ? html` title="No longer in your category list"` : ""}>${c}${removed ? html`<span class="cat-pill-note">removed</span>` : ""}</button>`;
  }));
}

function saveTransaction(){
  const amountField = $("amountInput");
  const amount = parseAmount(amountField.value);
  if (!(amount > 0)){ amountField.focus(); showToast("Enter an amount"); return; }
  if (!selectedCategory){ showToast("Pick a category"); return; }
  const date = $("dateInput").value || todayStr();
  const note = $("noteInput").value.trim();
  const state = getState();

  if (editingId){
    const existing = editingTxn();
    if (existing) Object.assign(existing, { type: currentType, amount, category: selectedCategory, note, date });
    closeSheet();
    commit();
    confirmChange("Transaction updated");
  } else {
    state.transactions.push({ id: makeId(), type: currentType, amount, category: selectedCategory, note, date, createdAt: Date.now() });
    closeSheet();
    commit();
    confirmChange("Transaction added");
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

export function initSheet(){
  $("fabAdd").addEventListener("click", () => openSheet());
  $("sheetBackdrop").addEventListener("click", closeSheet);
  document.querySelectorAll(".type-toggle button").forEach(b => b.addEventListener("click", () => {
    // Switching back to the edited transaction's own type brings its category back too
    const original = editingTxn();
    setType(b.dataset.type, original && original.type === b.dataset.type ? original.category : null);
  }));
  $("catPicker").addEventListener("click", e => {
    const pill = e.target.closest(".cat-pill");
    if (!pill) return;
    $("catPicker").querySelectorAll(".cat-pill").forEach(p => p.classList.toggle("active", p === pill));
    selectedCategory = pill.dataset.cat;
  });
  $("saveTxnBtn").addEventListener("click", saveTransaction);
  $("deleteTxnBtn").addEventListener("click", () => {
    const id = editingId;
    if (!id) return;
    closeSheet();
    deleteTransaction(id);
  });
}
