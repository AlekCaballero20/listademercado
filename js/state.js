import * as storage from "./storage.local.js";

let db = storage.load();

export function getDB() { return db; }

export function setDB(next) {
  db = next;
  storage.save(db);
}

export function patch(mutator) {
  // mutator recibe db y lo modifica (o devuelve uno nuevo)
  const current = getDB();
  const maybe = mutator(current);
  setDB(maybe || current);
}

export function resetDB() {
  storage.hardReset();
  db = storage.load();
  return db;
}