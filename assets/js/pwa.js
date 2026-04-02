/* ============================================================
   LOOSE ITINERARY — pwa.js
   PWA registration, install prompt handling
   ============================================================ */

// ── Service Worker Registration ──

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    // Resolve path relative to site root regardless of which page registers the SW
    const isInSubdir = window.location.pathname.includes('/trips/');
    const swPath     = isInSubdir ? '../sw.js' : './sw.js';
    const swScope    = isInSubdir ? '../'      : './';

    navigator.serviceWorker
      .register(swPath, { scope: swScope })
      .then(reg => {
        console.log('[PWA] Service worker registered:', reg.scope);

        // Check for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New content available — could show a toast here if desired
              console.log('[PWA] New content available. Refresh to update.');
            }
          });
        });
      })
      .catch(err => {
        // Silently fail for local file:// protocol
        if (!err.message.includes('file://')) {
          console.warn('[PWA] Service worker registration failed:', err);
        }
      });
  });
}

// ── Install Prompt ──

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  // Could show a custom install button here
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  console.log('[PWA] App installed');
});

// Initialize
registerServiceWorker();
