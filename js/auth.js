import { auth } from "./firebase.config.js";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

export const ALLOWED_EMAILS = [
  "alekcaballeromusic@gmail.com",
  "catalina.medina.leal@gmail.com",
];

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export function isAllowedEmail(email) {
  return ALLOWED_EMAILS.includes(String(email || "").toLowerCase());
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function loginWithGoogle() {
  return signInWithPopup(auth, provider);
}

export async function logout() {
  return signOut(auth);
}
