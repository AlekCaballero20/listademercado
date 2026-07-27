import { normalizeName, uid } from "./utils.js";
import { getDB, patch, resetDB, setDB } from "./state.js";
import { migrate } from "./models.js";
import { renderAll } from "./ui.render.js";

/* =====================================================
   INIT
===================================================== */
export function bindActions() {
  // Add item
  document.querySelector("#btnAdd").addEventListener("click", addItem);
  document.querySelector("#newName").addEventListener("keydown", (e) => { if (e.key === "Enter") addItem(); });
  document.querySelector("#newBasePrice").addEventListener("keydown", (e) => { if (e.key === "Enter") addItem(); });

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

    if (act === "cartAdd")      cartAdd(id, 1);
    if (act === "cartInc")      cartAdd(id, 1);
    if (act === "cartDec")      cartAdd(id, -1);
    if (act === "cartRemove")   cartRemove(id);
    if (act === "loadList")     loadSavedList(id);
    if (act === "deleteList")   deleteSavedList(id);
    if (act === "buyNow")       buyNow(id);
    if (act === "setBasePrice") setBasePrice(id);
    if (act === "deactivate")   deactivate(id);
    if (act === "editItem")     openEditDialog(id);
  });

  // Precio unitario por ítem (carrito)
  document.addEventListener("change", (e) => {
    const inp = e.target.closest('input[data-act="priceSet"]');
    if (!inp) return;
    setCartUnitPrice(inp.dataset.id, inp.value);
  });

  // Clear cart
  document.querySelector("#btnClearCart").addEventListener("click", clearCart);
  document.querySelector("#btnSaveList").addEventListener("click", saveCartAsList);

  // Checkout
  document.querySelector("#btnCheckout").addEventListener("click", checkout);

  // Reset
  document.querySelector("#btnReset").addEventListener("click", async () => {
    if (!confirm("¿Seguro? Esto borra TODO en Firebase.")) return;
    await resetDB();
    renderAll(getDB());
  });

  // Edit dialog
  document.querySelector("#editSave").addEventListener("click", saveEdit);
  document.querySelector("#editCancel").addEventListener("click", () => {
    document.querySelector("#editDialog").close();
  });

  // Backup
  document.querySelector("#btnExportBackup").addEventListener("click", exportBackup);
  document.querySelector("#btnImportBackup").addEventListener("click", () => {
    document.querySelector("#importFile").click();
  });
  document.querySelector("#importFile").addEventListener("change", handleImportFile);
  document.querySelector("#btnExportCSV").addEventListener("click", exportCSV);
}

/* =====================================================
   HELPERS
===================================================== */

/** Lee #purchaseDate y devuelve timestamp. Fallback = ahora. */
function getPurchaseDate() {
  const val = document.querySelector("#purchaseDate")?.value;
  if (!val) return Date.now();
  // T12:00:00 evita problemas de zona horaria al parsear solo fecha
  const d = new Date(val + "T12:00:00");
  return Number.isFinite(d.getTime()) ? d.getTime() : Date.now();
}

/* =====================================================
   ADD ITEM
===================================================== */
function addItem() {
  const nameEl = document.querySelector("#newName");
  const name = nameEl.value.trim();
  const category = document.querySelector("#newCategory").value;
  const tag = document.querySelector("#newTag").value;
  const priceEl = document.querySelector("#newBasePrice");
  const basePrice = Math.max(0, Math.floor(Number(priceEl.value) || 0)) || null;

  if (!name) return;

  const norm = normalizeName(name);

  patch((db) => {
    // ¿Ya existe activo con el mismo nombre normalizado?
    const activeMatch = db.items.find(i => i.active && normalizeName(i.name) === norm);
    if (activeMatch) {
      alert(`"${activeMatch.name}" ya está en la lista.`);
      return db;
    }

    // ¿Existe inactivo? → reactivar en vez de duplicar
    const inactiveMatch = db.items.find(i => !i.active && normalizeName(i.name) === norm);
    if (inactiveMatch) {
      inactiveMatch.active = true;
      // Actualizar categoría/tag solo si el item no tenía valores útiles
      if (!inactiveMatch.category || inactiveMatch.category === "Otros") inactiveMatch.category = category;
      if (!inactiveMatch.tag) inactiveMatch.tag = tag;
      if (basePrice) {
        inactiveMatch.basePrice = basePrice;
        inactiveMatch.lastPrice = basePrice;
      }
      return db;
    }

    // Item nuevo con shape completo
    db.items.push({
      id: uid(),
      name,
      category,
      tag,
      active: true,
      createdAt: Date.now(),
      basePrice,
      lastPrice: basePrice,
      lastStore: "",
      lastAt: null,
    });
    return db;
  });

  nameEl.value = "";
  priceEl.value = "";
  renderAll(getDB());
}

/* =====================================================
   CART
===================================================== */
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
    delete db.cartPrices[itemId]; // limpiar precio huérfano
    return db;
  });
  renderAll(getDB());
}

function clearCart() {
  patch((db) => {
    db.cart = {};
    db.cartPrices = {}; // limpiar todos los precios huérfanos
    return db;
  });
  renderAll(getDB());
}

function saveCartAsList() {
  const dbNow = getDB();
  const cartEntries = Object.entries(dbNow.cart);
  if (!cartEntries.length) {
    alert("Agrega algo al carrito antes de guardar la lista.");
    return;
  }

  const nameEl = document.querySelector("#listName");
  const name = nameEl.value.trim() || "Lista pendiente";

  patch((db) => {
    db.savedLists.push({
      id: uid(), name, createdAt: Date.now(),
      items: cartEntries.map(([itemId, qtyRaw]) => {
        const item = db.items.find(x => x.id === itemId);
        const unitPrice = Math.max(0, Math.floor(Number(db.cartPrices?.[itemId]) || Number(item?.lastPrice) || Number(item?.basePrice) || 0));
        return { itemId, name: item?.name || "Producto", qty: Number(qtyRaw) || 1, unitPrice: unitPrice || null };
      }),
    });
    db.cart = {};
    db.cartPrices = {};
    return db;
  });
  nameEl.value = "";
  renderAll(getDB());
}

function loadSavedList(listId) {
  patch((db) => {
    const list = db.savedLists.find(x => x.id === listId);
    if (!list) return db;
    for (const line of list.items || []) {
      const item = db.items.find(x => x.id === line.itemId && x.active);
      if (!item) continue;
      db.cart[item.id] = Number(db.cart[item.id] || 0) + (Number(line.qty) || 1);
      if (Number(line.unitPrice) > 0 && !db.cartPrices[item.id]) db.cartPrices[item.id] = Number(line.unitPrice);
    }
    return db;
  });
  renderAll(getDB());
}

function deleteSavedList(listId) {
  const list = getDB().savedLists.find(x => x.id === listId);
  if (!list || !confirm(`¿Eliminar “${list.name}”?`)) return;
  patch((db) => {
    db.savedLists = db.savedLists.filter(x => x.id !== listId);
    return db;
  });
  renderAll(getDB());
}

function setCartUnitPrice(itemId, value) {
  patch((db) => {
    if (!db.cartPrices || typeof db.cartPrices !== "object") db.cartPrices = {};
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n <= 0 || value === "") {
      delete db.cartPrices[itemId];
    } else {
      db.cartPrices[itemId] = n;
    }
    return db;
  });
  renderAll(getDB());
}

/* =====================================================
   DEACTIVATE
===================================================== */
function deactivate(itemId) {
  patch((db) => {
    const item = db.items.find(i => i.id === itemId);
    if (!item) return db;
    item.active = false;
    delete db.cart[itemId];
    delete db.cartPrices[itemId]; // limpiar precio huérfano
    return db;
  });
  renderAll(getDB());
}

/* =====================================================
   BUY NOW (registro rápido, usa fecha de #purchaseDate)
===================================================== */
function buyNow(itemId) {
  const dbNow = getDB();
  const item = dbNow.items.find(i => i.id === itemId);
  if (!item) return;

  const unit = prompt(
    `Precio unitario (COP) para "${item.name}" (0 si no saben):`,
    String(item.lastPrice || item.basePrice || 0)
  );
  if (unit === null) return;

  const u = Math.max(0, Math.floor(Number(unit) || 0));
  const store = prompt(`¿Dónde lo compraste? (D1, Ara, Éxito...)`, item.lastStore || "");
  if (store === null) return;

  const date = getPurchaseDate(); // usa la fecha del campo #purchaseDate

  patch((db) => {
    const it = db.items.find(x => x.id === itemId);
    if (it) {
      if ((!it.basePrice) && u > 0) it.basePrice = u;
      if (u > 0) it.lastPrice = u;
      it.lastStore = store.trim();
      it.lastAt = date;
    }

    db.purchases.push({
      id: uid(),
      date,
      type: (item.tag === "antojo" ? "Antojos" : "Reposición"),
      store: store.trim(),
      estimatedTotal: u,
      total: u,
      items: [{ itemId: item.id, qty: 1, unitPrice: u, lineTotal: u }],
    });
    return db;
  });

  renderAll(getDB());
}

/* =====================================================
   SET BASE PRICE (sigue usando prompt, es una acción puntual)
===================================================== */
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
    if (!it.lastPrice && v > 0) it.lastPrice = v;
    return db;
  });
  renderAll(getDB());
}

/* =====================================================
   CHECKOUT (usa fecha de #purchaseDate)
===================================================== */
function checkout() {
  const dbNow = getDB();
  const cartEntries = Object.entries(dbNow.cart);
  if (!cartEntries.length) {
    alert("No hay nada en el carrito.");
    return;
  }

  let estimatedTotal = 0;
  for (const [itemId, qtyRaw] of cartEntries) {
    const qty = Number(qtyRaw) || 1;
    const it = dbNow.items.find(x => x.id === itemId);
    const unit = Math.max(0, Math.floor(
      Number(dbNow.cartPrices?.[itemId]) || Number(it?.lastPrice) || Number(it?.basePrice) || 0
    ));
    estimatedTotal += unit * qty;
  }

  const totalPaidRaw = document.querySelector("#totalPaid").value;
  const totalPaid = totalPaidRaw === "" ? null : Math.floor(Number(totalPaidRaw));
  if (totalPaid !== null && (!Number.isFinite(totalPaid) || totalPaid < 0)) {
    alert("Pon un total pagado válido (>= 0) o déjalo vacío.");
    return;
  }

  const type  = document.querySelector("#buyType").value;
  const store = document.querySelector("#store").value.trim();
  const date  = getPurchaseDate();

  patch((db) => {
    db.purchases.push({
      id: uid(),
      date,
      type,
      store,
      estimatedTotal,
      total: totalPaid ?? estimatedTotal,
      items: cartEntries.map(([itemId, qtyRaw]) => {
        const qty  = Number(qtyRaw) || 1;
        const it   = db.items.find(x => x.id === itemId);
        const unit = Math.max(0, Math.floor(
          Number(db.cartPrices?.[itemId]) || Number(it?.lastPrice) || Number(it?.basePrice) || 0
        ));
        const lineTotal = unit * qty;

        if (it && unit > 0) {
          if (!it.basePrice) it.basePrice = unit;
          it.lastPrice = unit;
          it.lastStore = store;
          it.lastAt = date;
        }

        return { itemId, qty, unitPrice: unit || null, lineTotal: lineTotal > 0 ? lineTotal : null };
      }),
    });

    db.cart = {};
    db.cartPrices = {};
    return db;
  });

  document.querySelector("#totalPaid").value = "";
  document.querySelector("#store").value = "";
  renderAll(getDB());
}

/* =====================================================
   EDIT ITEM (dialog nativo, sin prompt)
===================================================== */
let _editingItemId = null;

function openEditDialog(itemId) {
  const db = getDB();
  const item = db.items.find(i => i.id === itemId);
  if (!item) return;

  _editingItemId = itemId;

  document.querySelector("#editName").value = item.name;
  document.querySelector("#editCategory").value = item.category || "Otros";
  document.querySelector("#editTag").value = item.tag || "base";
  document.querySelector("#editBasePrice").value = item.basePrice > 0 ? item.basePrice : "";
  document.querySelector("#editLastPrice").value = item.lastPrice > 0 ? item.lastPrice : "";
  document.querySelector("#editLastStore").value = item.lastStore || "";
  document.querySelector("#editError").textContent = "";

  document.querySelector("#editDialog").showModal();
}

function saveEdit() {
  const errEl = document.querySelector("#editError");
  errEl.textContent = "";

  const name = document.querySelector("#editName").value.trim();
  if (!name) {
    errEl.textContent = "El nombre no puede estar vacío.";
    return;
  }

  const norm = normalizeName(name);
  const db = getDB();

  // ¿Choca con otro item activo diferente?
  const conflict = db.items.find(i =>
    i.active &&
    i.id !== _editingItemId &&
    normalizeName(i.name) === norm
  );
  if (conflict) {
    errEl.textContent = `Ya existe "${conflict.name}" en la lista activa.`;
    return;
  }

  const category  = document.querySelector("#editCategory").value;
  const tag       = document.querySelector("#editTag").value;
  const basePrice = Math.max(0, Math.floor(Number(document.querySelector("#editBasePrice").value) || 0)) || null;
  const lastPrice = Math.max(0, Math.floor(Number(document.querySelector("#editLastPrice").value) || 0)) || null;
  const lastStore = document.querySelector("#editLastStore").value.trim();

  patch((db) => {
    const it = db.items.find(i => i.id === _editingItemId);
    if (!it) return db;
    it.name      = name;
    it.category  = category;
    it.tag       = tag;
    it.basePrice = basePrice;
    it.lastPrice = lastPrice ?? it.lastPrice;
    it.lastStore = lastStore;
    return db;
  });

  document.querySelector("#editDialog").close();
  _editingItemId = null;
  renderAll(getDB());
}

/* =====================================================
   BACKUP — EXPORT JSON
===================================================== */
function exportBackup() {
  const db = getDB();
  const json = JSON.stringify(db, null, 2);
  const now = new Date();
  // YYYY-MM-DD-HHMM
  const ts = now.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  const filename = `market-checklist-backup-${ts}.json`;
  downloadBlob(new Blob([json], { type: "application/json" }), filename);
}

/* =====================================================
   BACKUP — IMPORT JSON
===================================================== */
function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);

      // Validación básica de estructura
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) {
        alert("Archivo inválido: no tiene la estructura esperada de Market Checklist.");
        return;
      }

      const ok = confirm(
        `¿Reemplazar la base actual de Firebase con este backup?\n\n` +
        `• ${parsed.items.length} items\n` +
        `• ${Array.isArray(parsed.purchases) ? parsed.purchases.length : 0} compras\n\n` +
        `Esta acción NO se puede deshacer.`
      );
      if (!ok) return;

      const migrated = migrate(parsed);
      setDB(migrated);
      renderAll(getDB());
      alert("✅ Backup importado correctamente.");
    } catch {
      alert("Error al leer el archivo. Asegúrate de que sea un JSON válido exportado desde esta app.");
    }
  };
  reader.readAsText(file);
  // Reset para poder importar el mismo archivo de nuevo si hace falta
  e.target.value = "";
}

/* =====================================================
   EXPORT CSV
===================================================== */
function exportCSV() {
  const db = getDB();
  const rows = [["Fecha", "Tipo", "Tienda", "Total pagado", "Total estimado", "Items"]];

  for (const p of [...db.purchases].sort((a, b) => b.date - a.date)) {
    const d = new Date(p.date).toLocaleDateString("es-CO");
    const itemNames = (p.items || [])
      .map(li => {
        const it = db.items.find(x => x.id === li.itemId);
        const n = it ? it.name : `(id:${li.itemId.slice(0, 6)})`;
        return `${n} x${li.qty || 1}`;
      })
      .join("; ");
    rows.push([d, p.type || "", p.store || "", p.total || 0, p.estimatedTotal || 0, itemNames]);
  }

  const csv = rows.map(r =>
    r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
  ).join("\n");

  const now = new Date();
  const ts  = now.toISOString().slice(0, 10);
  // BOM para que Excel lo abra bien
  downloadBlob(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
    `market-checklist-compras-${ts}.csv`
  );
}

/* =====================================================
   HELPER: descarga un Blob como archivo
===================================================== */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
