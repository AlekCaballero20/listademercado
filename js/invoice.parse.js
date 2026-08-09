/* =====================================================
   IMPORTAR FACTURA CON IA — lógica pura (sin DOM ni Firebase)
   1) Genera un prompt con el catálogo actual.
   2) Recibe el JSON que devuelve la IA.
   3) Concilia: "así aparece en la factura" → "así lo guardamos".
   4) Llena el carrito (y opcionalmente registra la compra).
===================================================== */

import { normalizeName } from "./utils.js";

export const CATEGORIES = [
  "Alacena", "Frescos", "Aseo", "Hogar", "Bebidas", "Salsas", "Galguerías", "Otros",
];

const TAGS = ["base", "antojo"];

/* =====================================================
   NORMALIZACIÓN Y MATCHING
===================================================== */

/** normalizeName + sin acentos + sin signos, para comparar de verdad. */
export function canon(s) {
  return normalizeName(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "con", "sin", "und", "unid", "unidad", "uds",
  "x", "gr", "g", "kg", "ml", "lt", "l", "cc", "pack", "paq", "bolsa", "caja", "und.",
]);

function tokens(s) {
  return canon(s).split(" ").filter(t => t && t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

/** Score 0..1 entre un texto de factura y el nombre de un item del catálogo. */
function similarity(a, b) {
  const ca = canon(a);
  const cb = canon(b);
  if (!ca || !cb) return 0;
  if (ca === cb) return 1;

  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;

  // Coincidencia de tokens (con prefijos, porque las facturas abrevian todo).
  let hits = 0;
  for (const t of tb) {
    const found = ta.some(u => u === t || (u.length >= 4 && t.startsWith(u)) || (t.length >= 4 && u.startsWith(t)));
    if (found) hits++;
  }
  const tokenScore = hits / tb.length;

  // Bonus si el nombre del catálogo aparece completo dentro del texto de factura.
  const contains = ca.includes(cb) || cb.includes(ca) ? 0.25 : 0;

  return Math.min(1, tokenScore * 0.85 + contains);
}

/** Mejor candidato del catálogo para un texto de factura. */
export function bestMatch(db, text, hint = "") {
  let best = null;
  for (const item of db.items) {
    const score = Math.max(similarity(text, item.name), hint ? similarity(hint, item.name) : 0);
    if (!best || score > best.score) best = { item, score };
  }
  if (!best || best.score < 0.5) return null;
  return best;
}

/* =====================================================
   PROMPT PARA LA IA
===================================================== */

export function buildInvoicePrompt(db) {
  const activos = db.items.filter(i => i.active);
  const catalogo = activos.length
    ? activos
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "es"))
        .map(i => `- ${i.name} | categoría: ${i.category} | tipo: ${i.tag}`)
        .join("\n")
    : "(catálogo vacío: propón nombres nuevos para todo)";

  return `Eres un asistente que lee facturas de supermercado (Colombia, pesos COP) y las convierte al formato de mi app "Market Checklist".

Te voy a pasar una factura (foto, PDF o texto). Léela completa y devuélveme SOLO un bloque de código JSON, sin ningún texto antes ni después.

## Catálogo actual de mi app
Estos son los productos que ya existen. Si una línea de la factura corresponde a uno de ellos, usa EXACTAMENTE ese nombre en "nombreApp" y marca "coincide": true.

${catalogo}

## Categorías válidas
${CATEGORIES.join(", ")}

## Tipos válidos
base (necesario, se repone) | antojo (capricho, no esencial)

## Reglas
1. Una línea del JSON por cada producto de la factura. No agrupes productos distintos.
2. "textoFactura" debe ser el texto TAL CUAL aparece impreso en la factura, con sus abreviaturas y todo (ej: "LCH ENT ALQ 1100ML").
3. "nombreApp" es el nombre limpio y corto como debe guardarse en la app. Si coincide con el catálogo, cópialo idéntico. Si no, propón un nombre corto en español, singular y sin marca cuando la marca no importe (ej: "Leche", "Arroz", "Papel higiénico").
4. "precioUnitario" es el precio por unidad en COP, entero, sin puntos ni símbolos. Si la factura solo trae el total de la línea, divídelo entre la cantidad y redondea.
5. "cantidad" es un número. Si la factura vende por peso (kg), pon cantidad 1 y el precio pagado por esa línea como precioUnitario, y explícalo en "nota".
6. Descuentos, bolsas, propinas, impuestos o cualquier línea que no sea un producto van en "otrosCargos", NO en "lineas".
7. Si un dato no aparece en la factura, pon null. No inventes precios.
8. "confianza" es "alta", "media" o "baja" según qué tan seguro estás de haber leído bien esa línea.
9. En "nota" explica la conciliación cuando el nombre cambie, ej: "En la factura aparece como LCH ENT ALQ 1100ML; en la app se guarda como Leche".

## Formato de salida (JSON exacto)
\`\`\`json
{
  "factura": {
    "tienda": "D1",
    "fecha": "2026-08-09",
    "numero": "FE-12345",
    "totalFactura": 187400,
    "moneda": "COP"
  },
  "lineas": [
    {
      "textoFactura": "LCH ENT ALQ 1100ML",
      "nombreApp": "Leche",
      "coincide": true,
      "categoria": "Frescos",
      "tag": "base",
      "cantidad": 2,
      "precioUnitario": 4500,
      "totalLinea": 9000,
      "confianza": "alta",
      "nota": "En la factura aparece como LCH ENT ALQ 1100ML; en la app se guarda como Leche"
    }
  ],
  "otrosCargos": [
    { "concepto": "Bolsa plástica", "valor": 200 }
  ],
  "noLeido": [
    "Línea 14 ilegible"
  ]
}
\`\`\`

Devuélveme únicamente ese JSON. Nada más.`;
}

/* =====================================================
   PARSEO DE LA RESPUESTA
===================================================== */

/** Extrae el JSON aunque venga con ```json, texto alrededor o comillas raras. */
export function parseInvoiceResponse(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("Pega primero la respuesta de la IA.");

  let candidate = text;

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    candidate = fence[1].trim();
  } else {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) candidate = text.slice(start, end + 1);
  }

  let data;
  try {
    data = JSON.parse(candidate);
  } catch {
    throw new Error("Eso no es un JSON válido. Copia la respuesta completa de la IA, incluido el bloque ```json.");
  }

  if (!data || typeof data !== "object" || !Array.isArray(data.lineas)) {
    throw new Error('El JSON no trae la lista "lineas". Pídele a la IA que use el formato del prompt.');
  }

  return data;
}

export function toInt(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function toQty(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.round(n));
}

export function normalizeCategory(v) {
  const c = canon(v);
  return CATEGORIES.find(x => canon(x) === c) || "Otros";
}

export function normalizeTag(v) {
  const t = canon(v);
  return TAGS.includes(t) ? t : "base";
}

/**
 * Convierte el JSON de la IA en filas conciliadas contra el catálogo.
 * Cada fila dice: así viene en la factura → así lo vamos a guardar.
 */
export function reconcile(db, data) {
  const lineas = data.lineas.map((l, index) => {
    const textoFactura = String(l.textoFactura || l.nombreApp || "(sin texto)").trim();
    const nombreApp = String(l.nombreApp || textoFactura).trim();
    const qty = toQty(l.cantidad);

    let unit = toInt(l.precioUnitario);
    const totalLinea = toInt(l.totalLinea);
    if (!unit && totalLinea) unit = Math.round(totalLinea / qty);

    const match = bestMatch(db, textoFactura, nombreApp);

    return {
      key: `ln_${index}`,
      textoFactura,
      nombreApp,
      qty,
      unit,
      totalLinea: totalLinea ?? (unit ? unit * qty : null),
      categoria: normalizeCategory(l.categoria),
      tag: normalizeTag(l.tag),
      confianza: ["alta", "media", "baja"].includes(canon(l.confianza)) ? canon(l.confianza) : "media",
      nota: String(l.nota || "").trim(),
      // Decisión: id del item existente, "__new__" para crear, "__skip__" para ignorar.
      decision: match ? match.item.id : "__new__",
      matchScore: match ? match.score : 0,
      autoMatched: Boolean(match),
    };
  });

  const factura = data.factura && typeof data.factura === "object" ? data.factura : {};

  return {
    tienda: String(factura.tienda || "").trim(),
    fecha: parseFecha(factura.fecha),
    numero: String(factura.numero || "").trim(),
    totalFactura: toInt(factura.totalFactura),
    otrosCargos: Array.isArray(data.otrosCargos)
      ? data.otrosCargos
          .map(c => ({ concepto: String(c?.concepto || "Cargo").trim(), valor: toInt(c?.valor) }))
          .filter(c => c.valor)
      : [],
    noLeido: Array.isArray(data.noLeido) ? data.noLeido.map(x => String(x)).filter(Boolean) : [],
    lineas,
  };
}

/** "2026-08-09" → "2026-08-09" válido para <input type="date">, o "" */
function parseFecha(v) {
  const s = String(v || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) return `${dmy[3]}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;

  return "";
}
