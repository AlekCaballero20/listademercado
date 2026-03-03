// pwa.js — registro SW + UX mínimo de instalación (sin ponerse intenso)
export async function registerPWA() {
  // Service Worker (solo en https o localhost)
  if (!('serviceWorker' in navigator)) return;

  try {
    await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
  } catch (err) {
    // Si falla, la app igual funciona; solo no habrá offline cache.
    console.warn('[PWA] SW register failed', err);
  }

  // Prompt de instalación (Android / Chrome principalmente)
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallToast(async () => {
      try {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } finally {
        deferredPrompt = null;
        hideInstallToast();
      }
    });
  });

  // Si ya está instalada, no muestres nada
  window.addEventListener('appinstalled', () => hideInstallToast());
}

function showInstallToast(onInstall) {
  if (document.querySelector('#pwaToast')) return;

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (isStandalone) return;

  const el = document.createElement('div');
  el.id = 'pwaToast';
  el.className = 'pwaToast';
  el.innerHTML = `
    <div class="row">
      <div>
        <div style="font-weight:900">Instálala como app</div>
        <div class="sub">Funciona offline y queda como icono en el celular.</div>
      </div>
      <div class="actions">
        <button class="mini" id="pwaInstallBtn">Instalar</button>
        <button class="ghost mini" id="pwaCloseBtn">Luego</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  el.querySelector('#pwaInstallBtn').addEventListener('click', onInstall);
  el.querySelector('#pwaCloseBtn').addEventListener('click', hideInstallToast);
}

function hideInstallToast() {
  document.querySelector('#pwaToast')?.remove();
}
