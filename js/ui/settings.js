// Settings tab: currency, starting balance, expense categories, recurring items and the savings goal.
// (Backups, import and erasing live in backup.js.)

import { getState, commit } from "../store.js";
import { cleanCurrency } from "../schema.js";
import { incomeInMonth } from "../goal.js";
import { currentMonth } from "../calc.js";
import { parseAmount, centsToInput } from "../money.js";
import { shiftMonthKey, todayStr, shortDate } from "../dates.js";
import { nextDate, ruleName, ordinal } from "../recurring.js";
import { html, setHtml } from "../html.js";
import { $, money, showToast, confirmChange, renderCurrent } from "./shell.js";
import { renderDataStatus } from "./backup.js";
import { openRuleEditor, stopRecurring } from "./sheet.js";

let renamingCategory = null;   // the category being renamed, or null when adding
let goalFormOpen = false;

export function renderSettings(state){
  $("currencyInput").value = state.currency;
  $("openingBalanceInput").value = state.openingBalance === null ? "" : centsToInput(state.openingBalance);
  renderRecurring(state);
  setHtml($("categoryChips"), state.categories.expense.map(c =>
    html`<div class="chip"><span class="chip-label" data-cat="${c}" role="button" tabindex="0">${c}</span><button data-cat="${c}" aria-label="Remove">&times;</button></div>`));
  $("addCategoryBtn").textContent = renamingCategory ? "Rename" : "Add";
  renderGoalSettings(state);
  renderDataStatus(state);
}

function renderRecurring(state){
  const today = todayStr();
  setHtml($("recurringList"), state.recurring.length
    ? state.recurring.map(rule => {
        const next = nextDate(rule);
        return html`<div class="rule-row" data-rule="${rule.id}" role="button" tabindex="0"><div class="rule-info"><div class="rule-name">${ruleName(rule)}</div><div class="rule-meta"><span class="${rule.type}">${rule.type === "income" ? "+" : "-"}${money(rule.amount)}</span> · every month on the ${ordinal(rule.day)}${rule.startsNextMonth ? " · starts the next month" : ""} · ${next <= today ? "due now" : "next " + shortDate(next)}</div></div><button class="del-btn" type="button" data-stop="${rule.id}" aria-label="Stop repeating ${ruleName(rule)}">&times;</button></div>`;
      })
    : html`<p class="empty-note">No recurring transactions yet.</p>`);
}

function renderGoalSettings(state){
  $("goalForm").hidden = !goalFormOpen;
  $("goalSummary").hidden = goalFormOpen;
  setHtml($("goalSummary"), state.goal
    ? html`<div class="set-row"><span>Expected monthly income</span><span>${money(state.goal.monthlyIncome)}</span></div><div class="set-row"><span>Monthly savings target</span><span>${money(state.goal.monthlySavings)}</span></div><div class="btn-row top-gap"><button class="btn btn-ghost" type="button" id="goalEditBtn">Edit goal</button><button class="btn btn-danger" type="button" id="goalRemoveBtn">Remove</button></div>`
    : html`<p class="intro">Tell me what you earn and want to save each month, and I'll work out how much you can safely spend each day.</p><button class="btn btn-gold btn-block" type="button" id="goalSetupBtn">Set a savings goal</button>`);
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
    // Recurring items too, so they keep logging under the new name
    [...state.transactions, ...state.recurring].forEach(t => { if (t.type === "expense" && t.category === oldName) t.category = name; });
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
    const state = getState();
    const lastIncome = incomeInMonth(state, shiftMonthKey(currentMonth(state, todayStr()), -1));
    $("goalIncomeInput").value = lastIncome > 0 ? centsToInput(lastIncome) : "";
    $("goalSavingsInput").value = "";
  }
  renderCurrent();
}

function saveGoal(){
  const state = getState();
  const monthlyIncome = parseAmount($("goalIncomeInput").value);
  const monthlySavings = parseAmount($("goalSavingsInput").value);
  if (!(monthlyIncome >= 0)){ showToast("Enter your expected monthly income, like 9000"); return; }
  if (!(monthlySavings > 0)){ showToast("Enter how much you want to save, like 2000"); return; }
  if (monthlySavings >= monthlyIncome){ showToast("Your savings target needs to be less than your income"); return; }
  const wasEditing = !!state.goal;
  state.goal = { monthlyIncome, monthlySavings, monthKey: currentMonth(state, todayStr()) };
  goalFormOpen = false;
  commit();
  confirmChange(wasEditing ? "Goal updated" : "Goal set");
}

function removeGoal(){
  if (!confirm("Remove your savings goal? Your transactions won't be affected.")) return;
  const state = getState();
  state.goal = null;
  state.goalNotices = { month: null };
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

  const openingInput = $("openingBalanceInput");
  openingInput.addEventListener("change", () => {
    const text = openingInput.value.trim();
    const cents = text === "" ? null : parseAmount(text);
    if (Number.isNaN(cents)){
      showToast("Enter an amount, like 1500 or -200");
      return;
    }
    getState().openingBalance = cents;
    commit();
    confirmChange(cents === null ? "Starting balance cleared" : "Starting balance updated");
  });

  const recurringList = $("recurringList");
  const findRule = id => getState().recurring.find(r => r.id === id);
  recurringList.addEventListener("click", e => {
    const stop = e.target.closest("[data-stop]");
    if (stop){ stopRecurring(stop.dataset.stop); return; }
    const row = e.target.closest(".rule-row");
    const rule = row && findRule(row.dataset.rule);
    if (rule) openRuleEditor(rule);
  });
  recurringList.addEventListener("keydown", e => {
    const row = e.target.closest(".rule-row");
    if (row && e.target === row && (e.key === "Enter" || e.key === " ")){
      e.preventDefault();
      const rule = findRule(row.dataset.rule);
      if (rule) openRuleEditor(rule);
    }
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
