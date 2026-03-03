import { DB_KEY, seedDB, migrate } from "./models.js";

export function load() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    const db = seedDB();
    save(db);
    return db;
  }
  try {
    const parsed = JSON.parse(raw);
    const db = migrate(parsed);
    // por si migrate cambió algo
    save(db);
    return db;
  } catch {
    const db = seedDB();
    save(db);
    return db;
  }
}

export function save(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function hardReset() {
  localStorage.removeItem(DB_KEY);
}