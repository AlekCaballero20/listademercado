import { firestore } from "./firebase.config.js";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export const MARKET_DOC_REF = doc(firestore, "marketChecklist", "main");

function cleanPayload(db) {
  return JSON.parse(JSON.stringify(db));
}

function getDataFromSnapshot(snapshot) {
  if (!snapshot.exists()) return null;
  const raw = snapshot.data();
  return raw?.data || raw?.db || null;
}

export async function ensureRemoteDB(defaultDB) {
  const snapshot = await getDoc(MARKET_DOC_REF);
  const remoteDB = getDataFromSnapshot(snapshot);
  if (remoteDB) return remoteDB;

  const firstDB = cleanPayload(defaultDB);
  await setDoc(MARKET_DOC_REF, {
    data: firstDB,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    appVersion: firstDB.version || 1,
  });
  return firstDB;
}

export function listenRemoteDB(onData, onError) {
  return onSnapshot(
    MARKET_DOC_REF,
    (snapshot) => onData(getDataFromSnapshot(snapshot), snapshot.metadata),
    onError
  );
}

export async function saveRemoteDB(db) {
  const payload = cleanPayload(db);
  await setDoc(MARKET_DOC_REF, {
    data: payload,
    updatedAt: serverTimestamp(),
    appVersion: payload.version || 1,
  }, { merge: true });
}

export async function replaceRemoteDB(db) {
  const payload = cleanPayload(db);
  await setDoc(MARKET_DOC_REF, {
    data: payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    appVersion: payload.version || 1,
  });
}
