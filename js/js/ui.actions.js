import { normalizeName, uid } from "./utils.js";
import { getDB, patch, resetDB } from "./state.js";
import { renderAll } from "./ui.render.js";

export function bindActions() {
  // Add item
  document.querySelector("#btnAdd").addEventListener("click", addItem);
  document.querySelector("#newName").addEventListener("keydown", (e) => { if (e.key === "Enter") addItem(); });
  
  // Filters
  document.querySelector("#q").addEventListener("input", () => renderAll(getDB()));
  document.querySelector("#filterTag").addEventListener("change", () => renderAll(getDB()));
  document.querySelector("#filterCategory").addEventListener("change", () => renderAll(getDB()));
  
  // Cart / item buttons via event delegation
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    
    if (act === "cartAdd") cartAdd(id, 1);
    if (act === "cartInc") cartAdd(id, 1);
    if (act === "cartDec") cartAdd(id, -1);
    if (act === "cartRemove") cartRemove(id);
    if (act === "buyNow") buyNow(id);
    if (act === "setBasePrice") setBasePrice(id);
    if (act === "deactivate") deactivate(id);
  });

  // Precio unitario por ítem (carrito)
  document.addEventListener('change', (e) => {
    const inp = e.target.closest('input[data-act="priceSet"]');
    if (!inp) return;
    const id = inp.dataset.id;
    const v = inp.value;
    setCartUnitPrice(id, v);
  });
  
  // Clear cart
  document.querySelector("#btnClearCart").addEventListener("click", clearCart);
  
  // Checkout
  document.querySelector("#btnCheckout").addEventListener("click", checkout);
  
  // Reset
  document.querySelector("#btnReset").addEventListener("click", () => {
    const ok = confirm("¿Seguro? Esto borra TODO.");
    if (!ok) return;
    resetDB();
    renderAll(getDB());
  });
}

function addItem() {
  const nameEl = document.querySelector("#newName");
  const name = nameEl.value.trim();
  const category = document.querySelector("#newCategory").value;
  const tag = document.querySelector("#newTag").value;
  
  if (!name) return;
  
  patch((db) => {
    const exists = db.items.some(i => normalizeName(i.name) === normalizeName(name) && i.active);
    if (exists) {
      alert("Ese item ya existe.");
      return db;
    }
    db.items.push({ id: uid(), name, category, tag, active: true, createdAt: Date.now() });
    return db;
  });
  
  nameEl.value = "";
  renderAll(getDB());
}

function cartAdd(itemId, delta) {
  patch((db) => {
    const cur = Number(db.cart[itemId] || 0);
    const next = cur + delta;
    if (next <= 0) delete db.cart[itemId];
    else db.cart[itemId] = next;
    return db;
  });
  renderAll(getDB());
}

function cartRemove(itemId) {
  patch((db) => {
    delete db.cart[itemId];
    return db;
  });
  renderAll(getDB());
}

function clearCart() {
  patch((db) => { db.cart = {}; return db; });
  renderAll(getDB());
}

function buyNow(itemId) {
  const dbNow = getDB();
  const item = dbNow.items.find(i => i.id === itemId);
  if (!item) return;

  const unit = prompt(`Precio unitario (COP) para "${item.name}" (si no saben, dejen 0):`, String(item.lastPrice || item.basePrice || 0));
  if (unit === null) return;

  const u = Math.max(0, Math.floor(Number(unit) || 0));
  const store = prompt(`¿Dónde lo compraste? (D1, Ara, Éxito...)`, "");
  if (store === null) return;

  patch((db) => {
    // Actualiza “último precio” (y base si está vacío)
    const it = db.items.find(x => x.id === itemId);
    if (it) {
      if ((it.basePrice === null || it.basePrice === undefined || it.basePrice === 0) && u > 0) it.basePrice = u;
      if (u > 0) it.lastPrice = u;
      it.lastStore = store.trim();
      it.lastAt = Date.now();
    }

    db.purchases.push({
      id: uid(),
      date: Date.now(),
      type: (item.tag === "antojo" ? "Antojos" : "Reposición"),
      store: store.trim(),
      estimatedTotal: u,
      total: u, // mantenemos compatibilidad: total = pagado
      items: [{ itemId: item.id, qty: 1, unitPrice: u, lineTotal: u }]
    });
    return db;
  });
  
  renderAll(getDB());
}

function setBasePrice(itemId) {
  const dbNow = getDB();
  const item = dbNow.items.find(i => i.id === itemId);
  if (!item) return;
  const cur = Number(item.basePrice) || 0;
  const raw = prompt(`Precio base (COP) para "${item.name}"`, String(cur));
  if (raw === null) return;
  const v = Math.max(0, Math.floor(Number(raw) || 0));
  patch((db) => {
    const it = db.items.find(x => x.id === itemId);
    if (!it) return db;
    it.basePrice = v;
    // si no hay lastPrice aún, le ayudamos
    if (!it.lastPrice && v > 0) it.lastPrice = v;
    return db;
  });
  renderAll(getDB());
}

function setCartUnitPrice(itemId, value) {
  patch((db) => {
    if (!db.cartPrices || typeof db.cartPrices !== 'object') db.cartPrices = {};
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 0) return db;
    if (value === '' || n === 0) {
      // 0 lo tratamos como “sin precio” para no contaminar
      delete db.cartPrices[itemId];
    } else {
      db.cartPrices[itemId] = n;
    }
    return db;
  });
  renderAll(getDB());
}

function deactivate(itemId) {
  patch((db) => {
    const item = db.items.find(i => i.id === itemId);
    if (!item) return db;
    item.active = false;
    delete db.cart[itemId];
    return db;
  });
  renderAll(getDB());
}

function checkout() {
  const dbNow = getDB();
  const cartEntries = Object.entries(dbNow.cart);
  if (!cartEntries.length) {
    alert("No hay nada en el carrito.");
    return;
  }

  // Estimado desde precios unitarios
  let estimatedTotal = 0;
  for (const [itemId, qtyRaw] of cartEntries) {
    const qty = Number(qtyRaw) || 1;
    const it = dbNow.items.find(x => x.id === itemId);
    const suggested = it ? (Number(dbNow.cartPrices?.[itemId]) || Number(it.lastPrice) || Number(it.basePrice) || 0) : 0;
    const unit = Math.max(0, Math.floor(suggested || 0));
    estimatedTotal += unit * qty;
  }

  // Total pagado: opcional
  const totalPaidRaw = document.querySelector("#totalPaid").value;
  const totalPaid = totalPaidRaw === '' ? null : Math.floor(Number(totalPaidRaw));
  if (totalPaid !== null && (!Number.isFinite(totalPaid) || totalPaid < 0)) {
    alert("Pon un total pagado válido (>= 0) o déjalo vacío.");
    return;
  }
  
  const type = document.querySelector("#buyType").value;
  const store = document.querySelector("#store").value.trim();
  
  patch((db) => {
    const now = Date.now();
    db.purchases.push({
      id: uid(),
      date: now,
      type,
      store,
      estimatedTotal,
      total: totalPaid ?? estimatedTotal,
      items: cartEntries.map(([itemId, qtyRaw]) => {
        const qty = Number(qtyRaw) || 1;
        const it = db.items.find(x => x.id === itemId);
        const unit = Math.max(0, Math.floor(Number(db.cartPrices?.[itemId]) || Number(it?.lastPrice) || Number(it?.basePrice) || 0));
        const lineTotal = unit * qty;

        // Actualiza “último precio” (y base si está vacío)
        if (it && unit > 0) {
          if ((it.basePrice === null || it.basePrice === undefined || it.basePrice === 0) && unit > 0) it.basePrice = unit;
          it.lastPrice = unit;
          it.lastStore = store;
          it.lastAt = now;
        }

        return { itemId, qty, unitPrice: unit || null, lineTotal: (lineTotal > 0 ? lineTotal : null) };
      })
    });
    db.cart = {};
    db.cartPrices = {};
    return db;
  });

  document.querySelector("#totalPaid").value = "";
  document.querySelector("#store").value = "";
  renderAll(getDB());
}