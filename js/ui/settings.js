// Settings tab: currency, expense categories and the savings goal.
// (Backups, import and erasing live in backup.js.)

import { getState, commit } from "../store.js";
import { cleanCurrency } from "../schema.js";
import { incomeInMonth } from "../goal.js";
import { parseAmount, centsToInput } from "../money.js";
import { currentMonthKey, shiftMonthKey, todayStr, startOfWeek } from "../dates.js";
import { html, setHtml } from "../html.js";
import { $, money, showToast, confirmChange, renderCurrent } from "./shell.js";
import { renderDataStatus } from "./backup.js";

let renamingCategory = null;   // the category being renamed, or null when adding
let goalFormOpen = false;

export function renderSettings(state){
  $("currencyInput").value = state.currency;
  setHtml($("categoryChips"), state.categories.expense.map(c =>
    html`<div class="chip"><span class="chip-label" data-cat="${c}" role="button" tabindex="0">${c}</span><button data-cat="${c}" aria-label="Remove">&times;</button></div>`));
  $("addCategoryBtn").textContent = renamingCategory ? "Rename" : "Add";
  renderGoalSettings(state);
  renderDataStatus(state);
}

function renderGoalSettings(state){
  $("goalForm").hidden = !goalFormOpen;
  $("goalSummary").hidden = goalFormOpen;
  setHtml($("goalSummary"), state.goal
    ? html`<div class="set-row"><span>Monthly income</span><span>${money(state.goal.monthlyIncome)}</span></div><div class="set-row"><span>Monthly savings target</span><span>${money(state.goal.monthlySavings)}</span></div><div class="btn-row top-gap"><button class="btn btn-ghost" type="button" id="goalEditBtn">Edit goal</button><button class="btn btn-danger" type="button" id="goalRemoveBtn">Remove</button></div>`
    : html`<p class="intro">Tell me what you earn and want to save each month, and I'll work out a weekly spending number.</p><button class="btn btn-gold btn-block" type="button" id="goalSetupBtn">Set a savings goal</button>`);
}

// ---------- Categories ----------
function setRenaming(category){
  renamingCategory = category;
  const input = $("newCategoryInput");
  input.value = category || "";
  $("addCategoryBtn").textContent = category ? "Rename" : "Add";
  if (category) input.focus();
}

function addOrRenameCategory(){
  const state = getState();
  const name = $("newCategoryInput").value.trim();
  if (!name) return;
  const list = state.categories.expense;

  if (renamingCategory){
    const oldName = renamingCategory;
    if (name === oldName){ setRenaming(null); return; }
    if (list.includes(name)){ showToast("That category already exists"); return; }
    const index = list.indexOf(oldName);
    if (index !== -1) list[index] = name;
    else list.push(name);
    state.transactions.forEach(t => { if (t.type === "expense" && t.category === oldName) t.category = name; });
    setRenaming(null);
    commit();
    confirmChange("Renamed to " + name);
    return;
  }

  if (list.includes(name)){ showToast("That category already exists"); return; }
  list.push(name);
  $("newCategoryInput").value = "";
  commit();
  confirmChange("Category added");
}

function removeCategory(name){
  const state = getState();
  if (state.categories.expense.length <= 1){ showToast("You need at least one expense category"); return; }
  if (renamingCategory === name) setRenaming(null);
  state.categories.expense = state.categories.expense.filter(c => c !== name);
  commit();
  confirmChange("Category removed");
}

// ---------- Savings goal ----------
function openGoalForm(isEdit){
  const goal = getState().goal;
  goalFormOpen = true;
  if (isEdit && goal){
    $("goalIncomeInput").value = centsToInput(goal.monthlyIncome);
    $("goalSavingsInput").value = centsToInput(goal.monthlySavings);
  } else {
    // Starts from what was actually earned last month
    const lastIncome = incomeInMonth(getState().transactions, shiftMonthKey(currentMonthKey(), -1));
    $("goalIncomeInput").value = lastIncome > 0 ? centsToInput(lastIncome) : "";
    $("goalSavingsInput").value = "";
  }
  renderCurrent();
}

function saveGoal(){
  const state = getState();
  const monthlyIncome = parseAmount($("goalIncomeInput").value);
  const monthlySavings = parseAmount($("goalSavingsInput").value);
  if (!(monthlyIncome >= 0)){ showToast("Enter your expected monthly income"); return; }
  if (!(monthlySavings > 0)){ showToast("Enter how much you want to save"); return; }
  if (monthlySavings >= monthlyIncome){ showToast("Your savings target needs to be less than your income"); return; }
  const wasEditing = !!state.goal;
  state.goal = { monthlyIncome, monthlySavings, monthKey: currentMonthKey(), weekStart: startOfWeek(todayStr()) };
  goalFormOpen = false;
  commit();
  confirmChange(wasEditing ? "Goal updated" : "Goal set");
}

function removeGoal(){
  if (!confirm("Remove your savings goal? Your transactions won't be affected.")) return;
  const state = getState();
  state.goal = null;
  state.goalNotices = { month: null, week: null };
  commit();
  confirmChange("Goal removed");
}

export function initSettings(){
  const currencyInput = $("currencyInput");
  currencyInput.addEventListener("change", () => {
    getState().currency = cleanCurrency(currencyInput.value);
    commit();
    confirmChange("Currency updated");
  });

  $("newCategoryInput").addEventListener("input", e => {
    if (renamingCategory && e.target.value.trim() === "") setRenaming(null);
  });
  $("addCategoryBtn").addEventListener("click", addOrRenameCategory);
  const chips = $("categoryChips");
  chips.addEventListener("click", e => {
    const label = e.target.closest(".chip-label");
    if (label){ setRenaming(label.dataset.cat); return; }
    const remove = e.target.closest(".chip > button");
    if (remove) removeCategory(remove.dataset.cat);
  });
  chips.addEventListener("keydown", e => {
    const label = e.target.closest(".chip-label");
    if (label && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); setRenaming(label.dataset.cat); }
  });

  $("goalSummary").addEventListener("click", e => {
    if (e.target.closest("#goalSetupBtn")) openGoalForm(false);
    else if (e.target.closest("#goalEditBtn")) openGoalForm(true);
    else if (e.target.closest("#goalRemoveBtn")) removeGoal();
  });
  $("goalCancelBtn").addEventListener("click", () => { goalFormOpen = false; renderCurrent(); });
  $("goalSaveBtn").addEventListener("click", saveGoal);
}
