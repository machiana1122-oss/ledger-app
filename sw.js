// Ledger service worker: lets the app open and work without a connection, and makes sure every
// launch uses ONE version of the app - never a new page with old styles or code.
//
// - Online, the app page and its files are fetched with cache: "no-cache". GitHub Pages lets
//   browsers reuse a file for 10 minutes without asking ("Cache-Control: max-age=600"), so right
//   after an update the browser could otherwise give the new page the styles and code it kept from
//   before. "no-cache" makes it ask the server each time (a quick "not modified" if nothing changed).
//   What the page gets is marked "no-cache" too, so the browser can't reuse it on its own (forPage).
// - A saved copy is kept for offline use: the page and every file it needs, all of one version.
//   It's made by reading the page and the files it links and imports, and it replaces the previous
//   copy only once it's complete. After each launch that started fine, it's checked against the
//   site and made again if the app changed - and only saved if fetching it all twice gives the same
//   files, so an update published at that very moment can't leave a mix in the copy.
// - A launch takes everything from one place: the network, or the saved copy when there's no
//   connection (or the page takes more than 4 s). If the page came from the saved copy, so do its
//   files; if it came from the network, so do they.
// - Google Fonts are kept separately (cache-first for the font files, refreshed for their styles).
//
// Older versions of this file kept everything in one "ledger-v2" cache and could mix versions; on
// taking over, the new version removes that cache and reloads any page the old one opened.
"use strict";

var SCOPE = self.registration.scope;
var APP_PAGE = new URL("./", SCOPE).href;
var COPY_PREFIX = "ledger-copy-" + new URL(SCOPE).pathname + "-";  // + the time it was made
var FONTS = "ledger-fonts";
var NOTES = "ledger-notes";                      // which copy is current; pages opened from a copy
var CACHE_FIRST_HOSTS = ["fonts.gstatic.com"];   // versioned files that never change
var REFRESH_HOSTS = ["fonts.googleapis.com"];    // small files that can change
var PAGE_TIMEOUT_MS = 4000;                      // then the saved copy is shown

var launches = new Map();  // page (client id) -> "network", or the name of the copy it came from
var refreshing = null;     // the copy check in progress

self.addEventListener("install", function(event){
  // Ready to work offline before taking over. If the copy can't be made (no connection, or an
  // update being published), the install fails and the browser tries again on a later visit; the
  // app works online meanwhile.
  event.waitUntil(refreshCopy().then(function(name){
    if (!name) throw new Error("The app couldn't be saved for offline use yet");
    return self.skipWaiting();
  }));
});

self.addEventListener("activate", function(event){
  event.waitUntil(caches.keys().then(function(keys){
    var old = keys.filter(function(key){
      return key.indexOf("ledger-") === 0 && key.indexOf("ledger-copy-") !== 0 && key !== FONTS && key !== NOTES;
    });
    return Promise.all(old.map(function(key){ return caches.delete(key); }))
      .then(function(){ return removeOldCopies().catch(function(){}); })
      .then(function(){ return self.clients.claim(); })
      .then(function(){
        // Pages opened by an older version may be mixing versions: open them again through this one.
        // (Not waited for: the reload is answered by this worker, once it has finished taking over.)
        if (old.length) reloadPages();
      });
  }));
});

function reloadPages(){
  return self.clients.matchAll({ type: "window" }).then(function(pages){
    pages.forEach(function(page){
      if (page.navigate) page.navigate(page.url).catch(function(){});
    });
  });
}

// A page says it has started (older pages said which files they loaded): a good time to check that
// the saved copy is still the app's latest version
self.addEventListener("message", function(event){
  var data = event.data;
  if (!data || (data.type !== "started" && data.type !== "keep-files")) return;
  event.waitUntil(refreshCopy().catch(function(){}).then(removeOldCopies));
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
    if (url.href.indexOf(SCOPE) === 0) serveAppFile(event);
    return;
  }
  if (CACHE_FIRST_HOSTS.indexOf(url.hostname) !== -1) serveCacheFirst(event, fetchCrossOrigin);
  else if (REFRESH_HOSTS.indexOf(url.hostname) !== -1) serveStaleWhileRevalidate(event, fetchCrossOrigin);
});

// The app page, with any query string (quick-add links use ?quickadd=1&...)
function isAppPage(url){
  var scopePath = new URL(SCOPE).pathname;
  return url.origin === self.location.origin && (url.pathname === scopePath || url.pathname === scopePath + "index.html");
}

// ---------- Launches

function serveAppPage(event){
  var clientId = event.resultingClientId;
  // "manual": a redirect is passed on to the browser as it is
  var network = fetchFresh(new Request(event.request.url, { redirect: "manual" }));
  event.waitUntil(network.catch(function(){}));
  // (If the saved copy can't be read, the page simply comes from the network)
  event.respondWith(currentCopy().catch(function(){ return null; }).then(function(name){
    if (!name) return network.then(function(response){ launched(clientId, "network"); return response; });
    return Promise.race([network, wait(PAGE_TIMEOUT_MS)]).then(function(response){
      if (response && (response.ok || response.type === "opaqueredirect")){
        launched(clientId, "network");
        return response;
      }
      // An error from the server, or no answer in time: the saved copy (an answer that comes later
      // isn't kept; the copy is only ever replaced as a whole, see refreshCopy)
      return openCopy(event, clientId, name, network);
    }, function(){ return openCopy(event, clientId, name, network); });
  }).then(forPage));
}

function openCopy(event, clientId, name, network){
  return caches.open(name).then(function(copy){ return copy.match(APP_PAGE); }).then(function(page){
    if (!page) return network;
    launched(clientId, name);
    // Noted down too, in case this worker is stopped and started again while the page loads its files
    if (clientId) event.waitUntil(writeNote("launch/" + clientId, name));
    return page;
  });
}

function launched(clientId, source){
  if (!clientId) return;
  launches.set(clientId, source);
  // Only recent pages are needed
  if (launches.size > 50) launches.delete(launches.keys().next().value);
}

function launchOf(clientId){
  if (!clientId) return Promise.resolve(null);
  if (launches.has(clientId)) return Promise.resolve(launches.get(clientId));
  return readNote("launch/" + clientId).then(function(name){
    if (name) launches.set(clientId, name);
    return name;
  });
}

// Styles, scripts, icons and the manifest: from where their page came from
function serveAppFile(event){
  var request = event.request;
  event.respondWith(launchOf(event.clientId).catch(function(){ return null; }).then(function(source){
    if (source && source !== "network"){
      return caches.open(source).then(function(copy){ return copy.match(request, { ignoreVary: true }); })
        .then(function(saved){ return saved || fetchFresh(request); });
    }
    var network = fetchFresh(request);
    // A page from the network gets its files from the network too, never older saved ones
    if (source === "network") return network;
    // A page this worker didn't open (the first visit, or one opened by an older version):
    // the network, or the saved copy without a connection
    return network.catch(function(){
      return fromCurrentCopy(request).then(function(saved){ return saved || network; });
    });
  }).then(forPage));
}

function fromCurrentCopy(request){
  return currentCopy().then(function(name){
    if (!name) return null;
    return caches.open(name).then(function(copy){ return copy.match(request, { ignoreVary: true }); });
  });
}

// Asks the server: the browser's kept copy is used only if the server says it's still current
function fetchFresh(request){ return fetch(request, { cache: "no-cache" }); }

// What a page gets is marked "ask again before reusing it". Otherwise the browser keeps loaded files
// in memory and gives them to the next page in the same tab for as long as the server allowed (10
// minutes on GitHub Pages), without asking this worker - a new page could get the old files again.
function forPage(response){
  // A redirect (or anything unusual) is passed on as it is
  if (response.type !== "basic" && response.type !== "default") return response;
  var headers = new Headers(response.headers);
  ["Cache-Control", "Expires", "ETag", "Last-Modified", "Age"].forEach(function(name){ headers.delete(name); });
  headers.set("Cache-Control", "no-cache");
  var noBody = [204, 205, 304].indexOf(response.status) !== -1;
  return new Response(noBody ? null : response.body, { status: response.status, statusText: response.statusText, headers: headers });
}

// ---------- The saved copy

// Read each time (not remembered): an old and a new version of this file can run side by side
function currentCopy(){
  return readNote("current").then(function(name){
    if (!name) return null;
    return caches.has(name).then(function(exists){ return exists ? name : null; });
  });
}

// Checks the saved copy against the site, and makes a new one if the app changed. Resolves with
// the current copy's name (null if there's none yet).
function refreshCopy(){
  if (!refreshing){
    refreshing = fetchApp().then(function(files){
      return currentCopy().then(function(name){
        return (name ? copyFiles(name).then(function(saved){ return sameFiles(saved, files); }) : Promise.resolve(false)).then(function(same){
          if (same) return name;
          // The app changed. It's fetched again (quick: the server answers "not modified") and saved
          // only if nothing changed in between - an update published while the files were being
          // fetched would give a mix of old and new ones. If it did, the next launch tries again.
          return fetchApp().then(function(again){
            return sameFiles(files, again).then(function(steady){ return steady ? saveCopy(again) : name; });
          });
        });
      });
    });
    var done = function(){ refreshing = null; };
    refreshing.then(done, done);
  }
  return refreshing;
}

// The app page and everything it needs - what it links (styles, scripts, icons, manifest), what
// its scripts import, the icons in the manifest, anything the styles load - asked from the server
// together. A Map of address -> response; fails if any of them fails.
function fetchApp(){
  var found = new Map();  // address -> promise of its response
  function add(url){
    if (found.has(url)) return;
    found.set(url, fetchFresh(new Request(url)).then(function(response){
      if (!response.ok || response.type !== "basic") throw new Error("Couldn't get " + url + " (" + response.status + ")");
      var type = fileType(url);
      if (!type) return response;
      return response.clone().text().then(function(text){
        linksIn(text, type, url).forEach(add);
        return response;
      });
    }));
  }
  function settle(){
    var count = found.size;
    return Promise.all(Array.from(found.values())).then(function(){ return found.size > count ? settle() : null; });
  }
  add(APP_PAGE);
  return settle().then(function(){
    return Promise.all(Array.from(found).map(function(entry){
      return entry[1].then(function(response){ return [entry[0], response]; });
    }));
  }).then(function(entries){ return new Map(entries); });
}

function fileType(url){
  if (url === APP_PAGE || /\.html$/.test(new URL(url).pathname)) return "page";
  if (/\.m?js$/.test(new URL(url).pathname)) return "script";
  if (/\.css$/.test(new URL(url).pathname)) return "style";
  if (/\.webmanifest$/.test(new URL(url).pathname)) return "manifest";
  return null;
}

var LINKS = {
  // <link href="...">, <script src="...">, <img src="...">
  page: /<(?:link|script|img)\b[^>]*?\s(?:href|src)\s*=\s*["']([^"']+)["']/gi,
  // import ... from "./x.js", export ... from "./x.js", import "./x.js", import("./x.js")
  script: /(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}\/[^"'\s]+)["']/g,
  // url(...) and @import "..."
  style: /url\(\s*["']?([^"')\s]+)["']?\s*\)|@import\s+["']([^"']+)["']/g
};

// The app's own files a file refers to (not other sites, like Google Fonts)
function linksIn(text, type, base){
  var links = [];
  if (type === "manifest"){
    try { (JSON.parse(text).icons || []).forEach(function(icon){ links.push(icon.src); }); } catch (e) {}
  } else {
    var pattern = new RegExp(LINKS[type].source, LINKS[type].flags);
    var match;
    while ((match = pattern.exec(text))) links.push(match[1] || match[2]);
  }
  return links.map(function(link){
    var url = new URL(link, base);
    url.hash = "";
    return url.href;
  }).filter(function(url){ return url.indexOf(SCOPE) === 0 && url !== base; });
}

// A saved copy's files: a Map of address -> response
function copyFiles(name){
  return caches.open(name).then(function(copy){
    return copy.keys().then(function(keys){
      return Promise.all(keys.map(function(key){
        return copy.match(key).then(function(response){ return [key.url, response]; });
      }));
    });
  }).then(function(entries){ return new Map(entries); });
}

// True when both have the same files, byte for byte
function sameFiles(a, b){
  if (a.size !== b.size) return Promise.resolve(false);
  return Promise.all(Array.from(a).map(function(entry){
    var other = b.get(entry[0]);
    if (!other) return false;
    return Promise.all([entry[1].clone().arrayBuffer(), other.clone().arrayBuffer()]).then(function(bodies){
      return sameBytes(bodies[0], bodies[1]);
    });
  })).then(function(results){ return results.every(Boolean); });
}

function sameBytes(a, b){
  if (a.byteLength !== b.byteLength) return false;
  var x = new Uint8Array(a), y = new Uint8Array(b);
  for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

// Saves the files as a new copy; only once it's complete does it become the current one (older
// copies are removed afterwards, see removeOldCopies)
function saveCopy(files){
  var name = COPY_PREFIX + Date.now();
  return caches.open(name).then(function(copy){
    return Promise.all(Array.from(files).map(function(entry){ return copy.put(entry[0], entry[1].clone()); }));
  }).then(function(){
    return writeNote("current", name);
  }).then(function(){ return name; }, function(error){
    return caches.delete(name).then(function(){ throw error; });
  });
}

function copyTime(name){ return Number(name.slice(COPY_PREFIX.length)) || 0; }

// ---------- Notes (small text entries in their own cache)

function noteUrl(key){ return SCOPE + "__ledger-notes/" + key; }
function writeNote(key, value){
  return caches.open(NOTES).then(function(notes){ return notes.put(noteUrl(key), new Response(value)); });
}
function readNote(key){
  return caches.open(NOTES).then(function(notes){ return notes.match(noteUrl(key)); })
    .then(function(found){ return found ? found.text() : null; });
}

// Removes the copies older than the current one, except any that an open page came from (it may
// still need files from it). The notes about closed pages go too. Newer copies are left alone:
// another version of this file may be saving one right now.
function removeOldCopies(){
  var prefix = noteUrl("launch/");
  return caches.open(NOTES).then(function(notes){
    return notes.keys().then(function(keys){
      return Promise.all(keys.filter(function(key){ return key.url.indexOf(prefix) === 0; }).map(function(key){
        return self.clients.get(key.url.slice(prefix.length)).then(function(page){
          if (!page) return notes.delete(key).then(function(){ return null; });
          return notes.match(key).then(function(found){ return found ? found.text() : null; });
        });
      }));
    });
  }).then(function(inUse){
    // (and those of pages opened a moment ago, whose note may not be written yet)
    return Promise.all(Array.from(launches).map(function(entry){
      return self.clients.get(entry[0]).then(function(page){ return page ? entry[1] : null; });
    })).then(function(recent){ return inUse.concat(recent); });
  }).then(function(inUse){
    return Promise.all([currentCopy(), caches.keys()]).then(function(results){
      var current = results[0];
      if (!current) return;
      return Promise.all(results[1].filter(function(key){
        return key.indexOf(COPY_PREFIX) === 0 && copyTime(key) < copyTime(current) && inUse.indexOf(key) === -1;
      }).map(function(key){ return caches.delete(key); }));
    });
  });
}

// ---------- Google Fonts

function serveStaleWhileRevalidate(event, fetcher){
  var request = event.request;
  var network = fetcher(request).then(function(response){
    if (!response.ok) return response;
    var copy = response.clone();
    return caches.open(FONTS).then(function(cache){ return cache.put(request, copy); })
      .then(function(){ return response; }, function(){ return response; });
  });
  event.waitUntil(network.catch(function(){}));
  event.respondWith(caches.match(request, { ignoreVary: true, cacheName: FONTS }).then(function(cached){ return cached || network; }));
}

function serveCacheFirst(event, fetcher){
  var request = event.request;
  event.respondWith(caches.match(request, { ignoreVary: true, cacheName: FONTS }).then(function(cached){
    if (cached) return cached;
    return fetcher(request).then(function(response){
      if (!response.ok) return response;
      var copy = response.clone();
      return caches.open(FONTS).then(function(cache){ return cache.put(request, copy); })
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
