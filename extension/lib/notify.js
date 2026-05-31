// notify.js — fan one alert out to the desktop and/or ntfy.sh, and echo it to
// the console. Honors useDesktop / useNtfy / ntfyTopic from the live config.

import { getConfig } from './storage.js';
import { URLS, NTFY_TAGS, NOTIFICATION_PRIORITY } from './constants.js';
import { log, warn } from './log.js';

export function notify(title, message, url) {
  const cfg = getConfig();

  if (cfg.useDesktop) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title,
      message,
      priority: NOTIFICATION_PRIORITY,
    });
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
