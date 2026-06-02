// notify.js — fan one alert out to the desktop and/or ntfy.sh, and echo it to
// the console. Honors useDesktop / useNtfy / ntfyTopic from the live config.

import { getConfig, get, set, remove } from './storage.js';
import { KEY, URLS, NTFY_TAGS, NOTIFICATION_PRIORITY } from './constants.js';
import { log, warn } from './log.js';

export function notify(title, message, url) {
  const cfg = getConfig();

  if (cfg.useDesktop) {
    // Give the notification an explicit id and remember its click target, so
    // onNotificationClicked() can open the product page. The MV3 worker may be
    // torn down between create and click, so the url lives in storage, not memory.
    const nid = `notif_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    chrome.notifications.create(nid, {
      type: 'basic',
      iconUrl: 'icon.png',
      title,
      message,
      priority: NOTIFICATION_PRIORITY,
    });
    if (url) {
      set({ [KEY.notifClick(nid)]: url });
    }
  }

  if (cfg.useNtfy && cfg.ntfyTopic) {
    // Use ntfy's JSON publishing (POST the topic in the body to the root URL)
    // rather than per-topic Title/Click headers: HTTP header values must be
    // ASCII, but our titles contain non-ASCII (e.g. "≤"), which makes the
    // header-based request reject. JSON carries UTF-8 cleanly. Surface failures
    // instead of swallowing them, so a broken push doesn't fail silently.
    fetch(URLS.NTFY_BASE, {
      method: 'POST',
      body: JSON.stringify({
        topic: cfg.ntfyTopic,
        title,
        message,
        tags: [NTFY_TAGS],
        click: url || undefined,
      }),
    }).catch((e) => warn('ntfy push failed:', e));
  }

  log(title, '—', message.replace(/\n/g, ' | '));
}

// Clicking a desktop notification opens its product page (in a focused tab) and
// dismisses the notification. No stored url (e.g. an older notification) just
// clears it. Wired to chrome.notifications.onClicked in background.js.
export async function onNotificationClicked(nid) {
  const url = await get(KEY.notifClick(nid), null);
  if (url) {
    chrome.tabs.create({ url, active: true });
    await remove(KEY.notifClick(nid));
  }
  chrome.notifications.clear(nid);
}
