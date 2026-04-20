import { uid } from "./utils.js";

export const DB_KEY = "market_mvp_v1_modular";

/** Shape completo de un item nuevo */
export function makeItem({ name, category = "Otros", tag = "base", basePrice = null } = {}) {
  return {
    id: uid(),
    name,
    category,
    tag,
    active: true,
    createdAt: Date.now(),
    basePrice: basePrice ?? null,
    lastPrice: basePrice ?? null,
    lastStore: "",
    lastAt: null,
  };
}

export function seedDB() {
  return {
    version: 3,
    items: [
      makeItem({ name: "Huevos",         category: "Frescos",    tag: "base",   basePrice: 16000 }),
      makeItem({ name: "Arroz",          category: "Alacena",    tag: "base",   basePrice: 6000  }),
      makeItem({ name: "Leche",          category: "Frescos",    tag: "base",   basePrice: 4500  }),
      makeItem({ name: "Chocolate",      category: "Galguerías", tag: "antojo", basePrice: 8000  }),
      makeItem({ name: "Salsa de tomate",category: "Salsas",     tag: "antojo", basePrice: 7000  }),
    ],
    cart: {},        // itemId -> qty
    cartPrices: {},  // itemId -> unitPrice (solo para presupuesto de la compra actual)
    purchases: [],   // {id,date,type,store,total,estimatedTotal, items:[{itemId,qty,unitPrice,lineTotal}]}
    settings: { currency: "COP" }
  };
}

export function migrate(db) {
  if (!db || typeof db !== "object") return seedDB();
  if (!db.version) db.version = 1;

  // v1 -> v2: precios por ítem + precios temporales del carrito + detalle de compra
  if (db.version === 1) {
    db.cartPrices = db.cartPrices && typeof db.cartPrices === "object" ? db.cartPrices : {};

    if (Array.isArray(db.items)) {
      for (const it of db.items) {
        if (!("basePrice" in it)) it.basePrice = null;
        if (!("lastPrice" in it)) it.lastPrice = null;
        if (!("lastStore" in it)) it.lastStore = "";
        if (!("lastAt" in it)) it.lastAt = null;
      }
    }

    if (Array.isArray(db.purchases)) {
      for (const p of db.purchases) {
        if (!("estimatedTotal" in p)) p.estimatedTotal = null;
        if (!Array.isArray(p.items)) p.items = [];
        for (const li of p.items) {
          if (!("unitPrice" in li)) li.unitPrice = null;
          if (!("lineTotal" in li)) li.lineTotal = null;
        }
      }
    }
    db.version = 2;
  }

  // v2 -> v3: shape completo garantizado en todos los items
  if (db.version === 2) {
    if (!db.cartPrices || typeof db.cartPrices !== "object") db.cartPrices = {};
    if (!db.settings || typeof db.settings !== "object") db.settings = { currency: "COP" };

    if (Array.isArray(db.items)) {
      for (const it of db.items) {
        if (!("id" in it) || !it.id) it.id = uid();
        if (!("active" in it)) it.active = true;
        if (!("tag" in it) || !it.tag) it.tag = "base";
        if (!("category" in it) || !it.category) it.category = "Otros";
        if (!("createdAt" in it) || it.createdAt == null) it.createdAt = Date.now();
        if (!("basePrice" in it)) it.basePrice = null;
        if (!("lastPrice" in it)) it.lastPrice = null;
        if (!("lastStore" in it) || it.lastStore === undefined) it.lastStore = "";
        if (!("lastAt" in it)) it.lastAt = null;
      }
    }

    if (Array.isArray(db.purchases)) {
      for (const p of db.purchases) {
        if (!("estimatedTotal" in p)) p.estimatedTotal = null;
        if (!Array.isArray(p.items)) p.items = [];
        for (const li of p.items) {
          if (!("unitPrice" in li)) li.unitPrice = null;
          if (!("lineTotal" in li)) li.lineTotal = null;
          if (!("qty" in li)) li.qty = 1;
        }
      }
    }

    db.version = 3;
  }

  return db;
}
