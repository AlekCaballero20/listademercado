import { daysBetween } from "./utils.js";

export function getItemById(db, id) {
  return db.items.find(x => x.id === id);
}

export function purchasesForItem(db, itemId) {
  const dates = [];
  for (const p of db.purchases) {
    if (p.items.some(it => it.itemId === itemId)) dates.push(p.date);
  }
  return dates.sort((a, b) => a - b);
}

export function avgFrequencyDays(db, itemId) {
  const dates = purchasesForItem(db, itemId);
  if (dates.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < dates.length; i++) {
    sum += daysBetween(dates[i - 1], dates[i]);
  }
  return Math.round(sum / (dates.length - 1));
}

export function lastBoughtDaysAgo(db, itemId) {
  const dates = purchasesForItem(db, itemId);
  if (!dates.length) return null;
  return daysBetween(dates[dates.length - 1], Date.now());
}

export function monthlyEstimateByCategory(db) {
  const catSpend = {};
  const now = Date.now();
  const windowDays = 60;
  const windowStart = now - windowDays * 24 * 60 * 60 * 1000;
  
  const windowPurchases = db.purchases.filter(p => p.date >= windowStart);
  for (const p of windowPurchases) {
    for (const li of (p.items || [])) {
      const item = getItemById(db, li.itemId);
      const cat = item?.category || "Otros";
      const line = Number(li.lineTotal);
      if (Number.isFinite(line) && line > 0) {
        catSpend[cat] = (catSpend[cat] || 0) + line;
      } else {
        // fallback antiguo: reparte el total por cantidad de líneas
        const count = (p.items && p.items.length) ? p.items.length : 1;
        const share = Number(p.total || p.estimatedTotal || 0) / count;
        catSpend[cat] = (catSpend[cat] || 0) + (Number.isFinite(share) ? share : 0);
      }
    }
  }
  
  const est = {};
  for (const [cat, v] of Object.entries(catSpend)) {
    est[cat] = Math.round((v / windowDays) * 30);
  }
  return est;
}

/* =========================
   Precios (v2)
========================= */

export function getSuggestedUnitPrice(db, itemId) {
  const it = getItemById(db, itemId);
  if (!it) return null;
  const last = Number(it.lastPrice);
  if (Number.isFinite(last) && last > 0) return last;
  const base = Number(it.basePrice);
  if (Number.isFinite(base) && base > 0) return base;
  return null;
}

export function priceHistoryForItem(db, itemId, { days = 365 } = {}) {
  const now = Date.now();
  const start = now - days * 24 * 60 * 60 * 1000;
  const rows = [];
  for (const p of (db.purchases || [])) {
    if (!p || p.date < start) continue;
    const store = (p.store || '').trim();
    for (const li of (p.items || [])) {
      if (li.itemId !== itemId) continue;
      const unit = Number(li.unitPrice);
      if (!Number.isFinite(unit) || unit <= 0) continue;
      rows.push({ date: p.date, store, unitPrice: unit, qty: Number(li.qty || 1) || 1 });
    }
  }
  rows.sort((a, b) => a.date - b.date);
  return rows;
}

export function lastTwoPrices(db, itemId) {
  const hist = priceHistoryForItem(db, itemId, { days: 3650 });
  if (!hist.length) return { last: null, prev: null };
  const last = hist[hist.length - 1];
  const prev = hist.length >= 2 ? hist[hist.length - 2] : null;
  return { last, prev };
}

export function priceChangePct(db, itemId, mode = 'base') {
  const it = getItemById(db, itemId);
  if (!it) return null;
  const last = Number(it.lastPrice);
  if (!Number.isFinite(last) || last <= 0) return null;

  let ref = null;
  if (mode === 'base') {
    const base = Number(it.basePrice);
    if (Number.isFinite(base) && base > 0) ref = base;
  } else {
    const { prev } = lastTwoPrices(db, itemId);
    const p = Number(prev?.unitPrice);
    if (Number.isFinite(p) && p > 0) ref = p;
  }
  if (!ref) return null;
  return ((last - ref) / ref) * 100;
}

export function cheapestStoreForItem(db, itemId, { days = 180 } = {}) {
  const hist = priceHistoryForItem(db, itemId, { days });
  if (!hist.length) return null;
  const byStore = new Map();
  for (const r of hist) {
    const key = r.store || 'Sin tienda';
    const cur = byStore.get(key);
    if (!cur || r.unitPrice < cur.unitPrice) byStore.set(key, r);
  }
  let best = null;
  for (const r of byStore.values()) {
    if (!best || r.unitPrice < best.unitPrice) best = r;
  }
  return best;
}