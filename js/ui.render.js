import { $, escapeHTML, fmtCOP, normalizeName } from "./utils.js";
import {
  avgFrequencyDays,
  lastBoughtDaysAgo,
  monthlyEstimateByCategory,
  getItemById,
  getSuggestedUnitPrice,
  priceChangePct,
  cheapestStoreForItem,
  spendThisMonth,
  avgMonthlySpend,
} from "./metrics.js";


export function renderBootState(message, type = "info") {
  const boot = $("#bootCard");
  const content = $("#appContent");
  const title = $("#bootTitle");
  const text = $("#bootText");
  if (boot) boot.hidden = false;
  if (content) content.hidden = true;
  if (title) title.textContent = type === "error" ? "No se pudo cargar" : "Preparando app";
  if (text) text.textContent = message || "Conectando...";
  boot?.classList.toggle("bootError", type === "error");
}

export function renderAuthState(user) {
  const userChip = $("#userChip");
  const login = $("#btnLogin");
  const logoutBtn = $("#btnLogout");

  if (!user) {
    if (userChip) { userChip.hidden = true; userChip.textContent = ""; }
    if (login) login.hidden = false;
    if (logoutBtn) logoutBtn.hidden = true;
    return;
  }

  if (userChip) {
    userChip.hidden = false;
    userChip.textContent = user.email || "Cuenta Google";
  }
  if (login) login.hidden = true;
  if (logoutBtn) logoutBtn.hidden = false;
}

export function renderSyncStatus(status = {}) {
  const el = $("#syncStatus");
  if (!el) return;
  const text = status.text || "Sin conectar";
  el.textContent = text;
  el.title = status.detail || "";
  el.dataset.phase = status.phase || "idle";
}

export function renderAll(db) {
  const boot = $("#bootCard");
  const content = $("#appContent");
  if (boot) boot.hidden = true;
  if (content) content.hidden = false;
  renderKPIs(db);
  renderItems(db);
  renderCart(db);
  renderHistory(db);
  renderStats(db);
}

/* =====================================================
   KPIs
===================================================== */
export function renderKPIs(db) {
  const totalItems = db.items.filter(i => i.active).length;
  const cartCount  = Object.values(db.cart).reduce((a, b) => a + b, 0);
  const thisMonth  = spendThisMonth(db);
  const avgMonth   = avgMonthlySpend(db);

  $("#kpi").innerHTML = `
    <div class="box"><div class="sub">Items activos</div><div class="num">${totalItems}</div></div>
    <div class="box"><div class="sub">En carrito</div><div class="num">${cartCount}</div></div>
    <div class="box"><div class="sub">Gasto este mes</div><div class="num">$ ${fmtCOP(thisMonth)}</div></div>
    <div class="box"><div class="sub">Promedio mensual</div><div class="num">${avgMonth > 0 ? "$ " + fmtCOP(avgMonth) : "—"}</div></div>
  `;
}

/* =====================================================
   ITEMS LIST
===================================================== */
export function renderItems(db) {
  const q  = normalizeName($("#q").value);
  const ft = $("#filterTag").value;
  const fc = $("#filterCategory").value;

  let items = db.items.filter(i => i.active);
  if (q)           items = items.filter(i => normalizeName(i.name).includes(q));
  if (ft !== "all") items = items.filter(i => i.tag === ft);
  if (fc !== "all") items = items.filter(i => i.category === fc);

  items.sort((a, b) => a.name.localeCompare(b.name, "es"));

  const html = items.map(i => {
    const freq   = avgFrequencyDays(db, i.id);
    const ago    = lastBoughtDaysAgo(db, i.id);
    const inCart = db.cart[i.id] ? `• en carrito x${db.cart[i.id]}` : "";
    const freqTxt = freq ? `Cada ~${freq} días` : "Sin frecuencia aún";
    const agoTxt  = ago === null ? "Nunca comprado" : `Última: hace ${ago} d`;

    const base    = Number(i.basePrice);
    const last    = Number(i.lastPrice);
    const baseTxt = Number.isFinite(base) && base > 0 ? `$ ${fmtCOP(base)}` : "—";
    const lastTxt = Number.isFinite(last) && last > 0
      ? `$ ${fmtCOP(last)}${i.lastStore ? ` · ${escapeHTML(i.lastStore)}` : ""}`
      : "—";

    return `
      <div class="item">
        <div>
          <div style="font-weight:800">${escapeHTML(i.name)}</div>
          <div class="meta">
            <span class="badge">${escapeHTML(i.category)}</span>
            <span class="badge ${i.tag}">${i.tag === "antojo" ? "Antojo" : "Base"}</span>
            <span class="badge">${freqTxt}</span>
            <span class="badge">${agoTxt}</span>
            <span class="badge">Base: <b>${baseTxt}</b></span>
            <span class="badge">Últ: <b>${lastTxt}</b></span>
            ${inCart ? `<span class="badge">${inCart}</span>` : ""}
          </div>
        </div>
        <div class="actions">
          <button class="mini" data-act="cartAdd" data-id="${i.id}">+ Carrito</button>
          <button class="mini" data-act="editItem" data-id="${i.id}">✏️</button>
          <button class="mini" data-act="setBasePrice" data-id="${i.id}">💲 Precio</button>
          <button class="mini ok" data-act="buyNow" data-id="${i.id}">Compré</button>
          <button class="mini warn" data-act="deactivate" data-id="${i.id}">Ocultar</button>
        </div>
      </div>
    `;
  }).join("");

  $("#itemsList").innerHTML = html || `<div class="muted">No hay items con ese filtro.</div>`;
}

/* =====================================================
   CART
===================================================== */
export function renderCart(db) {
  const entries = Object.entries(db.cart)
    .map(([itemId, qty]) => ({ item: getItemById(db, itemId), qty }))
    .filter(x => x.item);

  entries.sort((a, b) => a.item.name.localeCompare(b.item.name, "es"));

  if (!entries.length) {
    $("#cartList").innerHTML = `<div class="muted">Carrito vacío. Milagro.</div>`;
    $("#cartBudget").innerHTML = `<div class="muted">Presupuesto: —</div>`;
    return;
  }

  let estTotal = 0;

  $("#cartList").innerHTML = entries.map(({ item, qty }) => {
    const stored  = Number(db.cartPrices?.[item.id]);
    const suggested = getSuggestedUnitPrice(db, item.id);
    const unit    = Number.isFinite(stored) && stored > 0 ? stored : (suggested ?? "");
    const unitNum = Number(unit);
    const line    = Number.isFinite(unitNum) && unitNum > 0 ? unitNum * qty : 0;
    estTotal += line;

    const hint = suggested ? `Sugerido: $ ${fmtCOP(suggested)}` : "Sugerido: —";

    return `
    <div class="item">
      <div>
        <div style="font-weight:800">${escapeHTML(item.name)}</div>
        <div class="meta">
          <span class="badge">${escapeHTML(item.category)}</span>
          <span class="badge ${item.tag}">${item.tag === "antojo" ? "Antojo" : "Base"}</span>
          <span class="badge">${hint}</span>
        </div>
      </div>
      <div class="actions">
        <input class="price" inputmode="numeric" type="number" min="0" step="1" placeholder="$/u"
          value="${unit === "" ? "" : escapeHTML(String(unit))}"
          data-act="priceSet" data-id="${item.id}" title="Precio unitario" />
        <span class="badge">$ ${fmtCOP(line)}</span>
        <button class="ghost mini" data-act="cartDec" data-id="${item.id}" ${qty <= 1 ? "disabled" : ""}>-</button>
        <span class="badge">x${qty}</span>
        <button class="ghost mini" data-act="cartInc" data-id="${item.id}">+</button>
        <button class="warn mini" data-act="cartRemove" data-id="${item.id}">Quitar</button>
      </div>
    </div>
    `;
  }).join("");

  // Referencia vs promedio mensual
  const avg = avgMonthlySpend(db);
  let refLine = "";
  if (avg > 0 && estTotal > 0) {
    const pct = Math.round((estTotal / avg) * 100);
    refLine = `<div class="muted small" style="margin-top:4px">≈ ${pct}% del promedio mensual</div>`;
  }

  $("#cartBudget").innerHTML = `
    <div class="budgetRow">
      <div class="muted">Presupuesto (calculado)</div>
      <div class="budgetNum">$ ${fmtCOP(estTotal)}</div>
    </div>
    ${refLine}
  `;
}

/* =====================================================
   HISTORY
===================================================== */
export function renderHistory(db) {
  const rows = db.purchases
    .slice().sort((a, b) => b.date - a.date).slice(0, 10)
    .map(p => {
      const d = new Date(p.date);
      const itemsCount = p.items.reduce((a, it) => a + Number(it.qty || 1), 0);
      const paid = Number(p.total || 0);
      const est  = Number(p.estimatedTotal || 0);
      const showEst = Number.isFinite(est) && est > 0 && Math.abs(est - paid) >= 1;
      return `
        <tr>
          <td class="small">${d.toLocaleDateString("es-CO")}</td>
          <td class="small">${escapeHTML(p.type || "-")} <span class="muted">${p.store ? "· " + escapeHTML(p.store) : ""}</span></td>
          <td class="right small">
            <b>$ ${fmtCOP(paid)}</b>
            ${showEst
              ? `<div class="muted">est: $ ${fmtCOP(est)}</div>`
              : `<div class="muted">(${itemsCount} ítems)</div>`}
          </td>
        </tr>
      `;
    }).join("");

  $("#historyTable").innerHTML = rows || `<tr><td class="muted">Sin compras aún.</td></tr>`;
}

/* =====================================================
   STATS
===================================================== */
export function renderStats(db) {
  const items = db.items.filter(i => i.active);
  const withFreq = items
    .map(i => ({ i, freq: avgFrequencyDays(db, i.id), ago: lastBoughtDaysAgo(db, i.id) }))
    .filter(x => x.freq !== null);

  withFreq.sort((a, b) => {
    if (a.i.tag !== b.i.tag) return a.i.tag === "antojo" ? -1 : 1;
    return a.freq - b.freq;
  });

  const top  = withFreq.slice(0, 8);
  const est  = monthlyEstimateByCategory(db);
  const cats = Object.entries(est).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const freqHtml = top.length ? `
    <div class="title small">⏱️ Frecuencia (top)</div>
    <table class="table" style="margin-top:8px">
      ${top.map(x => {
        const sem = x.freq < 7 ? "danger" : x.freq <= 15 ? "" : "muted";
        const label = x.i.tag === "antojo" ? "🍫" : "🥦";
        return `
          <tr>
            <td class="small"><b>${label} ${escapeHTML(x.i.name)}</b><div class="muted">${escapeHTML(x.i.category)} · ${x.i.tag === "antojo" ? "Antojo" : "Base"}</div></td>
            <td class="right small">
              <div class="${sem}" style="font-weight:900">~${x.freq} días</div>
              <div class="muted">última: ${x.ago ?? "?"} días</div>
            </td>
          </tr>`;
      }).join("")}
    </table>
  ` : `<div class="muted">Aún no hay suficientes compras para calcular frecuencias.</div>`;

  const catsHtml = cats.length ? `
    <div style="height:12px"></div>
    <div class="title small">💸 Gasto mensual estimado (por categoría)</div>
    <table class="table" style="margin-top:8px">
      ${cats.map(([cat, val]) => `
        <tr>
          <td class="small"><b>${escapeHTML(cat)}</b></td>
          <td class="right small"><b>$ ${fmtCOP(val)}</b><div class="muted">estimado</div></td>
        </tr>
      `).join("")}
    </table>
    <div class="sub small muted" style="margin-top:8px">
      Usa precios por ítem cuando existen; si no, fallback al total repartido.
    </div>
  ` : "";

  const priceItems = items
    .map(i => ({
      i,
      pct: priceChangePct(db, i.id, "base"),
      cheap: cheapestStoreForItem(db, i.id, { days: 180 }),
    }))
    .filter(x => x.pct !== null || x.cheap);

  const movers = priceItems
    .filter(x => x.pct !== null)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 6);

  const cheapies = priceItems
    .filter(x => x.cheap)
    .sort((a, b) => a.cheap.unitPrice - b.cheap.unitPrice)
    .slice(0, 6);

  const moversHtml = movers.length ? `
    <div style="height:14px"></div>
    <div class="title small">📈 Cambios de precio (vs base)</div>
    <table class="table" style="margin-top:8px">
      ${movers.map(x => {
        const pct = x.pct;
        const cls  = pct > 8 ? "danger" : pct < -8 ? "ok" : "";
        const sign = pct > 0 ? "+" : "";
        return `
          <tr>
            <td class="small"><b>${escapeHTML(x.i.name)}</b>
              <div class="muted">Base: ${Number.isFinite(Number(x.i.basePrice)) && x.i.basePrice ? `$ ${fmtCOP(x.i.basePrice)}` : "—"} · Últ: ${Number.isFinite(Number(x.i.lastPrice)) && x.i.lastPrice ? `$ ${fmtCOP(x.i.lastPrice)}` : "—"}</div>
            </td>
            <td class="right small"><div class="${cls}" style="font-weight:900">${sign}${pct.toFixed(1)}%</div><div class="muted">vs base</div></td>
          </tr>`;
      }).join("")}
    </table>
  ` : "";

  const cheapHtml = cheapies.length ? `
    <div style="height:14px"></div>
    <div class="title small">🏷️ Dónde está más barato (últimos 180 días)</div>
    <table class="table" style="margin-top:8px">
      ${cheapies.map(x => `
        <tr>
          <td class="small"><b>${escapeHTML(x.i.name)}</b><div class="muted">${escapeHTML(x.cheap.store || "Sin tienda")}</div></td>
          <td class="right small"><b>$ ${fmtCOP(x.cheap.unitPrice)}</b><div class="muted">mejor visto</div></td>
        </tr>
      `).join("")}
    </table>
  ` : "";

  $("#stats").innerHTML = freqHtml + catsHtml + moversHtml + cheapHtml;
}
