/* 가족 일정 — 앱 셸 캐시: index.html=네트워크 우선(항상 최신, 오프라인 폴백), 나머지=stale-while-revalidate */
var CACHE = 'fam-shell-v16';
var SHELL = ['./', './index.html', './push-config.js', './fs-calc.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './bass.jpg', './tl/bass.jpg', './tl/book.jpg', './tl/news.jpg', './tl/theory.jpg', './tl/gym.jpg'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return; // GAS API는 항상 네트워크
  // 앱 본문(index.html)은 네트워크 우선 — 배포 즉시 반영, 오프라인이면 캐시로
  if (e.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) {
    e.respondWith(
      fetch(e.request).then(function (res) {
        if (res && res.ok) {
          var clone = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, clone); });
        }
        return res;
      }).catch(function () {
        return caches.match(e.request).then(function (c) { return c || caches.match('./index.html'); });
      })
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      var fetched = fetch(e.request).then(function (res) {
        if (res && res.ok) {
          var clone = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, clone); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || fetched;
    })
  );
});

/* 🔔 웹푸시(FCM) — push-config.js에 값이 있을 때만. 백그라운드 메시지 → 알림 표시, 탭 → 앱 열기 */
try { importScripts('push-config.js'); } catch (e) {}
if (self.FAM_PUSH && self.FAM_PUSH.config) {
  try {
    importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');
    firebase.initializeApp(self.FAM_PUSH.config);
    var fmsg = firebase.messaging();
    fmsg.onBackgroundMessage(function (payload) {
      var n = (payload && payload.notification) || {};
      // FCM webpush notification 필드가 있으면 브라우저가 이미 표시함 — 중복 방지로 data-only일 때만 직접 표시
      if (n.title) return;
      var d = (payload && payload.data) || {};
      return self.registration.showNotification(d.title || '가족 일정', { body: d.body || '', icon: './icon-192.png', tag: 'fam-goal', data: { link: d.link || './' } });
    });
  } catch (e) {}
}
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var link = (e.notification.data && e.notification.data.link) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { if ('focus' in cs[i]) return cs[i].focus(); }
    if (clients.openWindow) return clients.openWindow(link);
  }));
});
