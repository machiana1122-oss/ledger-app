// Backups: export (share sheet on phones), the reminder, import, the status lines in Settings,
// erasing everything, and the buttons in the "not saved" warning.

import { getState, replaceState, commit, save, removeSetAsideCopies, restoreSetAsideCopies } from "../store.js";
import { freshState, sanitizeState } from "../schema.js";
import { applyGoalRollover } from "../goal.js";
import { todayStr, toDateStr, daysBetween } from "../dates.js";
import { html, setHtml } from "../html.js";
import { plural } from "../util.js";
import { offlineStatus } from "../offline.js";
import { $, showToast, confirmChange, renderAllViews } from "./shell.js";

const BACKUP_REMINDER_DAYS = 14;
const BACKUP_SNOOZE_DAYS = 3;
const DAY_MS = 86400000;

// ---------- Export ----------
// Hands a backup file to the user. On touch devices that can share files this opens the share
// sheet ("Save to Files", AirDrop, Mail...), because iPhone Home Screen apps ignore normal
// downloads; everywhere else the file is downloaded. Call it straight from a tap: iOS only
// allows the share sheet during a user action. Resolves to true once the file was handed
// over, or false if the user closed the share sheet.
export function exportBackup(){
  const name = "ledger-backup-" + todayStr() + ".json";
  const now = Date.now();
  // The file records when it was made, so restoring it later restores that date too
  const json = JSON.stringify({ ...getState(), lastBackupAt: now, backupReminderSnoozedUntil: null }, null, 2);
  const file = makeBackupFile(json, name);
  if (canShareFile(file)){
    return navigator.share({ files: [file] }).then(
      () => backupHandedOver(now, "Backup exported"),
      err => {
        if (err && err.name === "AbortError") return false;
        // Sharing failed for another reason: fall back to a normal download
        downloadFile(file, name);
        return backupHandedOver(now, "Backup downloaded");
      });
  }
  downloadFile(file, name);
  return Promise.resolve(backupHandedOver(now, "Backup downloaded"));
}

function backupHandedOver(at, message){
  const state = getState();
  state.lastBackupAt = at;
  state.backupReminderSnoozedUntil = null;
  commit();
  showToast(message);
  return true;
}

function makeBackupFile(json, name){
  try { return new File([json], name, { type: "application/json" }); }
  catch (e){ return new Blob([json], { type: "application/json" }); }
}

function canShareFile(file){
  try {
    return !!(navigator.share && navigator.canShare && file instanceof File &&
      window.matchMedia("(pointer: coarse)").matches && navigator.canShare({ files: [file] }));
  } catch (e){
    return false;
  }
}

function downloadFile(blob, name){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoking straight away can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------- Reminder and status ----------
// Calendar days between a timestamp and today (so "14 days ago" means the same everywhere)
const daysSince = ms => daysBetween(toDateStr(new Date(ms)), todayStr());

function daysAgoText(ms){
  const days = daysSince(ms);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return days + " days ago";
}

// Due after BACKUP_REMINDER_DAYS calendar days without a backup (counted from the first
// transaction if there has never been one), unless the user tapped "Later" recently
function backupReminderDue(state){
  if (state.transactions.length === 0) return false;
  const now = Date.now();
  if (state.backupReminderSnoozedUntil && now < state.backupReminderSnoozedUntil) return false;
  const since = state.lastBackupAt || state.transactions.reduce((min, t) => Math.min(min, t.createdAt), now);
  return daysSince(since) >= BACKUP_REMINDER_DAYS;
}

export function renderBackupReminder(state){
  const due = backupReminderDue(state);
  $("backupReminder").hidden = !due;
  if (!due) return;
  $("backupReminderText").textContent = state.lastBackupAt
    ? "Your last backup was " + daysAgoText(state.lastBackupAt) + ". Save a fresh copy so your recent changes can't be lost."
    : "You haven't backed up yet. Ledger keeps your data only on this device, so save a copy somewhere safe.";
}

const OFFLINE_TEXT = {
  unsupported: "not available in this browser",
  pending: "getting ready…",
  ready: "yes",
  failed: "not available right now"
};

export function renderDataStatus(state){
  setHtml($("backupStatus"), html`Last backup: <strong>${state.lastBackupAt ? daysAgoText(state.lastBackupAt) : "never"}</strong>`);
  setHtml($("offlineStatus"), html`Works offline: <strong>${OFFLINE_TEXT[offlineStatus()]}</strong>`);
}

// ---------- Import ----------
function importFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); }
    catch (e){ showToast("Couldn't read that file"); return; }

    const result = sanitizeState(parsed);
    if (!result){ showToast("That file isn't a Ledger backup"); return; }
    if (result.newer){ showToast("That backup is from a newer version of Ledger. Update the app (reload while online) and try again."); return; }
    const incoming = result.state.transactions.length;
    const skipped = result.skipped.length;
    if (incoming === 0 && skipped > 0){ showToast("None of the transactions in that file could be read"); return; }

    let question = "Replace all data on this device (" + plural(getState().transactions.length, "transaction") +
      ", plus your categories and settings) with this backup (" + plural(incoming, "transaction") + ")?";
    if (skipped) question += "\n\n" + plural(skipped, "damaged transaction") + " in the file will be skipped.";
    if (!confirm(question)) return;

    const previous = getState();
    replaceState(result.state);
    applyGoalRollover(getState(), todayStr()); // the backup's goal may be from an earlier month
    try {
      renderAllViews(); // make sure every tab can show it before keeping it
    } catch (e){
      // Nothing has been saved yet, so switching back is enough
      replaceState(previous);
      renderAllViews();
      showToast("Couldn't load that backup. Nothing was changed.");
      return;
    }
    commit();
    confirmChange("Backup restored", () => {
      replaceState(previous);
      commit();
      confirmChange("Previous data restored");
    });
  };
  reader.onerror = () => showToast("Couldn't read that file");
  reader.readAsText(file);
}

// ---------- Erase all data ----------
function eraseSummaryText(){
  const state = getState();
  const n = state.transactions.length;
  const parts = [];
  if (n) parts.push(n === 1 ? "your 1 transaction" : "all " + n + " transactions");
  parts.push("your categories and currency");
  if (state.recurring.length) parts.push(state.recurring.length === 1 ? "your recurring transaction" : "your " + state.recurring.length + " recurring transactions");
  if (state.goal) parts.push("your savings goal");
  if (state.goalHistory.length) parts.push("your savings history");
  const list = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  return "This removes " + list + " from this device.";
}

function eraseBackupNoteText(){
  const { lastBackupAt } = getState();
  if (!lastBackupAt) return "You haven't exported a backup yet, so this data couldn't be recovered later.";
  const when = daysAgoText(lastBackupAt);
  if (when === "today") return "You exported a backup today.";
  return "Your last backup was " + when + ", so anything newer would be lost.";
}

function renderEraseDialog(){
  $("eraseSummary").textContent = eraseSummaryText();
  $("eraseBackupNote").textContent = eraseBackupNoteText();
}

function eraseAllData(){
  const previous = getState();
  const setAsideCopies = removeSetAsideCopies();
  replaceState(freshState());
  commit();
  confirmChange("All data erased", () => {
    replaceState(previous);
    restoreSetAsideCopies(setAsideCopies);
    commit();
    confirmChange("Data restored");
  });
}

export function initBackup(){
  $("exportBtn").addEventListener("click", () => exportBackup());
  $("backupReminderExportBtn").addEventListener("click", () => exportBackup());
  $("backupReminderLaterBtn").addEventListener("click", () => {
    getState().backupReminderSnoozedUntil = Date.now() + BACKUP_SNOOZE_DAYS * DAY_MS;
    commit();
    confirmChange("I'll remind you again in " + BACKUP_SNOOZE_DAYS + " days");
  });
  $("saveWarningExportBtn").addEventListener("click", () => exportBackup());
  $("saveWarningRetryBtn").addEventListener("click", () => {
    showToast(save() ? "Saved" : "Still can't save. Export a backup to keep your data.");
  });

  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) importFile(file);
    e.target.value = "";
  });

  const dialog = $("eraseDialog");
  $("resetBtn").addEventListener("click", () => {
    if (typeof dialog.showModal !== "function"){
      // Browsers without <dialog> support get a plain confirmation instead
      if (confirm("Erase all data? " + eraseSummaryText() + " " + eraseBackupNoteText())) eraseAllData();
      return;
    }
    renderEraseDialog();
    dialog.showModal();
  });
  $("eraseExportBtn").addEventListener("click", () => {
    exportBackup().then(done => { if (done) renderEraseDialog(); });
  });
  $("eraseConfirmBtn").addEventListener("click", () => {
    dialog.close();
    eraseAllData();
  });
  $("eraseCancelBtn").addEventListener("click", () => dialog.close());
  // A tap outside the dialog (on the dimmed backdrop) closes it
  dialog.addEventListener("click", e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
}
