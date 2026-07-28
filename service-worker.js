/* =========================================================
   الحسوبابابي — Service Worker
   استراتيجية: App Shell + Offline fallback + Push Notifications
   ========================================================= */

// غيّر هذا الرقم مع كل نشر جديد للموقع لإجبار تحديث الكاش
const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE = `alhasoubababi-static-${CACHE_VERSION}`;
const PAGES_CACHE = `alhasoubababi-pages-${CACHE_VERSION}`;
const IMAGES_CACHE = `alhasoubababi-images-${CACHE_VERSION}`;

// رابط سيرفر الإشعارات الفعلي (منشور على Vercel) — نفس الرابط المستخدم في pwa-init.js
const PUSH_SERVER_URL = 'https://alhasoubababi-push.vercel.app';

// ملفات الـ App Shell الأساسية التي يجب تخزينها فور التثبيت
const APP_SHELL = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

/* -----------------------------------------------------------
   INSTALL — تخزين الـ App Shell
----------------------------------------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

/* -----------------------------------------------------------
   ACTIVATE — حذف نسخ الكاش القديمة
----------------------------------------------------------- */
self.addEventListener('activate', (event) => {
  const currentCaches = [STATIC_CACHE, PAGES_CACHE, IMAGES_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => !currentCaches.includes(key))
            .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* -----------------------------------------------------------
   FETCH — استراتيجيات مختلفة حسب نوع الطلب
----------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1) طلبات التنقل بين الصفحات (HTML): Network First مع fallback للكاش ثم offline.html
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, PAGES_CACHE));
    return;
  }

  // 2) الصور: Cache First (أسرع، والصور نادراً ما تتغيّر)
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMAGES_CACHE));
    return;
  }

  // 3) الخطوط وCSS/JS الثابتة: Stale While Revalidate
  if (['style', 'script', 'font'].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // 4) أي شيء آخر: جرّب الشبكة ثم الكاش
  event.respondWith(networkFirst(request, STATIC_CACHE));
});

/* -----------------------------------------------------------
   استراتيجيات التخزين المؤقت
----------------------------------------------------------- */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const offline = await caches.match('/offline.html');
      if (offline) return offline;
    }
    return new Response('تعذر الاتصال بالشبكة ولا توجد نسخة مخزّنة.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    return new Response('', { status: 404 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || networkPromise;
}

/* -----------------------------------------------------------
   MESSAGE — استقبال أوامر من الصفحة (مثل زر "تحديث الآن")
----------------------------------------------------------- */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

/* -----------------------------------------------------------
   PUSH — استقبال إشعارات من السيرفر
   يتطلب سيرفر backend يرسل الإشعار عبر Web Push + مفاتيح VAPID
----------------------------------------------------------- */
self.addEventListener('push', (event) => {
  let data = { title: 'الحسوبابابي', body: 'لديك تحديث جديد', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (err) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    dir: 'rtl',
    lang: 'ar',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'فتح' },
      { action: 'close', title: 'إغلاق' },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

/* -----------------------------------------------------------
   NOTIFICATION CLICK — فتح الصفحة عند الضغط على الإشعار
----------------------------------------------------------- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      })
  );
});

/* -----------------------------------------------------------
   SUBSCRIPTION CHANGE — تجديد الاشتراك تلقائياً عند انتهاء صلاحيته
----------------------------------------------------------- */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options)
      .then((subscription) => {
        return fetch(`${PUSH_SERVER_URL}/api/save-subscription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription),
        });
      })
  );
});
