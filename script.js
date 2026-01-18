import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, query, orderBy, limit, onSnapshot, getDocs, getDoc, doc, where, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ▼▼▼ Firebase Config (使用你提供的) ▼▼▼
const firebaseConfig = {
  apiKey: "AIzaSyA4rX2ZjJqto9Eyv4G_xdlAdYAH3uJCMBo",
  authDomain: "reviewtest-f016d.firebaseapp.com",
  projectId: "reviewtest-f016d",
  storageBucket: "reviewtest-f016d.firebasestorage.app",
  messagingSenderId: "170552561842",
  appId: "1:170552561842:web:a204553261698d7311b9ab",
  measurementId: "G-RQ20L5H9S4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const ADMIN_EMAIL = "ulysses950710@gmail.com";

// 全域變數
window.currentUser = null;
window.currentUnitData = null;
window.currentUnitId = null;
let unsubscribeChat = null;

// ==========================
// 1. 導航系統 (History API 支援滑動返回)
// ==========================

// 初始化：處理重新整理或首次載入
window.addEventListener('load', () => {
    // 預設替換當前歷史紀錄為 home
    history.replaceState({ page: 'home-screen' }, '', '');
    renderPage('home-screen');
});

// 監聽瀏覽器上一頁/下一頁 (包含 iPhone 手勢)
window.onpopstate = (event) => {
    if (event.state && event.state.page) {
        renderPage(event.state.page);
    } else {
        renderPage('home-screen');
    }
};

// 核心跳轉函數
function navigateTo(pageId, data = {}) {
    history.pushState({ page: pageId, ...data }, '', `?page=${pageId.replace('-screen','')}`);
    renderPage(pageId);
}

// 渲染頁面 UI
function renderPage(pageId) {
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(pageId);
    if(target) target.classList.add('active');

    // 處理 Header 狀態
    const backBtn = document.getElementById('back-btn');
    const leftActionBtn = document.getElementById('left-action-btn');
    const title = document.getElementById('header-title');

    if (pageId === 'home-screen') {
        backBtn.style.display = 'none';
        leftActionBtn.style.display = 'flex';
        title.innerText = '首頁';
    } else {
        backBtn.style.display = 'flex';
        leftActionBtn.style.display = 'none';
        if(pageId === 'subject-screen') title.innerText = '單元列表'; 
    }
}

document.getElementById('back-btn').onclick = () => {
    history.back();
};

// ==========================
// 2. 頁面邏輯
// ==========================

document.getElementById('btn-math').onclick = () => goToSubject('math');
document.getElementById('btn-science').onclick = () => goToSubject('science');

async function goToSubject(subjectId) {
    navigateTo('subject-screen');
    const container = document.getElementById('unit-list-container');
    container.innerHTML = '<p style="text-align:center;">載入中...</p>';
    document.getElementById('header-title').innerText = (subjectId === 'math' ? '數學' : '理化') + '單元列表';

    const themeColor = subjectId === 'math' ? '#4A90E2' : '#50E3C2';
    const q = query(collection(db, 'units'), where('subject', '==', subjectId), orderBy('order', 'asc'));

    try {
        const snap = await getDocs(q);
        if (snap.empty) { container.innerHTML = '<p style="text-align:center;">無單元</p>'; return; }
        let html = '';
        snap.forEach(doc => {
            const data = doc.data();
            html += `
                <div class="unit-card" onclick="window.triggerUnit('${doc.id}')">
                    <div class="unit-icon" style="background-color: ${themeColor};">${subjectId === 'math' ? '📐' : '🧪'}</div>
                    <div><h3>${data.title}</h3><p>點擊查看題目與詳解</p></div>
                </div>`;
        });
        container.innerHTML = html;
    } catch (e) { console.error(e); container.innerHTML = '讀取錯誤'; }
}

window.triggerUnit = (unitId) => {
    goToUnit(unitId);
};

async function goToUnit(unitId) {
    window.currentUnitId = unitId;
    navigateTo('unit-screen');
    document.getElementById('header-title').innerText = '載入中...';
    
    switchTab('question');

    try {
        const docSnap = await getDoc(doc(db, 'units', unitId));
        if (docSnap.exists()) {
            window.currentUnitData = docSnap.data();
            document.getElementById('header-title').innerText = window.currentUnitData.title;
            renderPdfViewer('question', window.currentUnitData.questionPdf);
            renderPdfViewer('answer', window.currentUnitData.answerPdf);
        } else { alert('找不到單元'); history.back(); }
    } catch (e) { console.error(e); alert('讀取失敗'); }
    
    loadComments(unitId);
}

// ==========================
// 3. 單元詳細頁
// ==========================

document.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => switchTab(t.dataset.tab);
});

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
    
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active-panel'));
    const target = document.getElementById(`panel-${tabName}`);
    target.classList.add('active-panel');
}

function renderPdfViewer(type, url) {
    const viewer = document.getElementById(`viewer-${type}`);
    const dlBtn = document.getElementById(`dl-${type}`);
    
    dlBtn.onclick = () => { if(url) window.open(url, '_blank'); };

    if (!url) {
        viewer.innerHTML = `<div class="center-msg">尚未上傳檔案</div>`;
        dlBtn.style.display = 'none';
        return;
    }
    dlBtn.style.display = 'block';
    
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
        viewer.innerHTML = `
            <div class="center-msg">
                <p>手機版建議直接開啟 PDF 閱讀</p>
                <button class="btn btn-blue" style="width:auto;" onclick="window.open('${url}', '_blank')">📄 點此開啟 PDF</button>
            </div>`;
    } else {
        viewer.innerHTML = `<iframe src="${url}" class="pdf-frame"></iframe>`;
    }
}

// 留言載入
function loadComments(unitId) {
    if (unsubscribeChat) unsubscribeChat();
    const q = query(collection(db, 'units', unitId, 'comments'), orderBy('createdAt', 'desc'));
    const listEl = document.getElementById('chat-list');

    unsubscribeChat = onSnapshot(q, (snap) => {
        if (snap.empty) {
            listEl.innerHTML = '<div style="text-align:center;color:#999;margin-top:20px;">還沒有留言，來搶頭香吧！</div>';
            return;
        }
        let html = '';
        snap.forEach(doc => {
            const data = doc.data();
            const name = data.userName || data.userEmail.split('@')[0];
            html += `
                <div class="comment-item">
                    <div class="comment-user">${name}:</div>
                    <div class="comment-text">${data.text}</div>
                </div>`;
        });
        listEl.innerHTML = html;
    });
}

// 發送留言
document.getElementById('comment-input').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') sendComment();
});
document.getElementById('btn-send-comment').onclick = sendComment;

async function sendComment() {
    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    if (!text) return;
    if (!window.currentUser) return alert('請先登入');

    const user = window.currentUser;
    const name = user.displayName || user.email.split('@')[0];

    try {
        await addDoc(collection(db, 'units', window.currentUnitId, 'comments'), {
            text: text,
            userEmail: user.email,
            userName: name,
            createdAt: serverTimestamp()
        });
        
        await addDoc(collection(db, 'notifications'), {
            type: 'comment',
            title: `💬 ${window.currentUnitData.title} 有新留言`,
            body: `${name}: ${text}`,
            unitId: window.currentUnitId,
            targetTab: 'chat',
            createdAt: serverTimestamp(),
            senderEmail: user.email
        });
        input.value = '';
    } catch (e) { console.error(e); alert('留言失敗'); }
}

// ==========================
// 4. 身份驗證 (Auth) - 已更新
// ==========================

// 監聽狀態
onAuthStateChanged(auth, (user) => {
    window.currentUser = user;
    updateUI(user);
    if(user) listenNotifications();
});

function updateUI(user) {
    const inputArea = document.getElementById('chat-input-area');
    const authHint = document.getElementById('chat-auth-hint');
    const loginLabel = document.getElementById('login-label');
    const settingsBtn = document.getElementById('left-action-btn');

    if (user) {
        // 已登入
        inputArea.style.display = 'flex';
        authHint.style.display = 'none';
        loginLabel.style.display = 'none';
        
        const displayName = user.displayName || user.email.split('@')[0];
        document.getElementById('settings-user-info').innerText = `目前登入：${displayName} (${user.email})`;
        document.getElementById('greeting-text').innerText = `嗨! ${displayName} 同學`;

        if (user.email === ADMIN_EMAIL) {
            document.getElementById('teacher-section').style.display = 'block';
            fetchUnitsForAdmin();
        } else {
            document.getElementById('teacher-section').style.display = 'none';
        }
        
        settingsBtn.onclick = () => {
            document.getElementById('settings-modal').style.display = 'flex';
        };

    } else {
        // 未登入
        inputArea.style.display = 'none';
        authHint.style.display = 'flex';
        loginLabel.style.display = 'inline';
        document.getElementById('greeting-text').innerText = "嗨! 同學 選擇科目來練習吧";
        
        settingsBtn.onclick = openAuthModal;
    }
}

// Auth Modal 控制邏輯
const authModal = document.getElementById('auth-modal');
const loginView = document.getElementById('login-view');
const registerView = document.getElementById('register-view');
const authTitle = document.getElementById('auth-title');

function openAuthModal() { 
    authModal.style.display = 'flex';
    showLoginView(); // 每次打開預設顯示登入
}

// 切換為註冊
document.getElementById('go-to-register').onclick = () => {
    loginView.classList.add('hidden');
    registerView.classList.remove('hidden');
    authTitle.innerText = "建立新帳戶";
};

// 切換為登入
document.getElementById('go-to-login').onclick = showLoginView;

function showLoginView() {
    registerView.classList.add('hidden');
    loginView.classList.remove('hidden');
    authTitle.innerText = "歡迎回來";
}

document.getElementById('close-auth').onclick = () => authModal.style.display = 'none';
document.getElementById('btn-quick-login').onclick = openAuthModal; 

// --- 執行登入 ---
document.getElementById('btn-do-login').onclick = async () => {
    const email = document.getElementById('login-email').value;
    const pwd = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-do-login');

    if(!email || !pwd) return alert("請輸入帳號密碼");

    btn.innerText = "登入中...";
    try {
        await signInWithEmailAndPassword(auth, email, pwd);
        authModal.style.display = 'none';
    } catch(e) { 
        alert("登入失敗: " + e.message); 
    } finally {
        btn.innerText = "登入";
    }
};

// --- 執行註冊 ---
document.getElementById('btn-do-register').onclick = async () => {
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const pwd = document.getElementById('reg-password').value;
    const confirmPwd = document.getElementById('reg-confirm-password').value;
    const btn = document.getElementById('btn-do-register');

    if (!name || !email || !pwd) return alert("請填寫所有欄位");
    if (pwd !== confirmPwd) return alert("兩次密碼輸入不一致");
    if (pwd.length < 6) return alert("密碼長度需至少 6 碼");

    btn.innerText = "註冊中...";
    btn.disabled = true;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pwd);
        const user = userCredential.user;
        
        // 更新使用者名稱 (displayName)
        await updateProfile(user, { displayName: name });
        
        alert(`註冊成功！歡迎 ${name}`);
        authModal.style.display = 'none';
        
        // 強制更新一次 UI 顯示名字
        updateUI(user);

    } catch(e) { 
        let msg = e.message;
        if(msg.includes('email-already-in-use')) msg = "此 Email 已被註冊";
        alert("註冊失敗: " + msg); 
    } finally {
        btn.innerText = "註冊";
        btn.disabled = false;
    }
};

// 登出
document.getElementById('btn-logout').onclick = async () => {
    await signOut(auth);
    document.getElementById('settings-modal').style.display = 'none';
};
document.getElementById('btn-cancel-settings').onclick = () => {
    document.getElementById('settings-modal').style.display = 'none';
};

// ==========================
// 5. 通知系統 (維持不變)
// ==========================

document.getElementById('notif-btn').onclick = async () => {
    document.getElementById('notification-modal').style.display = 'flex';
    const listEl = document.getElementById('notif-list');
    listEl.innerHTML = '<p class="loading-text">載入中...</p>';

    try {
        const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(20));
        const snap = await getDocs(q);
        if (snap.empty) {
            listEl.innerHTML = '<p style="text-align: center; margin-top: 20px;">目前沒有新通知</p>';
            return;
        }
        
        let html = '';
        const lastRead = parseInt(localStorage.getItem('lastReadTime') || '0');
        
        snap.forEach(doc => {
            const data = doc.data();
            if (window.currentUser && data.senderEmail === window.currentUser.email) return;

            const isNew = (data.createdAt?.toMillis() || 0) > lastRead;
            const date = data.createdAt ? new Date(data.createdAt.toMillis()).toLocaleString() : '';
            
            html += `
                <div class="notif-item" onclick="window.handleNotificationClick('${data.unitId}', '${data.targetTab}')">
                    <div class="notif-title">
                        ${isNew ? '<span class="new-badge"></span>' : ''}
                        ${data.title}
                    </div>
                    <div class="notif-body">${data.body}</div>
                    <div class="notif-time">${date}</div>
                </div>`;
        });
        listEl.innerHTML = html || '<p style="text-align: center;">沒有其他人的通知</p>';
    } catch (e) {
        console.error(e);
        listEl.innerHTML = '載入失敗';
    }
};

document.getElementById('close-notif').onclick = closeNotifications;
document.getElementById('btn-close-read').onclick = closeNotifications;

function closeNotifications() {
    document.getElementById('notification-modal').style.display = 'none';
    localStorage.setItem('lastReadTime', Date.now().toString());
    document.getElementById('badge').style.display = 'none';
}

function listenNotifications() {
    const lastRead = parseInt(localStorage.getItem('lastReadTime') || '0');
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(50));
    onSnapshot(q, (snap) => {
        const count = snap.docs.filter(doc => {
            const d = doc.data();
            const isNew = (d.createdAt?.toMillis() || 0) > lastRead;
            const notMe = window.currentUser ? d.senderEmail !== window.currentUser.email : true;
            return isNew && notMe;
        }).length;
        const badge = document.getElementById('badge');
        if (count > 0) {
            badge.style.display = 'flex';
            badge.innerText = count > 9 ? '9+' : count;
        } else {
            badge.style.display = 'none';
        }
    });
}

window.handleNotificationClick = (unitId, tab) => {
    closeNotifications();
    if (unitId) {
        goToUnit(unitId).then(() => {
            if (tab) switchTab(tab);
        });
    }
};

// ==========================
// 6. 老師後台功能 (維持不變)
// ==========================
async function fetchUnitsForAdmin() {
    const q = query(collection(db, 'units'), orderBy('order', 'asc'));
    const snap = await getDocs(q);
    const select = document.getElementById('admin-unit-select');
    select.innerHTML = '';
    snap.forEach(doc => {
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.text = doc.data().title;
        opt.dataset.title = doc.data().title;
        select.appendChild(opt);
    });
}

document.getElementById('btn-upload-q').onclick = () => simulateTeacherUpload('question');
document.getElementById('btn-upload-a').onclick = () => simulateTeacherUpload('answer');

async function simulateTeacherUpload(type) {
    const select = document.getElementById('admin-unit-select');
    const unitId = select.value;
    if (!unitId) return alert('請選擇單元');
    const title = select.options[select.selectedIndex].dataset.title;
    const isQ = type === 'question';
    try {
        await addDoc(collection(db, 'notifications'), {
            type: 'file',
            title: isQ ? '📄 題目卷' : '✅ 詳解卷',
            body: `單元「${title}」已經更新${isQ ? '題目' : '詳解'}囉！`,
            unitId: unitId,
            senderEmail: window.currentUser.email,
            targetTab: type,
            createdAt: serverTimestamp()
        });
        alert('已發送通知！');
    } catch (e) { alert(e.message); }
}