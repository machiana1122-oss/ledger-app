// Keyboard shortcuts (listed in the laptop sidebar): N adds a transaction, / searches History, and
// the left and right arrows move between months on Overview. They're ignored while typing in a
// field, while a window is open, and with Ctrl, Cmd or Alt held (the browser's own shortcuts).

import { $, currentView, switchTab } from "./shell.js";
import { openSheet, isSheetOpen } from "./sheet.js";

const typingIn = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export function initShortcuts(){
  document.addEventListener("keydown", e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (isSheetOpen() || document.querySelector("dialog[open]") || typingIn(document.activeElement)) return;
    if (e.key === "n" || e.key === "N"){
      e.preventDefault();
      openSheet();
    } else if (e.key === "/"){
      e.preventDefault();
      if (currentView() !== "history") switchTab("history");
      $("historySearch").focus();
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && currentView() === "overview"){
      const button = $(e.key === "ArrowLeft" ? "prevMonthBtn" : "nextMonthBtn");
      if (!button.disabled){
        e.preventDefault();
        button.click();
      }
    }
  });
}
