// Ledger service worker: lets the app open and work without a connection.
//
// - The app page is loaded network-first, so every update pushed to GitHub shows up on the
//   next launch. The last good copy is used when offline (or when the network is very slow).
// - The manifest and icons come from the cache and refresh in the background.
// - Chart.js and Google Fonts are cached the first time they load.
//
// Bump CACHE_VERSION whenever APP_FILES changes.
"use strict";

var CACHE_VERSION = "v1";
var CACHE = "ledger-" + CACHE_VERSION;
var APP_PAGE = new URL("./", self.registration.scope).href;
var APP_FILES = ["./", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
// Same URL as the <script> tag in index.html. If they ever differ, Chart.js is still cached on first use.
var CHART_JS = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.5.1/chart.umd.min.js";
var CACHE_FIRST_HOSTS = ["cdnjs.cloudflare.com", "fonts.gstatic.com"]; // versioned files that never change
var REFRESH_HOSTS = ["fonts.googleapis.com"];                          // small files that can change
var NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(CACHE).then(function(cache){
      // cache: "reload" skips the browser's HTTP cache, so a new version never stores stale files
      return cache.addAll(APP_FILES.map(function(url){ return new Request(url, { cache: "reload" }); }))
        .then(function(){
          // Optional: the app still works (without charts) if this fails
          return fetch(corsRequest(CHART_JS)).then(function(response){
            if (response.ok) return cache.put(CHART_JS, response);
          }).catch(function(){});
        });
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(key){ return key.indexOf("ledger-") === 0 && key !== CACHE; })
        .map(function(key){ return caches.delete(key); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(event){
  var request = event.request;
  if (request.method !== "GET") return;
  var url = new URL(request.url);

  if (request.mode === "navigate"){
    if (isAppPage(url)) serveAppPage(event);
    return;
  }
  if (url.origin === self.location.origin){
    if (url.href.indexOf(self.registration.scope) === 0) serveStaleWhileRevalidate(event, fetchSameOrigin);
    return;
  }
  if (CACHE_FIRST_HOSTS.indexOf(url.hostname) !== -1) serveCacheFirst(event, fetchCrossOrigin);
  else if (REFRESH_HOSTS.indexOf(url.hostname) !== -1) serveStaleWhileRevalidate(event, fetchCrossOrigin);
});

// The app page, with any query string (quick-add links use ?quickadd=1&...)
function isAppPage(url){
  var scopePath = new URL(self.registration.scope).pathname;
  return url.origin === self.location.origin && (url.pathname === scopePath || url.pathname === scopePath + "index.html");
}

function serveAppPage(event){
  var network = fetch(event.request);
  // Keep the latest good copy for offline use
  event.waitUntil(network.then(function(response){
    if (!response.ok || response.type !== "basic") return;
    var copy = response.clone();
    return caches.open(CACHE).then(function(cache){ return cache.put(APP_PAGE, copy); });
  }).catch(function(){}));

  event.respondWith(caches.match(APP_PAGE, { ignoreVary: true }).then(function(cached){
    if (!cached) return network;
    return Promise.race([network, wait(NETWORK_TIMEOUT_MS)]).then(function(response){
      // Redirects are passed on; errors (or no answer in time) fall back to the saved copy
      if (response && (response.ok || response.type === "opaqueredirect")) return response;
      return cached;
    }, function(){ return cached; });
  }));
}

function serveStaleWhileRevalidate(event, fetcher){
  var request = event.request;
  var network = fetcher(request).then(function(response){
    if (!response.ok) return response;
    var copy = response.clone();
    return caches.open(CACHE).then(function(cache){ return cache.put(request, copy); })
      .then(function(){ return response; }, function(){ return response; });
  });
  event.waitUntil(network.catch(function(){}));
  event.respondWith(caches.match(request, { ignoreVary: true }).then(function(cached){ return cached || network; }));
}

function serveCacheFirst(event, fetcher){
  var request = event.request;
  event.respondWith(caches.match(request, { ignoreVary: true }).then(function(cached){
    if (cached) return cached;
    return fetcher(request).then(function(response){
      if (!response.ok) return response;
      var copy = response.clone();
      return caches.open(CACHE).then(function(cache){ return cache.put(request, copy); })
        .then(function(){ return response; }, function(){ return response; });
    });
  }));
}

function fetchSameOrigin(request){ return fetch(request); }

// Cross-origin files are fetched with CORS so they can be cached as normal (not opaque) responses.
// If a server doesn't allow CORS, the page's own request is used instead; its opaque answer isn't cached.
function fetchCrossOrigin(request){
  return fetch(corsRequest(request.url)).catch(function(){ return fetch(request); });
}
function corsRequest(url){ return new Request(url, { mode: "cors", credentials: "omit" }); }
function wait(ms){ return new Promise(function(resolve){ setTimeout(function(){ resolve(null); }, ms); }); }
