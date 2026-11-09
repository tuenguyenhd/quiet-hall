// Offline support (service worker) + "Install app" button.

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

export function setupPwa(installBtn: HTMLElement, onInstalled: () => void) {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    addEventListener('load', async () => {
      try {
        await navigator.serviceWorker.register('/sw.js');
        const reg = await navigator.serviceWorker.ready;
        // cache everything this page already loaded (hashed JS/CSS, fonts) for offline use
        const urls = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin) && !u.includes('/ws') && !u.includes('/api/'));
        reg.active?.postMessage({ type: 'cache', urls: [...new Set(urls)] });
      } catch {
        /* offline support unavailable (e.g. http on LAN) */
      }
    });
  }

  let deferred: InstallEvent | null = null;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    installBtn.classList.remove('hidden');
  });
  installBtn.addEventListener('click', async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    installBtn.classList.add('hidden');
    if (outcome === 'accepted') onInstalled();
  });
  addEventListener('appinstalled', () => installBtn.classList.add('hidden'));
}

export const isStandalone = () => matchMedia('(display-mode: standalone)').matches;
