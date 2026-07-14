// =====================================================================
// Service worker minimal
// =====================================================================
// L'application nécessite une connexion internet pour fonctionner
// (toutes les données viennent de Supabase) : ce service worker ne met
// donc pas en place de mode hors ligne complet. Son seul rôle est de
// satisfaire la condition technique requise par iOS/Android pour
// autoriser l'installation de l'app sur l'écran d'accueil (PWA
// installable), et de mettre en cache l'app shell pour un chargement
// plus rapide au second lancement.

const CACHE_NAME = 'courses-preferences-v3';

const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/supabase-client.js',
  './js/auth.js',
  './js/image-utils.js',
  './js/api.js',
  './js/a11y.js',
  './js/announce.js',
  './js/app.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {
      // Le cache de l'app shell est une optimisation, pas une nécessité.
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Uniquement les fichiers de l'app shell (même origine) : les appels
  // à l'API Supabase doivent toujours passer par le réseau.
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
