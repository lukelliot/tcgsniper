# TCGplayer Price Watch

A Chrome extension (Manifest V3) that watches the cheapest buyable listing and the Market Price trend on chosen [TCGplayer](https://www.tcgplayer.com) products, then notifies you on threshold, steal, and trend events — via desktop notifications and/or [ntfy.sh](https://ntfy.sh) push.

It's built to run unattended for days: a `chrome.alarms` timer drives the cadence independent of page state, so the watch recovers on its own from failed loads, discarded tabs, sleep, and anti-bot blocks.

## How it works

```
chrome.alarms ──tick──▶ background.js (service worker)
                          │  reloads watched product tab(s)
                          ▼
                        content.js (per product page)
                          │  scrapes listings + price-points panel
                          ▼
                        background.js → evaluate() → notify()
                                                       ├─ desktop notification
                                                       └─ ntfy.sh push
```

- **`background.js`** — the durable scheduler and brain. On each alarm it reloads the watched tab(s); when a scrape comes back it evaluates thresholds, steals, and trend, fires notifications, and stores price history. All config and runtime state live in `chrome.storage.local`.
- **`content.js`** — injected into each `tcgplayer.com/product/*` page. Its only job is to wait for the listings and price-points panel to render, scrape them, and message the result back. It schedules nothing.
- **`manifest.json`** — MV3 manifest; permissions: `alarms`, `notifications`, `storage`, `tabs`, `power`.

## Alerts

- **Threshold ladder** — a list of descending "low" price markers plus one "high" (spike) marker. You get a `DROP` alert as the cheapest listing steps down through each new, deeper marker, and a `SPIKE` alert when it crosses the high. While the price sits at a marker, it re-pings on a backoff that doubles each time (clamped between `reAlertMinHours` and `reAlertMaxHours`).
- **Steal** — fires when the cheapest listing is `stealFactor` (default 65%) or less of the listing median, given at least `stealMinListings` listings.
- **Trend** — anchored on the smoothed Market Price: a `still falling` ping each time it drops `trendDropPct` from the anchor, and a `decline stalled` ping once it holds flat for `stallHours` after a decline (a possible buy window).
- **Daily snapshot** — one digest notification per day at/after `dailySnapshotHour`.
- **Floor** — listings below `floorPrice` are treated as junk and ignored; if *all* listings fall below it you get a "look manually" alert.

## Resilience

- **Durable scheduling** — the alarm fires on its period regardless of page/network state; a failed load just gets retried next tick.
- **Adaptive backoff** — repeated empty renders (a likely challenge) slow the poll up to `maxPeriodMin`; a run of clean cycles relaxes it back toward the base.
- **Block recovery** — if TCGplayer redirects to `/uhoh`, the poll backs off (10 → 20 → … → 120 min) and recovers by reusing the blocked tab rather than hammering or spawning new ones.
- **Self-healing tabs** — if a watched tab is closed or discarded, it's reopened (pinned, background) from the last known URL.
- **Carry-forward** — late-rendering Market Price / quantity fields fall back to the last good reading per field so alerts don't blank out or show 0.
- **Keep-awake** — requests the OS not to idle-sleep so overnight watches keep running.

## Install

1. Clone this repo.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.

## Configure

Default products and settings live at the top of [`extension/background.js`](extension/background.js) (`DEFAULT_PRODUCTS` and `DEFAULT_CONFIG`). Edit them there, or change them at runtime without reloading from the **service worker console** (`chrome://extensions` → this extension → "service worker"):

```js
setProduct('693209', { lowPrices: [390, 360, 340], highPrice: 410 }) // change a product's markers
setProduct('693209', null)                                           // stop watching that product
setConfig({ basePeriodMin: 5, dailySnapshotHour: 8 })                // change global settings
showConfig()                                                         // print effective config
resetConfig()                                                        // drop overrides, back to file defaults
pauseWatch() / resumeWatch() / statusWatch()                         // pause / resume / inspect
```

Runtime overrides are stored in `chrome.storage.local` and win over file defaults until `resetConfig()`. To watch a product, find its numeric id in the TCGplayer product URL (`tcgplayer.com/product/<id>/...`) and add it via `setProduct` or to `DEFAULT_PRODUCTS`.

### Push notifications (optional)

Set `useNtfy: true` and a `ntfyTopic` in the config, then subscribe to that topic in the [ntfy](https://ntfy.sh) app to get alerts on your phone. Desktop notifications are controlled by `useDesktop`.

## Notes

This relies on TCGplayer's current DOM structure (CSS classes scraped in `content.js`). If their markup changes, the selectors in `readListings()` / `scrapeMarket()` will need updating. For personal use; respect TCGplayer's terms of service and don't poll aggressively.
