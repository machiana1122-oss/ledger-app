// Offline support: registers the service worker (sw.js), which keeps a copy of the app so it opens
// without a connection. Needs https or localhost.

let status = ("serviceWorker" in navigator && window.isSecureContext) ? "pending" : "unsupported";

// "unsupported" | "pending" | "ready" | "failed"
export const offlineStatus = () => status;

export function startOfflineSupport(onStatusChange){
  if (status !== "pending") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then(registration => {
        status = "ready";
        keepLoadedFiles(registration);
      }, () => { status = "failed"; })
      .then(onStatusChange);
  });
}

// Tells the service worker every app file this page loaded (styles, scripts...), so they're all
// available offline from the very first visit - no list to keep up to date by hand.
function keepLoadedFiles(registration){
  if (!registration.active) return;
  const urls = performance.getEntriesByType("resource").map(e => e.name).filter(url => url.startsWith(registration.scope));
  registration.active.postMessage({ type: "keep-files", urls });
}
