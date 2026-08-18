/* 🔔 웹푸시 공개 설정 (Firebase 웹 앱 config + VAPID 공개키) — 시크릿 아님(브라우저에 노출되는 값). 값이 없으면(null) 알림 기능 전체가 꺼진 상태.
   서버 쪽 서비스 계정 키는 GAS Script Properties(FCM_SA_JSON·FCM_PROJECT_ID)에만. 프로젝트: fam-push (2026-08-18) */
self.FAM_PUSH = {
  config: {
    apiKey: 'AIzaSyA8Wj5W1tCjvD3SfwwkHG96ESVPLiNHc8U',
    authDomain: 'fam-push-91a7f.firebaseapp.com',
    projectId: 'fam-push-91a7f',
    storageBucket: 'fam-push-91a7f.firebasestorage.app',
    messagingSenderId: '497532083891',
    appId: '1:497532083891:web:79b8f6649bcce56b045ac6'
  },
  vapid: 'BNgONJKwPb2RsYkaH6oc_bHwRVrhmY6Kn0H1FEw4ZIP6y8MevoH745q_l2D0aDZHND4iQaMlR_w_1JO2fF30kZM'
};
