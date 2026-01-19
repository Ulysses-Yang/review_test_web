//script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
// ▼ 新增 updateDoc
import { getFirestore, collection, query, orderBy, limit, onSnapshot, getDocs, getDoc, doc, where, addDoc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
// ▼ 新增 Storage 相關功能
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
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
const storage = getStorage(app);
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

// ==========================
// 修改後的 Tab 切換功能
// ==========================
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
    
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active-panel'));
    const target = document.getElementById(`panel-${tabName}`);
    if (target) {
        target.classList.add('active-panel');
    }

    // ▼▼▼ 新增：如果是切換到「討論區」，強制捲到底部 ▼▼▼
    if (tabName === 'chat') {
        setTimeout(() => {
            forceScrollToBottom();
        }, 50); // 給一點時間讓 display:flex 生效
    }
}

function renderPdfViewer(type, url) {
    const viewer = document.getElementById(`viewer-${type}`);
    const dlBtn = document.getElementById(`dl-${type}`);
    
    dlBtn.onclick = () => { if(url) window.open(url, '_blank'); };

    if (!url) {
        viewer.innerHTML = `<div class="center-msg"><p>尚未上傳檔案</p><p>若急需可直接留言或到意見箱反應</p></div>`;
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
        document.getElementById('greeting-text').innerText = `嗨! ${displayName} `;

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
        document.getElementById('greeting-text').innerText = "哈囉！";
        
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
// --- 修改後的登出邏輯 ---
// --- 1. 左上角頭像點擊邏輯 ---
document.getElementById('left-action-btn').onclick = () => {
    if (auth.currentUser) {
        // 已登入：顯示設定視窗 (裡面有你的登出鍵)
        const userInfo = document.getElementById('settings-user-info');
        if (userInfo) {
            userInfo.innerText = `目前帳號：${auth.currentUser.email}`;
        }
        document.getElementById('settings-modal').style.display = 'flex';
    } else {
        // 未登入：跳出登入/註冊視窗
        document.getElementById('auth-modal').style.display = 'flex';
    }
};

// --- 2. 你的登出邏輯 (保持不變，確認 ID 正確即可) ---
document.getElementById('btn-logout').onclick = async () => {
    const isConfirmed = confirm("⚠️ 確定要登出帳號嗎？\n\n登出後，下次使用需要重新輸入帳號密碼。");
    if (!isConfirmed) return;

    try {
        await signOut(auth);
        alert("已成功登出 👋");
        document.getElementById('settings-modal').style.display = 'none';
        window.location.reload(); 
    } catch (error) {
        console.error("登出錯誤:", error);
        alert("登出失敗，請重試");
    }
};

// --- 3. 取消按鈕邏輯 ---
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
if (data.type === 'comment' && window.currentUser && data.senderEmail === window.currentUser.email) {
        return; 
    }
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
    // 建立監聽 (只抓最新的 50 筆通知)
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(50));
    
    // 如果之前有監聽器，先取消 (避免重複監聽導致閃爍)
    if (window.unsubscribeNotif) window.unsubscribeNotif();

    window.unsubscribeNotif = onSnapshot(q, (snap) => {
        // 每次資料庫有變動，都重新從 LocalStorage 讀取一次「最後已讀時間」
        const lastRead = parseInt(localStorage.getItem('lastReadTime') || '0');
        
        const count = snap.docs.filter(doc => {
            const d = doc.data();
            
            // 1. 處理時間戳記 (關鍵修正！)
            // 如果是剛寫入的資料，createdAt 可能是 null，這時我們視為 Date.now() (最新)，確保紅點會亮
            const msgTime = d.createdAt ? d.createdAt.toMillis() : Date.now();
            const isNew = msgTime > lastRead;
            
            // 2. 判斷是否顯示紅點
            const isBroadcast = d.type === 'file'; // 老師廣播 (所有人都要看)
            
            // 判斷是否為「別人」發的 (如果還沒登入，預設當作別人發的)
            const notMe = window.currentUser ? d.senderEmail !== window.currentUser.email : true;
            
            // 邏輯：(是新訊息) 且 (是廣播 或 是別人發的留言)
            return isNew && (isBroadcast || notMe);
        }).length;
        
        // 控制紅點顯示
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
// 8. 整合版：老師後台管理邏輯 (智慧表單)
// ==========================

const adminSelect = document.getElementById('admin-unit-select');
const inputSubject = document.getElementById('input-subject');
const inputOrder = document.getElementById('input-order');
const inputTitle = document.getElementById('input-title');
const inputFileQ = document.getElementById('input-file-q');
const inputFileA = document.getElementById('input-file-a');
const btnSubmit = document.getElementById('btn-submit-unit');
const statusText = document.getElementById('admin-status');

// 暫存資料用
let adminUnitsData = {}; 

// A. 讀取單元列表並填入下拉選單
async function fetchUnitsForAdmin() {
    const q = query(collection(db, 'units'), orderBy('order', 'asc'));
    const snap = await getDocs(q);
    
    // 保留前兩個選項 (建立新單元 & 分隔線)
    adminSelect.innerHTML = `
        <option value="NEW_UNIT">➕ 建立全新單元 (預設)</option>
        <option disabled>--- 或選擇下方舊單元進行編輯 ---</option>
    `;
    adminUnitsData = {}; // 重置暫存

    snap.forEach(doc => {
        const data = doc.data();
        adminUnitsData[doc.id] = data; // 存起來等下用
        
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.text = `${data.subject === 'math'?'📐':'🧪'} ${data.order}. ${data.title}`;
        adminSelect.appendChild(opt);
    });
}

// B. 當下拉選單改變時 -> 自動填入表單
adminSelect.onchange = () => {
    const unitId = adminSelect.value;
    const currentQ = document.getElementById('current-q-link');
    const currentA = document.getElementById('current-a-link');

    if (unitId === 'NEW_UNIT') {
        // 切換到「新增模式」：清空表單
        inputSubject.value = 'math';
        inputOrder.value = '';
        inputTitle.value = '';
        inputFileQ.value = '';
        inputFileA.value = '';
        currentQ.innerText = '';
        currentA.innerText = '';
        btnSubmit.innerText = "🚀 建立並上架";
        btnSubmit.style.backgroundColor = "#ff9800"; // 橘色
    } else {
        // 切換到「編輯模式」：填入舊資料
        const data = adminUnitsData[unitId];
        if (data) {
            inputSubject.value = data.subject || 'math';
            inputOrder.value = data.order || '';
            inputTitle.value = data.title || '';
            
            // 顯示目前是否有檔案
            currentQ.innerText = data.questionPdf ? "✅ 目前已有題目卷 (上傳新檔案可覆蓋)" : "❌ 目前無題目卷";
            currentA.innerText = data.answerPdf ? "✅ 目前已有詳解卷 (上傳新檔案可覆蓋)" : "❌ 目前無詳解卷";
            
            btnSubmit.innerText = "💾 儲存修改 / 更新檔案";
            btnSubmit.style.backgroundColor = "#4caf50"; // 綠色
        }
    }
};

// C. 送出按鈕 (同時處理 新增 與 更新)
btnSubmit.onclick = async () => {
    const unitId = adminSelect.value;
    const isNew = unitId === 'NEW_UNIT';
    
    // 1. 驗證
    if (!inputTitle.value || !inputOrder.value) {
        return alert('標題與順序為必填！');
    }

    // 2. UI 鎖定
    btnSubmit.disabled = true;
    const originalText = btnSubmit.innerText;
    btnSubmit.innerText = "⏳ 處理中...";
    statusText.innerText = "正在上傳與寫入...";

    try {
        // 3. 定義上傳函式
        const uploadFile = async (file, folder) => {
            if (!file) return null; // 沒選檔案回傳 null
            statusText.innerText = `上傳中：${file.name}...`;
            const fileName = `${Date.now()}_${file.name}`;
            const storageRef = ref(storage, `pdfs/${folder}/${fileName}`);
            const snapshot = await uploadBytes(storageRef, file);
            return await getDownloadURL(snapshot.ref);
        };

        // 4. 執行上傳 (若沒選檔案，變數會是 null)
        const qUrl = await uploadFile(inputFileQ.files[0], 'questions');
        const aUrl = await uploadFile(inputFileA.files[0], 'answers');

        // 5. 準備要寫入的資料物件
        let docData = {
            title: inputTitle.value.trim(),
            order: parseFloat(inputOrder.value),
            subject: inputSubject.value
        };

        // 只有當「有上傳新檔案」時，才更新資料庫裡的網址
        // 如果是新增模式，且沒上傳，預設給空字串
        if (isNew) {
            docData.questionPdf = qUrl || '';
            docData.answerPdf = aUrl || '';
            docData.createdAt = serverTimestamp();
        } else {
            // 編輯模式：只有當 qUrl 有值時才更新該欄位，否則維持原樣 (Firebase updateDoc 特性)
            if (qUrl) docData.questionPdf = qUrl;
            if (aUrl) docData.answerPdf = aUrl;
        }

        // 6. 寫入資料庫
        if (isNew) {
            statusText.innerText = "正在建立新單元...";
            const newDoc = await addDoc(collection(db, 'units'), docData);
            // 為了發通知，抓一下新 ID
            await sendNotification('create', inputTitle.value, newDoc.id);
            alert('🎉 新單元建立成功！');
        } else {
            statusText.innerText = "正在更新單元...";
            await updateDoc(doc(db, 'units', unitId), docData);
            
            // 判斷要發什麼通知
            if (qUrl) await sendNotification('update', inputTitle.value, unitId, 'question');
            if (aUrl) await sendNotification('update', inputTitle.value, unitId, 'answer');
            if (!qUrl && !aUrl) alert('✅ 文字資料更新成功 (未更新檔案)');
            else alert('🎉 更新成功並已發送通知！');
        }

        // 7. 重置畫面
        document.getElementById('input-file-q').value = ''; // 清空檔案選擇
        document.getElementById('input-file-a').value = '';
        statusText.innerText = "✅ 完成";
        fetchUnitsForAdmin(); // 重新抓列表 (如果有新增單元才看得到)
        
        // 如果是新增完，切換回預設狀態
        if(isNew) {
            inputTitle.value = '';
            inputOrder.value = '';
        }

    } catch (e) {
        console.error(e);
        alert("錯誤：" + e.message);
        statusText.innerText = "❌ 失敗";
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerText = originalText;
    }
};

// D. 輔助函式：發送通知
async function sendNotification(action, title, unitId, tab = 'question') {
    let bodyText = '';
    let notifTitle = '';
    
    if (action === 'create') {
        notifTitle = '✨ 新單元上架';
        bodyText = `新增了單元：「${title}」，快來練習吧！`;
    } else {
        notifTitle = tab === 'question' ? '📄 題目卷更新' : '✅ 詳解卷更新';
        bodyText = `單元「${title}」內容已更新！`;
    }

    await addDoc(collection(db, 'notifications'), {
        type: 'file',
        title: notifTitle,
        body: bodyText,
        unitId: unitId,
        senderEmail: window.currentUser.email,
        targetTab: tab,
        createdAt: serverTimestamp()
    });
}

// E. 快速通知按鈕 (僅通知，不改資料)
document.getElementById('btn-quick-notify-q').onclick = () => quickNotify('question');
document.getElementById('btn-quick-notify-a').onclick = () => quickNotify('answer');

async function quickNotify(tab) {
    const unitId = adminSelect.value;
    if (unitId === 'NEW_UNIT') return alert('請先選擇一個舊單元');
    
    const title = inputTitle.value;
    const confirmSend = confirm(`確定要發送「${title}」的${tab==='question'?'題目':'詳解'}更新通知嗎？\n(不會修改檔案)`);
    
    if (confirmSend) {
        await sendNotification('update', title, unitId, tab);
        alert('通知已發送！');
    }
}
// ==========================================
// 留言區核心邏輯 (包含：載入、發送、鍵盤優化)
// 請用這整段替換原本的 loadComments, sendComment 及 Section 9
// ==========================================

// --- 1. 強制捲動工具 (解決鍵盤遮擋的核心) ---
function forceScrollToBottom() {
    const listEl = document.getElementById('chat-list');
    const panelChat = document.getElementById('panel-chat');
    
    // 防呆：只有在聊天分頁開啟時才執行
    if (!listEl || !panelChat || !panelChat.classList.contains('active-panel')) return;

    // 策略：分四階段捲動，確保追上鍵盤彈出的動畫速度
    // 0ms (馬上)
    listEl.scrollTop = listEl.scrollHeight;

    // 100ms (動畫開始)
    setTimeout(() => { listEl.scrollTop = listEl.scrollHeight; }, 100);

    // 300ms (動畫結束 - 最關鍵)
    setTimeout(() => { listEl.scrollTop = listEl.scrollHeight; }, 300);
    
    // 500ms (保險)
    setTimeout(() => { listEl.scrollTop = listEl.scrollHeight; }, 500);
}

// --- 2. 載入留言 ---
function loadComments(unitId) {
    if (unsubscribeChat) unsubscribeChat();

    // 設定：舊的在上面，新的在下面 (asc)
    const q = query(collection(db, 'units', unitId, 'comments'), orderBy('createdAt', 'asc'));
    const listEl = document.getElementById('chat-list');

    unsubscribeChat = onSnapshot(q, (snap) => {
        if (snap.empty) {
            listEl.innerHTML = '<div style="text-align:center;color:#999;margin-top:20px;">有問題都可以在這邊發問！</div>';
            return;
        }

        let html = '';
        snap.forEach(doc => {
            const data = doc.data();
            const name = data.userName || data.userEmail.split('@')[0];
            const isMe = window.currentUser && data.userEmail === window.currentUser.email;
            
            html += `
                <div class="comment-item" style="${isMe ? 'background:#e3f2fd; margin-left:20%;' : ''}">
                    <div class="comment-user" style="font-weight:bold; color:#555;">${name}:</div>
                    <div class="comment-text">${data.text}</div>
                </div>`;
        });
        
        listEl.innerHTML = html;

        // 資料載入完成後，執行捲動
        setTimeout(() => {
            forceScrollToBottom();
        }, 50);
    });
}

// --- 3. 發送留言 ---
const commentInput = document.getElementById('comment-input');
const btnSend = document.getElementById('btn-send-comment');

// 綁定鍵盤 Enter 發送
if (commentInput) {
    commentInput.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') sendComment();
    });

    // ▼▼▼ 關鍵：點擊輸入框時 (鍵盤彈出)，觸發捲動 ▼▼▼
    commentInput.addEventListener('focus', forceScrollToBottom);
    commentInput.addEventListener('click', forceScrollToBottom);
}

if (btnSend) {
    btnSend.onclick = sendComment;
}

async function sendComment() {
    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    
    if (!text) return;
    if (!window.currentUser) return alert('請先登入');

    const user = window.currentUser;
    const name = user.displayName || user.email.split('@')[0];

    try {
        // 先清空輸入框並保持 focus
        input.value = '';
        input.focus(); 

        // 1. 寫入留言
        await addDoc(collection(db, 'units', window.currentUnitId, 'comments'), {
            text: text,
            userEmail: user.email,
            userName: name,
            createdAt: serverTimestamp()
        });
        
        // 2. 寫入通知
        await addDoc(collection(db, 'notifications'), {
            type: 'comment',
            title: `💬 ${window.currentUnitData.title} 有新留言`,
            body: `${name}: ${text}`,
            unitId: window.currentUnitId,
            targetTab: 'chat',
            createdAt: serverTimestamp(),
            senderEmail: user.email
        });

        // 3. 送出後再次確認捲到底部
        forceScrollToBottom();

    } catch (e) { 
        console.error(e); 
        alert('留言失敗'); 
    }
}

// --- 4. 針對 Android 鍵盤/視窗變形的額外監聽 ---
window.addEventListener('resize', () => {
    const panelChat = document.getElementById('panel-chat');
    // 如果聊天分頁開著，且視窗高度變很小(鍵盤彈出)，就捲動
    if (panelChat && panelChat.classList.contains('active-panel')) {
        if (window.innerHeight < 600) { 
             forceScrollToBottom();
        }
    }
});
// ==========================
// 10. 公告系統邏輯
// ==========================

// 1. 設定目標單元的 ID (已填入你提供的 ID)
const TARGET_UNIT_ID = "KqKyCAZjDE2QpnxKcBvJ"; 

// 2. 開啟公告彈窗
const annoBar = document.getElementById('announcement-bar');
const annoModal = document.getElementById('announcement-modal');
const closeAnno = document.getElementById('close-announcement');

// 綁定點擊首頁公告條
if (annoBar) {
    annoBar.onclick = () => {
        if (annoModal) annoModal.style.display = 'flex';
    };
}

// 綁定關閉按鈕
if (closeAnno) {
    closeAnno.onclick = () => {
        if (annoModal) annoModal.style.display = 'none';
    };
}

// 3. 跳轉到指定單元
const btnGoTarget = document.getElementById('btn-go-to-target-unit');
if (btnGoTarget) {
    btnGoTarget.onclick = () => {
        if (!TARGET_UNIT_ID) {
            alert("尚未設定單元 ID");
            return;
        }

        // 關閉彈窗
        if (annoModal) annoModal.style.display = 'none';
        
        // 呼叫原本的單元跳轉函式
        goToUnit(TARGET_UNIT_ID);
    };
}
// ==========================
// 11. 意見箱系統 (完整修復版)
// ==========================

console.log("正在初始化意見箱系統..."); // 1. 檢查程式有沒有跑到這

// --- A. 變數宣告 ---
const feedbackBar = document.getElementById('feedback-bar');       // 首頁綠色按鈕
const feedbackModal = document.getElementById('feedback-modal');   // 填寫彈窗
const closeFeedback = document.getElementById('close-feedback');   // 關閉 X
const btnSubmitFeedback = document.getElementById('btn-submit-feedback'); // 送出按鈕
const feedbackInput = document.getElementById('feedback-input');   // 輸入框

// --- B. 綁定事件 (使用者填寫端) ---

// 1. 打開意見箱
if (feedbackBar) {
    feedbackBar.onclick = () => {
        console.log("點擊了意見箱！"); // 2. 檢查點擊有沒有反應
        if (feedbackModal) {
            feedbackModal.style.display = 'flex';
        } else {
            console.error("找不到 feedback-modal 彈窗元素！");
        }
    };
} else {
    console.error("找不到 feedback-bar 按鈕元素！(請檢查 HTML ID)");
}

// 2. 關閉意見箱
if (closeFeedback) {
    closeFeedback.onclick = () => {
        if (feedbackModal) feedbackModal.style.display = 'none';
    };
}

// 3. 送出意見
if (btnSubmitFeedback) {
    btnSubmitFeedback.onclick = async () => {
        const text = feedbackInput.value.trim();
        if (!text) {
            alert("請輸入內容喔！");
            return;
        }

        // 按鈕變更狀態避免重複按
        const originalText = btnSubmitFeedback.innerText;
        btnSubmitFeedback.innerText = "傳送中...";
        btnSubmitFeedback.disabled = true;

        try {
            // 寫入 Firestore
            // 確保上方有 import { addDoc, collection, serverTimestamp }
            await addDoc(collection(db, "feedback"), {
                content: text,
                uid: auth.currentUser ? auth.currentUser.uid : "anonymous",
                email: auth.currentUser ? auth.currentUser.email : "訪客",
                timestamp: serverTimestamp()
            });

            alert("感謝您的意見！我們會認真閱讀");
            feedbackInput.value = ""; // 清空
            feedbackModal.style.display = 'none'; // 關閉
        } catch (e) {
            console.error("傳送失敗", e);
            alert("傳送失敗：" + e.message);
        } finally {
            // 恢復按鈕
            btnSubmitFeedback.innerText = originalText;
            btnSubmitFeedback.disabled = false;
        }
    };
}


// --- C. 管理員部分 (查看意見) ---

const btnCheckFeedback = document.getElementById('btn-check-feedback');

if (btnCheckFeedback) {
    btnCheckFeedback.onclick = loadFeedbackList;
}

// 載入列表函式
async function loadFeedbackList() {
    const adminModal = document.getElementById('admin-feedback-modal');
    const listContainer = document.getElementById('admin-feedback-list');
    
    if (adminModal) adminModal.style.display = 'flex';
    if (listContainer) listContainer.innerHTML = '<div class="loading-text">載入留言中...</div>';

    try {
        const q = query(collection(db, "feedback"), orderBy("timestamp", "desc"), limit(20));
        const querySnapshot = await getDocs(q);
        
        if (listContainer) listContainer.innerHTML = "";

        if (querySnapshot.empty) {
            if (listContainer) listContainer.innerHTML = '<div class="center-msg">目前沒有任何意見留言 🍃</div>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            let timeStr = "剛剛";
            if (data.timestamp) {
                timeStr = new Date(data.timestamp.toDate()).toLocaleString();
            }

            const itemDiv = document.createElement('div');
            itemDiv.className = 'feedback-item';
            itemDiv.innerHTML = `
                <div style="font-weight:bold; color:#333;">${data.email || '訪客'}</div>
                <div style="margin: 5px 0; color:#555;">${data.content}</div>
                <div class="feedback-time">${timeStr}</div>
            `;
            listContainer.appendChild(itemDiv);
        });

    } catch (e) {
        console.error("讀取失敗", e);
        if (listContainer) listContainer.innerHTML = '<div class="center-msg">讀取失敗，請確認權限或網路</div>';
    }
}

// 關閉管理員彈窗
const closeAdminFeedback = document.getElementById('close-admin-feedback');
if (closeAdminFeedback) {
    closeAdminFeedback.onclick = () => {
        document.getElementById('admin-feedback-modal').style.display = 'none';
    };
}