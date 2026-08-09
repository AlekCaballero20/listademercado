/* =====================================================
   IMPORTAR FACTURA CON IA — UI del diálogo
===================================================== */

import { escapeHTML, fmtCOP, normalizeName, uid } from "./utils.js";
import { getDB, patch } from "./state.js";
import { renderAll } from "./ui.render.js";
import {
  CATEGORIES,
  buildInvoicePrompt,
  normalizeCategory,
  normalizeTag,
  parseInvoiceResponse,
  reconcile,
  toInt,
  toQty,
} from "./invoice.parse.js";

/* =====================================================
   APLICAR AL CARRITO
===================================================== */

/**
 * Crea los items nuevos, llena carrito y precios.
 * Devuelve un resumen para avisarle al humano qué pasó.
 */
export function applyInvoice(review, { registrarCompra = false } = {}) {
  const usable = review.lineas.filter(l => l.decision !== "__skip__");
  if (!usable.length) return { creados: 0, actualizados: 0, lineas: 0, compra: false };

  let creados = 0;
  let actualizados = 0;

  patch((db) => {
    if (!db.cartPrices || typeof db.cartPrices !== "object") db.cartPrices = {};

    for (const line of usable) {
      let item = null;

      if (line.decision === "__new__") {
        // Reutiliza un item inactivo con el mismo nombre en vez de duplicarlo.
        const norm = normalizeName(line.nombreApp);
        const existing = db.items.find(i => normalizeName(i.name) === norm);
        if (existing) {
          existing.active = true;
          item = existing;
        } else {
          item = {
            id: uid(),
            name: line.nombreApp,
            category: line.categoria,
            tag: line.tag,
            active: true,
            createdAt: Date.now(),
            basePrice: line.unit ?? null,
            lastPrice: line.unit ?? null,
            lastStore: "",
            lastAt: null,
          };
          db.items.push(item);
          creados++;
        }
      } else {
        item = db.items.find(i => i.id === line.decision);
        if (!item) continue;
        if (!item.active) item.active = true;
        actualizados++;
      }

      db.cart[item.id] = Number(db.cart[item.id] || 0) + line.qty;
      if (line.unit) db.cartPrices[item.id] = line.unit;

      line.resolvedItemId = item.id;
    }

    return db;
  });

  // Campos de cabecera de la compra
  const storeEl = document.querySelector("#store");
  const dateEl = document.querySelector("#purchaseDate");
  const totalEl = document.querySelector("#totalPaid");
  if (storeEl && review.tienda) storeEl.value = review.tienda;
  if (dateEl && review.fecha) dateEl.value = review.fecha;
  if (totalEl && review.totalFactura) totalEl.value = String(review.totalFactura);

  renderAll(getDB());

  let compra = false;
  if (registrarCompra) {
    document.querySelector("#btnCheckout")?.click();
    compra = true;
  }

  return { creados, actualizados, lineas: usable.length, compra };
}

/* =====================================================
   UI DEL DIÁLOGO
===================================================== */

let review = null;

export function openInvoiceDialog() {
  const dlg = document.querySelector("#invoiceDialog");
  if (!dlg) return;

  review = null;
  document.querySelector("#invoicePrompt").value = buildInvoicePrompt(getDB());
  document.querySelector("#invoiceResponse").value = "";
  document.querySelector("#invoiceError").textContent = "";
  document.querySelector("#invoiceReview").innerHTML = "";
  document.querySelector("#invoiceReviewWrap").hidden = true;
  document.querySelector("#invoiceCopyHint").textContent = "";
  dlg.showModal();
}

async function copyPrompt() {
  const text = document.querySelector("#invoicePrompt").value;
  const hint = document.querySelector("#invoiceCopyHint");
  try {
    await navigator.clipboard.writeText(text);
    hint.textContent = "✅ Prompt copiado. Pégalo en la IA junto con la factura.";
  } catch {
    document.querySelector("#invoicePrompt").select();
    hint.textContent = "Selecciónalo y cópialo a mano (Ctrl+C).";
  }
}

function analyze() {
  const errEl = document.querySelector("#invoiceError");
  errEl.textContent = "";
  try {
    const data = parseInvoiceResponse(document.querySelector("#invoiceResponse").value);
    review = reconcile(getDB(), data);
    if (!review.lineas.length) {
      errEl.textContent = "La IA no devolvió ninguna línea de producto.";
      return;
    }
    renderReview();
  } catch (error) {
    errEl.textContent = error.message || "No se pudo leer la respuesta.";
  }
}

function itemOptions(db, selected) {
  const active = db.items
    .filter(i => i.active)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const inactive = db.items
    .filter(i => !i.active)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const opt = (i) =>
    `<option value="${i.id}" ${selected === i.id ? "selected" : ""}>${escapeHTML(i.name)}${i.active ? "" : " (oculto)"}</option>`;

  return `
    <option value="__new__" ${selected === "__new__" ? "selected" : ""}>➕ Crear item nuevo</option>
    <option value="__skip__" ${selected === "__skip__" ? "selected" : ""}>⛔ Ignorar esta línea</option>
    ${active.map(opt).join("")}
    ${inactive.map(opt).join("")}
  `;
}

function renderReview() {
  const db = getDB();
  const wrap = document.querySelector("#invoiceReviewWrap");
  const box = document.querySelector("#invoiceReview");

  const usable = review.lineas.filter(l => l.decision !== "__skip__");
  const estimado = usable.reduce((acc, l) => acc + (l.unit || 0) * l.qty, 0);
  const cargos = review.otrosCargos.reduce((acc, c) => acc + c.valor, 0);
  const diff = review.totalFactura ? review.totalFactura - (estimado + cargos) : null;

  const cabecera = `
    <div class="invoiceHead">
      <div><span>Tienda</span><b>${escapeHTML(review.tienda || "—")}</b></div>
      <div><span>Fecha</span><b>${escapeHTML(review.fecha || "—")}</b></div>
      <div><span>Factura</span><b>${escapeHTML(review.numero || "—")}</b></div>
      <div><span>Total factura</span><b>${review.totalFactura ? "$ " + fmtCOP(review.totalFactura) : "—"}</b></div>
    </div>
  `;

  const filas = review.lineas.map((line) => {
    const nuevo = line.decision === "__new__";
    const ignorado = line.decision === "__skip__";
    const existente = !nuevo && !ignorado ? db.items.find(i => i.id === line.decision) : null;

    const destino = ignorado
      ? `<span class="badge warnBadge">No se guarda</span>`
      : nuevo
        ? `<span class="badge antojo">Item nuevo</span>`
        : `<span class="badge base">Ya existe${line.autoMatched ? ` · ${Math.round(line.matchScore * 100)}%` : ""}</span>`;

    const conciliacion = ignorado
      ? "Esta línea se descarta."
      : `En la factura: <b>${escapeHTML(line.textoFactura)}</b> → en la app: <b>${escapeHTML(existente ? existente.name : line.nombreApp)}</b>`;

    const confBadge = line.confianza === "baja"
      ? `<span class="badge warnBadge">Lectura dudosa</span>`
      : line.confianza === "media"
        ? `<span class="badge">Confianza media</span>`
        : "";

    return `
      <div class="invoiceLine ${ignorado ? "isSkipped" : ""}">
        <div class="invoiceLineTop">
          <div class="invoiceRaw">${escapeHTML(line.textoFactura)}</div>
          <div class="invoiceBadges">${destino}${confBadge}</div>
        </div>

        <div class="invoiceConc small">${conciliacion}</div>
        ${line.nota ? `<div class="muted small">📝 ${escapeHTML(line.nota)}</div>` : ""}

        <div class="invoiceFields">
          <label class="invoiceField" style="grid-column:span 2">
            <span>Guardar como</span>
            <select data-inv="decision" data-key="${line.key}">${itemOptions(db, line.decision)}</select>
          </label>

          ${nuevo ? `
          <label class="invoiceField" style="grid-column:span 2">
            <span>Nombre nuevo</span>
            <input data-inv="nombreApp" data-key="${line.key}" value="${escapeHTML(line.nombreApp)}" />
          </label>
          <label class="invoiceField">
            <span>Categoría</span>
            <select data-inv="categoria" data-key="${line.key}">
              ${CATEGORIES.map(c => `<option ${c === line.categoria ? "selected" : ""}>${c}</option>`).join("")}
            </select>
          </label>
          <label class="invoiceField">
            <span>Tipo</span>
            <select data-inv="tag" data-key="${line.key}">
              <option value="base" ${line.tag === "base" ? "selected" : ""}>Base</option>
              <option value="antojo" ${line.tag === "antojo" ? "selected" : ""}>Antojo</option>
            </select>
          </label>` : ""}

          <label class="invoiceField">
            <span>Cantidad</span>
            <input type="number" min="1" step="1" data-inv="qty" data-key="${line.key}" value="${line.qty}" />
          </label>
          <label class="invoiceField">
            <span>Precio unitario</span>
            <input type="number" min="0" step="1" data-inv="unit" data-key="${line.key}" value="${line.unit ?? ""}" placeholder="—" />
          </label>
        </div>

        <div class="invoiceLineTotal small muted">Subtotal línea: <b>$ ${fmtCOP((line.unit || 0) * line.qty)}</b></div>
      </div>
    `;
  }).join("");

  const cargosHtml = review.otrosCargos.length ? `
    <div class="invoiceNote">
      <div class="title small">Otros cargos (no van al carrito)</div>
      ${review.otrosCargos.map(c => `<div class="small">• ${escapeHTML(c.concepto)}: $ ${fmtCOP(c.valor)}</div>`).join("")}
    </div>` : "";

  const noLeidoHtml = review.noLeido.length ? `
    <div class="invoiceNote">
      <div class="title small">La IA no pudo leer</div>
      ${review.noLeido.map(x => `<div class="small">• ${escapeHTML(x)}</div>`).join("")}
    </div>` : "";

  const cuadre = review.totalFactura ? `
    <div class="invoiceBalance ${Math.abs(diff) <= 500 ? "isOk" : "isOff"}">
      <div><span>Suma de líneas</span><b>$ ${fmtCOP(estimado)}</b></div>
      ${cargos ? `<div><span>Otros cargos</span><b>$ ${fmtCOP(cargos)}</b></div>` : ""}
      <div><span>Total factura</span><b>$ ${fmtCOP(review.totalFactura)}</b></div>
      <div><span>Diferencia</span><b>${diff === 0 ? "cuadra exacto" : `$ ${fmtCOP(Math.abs(diff))} ${diff > 0 ? "sin explicar" : "de más"}`}</b></div>
    </div>` : `
    <div class="invoiceBalance">
      <div><span>Suma de líneas</span><b>$ ${fmtCOP(estimado)}</b></div>
      <div><span>Total factura</span><b>no vino en el JSON</b></div>
    </div>`;

  box.innerHTML = `
    ${cabecera}
    <div class="sub small" style="margin:10px 0">${usable.length} de ${review.lineas.length} líneas se van a aplicar. Revisa la conciliación antes de guardar.</div>
    <div class="invoiceLines">${filas}</div>
    ${cargosHtml}
    ${noLeidoHtml}
    ${cuadre}
  `;

  wrap.hidden = false;
}

function updateLine(key, field, value) {
  const line = review?.lineas.find(l => l.key === key);
  if (!line) return;

  if (field === "qty") {
    line.qty = toQty(value);
  } else if (field === "unit") {
    line.unit = toInt(value);
  } else if (field === "nombreApp") {
    line.nombreApp = String(value).trim() || line.textoFactura;
    return; // no re-renderizar: el usuario está escribiendo
  } else if (field === "categoria") {
    line.categoria = normalizeCategory(value);
    return;
  } else if (field === "tag") {
    line.tag = normalizeTag(value);
    return;
  } else if (field === "decision") {
    line.decision = value;
  }

  renderReview();
}

function applyFromDialog(registrarCompra) {
  if (!review) return;
  const errEl = document.querySelector("#invoiceError");

  const usable = review.lineas.filter(l => l.decision !== "__skip__");
  if (!usable.length) {
    errEl.textContent = "Todas las líneas están ignoradas. No hay nada que guardar.";
    return;
  }

  if (registrarCompra && !confirm("Se llenará el carrito y se registrará la compra en el historial. ¿Seguimos?")) return;

  const res = applyInvoice(review, { registrarCompra });
  document.querySelector("#invoiceDialog").close();
  review = null;

  alert(
    `✅ Factura aplicada\n\n` +
    `• ${res.lineas} líneas al carrito\n` +
    `• ${res.creados} items nuevos creados\n` +
    `• ${res.actualizados} items ya existentes\n` +
    (res.compra ? `• Compra registrada en el historial` : `• Revisa el carrito y dale "Guardar compra" cuando quieras`)
  );
}

export function bindInvoiceActions() {
  document.querySelector("#btnInvoiceImport")?.addEventListener("click", openInvoiceDialog);
  document.querySelector("#invoiceCopyPrompt")?.addEventListener("click", copyPrompt);
  document.querySelector("#invoiceAnalyze")?.addEventListener("click", analyze);
  document.querySelector("#invoiceApply")?.addEventListener("click", () => applyFromDialog(false));
  document.querySelector("#invoiceApplyBuy")?.addEventListener("click", () => applyFromDialog(true));
  document.querySelector("#invoiceClose")?.addEventListener("click", () => {
    document.querySelector("#invoiceDialog").close();
    review = null;
  });

  const box = document.querySelector("#invoiceReview");
  box?.addEventListener("change", (e) => {
    const el = e.target.closest("[data-inv]");
    if (!el) return;
    updateLine(el.dataset.key, el.dataset.inv, el.value);
  });
  box?.addEventListener("input", (e) => {
    const el = e.target.closest('input[data-inv="nombreApp"]');
    if (!el) return;
    updateLine(el.dataset.key, "nombreApp", el.value);
  });
}
