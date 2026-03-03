export function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
export function normalizeName(s) {
  return String(s || "").trim().toLowerCase();
}
export function escapeHTML(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
export function fmtCOP(n) {
  const v = Number(n || 0);
  return v.toLocaleString("es-CO");
}
export function daysBetween(a, b) {
  const ms = Math.abs(b - a);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
export const $ = (sel) => document.querySelector(sel);