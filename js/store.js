// Holds the app's data, loads and saves it, and tells the screen when it changed.
//
// The rule for every change: change getState() -> commit() (saves, then redraws). Drawing code only
// reads the data and never changes it. Steps that keep the data consistent after any change (like
// moving the savings goal to a new month when a salary starts one) run in commit, before saving.

import { freshState, sanitizeState } from "./schema.js";
import { plural } from "./util.js";

// The key name dates from before the data had a version number; the data itself says its version
const STORAGE_KEY = "ledger_data_v1";
// Saved data that can't be read is copied under this prefix (plus a timestamp) instead of being overwritten
export const SET_ASIDE_KEY_PREFIX = "ledger_set_aside_";

let state = freshState();
let lastSaveOk = true;
let saveBlockedReason = null; // "newer": this device holds data from a newer version of Ledger
const commitSteps = [];
const changeListeners = [];
const saveListeners = [];

export const getState = () => state;
export const replaceState = next => { state = next; };
export const lastSaveWorked = () => lastSaveOk;
export const saveProblem = () => saveBlockedReason || (lastSaveOk ? null : "failed");
export const onChange = fn => changeListeners.push(fn);
export const onSave = fn => saveListeners.push(fn);
export const beforeCommit = fn => commitSteps.push(fn);

// Saves the data. Returns false when the browser refuses (private browsing, storage full...).
export function save(){
  if (saveBlockedReason){
    lastSaveOk = false;
  } else {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      lastSaveOk = true;
    } catch (e){
      lastSaveOk = false;
    }
  }
  saveListeners.forEach(fn => fn(lastSaveOk));
  return lastSaveOk;
}

// Every change ends here: keep the data consistent, save it, then redraw what's on screen
export function commit(){
  commitSteps.forEach(fn => fn(state));
  const ok = save();
  changeListeners.forEach(fn => fn());
  return ok;
}

// Loads saved data into the store. Never throws, and never discards saved data it can't read:
// unreadable data is copied aside so it can still be recovered.
// Returns { problem: message or null, storageBlocked }.
export function load(){
  const result = { problem: null, storageBlocked: false };
  state = freshState();
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e){
    // Storage is blocked in this context, so nothing can be saved: start empty and warn
    result.storageBlocked = true;
    lastSaveOk = false;
    return result;
  }
  if (!raw) return result;

  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e){ /* handled below */ }
  const clean = sanitizeState(parsed);
  if (clean && clean.newer){
    // Leave it untouched: a newer Ledger saved it, and this older copy can't read it safely
    saveBlockedReason = "newer";
    result.problem = "This device has data from a newer version of Ledger. Reload the app while online to use it.";
    return result;
  }
  let keptCopy = true;
  if (!clean){
    keptCopy = setAside(raw);
    result.problem = "Your saved data couldn't be read, so Ledger started fresh. A copy was kept on this device.";
  } else {
    if (clean.skipped.length){
      keptCopy = setAside(JSON.stringify(clean.skipped));
      result.problem = plural(clean.skipped.length, "damaged transaction") + " couldn't be read and " +
        (clean.skipped.length === 1 ? "was" : "were") + " set aside.";
    }
    state = clean.state;
  }
  // Store the cleaned (and upgraded) data only once anything unreadable has a safe copy
  // (this also stops the same problem being reported on every launch)
  if (keptCopy){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e){ /* warned on the next save */ }
  }
  return result;
}

function setAside(text){
  try {
    localStorage.setItem(SET_ASIDE_KEY_PREFIX + Date.now(), text);
    return true;
  } catch (e){
    return false;
  }
}

// "Erase everything" removes the set-aside copies too; Undo puts them back
export function removeSetAsideCopies(){
  const copies = {};
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    for (const key of keys){
      if (key && key.startsWith(SET_ASIDE_KEY_PREFIX)){
        copies[key] = localStorage.getItem(key);
        localStorage.removeItem(key);
      }
    }
  } catch (e){ /* storage unavailable */ }
  return copies;
}
export function restoreSetAsideCopies(copies){
  for (const [key, value] of Object.entries(copies)){
    try { localStorage.setItem(key, value); } catch (e){ /* storage unavailable */ }
  }
}

// Asks the browser to keep Ledger's storage even when the device runs low on space.
// Chrome and Safari decide silently; Firefox may ask the user once.
let persistRequested = false;
export function requestPersistentStorage(){
  if (persistRequested || state.transactions.length === 0) return;
  if (!navigator.storage || !navigator.storage.persist || !navigator.storage.persisted) return;
  persistRequested = true;
  navigator.storage.persisted()
    .then(persisted => { if (!persisted) return navigator.storage.persist(); })
    .catch(() => {});
}
