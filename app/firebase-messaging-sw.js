// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// ▼▼▼ 請填入您的 firebaseConfig (跟您程式碼裡的一樣) ▼▼▼
const firebaseConfig = {
  apiKey: "AIzaSyA4rX2ZjJqto9Eyv4G_xdlAdYAH3uJCMBo",
  authDomain: "reviewtest-f016d.firebaseapp.com",
  projectId: "reviewtest-f016d",
  storageBucket: "reviewtest-f016d.firebasestorage.app",
  messagingSenderId: "170552561842",
  appId: "1:170552561842:web:a204553261698d7311b9ab",
  measurementId: "G-RQ20L5H9S4"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// 設定背景通知的顯示樣式
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] 收到背景訊息 ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/review_test_web/app/assets/images/icon.png' // 設定通知圖示
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});