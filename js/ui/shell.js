// The app's frame: tabs (only the visible one is drawn), the message bar ("toast") and the
// "not saved" warning shown on every tab.

import { getState, lastSaveWorked, saveProblem } from "../store.js";
import { formatMoney } from "../money.js";
import { html, setHtml } from "../html.js";

const TAB_TITLES = { overview: "Overview", history: "History", insights: "Insights", settings: "Settings" };
const views = {};
let currentTab = "overview";

// Money in the user's currency
export const money = cents => formatMoney(cents, getState().currency);
export const currentView = () => currentTab;
export const $ = id => document.getElementById(id);

export function registerView(name, render){ views[name] = render; }

// Draws the tab on screen. The other tabs are drawn when they're opened.
export function renderCurrent(){ views[currentTab](getState()); }

// Draws every tab once (used to check that imported data can be shown before keeping it)
export function renderAllViews(){ Object.values(views).forEach(render => render(getState())); }

export function switchTab(name){
  currentTab = name;
  document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === "tab-" + name));
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === name));
  $("topTitle").textContent = TAB_TITLES[name];
  renderCurrent();
}

// ---------- Toast ----------
let toastTimer = null;
let toastUndo = null;

export function showToast(message, undo, durationMs){
  const toast = $("toast");
  toastUndo = undo || null;
  setHtml(toast, html`${message}${undo ? html` <button type="button" class="toast-undo-btn">Undo</button>` : ""}`);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, durationMs || (undo ? 5000 : 2200));
}

function hideToast(){
  $("toast").classList.remove("show");
  toastUndo = null;
}

// Confirms a change the user just made, and says so when it couldn't be stored on this device
// (the warning at the top may be scrolled out of view)
export function confirmChange(message, undo){
  if (lastSaveWorked()) showToast(message, undo);
  else showToast(message + " - not saved on this device", undo, 5000);
}

// ---------- "Not saved" warning ----------
const SAVE_WARNINGS = {
  failed: html`<strong>Your latest changes aren't saved.</strong> This browser isn't letting Ledger store data right now (this can happen in private browsing or when storage is full), so anything new will be lost when you close the app. Export a backup to keep it.`,
  newer: html`<strong>Changes can't be saved here.</strong> This device has data from a newer version of Ledger, so this older copy won't overwrite it. Reload the app while online to get the latest version.`
};

export function updateSaveWarning(){
  const problem = saveProblem();
  $("saveWarning").hidden = !problem;
  if (problem) setHtml($("saveWarningText"), SAVE_WARNINGS[problem]);
}

export function initShell(){
  document.querySelectorAll(".tab-btn").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
  $("toast").addEventListener("click", e => {
    if (!e.target.closest(".toast-undo-btn") || !toastUndo) return;
    const undo = toastUndo;
    clearTimeout(toastTimer);
    hideToast();
    undo();
  });
}
