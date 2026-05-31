// storage.js — the chrome.storage.local layer plus the live CONFIG/PRODUCTS
// holder. Other modules read effective settings via getConfig()/getProducts()
// rather than reaching for module globals, and call applyOverrides() to
// rehydrate them from stored overrides.

import { DEFAULT_CONFIG, DEFAULT_PRODUCTS } from './config.js';
import { KEY } from './constants.js';

// Async wrappers around chrome.storage.local.
export const get = (k, d) => new Promise((r) => chrome.storage.local.get([k], (o) => r(k in o ? o[k] : d)));
export const set = (o) => new Promise((r) => chrome.storage.local.set(o, r));

// Effective settings — defaults overlaid with stored overrides (rehydrated each tick).
let CONFIG = { ...DEFAULT_CONFIG };
let PRODUCTS = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));

export const getConfig = () => CONFIG;
export const getProducts = () => PRODUCTS;

// Merge stored overrides on top of the file defaults into the live CONFIG/PRODUCTS.
// A product override of null is a tombstone: it removes that product entirely.
export async function applyOverrides() {
  const co = await get(KEY.CONFIG_OVERRIDE, {});
  CONFIG = { ...DEFAULT_CONFIG, ...co };

  const po = await get(KEY.PRODUCTS_OVERRIDE, {});
  PRODUCTS = {};
  for (const id of Object.keys(DEFAULT_PRODUCTS)) {
    if (po[id] === null) {
      continue; // removed
    }
    PRODUCTS[id] = { ...DEFAULT_PRODUCTS[id], ...(po[id] || {}) };
  }
  for (const id of Object.keys(po)) {
    if (po[id] && !PRODUCTS[id]) {
      PRODUCTS[id] = { ...po[id] }; // a product added entirely via override
    }
  }
}
