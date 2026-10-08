// Offline support: registers the service worker (sw.js), which keeps a copy of the app so it opens
// without a connection, and makes sure each launch uses one version of the app. Needs https or
// localhost.

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
        // The app has started: the service worker checks that its saved copy is the latest version
        if (registration.active) registration.active.postMessage({ type: "started" });
      }, () => { status = "failed"; })
      .then(onStatusChange);
  });
}
