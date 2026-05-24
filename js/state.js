import { migrate, seedDB } from "./models.js";
import { ensureRemoteDB, listenRemoteDB, replaceRemoteDB, saveRemoteDB } from "./firebase.store.js";

let db = seedDB();
let initialized = false;
let unsubscribeRemote = null;
let saveTimer = null;
let savingSeq = 0;
let remoteChangeHandler = () => {};

const status = {
  phase: "idle",
  text: "Sin conectar",
  detail: "",
  updatedAt: null,
};
const statusListeners = new Set();

function setStatus(next) {
  Object.assign(status, next, { updatedAt: Date.now() });
  for (const fn of statusListeners) fn(getSyncStatus());
}

export function onSyncStatus(fn) {
  statusListeners.add(fn);
  fn(getSyncStatus());
  return () => statusListeners.delete(fn);
}

export function getSyncStatus() {
  return { ...status };
}

export function getDB() {
  return db;
}

export function isInitialized() {
  return initialized;
}

export async function initState({ onRemoteChange } = {}) {
  remoteChangeHandler = typeof onRemoteChange === "function" ? onRemoteChange : () => {};

  if (unsubscribeRemote) {
    unsubscribeRemote();
    unsubscribeRemote = null;
  }

  setStatus({ phase: "loading", text: "Conectando con Firebase", detail: "Preparando mercado compartido..." });

  const remoteDB = await ensureRemoteDB(seedDB());
  db = migrate(remoteDB);
  initialized = true;
  setStatus({ phase: "synced", text: "Firebase conectado", detail: "Datos cargados" });

  unsubscribeRemote = listenRemoteDB(
    (remoteDB, metadata) => {
      if (!remoteDB) return;
      db = migrate(remoteDB);
      initialized = true;
      const source = metadata?.fromCache ? "cache local de Firebase" : "Firestore";
      setStatus({ phase: "synced", text: "Sincronizado", detail: `Fuente: ${source}` });
      remoteChangeHandler(db);
    },
    (error) => {
      console.error("[Firebase] listener error", error);
      setStatus({ phase: "error", text: "Error de Firebase", detail: error?.message || "No se pudo sincronizar" });
    }
  );

  return db;
}

export function setDB(next) {
  db = migrate(next);
  queueSave();
  return db;
}

export function patch(mutator) {
  const current = getDB();
  const maybe = mutator(current);
  setDB(maybe || current);
}

function queueSave() {
  if (!initialized) return;
  clearTimeout(saveTimer);
  setStatus({ phase: "saving", text: "Guardando", detail: "Subiendo cambios a Firebase..." });

  const seq = ++savingSeq;
  saveTimer = setTimeout(async () => {
    try {
      await saveRemoteDB(db);
      if (seq === savingSeq) {
        setStatus({ phase: "synced", text: "Guardado", detail: "Cambios en Firestore" });
      }
    } catch (error) {
      console.error("[Firebase] save failed", error);
      setStatus({ phase: "error", text: "No se pudo guardar", detail: error?.message || "Revisa reglas/permisos" });
    }
  }, 250);
}

export async function resetDB() {
  const next = seedDB();
  db = next;
  initialized = true;
  setStatus({ phase: "saving", text: "Reiniciando", detail: "Reemplazando datos en Firebase..." });
  await replaceRemoteDB(db);
  setStatus({ phase: "synced", text: "Reiniciado", detail: "Base limpia en Firestore" });
  return db;
}
