import { registerPWA } from "./pwa.js";
import { bindActions } from "./ui.actions.js";
import { renderAll, renderAuthState, renderBootState, renderSyncStatus } from "./ui.render.js";
import { getDB, initState, onSyncStatus } from "./state.js";
import { isAllowedEmail, loginWithGoogle, logout, watchAuth } from "./auth.js";

let actionsBound = false;

registerPWA();
onSyncStatus(renderSyncStatus);
renderBootState("Conecta tu cuenta para cargar el mercado compartido.");

document.querySelector("#btnLogin")?.addEventListener("click", async () => {
  try {
    await loginWithGoogle();
  } catch (error) {
    console.error("[Auth] login failed", error);
    renderBootState("No se pudo iniciar sesión con Google. Revisa que Authentication esté activo.", "error");
  }
});

document.querySelector("#btnLogout")?.addEventListener("click", async () => {
  try {
    await logout();
    location.reload();
  } catch (error) {
    console.error("[Auth] logout failed", error);
  }
});

watchAuth(async (user) => {
  renderAuthState(user);

  if (!user) {
    renderBootState("Inicia sesión con Google para usar la lista compartida.");
    return;
  }

  if (!isAllowedEmail(user.email)) {
    renderBootState(`La cuenta ${user.email} no está autorizada para esta lista.`, "error");
    return;
  }

  try {
    renderBootState("Cargando datos desde Firebase...");
    const db = await initState({ onRemoteChange: renderAll });
    if (!actionsBound) {
      bindActions();
      actionsBound = true;
    }
    renderAll(db || getDB());
  } catch (error) {
    console.error("[App] init failed", error);
    renderBootState(error?.message || "No se pudo cargar Firebase.", "error");
  }
});
