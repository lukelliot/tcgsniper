// scheduler.js — the DURABLE poll. A chrome.alarms alarm fires on its period
// regardless of page state, sleep, or network, so the watch recovers
// automatically from a failed load (the next alarm just reloads again). On each
// tick we reload the watched product tab(s); the content script re-scrapes and
// messages back to evaluate().

import { get, set, getConfig, getProducts, applyOverrides } from './storage.js';
import { ALARM, KEY, REGEX, URLS, KEEP_AWAKE_LEVEL, MS } from './constants.js';
import { log, warn } from './log.js';

export function ensureAlarm(min) {
  chrome.alarms.create(ALARM, { periodInMinutes: Math.max(1, min) });
}

// Ask the OS not to IDLE-sleep the system (display/screensaver can still turn
// off). Does NOT override a manual sleep or a closed laptop lid. MV3 workers are
// short-lived, so we re-assert this on every alarm; placing the OS power request
// also resets the idle-sleep timer, so a ~1-min cadence keeps the machine up.
export function keepAwake() {
  try {
    chrome.power.requestKeepAwake(KEEP_AWAKE_LEVEL);
  } catch (e) {
    // power API unavailable — ignore.
  }
}

// Alarm entry point. A failed load yields no scrape message; the next alarm
// retries — this is the auto-recovery a userscript lacks.
export async function handleTick(a) {
  if (a.name !== ALARM) {
    return;
  }

  await applyOverrides();

  if (await get(KEY.PAUSED, false)) {
    log('paused — skipping tick (resumeWatch() to restart).');
    return;
  }

  keepAwake(); // re-assert: the worker may have been torn down since last tick

  const allTcg = await chrome.tabs.query({ url: URLS.TCG_ALL });
  const uhoh = allTcg.filter((t) => REGEX.UHOH.test(t.url || ''));
  const products = getProducts();
  const watched = allTcg.filter((t) => {
    const mm = (t.url || '').match(REGEX.PRODUCT_ID);
    return mm && products[mm[1]];
  });

  if (uhoh.length) {
    await handleBlocked(uhoh, watched);
    return;
  }

  if (watched.length) {
    const active = [];
    for (const t of watched) {
      const pid = (t.url.match(REGEX.PRODUCT_ID) || [])[1];
      if (!(await get(KEY.productPaused(pid), false))) {
        active.push(t);
      }
    }
    if (active.length) {
      reloadWatched(active);
    } else {
      log('all open watched products are paused — skipping reloads.');
    }
    return; // tabs are open, just paused — don't fall through to reopen
  }

  await reopenClosedIfNeeded();
}

// TCGplayer redirected us to /uhoh. Slow down (hammering a block makes it
// worse) and recover by REUSING the blocked tab(s); close any extra /uhoh tabs
// so they can't accumulate overnight.
//
// A /uhoh URL carries no product id, so we can't read which product a blocked
// tab belonged to. Instead we recover each watched product that currently lacks
// a live (non-/uhoh) tab back to ITS OWN saved URL, pairing those URLs with the
// available /uhoh tabs. (The old code reused a single URL — the first product's
// — for every tab, collapsing every watched tab onto that one product.)
async function handleBlocked(uhoh, watched) {
  const c = getConfig();
  const products = getProducts();

  let fb = await get(KEY.FLAGGED_BACKOFF, 0);
  fb = fb ? Math.min(fb * 2, c.flaggedMaxBackoffMin) : c.flaggedBackoffMin;
  const since = (await get(KEY.FLAGGED_SINCE, null)) || Date.now();
  await set({ [KEY.FLAGGED_BACKOFF]: fb, [KEY.FLAGGED_SINCE]: since });
  ensureAlarm(fb);

  // Products that still have a healthy product tab don't need recovery.
  const liveIds = new Set(watched.map((t) => (t.url.match(REGEX.PRODUCT_ID) || [])[1]));

  // One saved URL per watched product missing a live tab — the pages to recover.
  const recoverUrls = [];
  for (const id of Object.keys(products)) {
    if (liveIds.has(id) || await get(KEY.productPaused(id), false)) {
      continue;
    }
    const u = await get(KEY.url(id), null);
    if (u) {
      recoverUrls.push(u);
    }
  }

  // Point each blocked tab at its own product; close any surplus /uhoh tabs.
  let recovered = 0;
  for (let i = 0; i < uhoh.length; i++) {
    try {
      if (i < recoverUrls.length) {
        await chrome.tabs.update(uhoh[i].id, { url: recoverUrls[i] });
        recovered++;
      } else {
        await chrome.tabs.remove(uhoh[i].id);
      }
    } catch (e) { /* tab already gone */ }
  }

  const downMin = ((Date.now() - since) / MS.MIN).toFixed(0);
  warn(`FLAGGED (/uhoh) — blocked ~${downMin}m so far. Backing off to ${fb}m and ${recovered ? `retrying ${recovered} page(s) now` : 'waiting (no saved product URL to retry)'}.`);
}

// Reload at most one tab per product id — duplicate tabs (e.g. leftovers from an
// earlier reopen) would otherwise each scrape and triple the logs. Reloading
// also revives a tab Chrome discarded/froze during idle or sleep.
function reloadWatched(watched) {
  const seen = new Set();
  for (const t of watched) {
    const pid = (t.url.match(REGEX.PRODUCT_ID) || [])[1];
    if (seen.has(pid)) {
      continue; // a duplicate tab for a product we already reloaded this tick
    }
    seen.add(pid);
    chrome.tabs.reload(t.id);
  }
}

// No open tab for a watched product — reopen any we've seen before, pinned + in
// the background, so the watch self-heals.
async function reopenClosedIfNeeded() {
  const c = getConfig();
  if (!c.reopenIfClosed) {
    warn('no watched product tab open to poll.');
    return;
  }

  const products = getProducts();
  for (const id of Object.keys(products)) {
    if (await get(KEY.productPaused(id), false)) {
      continue; // paused product — leave it closed
    }
    const url = await get(KEY.url(id), null);
    if (url) {
      chrome.tabs.create({
        url,
        active: false,
        pinned: true,
      });
    }
  }
}
