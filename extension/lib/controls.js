// controls.js — functions callable from the SERVICE WORKER console
// (chrome://extensions -> this extension -> "service worker"). Config edits
// persist in storage (no reload):
//   setProduct('693209', { lowPrices: [390,360,340], highPrice: 410 })   change a product's markers
//   setProduct('693209', null)                                stop watching that product (and its timer)
//   setConfig({ basePeriodMin: 5, dailySnapshotHour: 8 })     change global settings
//   showConfig()                                              print effective config
//   resetConfig()                                             drop overrides, back to file defaults
//   pauseWatch() / resumeWatch() / statusWatch()              pause / resume / inspect

import { get, set, applyOverrides, getConfig, getProducts } from './storage.js';
import { ensureAlarm } from './scheduler.js';
import { ALARM, KEY } from './constants.js';
import { PREFIX } from './log.js';

export function registerControls() {
  globalThis.setConfig = async (patch) => {
    const ov = await get(KEY.CONFIG_OVERRIDE, {});
    await set({ [KEY.CONFIG_OVERRIDE]: { ...ov, ...patch } });
    await applyOverrides();
    ensureAlarm(getConfig().basePeriodMin);
    console.log(PREFIX, 'config override saved:', patch, '\nEffective CONFIG:', getConfig());
  };

  // patch = object to merge, or null to stop watching this product (clears its
  // timer if it was the last one; its open tab simply stops refreshing).
  globalThis.setProduct = async (id, patch) => {
    const ov = await get(KEY.PRODUCTS_OVERRIDE, {});

    if (patch === null) {
      ov[id] = null;
      await set({ [KEY.PRODUCTS_OVERRIDE]: ov });
      await applyOverrides();
      if (Object.keys(getProducts()).length === 0) {
        await chrome.alarms.clear(ALARM);
        console.log(PREFIX, `product ${id} removed — no products left, poll timer stopped. Any open tab will no longer refresh.`);
      } else {
        console.log(PREFIX, `product ${id} removed — its tab will no longer refresh. Still watching:`, Object.keys(getProducts()));
      }
      return;
    }

    ov[id] = { ...(ov[id] || {}), ...patch };
    await set({ [KEY.PRODUCTS_OVERRIDE]: ov });
    await applyOverrides();
    ensureAlarm(getConfig().basePeriodMin); // make sure the timer is running if it was stopped
    console.log(PREFIX, `product ${id} override saved:`, patch, '\nEffective:', getProducts()[id]);
  };

  globalThis.showConfig = async () => {
    await applyOverrides();
    console.log(PREFIX, 'effective CONFIG:', getConfig(), '\neffective PRODUCTS:', getProducts());
  };

  globalThis.resetConfig = async () => {
    await set({ [KEY.CONFIG_OVERRIDE]: {}, [KEY.PRODUCTS_OVERRIDE]: {} });
    await applyOverrides();
    ensureAlarm(getConfig().basePeriodMin);
    console.log(PREFIX, 'overrides cleared — back to file defaults.', getConfig(), getProducts());
  };

  globalThis.pauseWatch = async () => {
    await set({ [KEY.PAUSED]: true });
    console.log(PREFIX, 'PAUSED — no reloads or alerts until resumeWatch().');
  };

  globalThis.resumeWatch = async () => {
    await set({ [KEY.PAUSED]: false });
    await applyOverrides();
    ensureAlarm(getConfig().basePeriodMin);
    console.log(PREFIX, 'resumed.');
  };

  globalThis.statusWatch = async () => {
    await applyOverrides();
    const all = await new Promise((r) => chrome.storage.local.get(null, r));
    const alarm = await new Promise((r) => chrome.alarms.get(ALARM, r));
    console.log(PREFIX, 'paused:', !!all.paused, '| alarm:', alarm, '| CONFIG:', getConfig(), '| PRODUCTS:', getProducts(), '| storage:', all);
  };
}
