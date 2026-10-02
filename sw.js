// Ledger service worker: lets the app open and work without a connection.
//
// - The app page is loaded network-first, so every update pushed to GitHub shows up on the
//   next launch. The last good copy is used when offline (or when the network is very slow).
// - The app's other files (styles, scripts, icons) follow their page: a page that came from the
//   network gets fresh files, a page that came from the saved copy gets saved files. So one launch
//   never mixes old and new versions.
// - Every app file is saved as it's loaded; the page also sends the list of files it used, so
//   they're all available offline from the first visit. Google Fonts are cached on first use.
//
// Bump CACHE_VERSION when the way files are cached changes (old caches are then deleted).
// A new version of this file takes over as soon as the old one is idle: right away, or within
// about 30 seconds while the app is open (Chrome waits for its next idle check after network
// requests), and at the latest on the next launch. The app's own files are always fresh anyway.
"use strict";

var CACHE_VERSION = "v2";
var CACHE = "ledger-" + CACHE_VERSION;
var APP_PAGE = new URL("./", self.registration.scope).href;
var APP_FILES = ["./", "styles.css", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
var CACHE_FIRST_HOSTS = ["fonts.gstatic.com"];  // versioned files that never change
var REFRESH_HOSTS = ["fonts.googleapis.com"];    // small files that can change
var PAGE_TIMEOUT_MS = 4000;                      // then the saved copy is shown
var FILE_TIMEOUT_MS = 8000;                      // for the files of a page that came from the network

// Pages (by client id) that were shown from the saved copy, so their files come from it too
var pagesFromCache = new Set();

self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(CACHE).then(function(cache){
      // cache: "reload" skips the browser's HTTP cache, so a new version never stores stale files
      return cache.addAll(APP_FILES.map(function(url){ return new Request(url, { cache: "reload" }); }));
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

// The page sends the app files it loaded, so they're kept for offline use
self.addEventListener("message", function(event){
  var data = event.data;
  if (!data || data.type !== "keep-files" || !Array.isArray(data.urls)) return;
  var urls = data.urls.filter(function(url){ return typeof url === "string" && url.indexOf(self.registration.scope) === 0; });
  event.waitUntil(caches.open(CACHE).then(function(cache){
    return Promise.all(urls.map(function(url){
      return cache.match(url).then(function(found){
        if (found) return;
        return fetch(url).then(function(response){ if (response.ok) return cache.put(url, response); }).catch(function(){});
      });
    }));
  }));
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
    if (url.href.indexOf(self.registration.scope) === 0) serveAppFile(event);
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

  var clientId = event.resultingClientId;
  event.respondWith(caches.match(APP_PAGE, { ignoreVary: true }).then(function(cached){
    if (!cached) return network;
    return Promise.race([network, wait(PAGE_TIMEOUT_MS)]).then(function(response){
      // Redirects are passed on; errors (or no answer in time) fall back to the saved copy
      if (response && (response.ok || response.type === "opaqueredirect")) return response;
      return usedSavedPage(clientId, cached);
    }, function(){ return usedSavedPage(clientId, cached); });
  }));
}

function usedSavedPage(clientId, cached){
  if (clientId){
    pagesFromCache.add(clientId);
    // The set only needs recent pages
    if (pagesFromCache.size > 50) pagesFromCache.delete(pagesFromCache.values().next().value);
  }
  return cached;
}

// Styles, scripts, icons and the manifest: from the same source as the page that asked for them
function serveAppFile(event){
  var request = event.request;
  if (pagesFromCache.has(event.clientId)){
    event.respondWith(caches.match(request, { ignoreVary: true }).then(function(cached){
      return cached || fetchAndKeep(request);
    }));
    return;
  }
  var network = fetchAndKeep(request);
  event.waitUntil(network.catch(function(){}));
  event.respondWith(Promise.race([network, wait(FILE_TIMEOUT_MS)]).then(function(response){
    return response || savedOr(request, network);
  }, function(){ return savedOr(request, network); }));
}

function fetchAndKeep(request){
  return fetch(request).then(function(response){
    if (!response.ok || response.type !== "basic") return response;
    var copy = response.clone();
    return caches.open(CACHE).then(function(cache){ return cache.put(request, copy); })
      .then(function(){ return response; }, function(){ return response; });
  });
}

// The saved copy if there is one, otherwise keep waiting for the network
function savedOr(request, network){
  return caches.match(request, { ignoreVary: true }).then(function(cached){ return cached || network; });
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

// Cross-origin files are fetched with CORS so they can be cached as normal (not opaque) responses.
// If a server doesn't allow CORS, the page's own request is used instead; its opaque answer isn't cached.
function fetchCrossOrigin(request){
  return fetch(new Request(request.url, { mode: "cors", credentials: "omit" })).catch(function(){ return fetch(request); });
}
function wait(ms){ return new Promise(function(resolve){ setTimeout(function(){ resolve(null); }, ms); }); }
