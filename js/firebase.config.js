import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCw4TCRaLA-qe0A-w5YGGMpf3AIeQPKBvE",
  authDomain: "market-checklist-da957.firebaseapp.com",
  projectId: "market-checklist-da957",
  storageBucket: "market-checklist-da957.firebasestorage.app",
  messagingSenderId: "119653477318",
  appId: "1:119653477318:web:37398c003ad57dd63b20c7"
};

export const app = initializeApp(firebaseConfig);
export const firestore = getFirestore(app);
export const auth = getAuth(app);
