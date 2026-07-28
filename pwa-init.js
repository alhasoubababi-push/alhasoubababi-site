/* =========================================================
   الحسوبابابي — PWA Init
   تسجيل الـ Service Worker + زر التثبيت + إشعارات Push
   ========================================================= */
(function () {
  'use strict';

  // مفتاح VAPID العام الحقيقي (تم توليده فعلياً — المفتاح الخاص محفوظ في متغيرات بيئة السيرفر فقط)
  const VAPID_PUBLIC_KEY = 'BAeTPb3wIV8vm9_H3WV8SQKX4ENei-JfXN4d2X3QMZLIvNPDZ8K2JitfHe9k4tm1M_9fSNBPqafkun_V6q7wwpE';

  // رابط سيرفر الإشعارات الفعلي (منشور على Vercel)
  const PUSH_SERVER_URL = 'https://alhasoubababi-push.vercel.app';

  /* -----------------------------------------------------------
     1) تسجيل الـ Service Worker
  ----------------------------------------------------------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then((reg) => {
          console.log('[PWA] Service Worker مسجّل:', reg.scope);

          // التحقق من وجود تحديث جديد للموقع
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateToast(reg);
              }
            });
          });
        })
        .catch((err) => console.warn('[PWA] فشل تسجيل Service Worker:', err));
    });
  }

  // تنبيه بسيط عند توفر نسخة جديدة من الموقع
  function showUpdateToast(reg) {
    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.style.cssText = `
      position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
      background:#0B0F19;color:#fff;padding:12px 18px;border-radius:12px;
      font-family:'Cairo',sans-serif;font-size:13.5px;z-index:2000;
      display:flex;align-items:center;gap:12px;box-shadow:0 10px 30px rgba(0,0,0,.3);
    `;
    toast.innerHTML = `يتوفر تحديث جديد للموقع
      <button style="background:#00A8E8;color:#fff;border:none;padding:6px 14px;border-radius:8px;font-weight:800;cursor:pointer;">تحديث الآن</button>`;
    toast.querySelector('button').onclick = () => {
      reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    };
    document.body.appendChild(toast);
  }

  /* -----------------------------------------------------------
     2) زر "تثبيت التطبيق" المخصص
  ----------------------------------------------------------- */
  let deferredPrompt = null;
  const installBtn = document.getElementById('pwaInstallBtn');

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    if (installBtn) installBtn.hidden = false;
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] قرار المستخدم بشأن التثبيت:', outcome);
      deferredPrompt = null;
      installBtn.hidden = true;
    });
  }

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] تم تثبيت التطبيق بنجاح');
    if (installBtn) installBtn.hidden = true;
  });

  // إخفاء الزر افتراضياً إن كان التطبيق مثبتاً بالفعل (standalone mode)
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
    if (installBtn) installBtn.hidden = true;
  }

  /* -----------------------------------------------------------
     3) طلب إذن الإشعارات والاشتراك في Push
  ----------------------------------------------------------- */
  const pushBtn = document.getElementById('pwaPushBtn');

  if (pushBtn) {
    if (!('Notification' in window) || !('PushManager' in window)) {
      pushBtn.hidden = true;
    } else if (Notification.permission === 'granted') {
      pushBtn.hidden = true; // مشترك بالفعل غالباً
    }

    pushBtn.addEventListener('click', async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          alert('تم رفض إذن الإشعارات. يمكنك تفعيله لاحقاً من إعدادات المتصفح.');
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        // أرسل الاشتراك لسيرفرك لحفظه وإرسال إشعارات لاحقاً
        await fetch(`${PUSH_SERVER_URL}/api/save-subscription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription),
        });

        pushBtn.hidden = true;
        console.log('[PWA] تم الاشتراك في الإشعارات بنجاح');
      } catch (err) {
        console.warn('[PWA] فشل الاشتراك في الإشعارات:', err);
      }
    });
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }
})();
