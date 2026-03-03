import { uid } from "./utils.js";

export const DB_KEY = "market_mvp_v1_modular";

export function seedDB() {
  return {
    version: 2,
    items: [
      { id: uid(), name: "Huevos", category: "Frescos", tag: "base", active: true, createdAt: Date.now(), basePrice: 16000, lastPrice: 16000, lastStore: "", lastAt: null },
      { id: uid(), name: "Arroz", category: "Alacena", tag: "base", active: true, createdAt: Date.now(), basePrice: 6000, lastPrice: 6000, lastStore: "", lastAt: null },
      { id: uid(), name: "Leche", category: "Frescos", tag: "base", active: true, createdAt: Date.now(), basePrice: 4500, lastPrice: 4500, lastStore: "", lastAt: null },
      { id: uid(), name: "Chocolate", category: "Galguerías", tag: "antojo", active: true, createdAt: Date.now(), basePrice: 8000, lastPrice: 8000, lastStore: "", lastAt: null },
      { id: uid(), name: "Salsa de tomate", category: "Salsas", tag: "antojo", active: true, createdAt: Date.now(), basePrice: 7000, lastPrice: 7000, lastStore: "", lastAt: null },
    ],
    cart: {}, // itemId -> qty
    cartPrices: {}, // itemId -> unitPrice (solo para presupuesto de la compra actual)
    purchases: [], // {id,date,type,store,total,estimatedTotal, items:[{itemId,qty,unitPrice,lineTotal}]}
    settings: { currency: "COP" }
  };
}

// Dejar esto listo para cuando quieran migraciones (v2, v3…)
export function migrate(db) {
  if (!db || typeof db !== "object") return seedDB();
  if (!db.version) db.version = 1;

  // v1 -> v2: precios por ítem + precios temporales del carrito + detalle de compra
  if (db.version === 1) {
    db.cartPrices = db.cartPrices && typeof db.cartPrices === 'object' ? db.cartPrices : {};

    // Items: agrega basePrice/lastPrice/lastStore/lastAt
    if (Array.isArray(db.items)) {
      for (const it of db.items) {
        if (!('basePrice' in it)) it.basePrice = null;
        if (!('lastPrice' in it)) it.lastPrice = null;
        if (!('lastStore' in it)) it.lastStore = '';
        if (!('lastAt' in it)) it.lastAt = null;
      }
    }

    // Purchases: agrega unitPrice/lineTotal y estimatedTotal
    if (Array.isArray(db.purchases)) {
      for (const p of db.purchases) {
        if (!('estimatedTotal' in p)) p.estimatedTotal = null;
        if (!Array.isArray(p.items)) p.items = [];
        for (const li of p.items) {
          if (!('unitPrice' in li)) li.unitPrice = null;
          if (!('lineTotal' in li)) li.lineTotal = null;
        }
      }
    }

    db.version = 2;
  }
  return db;
}