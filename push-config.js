/* 🔔 웹푸시 공개 설정 (Firebase 웹 앱 config + VAPID 공개키) — 시크릿 아님. 값이 없으면(null) 알림 기능 전체가 꺼진 상태.
   채우는 법: Firebase 콘솔 › 프로젝트 설정 › 일반(웹 앱 config) + 클라우드 메시징(웹 푸시 인증서 키 쌍). 서버 쪽 서비스 계정 키는 GAS Script Properties(FCM_SA_JSON·FCM_PROJECT_ID)에만. */
self.FAM_PUSH = null;
/* 예:
self.FAM_PUSH = {
  config: { apiKey: '…', authDomain: '<pid>.firebaseapp.com', projectId: '<pid>', messagingSenderId: '…', appId: '…' },
  vapid: '<웹 푸시 인증서 공개키>'
};
*/
