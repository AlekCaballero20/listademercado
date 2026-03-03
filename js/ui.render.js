import { $, escapeHTML, fmtCOP, normalizeName } from "./utils.js";
import {
  avgFrequencyDays,
  lastBoughtDaysAgo,
  monthlyEstimateByCategory,
  getItemById,
  getSuggestedUnitPrice,
  priceChangePct,
  cheapestStoreForItem,
} from "./metrics.js";

export function renderAll(db) {
  renderKPIs(db);
  renderItems(db);
  renderCart(db);
  renderHistory(db);
  renderStats(db);
}

export function renderKPIs(db) {
  const totalItems = db.items.filter(i => i.active).length;
  const cartCount = Object.values(db.cart).reduce((a, b) => a + b, 0);
  const last30 = db.purchases.filter(p => p.date >= Date.now() - 30 * 24 * 60 * 60 * 1000);
  const spend30 = last30.reduce((a, p) => a + Number(p.total || 0), 0);
  
  $("#kpi").innerHTML = `
    <div class="box"><div class="sub">Items activos</div><div class="num">${totalItems}</div></div>
    <div class="box"><div class="sub">En carrito</div><div class="num">${cartCount}</div></div>
    <div class="box"><div class="sub">Gasto últimos 30 días</div><div class="num">$ ${fmtCOP(spend30)}</div></div>
  `;
}

export function renderItems(db) {
  const q = normalizeName($("#q").value);
  const ft = $("#filterTag").value;
  const fc = $("#filterCategory").value;
  
  let items = db.items.filter(i => i.active);
  if (q) items = items.filter(i => normalizeName(i.name).includes(q));
  if (ft !== "all") items = items.filter(i => i.tag === ft);
  if (fc !== "all") items = items.filter(i => i.category === fc);
  
  items.sort((a, b) => a.name.localeCompare(b.name, "es"));
  
  const html = items.map(i => {
    const freq = avgFrequencyDays(db, i.id);
    const ago = lastBoughtDaysAgo(db, i.id);
    const inCart = db.cart[i.id] ? `• en carrito x${db.cart[i.id]}` : "";
    const freqTxt = freq ? `Cada ~${freq} días` : "Sin frecuencia aún";
    const agoTxt = (ago === null) ? "Nunca comprado" : `Última compra: hace ${ago} días`;
    
    const base = Number(i.basePrice);
    const last = Number(i.lastPrice);
    const baseTxt = Number.isFinite(base) && base > 0 ? `$ ${fmtCOP(base)}` : "—";
    const lastTxt = Number.isFinite(last) && last > 0 ? `$ ${fmtCOP(last)}${i.lastStore ? ` · ${escapeHTML(i.lastStore)}` : ""}` : "—";

    return `
      <div class="item">
        <div>
          <div style="font-weight:800">${escapeHTML(i.name)}</div>
          <div class="meta">
            <span class="badge">${escapeHTML(i.category)}</span>
            <span class="badge ${i.tag}">${i.tag==="antojo" ? "Antojo" : "Base"}</span>
            <span class="badge">${freqTxt}</span>
            <span class="badge">${agoTxt}</span>
            <span class="badge">Base: <b>${baseTxt}</b></span>
            <span class="badge">Últ: <b>${lastTxt}</b></span>
            ${inCart ? `<span class="badge">${inCart}</span>` : ""}
          </div>
        </div>
        <div class="actions">
          <button class="mini" data-act="cartAdd" data-id="${i.id}">+ Carrito</button>
          <button class="mini" data-act="setBasePrice" data-id="${i.id}">💲 Precio</button>
          <button class="mini ok" data-act="buyNow" data-id="${i.id}">Compré hoy</button>
          <button class="mini warn" data-act="deactivate" data-id="${i.id}">Ocultar</button>
        </div>
      </div>
    `;
  }).join("");
  
  $("#itemsList").innerHTML = html || `<div class="muted">No hay items con ese filtro.</div>`;
}

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
    const stored = Number(db.cartPrices?.[item.id]);
    const suggested = getSuggestedUnitPrice(db, item.id);
    const unit = Number.isFinite(stored) && stored >= 0 ? stored : (suggested ?? "");
    const unitNum = Number(unit);
    const line = (Number.isFinite(unitNum) && unitNum > 0) ? (unitNum * qty) : 0;
    estTotal += line;

    const hint = suggested ? `Sugerido: $ ${fmtCOP(suggested)}` : "Sugerido: —";

    return `
    <div class="item">
      <div>
        <div style="font-weight:800">${escapeHTML(item.name)}</div>
        <div class="meta">
          <span class="badge">${escapeHTML(item.category)}</span>
          <span class="badge ${item.tag}">${item.tag==="antojo"?"Antojo":"Base"}</span>
          <span class="badge">${hint}</span>
        </div>
      </div>
      <div class="actions">
        <input class="price" inputmode="numeric" type="number" min="0" step="1" placeholder="$/u" value="${unit === "" ? "" : escapeHTML(String(unit))}" data-act="priceSet" data-id="${item.id}" title="Precio unitario" />
        <span class="badge">$ ${fmtCOP(line)}</span>
        <button class="ghost mini" data-act="cartDec" data-id="${item.id}" ${qty<=1?'disabled':''}>-</button>
        <span class="badge">x${qty}</span>
        <button class="ghost mini" data-act="cartInc" data-id="${item.id}">+</button>
        <button class="warn mini" data-act="cartRemove" data-id="${item.id}">Quitar</button>
      </div>
    </div>
  `;
  }).join("");

  $("#cartBudget").innerHTML = `
    <div class="budgetRow">
      <div class="muted">Presupuesto (calculado)</div>
      <div class="budgetNum">$ ${fmtCOP(estTotal)}</div>
    </div>
  `;
}

export function renderHistory(db) {
  const rows = db.purchases
    .slice().sort((a, b) => b.date - a.date).slice(0, 10)
    .map(p => {
      const d = new Date(p.date);
      const itemsCount = p.items.reduce((a, it) => a + Number(it.qty || 1), 0);
      const paid = Number(p.total || 0);
      const est = Number(p.estimatedTotal || 0);
      const showEst = Number.isFinite(est) && est > 0 && Math.abs(est - paid) >= 1;
      return `
        <tr>
          <td class="small">${d.toLocaleDateString("es-CO")}</td>
          <td class="small">${escapeHTML(p.type || "-")} <span class="muted">${p.store ? "· "+escapeHTML(p.store) : ""}</span></td>
          <td class="right small">
            <b>$ ${fmtCOP(paid)}</b>
            ${showEst ? `<div class="muted">est: $ ${fmtCOP(est)}</div>` : `<div class="muted">(${itemsCount} ítems)</div>`}
          </td>
        </tr>
      `;
    }).join("");
  
  $("#historyTable").innerHTML = rows || `<tr><td class="muted">Sin compras aún.</td></tr>`;
}

export function renderStats(db) {
  const items = db.items.filter(i => i.active);
  const withFreq = items
    .map(i => ({ i, freq: avgFrequencyDays(db, i.id), ago: lastBoughtDaysAgo(db, i.id) }))
    .filter(x => x.freq !== null);
  
  withFreq.sort((a, b) => {
    if (a.i.tag !== b.i.tag) return (a.i.tag === "antojo" ? -1 : 1);
    return a.freq - b.freq;
  });
  
  const top = withFreq.slice(0, 8);
  const est = monthlyEstimateByCategory(db);
  const cats = Object.entries(est).sort((a, b) => b[1] - a[1]).slice(0, 6);
  
  const freqHtml = top.length ? `
    <div class="title small">⏱️ Frecuencia (top)</div>
    <table class="table" style="margin-top:8px">
      ${top.map(x=>{
        const sem = x.freq < 7 ? "danger" : (x.freq <= 15 ? "" : "muted");
        const label = x.i.tag==="antojo" ? "🍫" : "🥦";
        return `
          <tr>
            <td class="small"><b>${label} ${escapeHTML(x.i.name)}</b><div class="muted">${escapeHTML(x.i.category)} · ${x.i.tag==="antojo"?"Antojo":"Base"}</div></td>
            <td class="right small">
              <div class="${sem}" style="font-weight:900">~${x.freq} días</div>
              <div class="muted">última: ${x.ago ?? "?"} días</div>
            </td>
          </tr>
        `;
      }).join("")}
    </table>
  ` : `<div class="muted">Aún no hay suficientes compras para calcular frecuencias.</div>`;
  
  const catsHtml = cats.length ? `
    <div style="height:12px"></div>
    <div class="title small">💸 Gasto mensual estimado (por categoría)</div>
    <table class="table" style="margin-top:8px">
      ${cats.map(([cat,val])=>`
        <tr>
          <td class="small"><b>${escapeHTML(cat)}</b></td>
          <td class="right small"><b>$ ${fmtCOP(val)}</b><div class="muted">estimado</div></td>
        </tr>
      `).join("")}
    </table>
    <div class="sub small muted" style="margin-top:8px">
      Estimación con precios por ítem cuando existan; si no, hace fallback al total repartido.
    </div>
  ` : "";

  // Precios: top cambios vs base + tiendas más baratas
  const priceItems = items
    .map(i => ({
      i,
      pct: priceChangePct(db, i.id, 'base'),
      cheap: cheapestStoreForItem(db, i.id, { days: 180 })
    }))
    .filter(x => x.pct !== null || x.cheap);

  const movers = priceItems
    .filter(x => x.pct !== null)
    .slice()
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 6);

  const cheapies = priceItems
    .filter(x => x.cheap)
    .slice()
    .sort((a, b) => a.cheap.unitPrice - b.cheap.unitPrice)
    .slice(0, 6);

  const moversHtml = movers.length ? `
    <div style="height:14px"></div>
    <div class="title small">📈 Cambios de precio (vs base)</div>
    <table class="table" style="margin-top:8px">
      ${movers.map(x=>{
        const pct = x.pct;
        const cls = pct > 8 ? 'danger' : (pct < -8 ? 'ok' : '');
        const sign = pct > 0 ? '+' : '';
        return `
          <tr>
            <td class="small"><b>${escapeHTML(x.i.name)}</b><div class="muted">Base: ${Number.isFinite(Number(x.i.basePrice)) && x.i.basePrice ? `$ ${fmtCOP(x.i.basePrice)}` : '—'} · Últ: ${Number.isFinite(Number(x.i.lastPrice)) && x.i.lastPrice ? `$ ${fmtCOP(x.i.lastPrice)}` : '—'}</div></td>
            <td class="right small"><div class="${cls}" style="font-weight:900">${sign}${pct.toFixed(1)}%</div><div class="muted">vs base</div></td>
          </tr>
        `;
      }).join('')}
    </table>
  ` : '';

  const cheapHtml = cheapies.length ? `
    <div style="height:14px"></div>
    <div class="title small">🏷️ Dónde está más barato (últimos 180 días)</div>
    <table class="table" style="margin-top:8px">
      ${cheapies.map(x=>`
        <tr>
          <td class="small"><b>${escapeHTML(x.i.name)}</b><div class="muted">${escapeHTML(x.cheap.store || 'Sin tienda')}</div></td>
          <td class="right small"><b>$ ${fmtCOP(x.cheap.unitPrice)}</b><div class="muted">mejor visto</div></td>
        </tr>
      `).join('')}
    </table>
  ` : '';
  
  $("#stats").innerHTML = freqHtml + catsHtml + moversHtml + cheapHtml;
}