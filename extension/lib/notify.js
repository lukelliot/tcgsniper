// notify.js — fan one alert out to the desktop and/or ntfy.sh, and echo it to
// the console. Honors useDesktop / useNtfy / ntfyTopic from the live config.

import { getConfig } from './storage.js';
import { URLS, NTFY_TAGS, NOTIFICATION_PRIORITY } from './constants.js';
import { log } from './log.js';

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
    fetch(URLS.NTFY_BASE + cfg.ntfyTopic, {
      method: 'POST',
      headers: {
        Title: title,
        Click: url || '',
        Tags: NTFY_TAGS,
      },
      body: message,
    }).catch(() => {});
  }

  log(title, '—', message.replace(/\n/g, ' | '));
}
