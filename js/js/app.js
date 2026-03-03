import { registerPWA } from "./pwa.js";
import { getDB } from "./state.js";
import { bindActions } from "./ui.actions.js";
import { renderAll } from "./ui.render.js";

registerPWA();
bindActions();
renderAll(getDB());
