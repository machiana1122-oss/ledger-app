// Starts Ledger: loads the data, connects the screens, and keeps "today" up to date.

import { load, getState, save, onChange, onSave, requestPersistentStorage } from "./store.js";
import { applyGoalRollover } from "./goal.js";
import { todayStr } from "./dates.js";
import { handleQuickAdd } from "./quickadd.js";
import { startOfflineSupport } from "./offline.js";
import { initShell, registerView, renderCurrent, currentView, showToast, updateSaveWarning } from "./ui/shell.js";
import { initOverview, renderOverview } from "./ui/overview.js";
import { initHistory, renderHistory } from "./ui/history.js";
import { initInsights, renderInsights } from "./ui/insights.js";
import { initSettings, renderSettings } from "./ui/settings.js";
import { initSheet } from "./ui/sheet.js";
import { initBackup } from "./ui/backup.js";

const loaded = load();
onSave(updateSaveWarning);
onChange(renderCurrent);

initShell();
initOverview();
initHistory();
initInsights();
initSettings();
initSheet();
initBackup();
registerView("overview", renderOverview);
registerView("history", renderHistory);
registerView("insights", renderInsights);
registerView("settings", renderSettings);

if (applyGoalRollover(getState(), todayStr())) save();
updateSaveWarning();
renderCurrent();
handleQuickAdd();
if (loaded.problem) showToast(loaded.problem, null, 6000);
requestPersistentStorage();

// The app can stay open (or sit in the background on a phone) across midnight.
// When the date changes, close any finished month and redraw with the new "today"
// (which also shows recurring items that have become due).
let lastSeenDay = todayStr();
function refreshIfNewDay(){
  if (todayStr() === lastSeenDay) return;
  lastSeenDay = todayStr();
  if (applyGoalRollover(getState(), todayStr())) save();
  renderCurrent();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshIfNewDay(); });
window.addEventListener("focus", refreshIfNewDay);
setInterval(refreshIfNewDay, 60 * 1000);

startOfflineSupport(() => { if (currentView() === "settings") renderCurrent(); });

// Lets index.html know the app started (it shows a help message otherwise)
window.ledgerStarted = true;
