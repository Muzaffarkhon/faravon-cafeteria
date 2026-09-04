// Faravon Cafeteria PWA Service Worker
// Намеренно минимальный: НИЧЕГО не кэшируем (нет офлайн-режима). Задача SW —
// только сделать приложение «устанавливаемым». Перехватываем как можно меньше,
// чтобы случайно не кэшировать авторизованные страницы / OTP / купоны на общем
// устройстве и не ломать SSE.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  // Только свой origin.
  if (url.origin !== self.location.origin) return;
  // Не трогаем API, SSE-поток и вход — пусть идут напрямую в сеть.
  if (url.pathname.startsWith('/api/') || url.pathname === '/login') return;
  // Обрабатываем только навигации по страницам (не статику, не data/blob).
  if (req.mode !== 'navigate') return;

  // Сеть напрямую, без записи в кэш. При офлайне отдаём управление браузеру
  // (его собственная страница «нет сети»).
  event.respondWith(fetch(req));
});
