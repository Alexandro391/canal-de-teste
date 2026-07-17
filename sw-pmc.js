/* ═══════════════════════════════════════════════════════════
   Service Worker — PMC · Painel de Monitoramento de Chamados
   Cache só do "shell" do app (HTML/manifest/ícone).
   Os dados dos chamados (Google Sheets / Apps Script) NUNCA
   são cacheados aqui — sempre buscados direto da rede, senão
   o painel mostraria chamados desatualizados.
   ═══════════════════════════════════════════════════════════ */
const CACHE_VERSION = '2026-07-17-7'; // troque essa data ao publicar uma nova versão do painel
const CACHE_NAME = 'pmc-shell-' + CACHE_VERSION;
const APP_SHELL = [
  './painel-pmc.html',
  './manifest-pmc.json',
  './icon-192.png'
];

/* ── FIREBASE CLOUD MESSAGING (notificações push) ──
   Importado direto aqui dentro, em vez de um SW separado, pra não
   disputar o mesmo escopo com este Service Worker do PWA. */
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyA_HJfDMyPEYewfbGgQIJ90LmUvYK36OKE",
  authDomain: "pmc-fmc-push.firebaseapp.com",
  projectId: "pmc-fmc-push",
  storageBucket: "pmc-fmc-push.firebasestorage.app",
  messagingSenderId: "1020191800841",
  appId: "1:1020191800841:web:ffa56e8854c6c72fad82d8"
});

const messaging = firebase.messaging();

/* Notificação recebida com o painel FECHADO ou em segundo plano.
   IMPORTANTE: o Apps Script agora manda a mensagem só em "data"
   (sem o campo "notification"). Isso é o que garante que ESTE
   handler seja chamado — se "notification" viesse preenchido, o
   navegador exibiria a notificação sozinho, sem passar por aqui,
   ignorando vibrate/tag/requireInteraction abaixo. */
messaging.onBackgroundMessage((payload) => {
  const titulo = payload.data?.title || 'Novo chamado CAP Digital';
  const opcoes = {
    body: payload.data?.body || 'Um novo chamado foi registrado.',
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: 'pmc-chamado-' + Date.now(), // cada chamado gera notificação própria (não empilha por cima)
    requireInteraction: payload.data?.urgencia === 'Alta',
    data: payload.data || {}
  };
  self.registration.showNotification(titulo, opcoes);
});

// Ao clicar na notificação, abre ou foca o painel
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('painel-pmc.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./painel-pmc.html');
      }
    })
  );
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  // Nunca intercepta/cacheia dados ao vivo: planilha (gviz) e Apps Script
  if (url.includes('docs.google.com') || url.includes('script.google.com')) {
    return; // deixa passar direto pra rede
  }
  // Shell do app: network-first, com fallback pro cache se ficar offline
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
