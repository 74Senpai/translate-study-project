// Auth sync logic removed.
// Dedicated extension login flow is used instead of localStorage syncing.

// Biến lưu trữ tooltip, text đã bôi đen và trạng thái bật/tắt
let tooltipHost = null;
let shadowRoot = null;
let tooltip = null;
let lastSelectedText = "";
let isEnabled = true; // Mặc định là bật
let currentMode = "vi-en"; // Chế độ dịch hiện tại
let isPinnedActive = false; // Trạng thái cửa sổ ghim có đang mở hay không
let selectionRequestId = 0;
let tooltipRequestId = 0;
let isContextInvalidated = false;
let pendingLauncherSelection = null;
let extSettings = null;
let popupTimer = null;
let activeSession = null;
let currentCardIndex = 0;
let sessionResults = { correct: 0, total: 0, xp: 0 };

// Thêm hàm hiển thị banner thông báo tải lại trang
function showReloadBanner() {
  if (document.getElementById("translate-reload-banner-host")) return;

  const host = document.createElement("div");
  host.id = "translate-reload-banner-host";

  Object.assign(host.style, {
    position: "fixed",
    bottom: "32px",
    right: "32px",
    width: "360px",
    zIndex: "2147483647",
    pointerEvents: "none", // Cho phép click xuyên qua vùng trống của host
  });

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    .banner {
      background-color: #2563eb;
      color: white;
      padding: 16px;
      border-radius: 16px;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
      transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      transform: translateX(120%);
      border: 1px solid rgba(255,255,255,0.1);
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      pointer-events: auto;
      width: 100%;
    }
    .content {
      flex: 1;
      text-align: left;
      min-width: 0;
    }
    .title {
      font-weight: bold;
      margin-bottom: 2px;
      font-size: 14px;
      line-height: 1.4;
    }
    .desc {
      font-size: 12px;
      opacity: 0.9;
      line-height: 1.4;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    #reload-btn-now {
      background: white;
      color: #2563eb;
      border: none;
      padding: 8px 16px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: bold;
      font-size: 13px;
      white-space: nowrap;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      line-height: 1.2;
      transition: all 0.2s;
    }
    #reload-btn-now:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 8px -1px rgba(0,0,0,0.15);
    }
    #close-reload-banner {
      background: transparent;
      color: white;
      border: none;
      cursor: pointer;
      font-size: 22px;
      line-height: 1;
      padding: 0 4px;
      opacity: 0.7;
      transition: opacity 0.2s;
    }
    #close-reload-banner:hover {
      opacity: 1;
    }
  `;

  const banner = document.createElement("div");
  banner.className = "banner";
  banner.innerHTML = `
    <div class="content">
      <div class="title">DeepTranslate Cập Nhật</div>
      <div class="desc">Vui lòng tải lại trang để tiếp tục dịch.</div>
    </div>
    <div class="actions">
      <button id="reload-btn-now">Tải lại</button>
      <button id="close-reload-banner">&times;</button>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(banner);
  document.body.appendChild(host);

  // Trigger animation
  setTimeout(() => (banner.style.transform = "translateX(0)"), 100);

  banner.querySelector("#reload-btn-now").onclick = () => {
    if (
      confirm(
        "Bạn có muốn tải lại trang để áp dụng bản cập nhật DeepTranslate không?",
      )
    ) {
      window.location.reload();
    }
  };

  banner.querySelector("#close-reload-banner").onclick = () => {
    banner.style.transform = "translateX(120%)";
    setTimeout(() => host.remove(), 500);
  };
}

function checkContext() {
  try {
    if (!chrome.runtime || !chrome.runtime.id) {
      if (!isContextInvalidated) {
        isContextInvalidated = true;
        showReloadBanner();
      }
      return false;
    }
    return true;
  } catch (err) {
    if (!isContextInvalidated) {
      isContextInvalidated = true;
      showReloadBanner();
    }
    return false;
  }
}

// Lấy trạng thái cài đặt từ storage ngay khi load trang
try {
  chrome.storage.local.get(
    [
      "isEnabled",
      "extensionMode",
      "isPinnedActive",
      "extension_settings",
      "access_token",
    ],
    function (result) {
      try {
        if (!checkContext()) return;
        if (result.isEnabled !== undefined) {
          isEnabled = result.isEnabled;
        }
        if (result.extensionMode !== undefined) {
          currentMode = result.extensionMode;
        }
        if (result.isPinnedActive !== undefined) {
          isPinnedActive = result.isPinnedActive;
        }
        // Chỉ kích hoạt popup flashcard cho user đã đăng nhập
        if (result.access_token && result.extension_settings) {
          extSettings = result.extension_settings;
          applySettingsLogic();
        }
      } catch (err) {
        console.warn("DeepTranslate: Error loading settings", err);
      }
    },
  );
} catch (e) {}

function applySettingsLogic() {
  if (!extSettings) return;

  const currentHost = window.location.hostname.replace("www.", "");

  // 1. Translation Scope Check
  if (!extSettings.translation?.enabled_all) {
    const isAllowed = extSettings.translation?.allowed_urls?.some((url) =>
      currentHost.includes(url),
    );
    if (!isAllowed) {
      isEnabled = false; // Temporarily disable for this page
      console.log(
        "DeepTranslate: Translation disabled for this origin by user settings.",
      );
    }
  }

  // 2. Entertainment Sites Popup Timer
  const isEntertainment = extSettings.flashcard_popup?.entertainment_urls?.some(
    (item) => currentHost.includes(item.url) && item.enabled,
  );
  if (isEntertainment && extSettings.flashcard_popup?.enabled) {
    // Timer handled by background.js
  }
}

async function startEntertainmentTimer() {
  const settings = extSettings.flashcard_popup;
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD theo local timezone
  const countKey = `popup_count_${today}`;

  chrome.storage.local.get([countKey], (result) => {
    const count = result[countKey] || 0;
    if (count >= (settings.daily_frequency || 5)) {
      console.log(
        "DeepTranslate: Daily popup limit reached.",
        count,
        "/",
        settings.daily_frequency,
      );
      return;
    }

    const waitMinutes = settings.timeout || 5;
    const waitMs = waitMinutes * 60 * 1000;
    console.log(
      `DeepTranslate: Entertainment site detected! Popup will show in ${waitMinutes} min (${waitMs}ms). Count today: ${count}`,
    );

    popupTimer = setTimeout(() => {
      console.log("DeepTranslate: Showing flashcard popup now!");
      showFlashcardPopup();
      chrome.storage.local.set({ [countKey]: count + 1 });
    }, waitMs);
  });
}

function showFlashcardPopup() {
  if (document.getElementById("translate-popup-invite-host")) return;

  const host = document.createElement("div");
  host.id = "translate-popup-invite-host";
  Object.assign(host.style, {
    position: "fixed",
    top: "24px",
    right: "24px",
    zIndex: "2147483647",
    pointerEvents: "none",
  });
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    .invite {
      background: #4f46e5;
      color: white;
      padding: 12px 24px;
      border-radius: 100px;
      font-family: system-ui, -apple-system, sans-serif;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 800;
      animation: slideIn 0.5s ease-out;
      pointer-events: auto;
      transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .invite-text {
      max-width: 400px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #close-invite-btn {
      background: transparent;
      color: rgba(255, 255, 255, 0.7);
      border: none;
      cursor: pointer;
      font-size: 20px;
      line-height: 1;
      padding: 0 4px;
      margin-left: 8px;
      transition: color 0.2s, transform 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #close-invite-btn:hover {
      color: white;
      transform: scale(1.15);
    }
    @keyframes slideIn { from { transform: translateX(120%); } to { transform: translateX(0); } }
  `;
  const invite = document.createElement("div");
  invite.className = "invite";
  invite.innerHTML = `
    <span style="font-size: 20px;">⚡</span>
    <span class="invite-text">Còn nhớ hay đã quên các từ vựng tiếng Anh bạn thường dịch? Thử sức ngay!</span>
    <button id="close-invite-btn">&times;</button>
  `;
  invite.onclick = async () => {
    invite.innerHTML = "<span>Đang khởi tạo...</span>";
    try {
      chrome.runtime.sendMessage(
        { action: "start_extension_session" },
        (response) => {
          if (response && response.cards) {
            activeSession = response;
            currentCardIndex = 0;
            sessionResults = {
              correct: 0,
              total: response.cards.length,
              xp: 0,
            };
            host.remove();
            showFlashcardPlayer();
          } else {
            invite.innerHTML = "<span>Lỗi: Không đủ từ vựng!</span>";
            setTimeout(() => host.remove(), 2000);
          }
        },
      );
    } catch (e) {
      host.remove();
    }
  };

  const closeBtn = invite.querySelector("#close-invite-btn");
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    invite.style.transform = "translateX(120%)";
    setTimeout(() => host.remove(), 500);
  };

  shadow.appendChild(style);
  shadow.appendChild(invite);
  document.body.appendChild(host);
}

function showFlashcardPlayer() {
  if (!activeSession || !activeSession.cards.length) return;

  const existing = document.getElementById("translate-player-overlay-host");
  if (existing) existing.remove();

  const playerHost = document.createElement("div");
  playerHost.id = "translate-player-overlay-host";
  Object.assign(playerHost.style, {
    position: "fixed", inset: "0", zIndex: "2147483647",
    background: "rgba(15, 23, 42, 0.8)", backdropFilter: "blur(20px)", display: "block"
  });

  const shadow = playerHost.attachShadow({ mode: "open" });
  
  const speak = (text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text) ? 'vi-VN' : 'en-US';
    utter.volume = 1.0; utter.rate = 0.9;
    window.speechSynthesis.speak(utter);
  };

  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
    :host { --primary: #4f46e5; --success: #10b981; --danger: #ef4444; font-family: 'Inter', system-ui, sans-serif; }
    
    .card-container {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 640px; max-width: 95vw; height: 540px; background: white; border-radius: 32px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); overflow: hidden; 
      display: flex; flex-direction: column; box-sizing: border-box;
    }

    .hud { padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; background: #fafafa; }
    .timer-circle { 
        width: 38px; height: 38px; border-radius: 50%; border: 3px solid #eee; 
        display: flex; align-items: center; justify-content: center; font-weight: 900; color: var(--primary);
        font-size: 13px;
    }
    .timer-circle.warning { color: var(--danger); border-color: #fee2e2; animation: pulse 1s infinite; }

    .arena { 
        flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center;
        padding: 20px 40px; text-align: center; overflow: hidden;
    }
    .question { font-size: 24px; font-weight: 800; color: #1e293b; margin-bottom: 25px; line-height: 1.3; }
    
    #task-area { width: 100%; display: flex; justify-content: center; }

    /* CSS cho Fill */
    .fill-input { 
      width: 100%; max-width: 450px; padding: 16px; font-size: 30px; font-weight: 900; text-align: center; 
      border: 4px solid #f1f5f9; border-radius: 20px; outline: none; transition: 0.2s; color: #1e293b;
    }
    .fill-input:focus { border-color: var(--primary); background: #fcfcff; }
    .fill-input.error { border-color: var(--danger); animation: shake 0.4s; }
    
    /* CSS cho Complete (Từng chữ cái) */
    .complete-wrap { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; max-width: 100%; }
    .char-box {
      width: 42px; height: 54px; border: 3px solid #f1f5f9; border-radius: 12px;
      font-size: 24px; font-weight: 900; text-align: center; color: #1e293b;
      background: #f8fafc; text-transform: uppercase; display: flex; align-items: center; justify-content: center;
    }
    .char-input { background: white; outline: none; cursor: text; transition: 0.2s; }
    .char-input:focus { border-color: var(--primary); background: #fcfcff; transform: translateY(-2px); }
    .char-input.error { border-color: var(--danger); animation: shake 0.4s; }

    /* CSS cho Choice */
    .choices-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; width: 100%; max-width: 520px; }
    .choice-btn { 
      padding: 18px 12px; border: 2px solid #f1f5f9; border-radius: 16px; background: white; 
      font-weight: 700; font-size: 15px; cursor: pointer; transition: 0.2s;
      display: flex; align-items: center; justify-content: center; min-height: 60px;
    }
    .choice-btn:hover { border-color: var(--primary); background: #f8fafc; transform: translateY(-2px); }

    /* Achievement Toasts */
    #toast-container { position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
    .toast {
      background: white; padding: 15px 20px; border-radius: 20px; border-right: 6px solid var(--primary);
      box-shadow: 0 15px 30px rgba(0,0,0,0.15); pointer-events: auto;
      display: flex; align-items: center; gap: 12px; width: 280px;
      animation: slideIn 0.5s cubic-bezier(0.17, 0.88, 0.32, 1.28);
    }
    .toast.mastered { border-right-color: #fbbf24; }
    .toast-content { flex: 1; }
    .toast-title { font-weight: 900; font-size: 10px; color: #94a3b8; text-transform: uppercase; }
    .toast-msg { font-weight: 700; font-size: 14px; color: #1e293b; }

    .feedback-layer {
      position: absolute; inset: 0; background: white;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      z-index: 100; animation: fadeIn 0.3s; padding: 40px;
    }

    /* Animation */
    @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-8px); } 75% { transform: translateX(8px); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideIn { from { transform: translateX(120%); } to { transform: translateX(0); } }
    @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
  `;

  shadow.appendChild(style);
  const container = document.createElement("div");
  container.className = "card-container";
  const toastContainer = document.createElement("div");
  toastContainer.id = "toast-container";
  
  shadow.appendChild(container);
  shadow.appendChild(toastContainer);
  document.body.appendChild(playerHost);

  let currentIdx = 0, attempts = 3, score = 0, timeLeft = 15, timerInterval = null, nextTimeout = null;

  const showAchievement = (title, msg, icon = '✨', type = '') => {
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.innerHTML = `<div style="font-size:24px;">${icon}</div><div class="toast-content"><div class="toast-title">${title}</div><div class="toast-msg">${msg}</div></div>`;
    toastContainer.appendChild(t);
    setTimeout(() => { t.style.animation = 'slideIn 0.5s reverse forwards'; setTimeout(() => t.remove(), 500); }, 4000);
  };

  const startCard = (idx) => {
    clearTimeout(nextTimeout);
    clearInterval(timerInterval);
    currentIdx = idx; attempts = 3;
    const card = activeSession.cards[idx];
    timeLeft = card.timer || 15;
    
    container.innerHTML = `
      <div class="hud">
        <button id="close-btn" style="background:none; border:none; cursor:pointer; font-size:20px; color:#cbd5e1;">✕</button>
        <div style="font-weight:800; color:#94a3b8; font-size:11px; letter-spacing:1px;">CÂU ${idx + 1}/${activeSession.cards.length}</div>
        <div class="timer-circle" id="timer-box">${timeLeft}</div>
      </div>
      <div class="arena">
        <div class="question">${card.question}</div>
        <div id="task-area"></div>
      </div>
      <div style="padding:20px 40px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; background:#fafafa;">
        <button id="skip-btn" style="background:none; border:none; color:#94a3b8; font-weight:800; cursor:pointer;">BỎ QUA</button>
        <button id="check-btn" style="background:#1e293b; color:white; border:none; padding:12px 35px; border-radius:14px; font-weight:800; cursor:pointer; font-size:14px;">KIỂM TRA</button>
      </div>
    `;

    renderTask(card);
    container.querySelector("#close-btn").onclick = () => {
      if (confirm("Thoát?")) {
        clearInterval(timerInterval);
        clearTimeout(nextTimeout);
        playerHost.remove();
      }
    };
    container.querySelector("#skip-btn").onclick = () => handleAnswer(false);
    container.querySelector("#check-btn").onclick = validate;
    startTimer();
  };

  const renderTask = (card) => {
    const area = container.querySelector("#task-area");
    
    if (card.tasks.choice.enabled) {
      // 1. KIỂU CHOICE (TRẮC NGHIỆM)
      area.className = "choices-grid";
      card.tasks.choice.options.forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "choice-btn";
        btn.textContent = opt.text;
        btn.onclick = () => {
          if (opt.is_correct) handleAnswer(true);
          else { btn.style.borderColor = 'var(--danger)'; btn.style.color = 'var(--danger)'; btn.disabled = true; wrongAttempt(); }
        };
        area.appendChild(btn);
      });
      container.querySelector("#check-btn").style.display = "none"; // Ẩn nút kiểm tra vì chọn là xong
      
    } else if (card.tasks.complete.enabled) {
      // 2. KIỂU COMPLETE (ĐIỀN TỪNG CHỮ)
      const pattern = card.tasks.complete.patterns[0];
      
      area.innerHTML = `
        <div style="width:100%; display:flex; flex-direction:column; align-items:center;">
            <div class="complete-wrap" id="complete-wrap"></div>
            <div id="tries-hint" style="font-size:11px; font-weight:800; color:#94a3b8; margin-top:25px; text-transform:uppercase;">Còn ${attempts} lượt thử</div>
        </div>
      `;
      
      const wrap = area.querySelector("#complete-wrap");
      
      // Vẽ từng ô
      pattern.display_text.split('').forEach((char) => {
        if (char === ' ') {
          // Xử lý dấu cách giữa các từ
          const space = document.createElement("div");
          space.style.width = "10px";
          wrap.appendChild(space);
        } else if (char === '_') {
          // Ô trống để điền
          const inp = document.createElement("input");
          inp.type = "text";
          inp.maxLength = 1;
          inp.className = "char-box char-input";
          inp.autocomplete = "off";
          inp.spellcheck = false;
          wrap.appendChild(inp);
        } else {
          // Ký tự cho sẵn (gợi ý)
          const box = document.createElement("div");
          box.className = "char-box";
          box.textContent = char;
          wrap.appendChild(box);
        }
      });

      // Xử lý logic tự động nhảy ô cho .char-input
      const inputs = wrap.querySelectorAll(".char-input");
      inputs.forEach((inp, i) => {
        inp.oninput = (e) => {
            // Tự động nhảy sang ô tiếp theo nếu đã nhập
            if (inp.value && inputs[i + 1]) inputs[i + 1].focus();
        };
        inp.onkeydown = (e) => {
            e.stopPropagation();
            // Nhấn Backspace để lùi lại ô trước
            if (e.key === 'Backspace' && !inp.value && inputs[i - 1]) {
                inputs[i - 1].focus();
            }
            if (e.key === 'Enter') validate();
        };
        inp.onkeypress = (e) => {
            e.stopPropagation();
        };
        inp.onkeyup = (e) => {
            e.stopPropagation();
        };
      });
      if (inputs.length > 0) inputs[0].focus();

    } else {
      // 3. KIỂU FILL (ĐIỀN NGUYÊN TỪ)
      const firstChar = card.tasks.fill.answers[0][0];
      area.innerHTML = `
        <div style="width:100%; display:flex; flex-direction:column; align-items:center;">
            <input type="text" class="fill-input" id="main-input" placeholder="..." autocomplete="off" spellcheck="false">
            <div style="font-size:13px; font-weight:700; color:var(--primary); margin-top:15px; opacity:0.8;">Gợi ý: Bắt đầu bằng chữ "${firstChar.toUpperCase()}"</div>
            <div id="tries-hint" style="font-size:11px; font-weight:800; color:#94a3b8; margin-top:15px; text-transform:uppercase;">Còn ${attempts} lượt thử</div>
        </div>
      `;
      const inp = area.querySelector("#main-input");
      inp.focus();
      inp.onkeydown = (e) => { 
        e.stopPropagation();
        if(e.key === 'Enter') validate(); 
      };
      inp.onkeypress = (e) => {
        e.stopPropagation();
      };
      inp.onkeyup = (e) => {
        e.stopPropagation();
      };
    }
  };

  const validate = () => {
    const card = activeSession.cards[currentIdx];
    let isCorrect = false;

    if (card.tasks.fill.enabled) {
        const val = container.querySelector("#main-input")?.value.trim().toLowerCase();
        if (!val) return;
        isCorrect = card.tasks.fill.answers.some(a => a.trim().toLowerCase() === val);
    } else if (card.tasks.complete.enabled) {
        const inputs = container.querySelectorAll(".char-input");
        const val = Array.from(inputs).map(i => i.value).join('').toLowerCase();
        const target = card.tasks.complete.patterns[0].blanks.join('').toLowerCase();
        // Phải điền đủ số ký tự mới kiểm tra
        if (val.length < target.length) return; 
        isCorrect = (val === target);
    }

    if (isCorrect) handleAnswer(true); else wrongAttempt();
  };

  const wrongAttempt = () => {
    attempts--;
    const hint = container.querySelector("#tries-hint");
    if (hint) hint.textContent = `Còn ${attempts} lượt thử`;

    // Hiệu ứng rung đỏ
    const card = activeSession.cards[currentIdx];
    if (card.tasks.fill.enabled) {
        const inp = container.querySelector("#main-input");
        inp.classList.add("error"); setTimeout(() => inp.classList.remove("error"), 400); inp.value = "";
    } else if (card.tasks.complete.enabled) {
        const inputs = container.querySelectorAll(".char-input");
        inputs.forEach(inp => {
            inp.classList.add("error");
            inp.value = ""; // Xóa dữ liệu cũ
        });
        setTimeout(() => inputs.forEach(i => i.classList.remove("error")), 400);
        if(inputs[0]) inputs[0].focus();
    }
    
    if (attempts <= 0) handleAnswer(false);
  };

  const handleAnswer = (correct) => {
    clearInterval(timerInterval);
    const card = activeSession.cards[currentIdx];
    
    chrome.runtime.sendMessage({
      action: "submit_flashcard_answer",
      data: { word: card.word, is_correct: correct, task_type: card.tasks.choice.enabled ? 'choice' : (card.tasks.complete.enabled ? 'complete' : 'fill'), session_id: activeSession.session_id, meaning: card.meaning }
    }, (resp) => {
      if (resp) {
        if (resp.is_first_encounter) showAchievement("MỞ KHÓA TỪ MỚI", card.word, '🔓');
        if (resp.newly_mastered) showAchievement("THÔNG THẠO", `Đã thuộc: ${card.word}`, '👑', 'mastered');
      }
    });

    const feedback = document.createElement("div");
    feedback.className = "feedback-layer";
    feedback.innerHTML = `
      <div style="font-size:60px; margin-bottom:15px;">${correct ? '✅' : '❌'}</div>
      <div style="font-weight:900; color:${correct ? 'var(--success)' : 'var(--danger)'}; font-size:24px;">${correct ? 'CHÍNH XÁC!' : 'CHƯA ĐÚNG'}</div>
      <div style="font-size:32px; font-weight:900; margin:10px 0; color:#1e293b;">${card.word}</div>
      <div style="font-size:18px; color:#64748b; font-weight:600; margin-bottom:20px; max-width:85%; text-align:center;">${card.meaning}</div>
      <div style="font-size:10px; color:#94a3b8; font-weight:800; text-transform:uppercase;">Chuyển câu sau 3 giây...</div>
    `;
    container.appendChild(feedback);
    if (correct) { score += card.points; speak(card.word); }
    nextTimeout = setTimeout(() => { if (currentIdx < activeSession.cards.length - 1) startCard(currentIdx + 1); else finishSession(); }, 3000);
  };

  const startTimer = () => {
    const box = container.querySelector("#timer-box");
    timerInterval = setInterval(() => {
      timeLeft--;
      if (box) { box.textContent = timeLeft; if (timeLeft <= 5) box.classList.add("warning"); }
      if (timeLeft <= 0) { clearInterval(timerInterval); handleAnswer(false); }
    }, 1000);
  };

  const finishSession = () => {
    container.innerHTML = `
      <div class="arena" style="padding:40px;">
        <div style="font-size:70px; margin-bottom:15px;">🏆</div>
        <h2 style="font-weight:900; font-size:28px; margin:0;">HOÀN THÀNH!</h2>
        <p style="color:#64748b; font-weight:600; margin:10px 0 25px 0;">Bạn đã hoàn thành phiên ôn tập.</p>
        <div style="background:#f8fafc; padding:20px 50px; border-radius:24px; margin-bottom:30px; border:1px solid #f1f5f9;">
          <div style="font-weight:800; color:#4f46e5; font-size:12px; letter-spacing:1px; margin-bottom:5px;">ĐIỂM SỐ</div>
          <div style="font-size:52px; font-weight:900; color:#1e293b;">${score}</div>
        </div>
        <button id="final-btn" style="width:100%; max-width:260px; padding:16px; background:#1e293b; color:white; border:none; border-radius:16px; font-weight:900; cursor:pointer; font-size:15px;">KẾT THÚC</button>
      </div>
    `;
    container.querySelector("#final-btn").onclick = () => playerHost.remove();
  };

  startCard(0);
}

// Lắng nghe sự thay đổi cài đặt từ popup theo thời gian thực
try {
  chrome.storage.onChanged.addListener(function (changes, namespace) {
    try {
      if (!checkContext()) return;
      if (namespace === "local") {
        if (changes.isEnabled !== undefined) {
          isEnabled = changes.isEnabled.newValue;
          if (!isEnabled) {
            removeTooltip();
            lastSelectedText = "";
          }
        }
        if (changes.extensionMode !== undefined) {
          currentMode = changes.extensionMode.newValue;
          lastSelectedText = "";
          removeTooltip();
        }
        if (changes.isPinnedActive !== undefined) {
          isPinnedActive = changes.isPinnedActive.newValue;
        }
        if (changes.extension_settings) {
          // Chỉ áp dụng nếu user đang đăng nhập
          chrome.storage.local.get("access_token", (r) => {
            if (r.access_token) {
              extSettings = changes.extension_settings.newValue;
              applySettingsLogic();
            }
          });
        }
      }
    } catch (err) {}
  });
} catch (e) {}

// Hàm tạo và hiển thị tooltip
function showTooltip(text, x, y) {
  if (!checkContext()) return; // Kiểm tra xem extension có còn hoạt động không
  removeTooltip(); // Đảm bảo không có tooltip nào khác đang hiện

  // Tạo host container cho Shadow DOM
  tooltipHost = document.createElement("div");
  tooltipHost.id = "quick-translate-host";

  // Tính toán vị trí để không bị tràn ra ngoài màn hình
  const tooltipWidth = 300; // Chiều rộng tối đa đã thiết lập trong CSS
  const tooltipHeight = 80; // Chiều cao ước lượng
  const padding = 15;

  // Kiểm tra tràn cạnh phải
  if (x + tooltipWidth > window.innerWidth + window.scrollX - padding) {
    x = window.innerWidth + window.scrollX - tooltipWidth - padding;
  }

  // Kiểm tra tràn cạnh dưới
  if (y + tooltipHeight > window.innerHeight + window.scrollY - padding) {
    y = y - tooltipHeight - 40; // Đẩy lên trên con trỏ chuột
  }

  // Đảm bảo không bị âm
  x = Math.max(window.scrollX + padding, x);
  y = Math.max(window.scrollY + padding, y);

  // Thiết lập vị trí cho host
  tooltipHost.style.position = "absolute";
  tooltipHost.style.left = `${x}px`;
  tooltipHost.style.top = `${y}px`;
  tooltipHost.style.zIndex = "2147483647"; // Đảm bảo nổi lên trên cùng

  // Khởi tạo Shadow DOM
  shadowRoot = tooltipHost.attachShadow({ mode: "open" });

  // Lấy URL thực tế của font từ thư mục assets của extension
  const inter400 = chrome.runtime.getURL("assets/fonts/inter-400.ttf");
  const inter600 = chrome.runtime.getURL("assets/fonts/inter-600.ttf");

  // Tạo thẻ style và copy CSS
  const style = document.createElement("style");
  style.textContent = `
    @font-face {
      font-family: 'Inter';
      src: url('${inter400}') format('truetype');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Inter';
      src: url('${inter600}') format('truetype');
      font-weight: 600;
      font-style: normal;
    }
    #quick-translate-tooltip {
      background-color: #ffffff;
      color: #1e293b;
      padding: 12px 16px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      max-width: 300px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      white-space: pre-wrap;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      
      /* Hiệu ứng mượt mà khi xuất hiện */
      animation: translateFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @media (prefers-color-scheme: dark) {
      #quick-translate-tooltip {
        background-color: #1e293b;
        color: #f1f5f9;
        border-color: #334155;
      }
    }

    @keyframes translateFadeIn {
      from {
        opacity: 0;
        transform: translateY(-5px); /* Trượt nhẹ từ trên xuống */
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;

  // Tạo thẻ div cho tooltip
  tooltip = document.createElement("div");
  tooltip.id = "quick-translate-tooltip";
  tooltip.textContent = text;

  // Gắn style và tooltip vào Shadow Root
  shadowRoot.appendChild(style);
  shadowRoot.appendChild(tooltip);

  // Thêm host vào body
  document.body.appendChild(tooltipHost);
}

// Hàm xóa tooltip
function showTranslateLauncher(text, x, y) {
  if (!checkContext()) return;
  removeTooltip();

  tooltipHost = document.createElement("div");
  tooltipHost.id = "quick-translate-host";

  const launcherSize = 44;
  const padding = 15;

  if (x + launcherSize > window.innerWidth + window.scrollX - padding) {
    x = window.innerWidth + window.scrollX - launcherSize - padding;
  }

  if (y + launcherSize > window.innerHeight + window.scrollY - padding) {
    y = y - launcherSize - 40;
  }

  x = Math.max(window.scrollX + padding, x);
  y = Math.max(window.scrollY + padding, y);

  tooltipHost.style.position = "absolute";
  tooltipHost.style.left = `${x}px`;
  tooltipHost.style.top = `${y}px`;
  tooltipHost.style.zIndex = "2147483647";

  shadowRoot = tooltipHost.attachShadow({ mode: "open" });

  const iconUrl = chrome.runtime.getURL("assets/icons/icon16.png");
  const style = document.createElement("style");
  style.textContent = `
    #quick-translate-launcher {
      width: 25px;
      height: 25px;
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 14px;
      background: linear-gradient(135deg, #ffffff 0%, #eff6ff 100%);
      box-shadow: 0 10px 25px -10px rgba(37, 99, 235, 0.65), 0 6px 10px -6px rgba(15, 23, 42, 0.28);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      transition: transform 0.16s ease, box-shadow 0.16s ease;
      animation: launcherFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    #quick-translate-launcher:hover {
      transform: translateY(-1px) scale(1.03);
      box-shadow: 0 14px 30px -10px rgba(37, 99, 235, 0.72), 0 8px 16px -8px rgba(15, 23, 42, 0.32);
    }

    #quick-translate-launcher:active {
      transform: scale(0.97);
    }

    #quick-translate-launcher img {
      width: 24px;
      height: 24px;
      display: block;
      pointer-events: none;
      user-select: none;
    }

    @media (prefers-color-scheme: dark) {
      #quick-translate-launcher {
        background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
        border-color: rgba(96, 165, 250, 0.28);
      }
    }

    @keyframes launcherFadeIn {
      from {
        opacity: 0;
        transform: translateY(-4px) scale(0.94);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  `;

  tooltip = document.createElement("button");
  tooltip.id = "quick-translate-launcher";
  tooltip.type = "button";
  tooltip.title = "Dịch nhanh với DeepTranslate";
  tooltip.setAttribute("aria-label", "Dịch");
  tooltip.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const selection = pendingLauncherSelection;
    if (!selection?.text) return;

    translateText(selection.text, selection.x, selection.y);
  });

  pendingLauncherSelection = { text, x, y };

  shadowRoot.appendChild(style);
  shadowRoot.appendChild(tooltip);
  document.body.appendChild(tooltipHost);
}

function removeTooltip() {
  if (tooltipHost && tooltipHost.parentNode) {
    tooltipHost.parentNode.removeChild(tooltipHost);
    tooltipHost = null;
    shadowRoot = null;
    tooltip = null;
  }
  pendingLauncherSelection = null;
}

function getLatinWordTokens(text) {
  const matches = text.toLowerCase().match(/[a-z']+/g);
  return matches || [];
}

function scoreLanguageHints(text) {
  const englishHintWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "do",
    "does",
    "for",
    "from",
    "had",
    "has",
    "have",
    "he",
    "her",
    "his",
    "i",
    "in",
    "is",
    "it",
    "its",
    "my",
    "not",
    "of",
    "on",
    "or",
    "our",
    "she",
    "that",
    "the",
    "their",
    "there",
    "they",
    "this",
    "to",
    "was",
    "we",
    "were",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "will",
    "with",
    "would",
    "you",
    "your",
  ]);
  const vietnameseHintWords = new Set([
    "anh",
    "ban",
    "biet",
    "cac",
    "can",
    "cho",
    "co",
    "cua",
    "da",
    "dang",
    "day",
    "de",
    "den",
    "di",
    "duoc",
    "gi",
    "khong",
    "khi",
    "la",
    "lam",
    "mot",
    "neu",
    "ngay",
    "nguoi",
    "nhieu",
    "nhung",
    "noi",
    "nua",
    "roi",
    "se",
    "tai",
    "the",
    "thi",
    "toi",
    "tren",
    "trong",
    "tu",
    "va",
    "vao",
    "ve",
    "voi",
  ]);

  const words = getLatinWordTokens(text);
  let englishScore = 0;
  let vietnameseScore = 0;

  for (const word of words) {
    if (englishHintWords.has(word)) englishScore++;
    if (vietnameseHintWords.has(word)) vietnameseScore++;
  }

  return { englishScore, vietnameseScore, wordCount: words.length };
}

function shouldBlockSelectionByMode(text, mode, detectedLang, isReliable) {
  const hasVietnamese = CONFIG.VIETNAMESE_REGEX.test(text);
  const hasEnglishLetter = /[a-zA-Z]/.test(text);

  if (!hasVietnamese && !hasEnglishLetter) return true;
  if (mode === "en-vi" && hasVietnamese) return true;
  if (mode === "en-vi" && detectedLang === "vi" && isReliable) return true;
  if (mode === "vi-en" && detectedLang === "en" && isReliable) return true;

  if (mode !== "vi-en" || hasVietnamese || !hasEnglishLetter) {
    return false;
  }

  const scores = scoreLanguageHints(text);
  const asciiOnly = text.split("").every((ch) => ch.charCodeAt(0) <= 127);
  const looksLikeEnglishByWords =
    scores.wordCount >= 2 && scores.englishScore > scores.vietnameseScore;
  const looksLikeEnglishSingleWord =
    scores.wordCount === 1 &&
    scores.englishScore > 0 &&
    scores.vietnameseScore === 0;

  return asciiOnly && (looksLikeEnglishByWords || looksLikeEnglishSingleWord);
}
// Hàm gọi API dịch thuật thông qua background script
function translateText(text, x, y) {
  showTooltip("Đang dịch...", x, y);
  const requestId = ++tooltipRequestId;

  if (!checkContext()) {
    console.warn(
      "DeepTranslate: Extension context invalidated. Please refresh the page.",
    );
    if (tooltip)
      tooltip.textContent = "Tiện ích đã cập nhật. Vui lòng F5 trang web!";
    return;
  }

  try {
    chrome.runtime.sendMessage(
      { action: "translate", text: text, mode: currentMode },
      (response) => {
        try {
          if (!checkContext()) return;
          if (requestId !== tooltipRequestId) return;
          if (chrome.runtime.lastError) {
            console.error("Lỗi kết nối background:", chrome.runtime.lastError);
            return;
          }

          if (response && response.success) {
            const translatedText = response.translatedText;
            if (tooltip) {
              tooltip.innerHTML = "";

              const textSpan = document.createElement("span");
              textSpan.textContent = translatedText;

              const aiBtn = document.createElement("button");
              aiBtn.innerHTML = "?";
              aiBtn.title = "Xem phân tích chi tiết";
              aiBtn.style.cssText =
                "margin-left: 8px; background: var(--primary-color, #2563eb); color: white; border: none; border-radius: 50%; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; cursor: pointer; font-weight: 800; box-shadow: 0 2px 4px rgba(37,99,235,0.2); transition: all 0.2s; vertical-align: middle; line-height: 1;";

              aiBtn.onmouseover = () =>
                (aiBtn.style.transform = "translateY(-1px)");
              aiBtn.onmouseout = () =>
                (aiBtn.style.transform = "translateY(0)");

              aiBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (checkContext()) {
                  try {
                    chrome.storage.local.set(
                      { pendingData: response.data },
                      () => {
                        try {
                          if (checkContext()) {
                            chrome.runtime.sendMessage({
                              action: "open_popup",
                            });
                          }
                        } catch (err) {}
                        lastSelectedText = "";
                        removeTooltip();
                      },
                    );
                  } catch (err) {}
                }
              });

              tooltip.appendChild(textSpan);
              tooltip.appendChild(aiBtn);
            }
          } else {
            if (response && response.aborted) {
              return;
            }

            const errorMessage =
              response && response.error
                ? response.error
                : "Unknown translation error";
            console.error("Lỗi dịch:", errorMessage);
            if (tooltip) tooltip.textContent = "Lỗi: Không thể dịch!";
          }
        } catch (err) {
          console.warn("DeepTranslate: Translate callback error:", err);
        }
      },
    );
  } catch (error) {
    console.warn("DeepTranslate: Request blocked by invalid context.");
  }
}

function sendSelectionToPinnedView(text) {
  return new Promise((resolve) => {
    if (!checkContext()) {
      resolve(false);
      return;
    }

    try {
      chrome.runtime.sendMessage({ action: "selection_changed", text }, () => {
        try {
          if (!checkContext()) {
            resolve(false);
            return;
          }
          if (chrome.runtime.lastError) {
            resolve(false);
            return;
          }
          resolve(true);
        } catch (err) {
          resolve(false);
        }
      });
    } catch (error) {
      resolve(false);
    }
  });
}

function getSelectedText() {
  let selectedText = window.getSelection().toString().trim();

  if (!selectedText) {
    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")
    ) {
      if (activeEl.type !== "password" && activeEl.type !== "hidden") {
        try {
          selectedText = activeEl.value
            .substring(activeEl.selectionStart, activeEl.selectionEnd)
            .trim();
        } catch (err) {
          // Má»™t sá»‘ loáº¡i input khĂ´ng há»— trá»£ selectionStart/End
        }
      }
    }
  }

  return selectedText;
}

function handleSelectedText(selectedText, x, y) {
  const hasVietnamese = CONFIG.VIETNAMESE_REGEX.test(selectedText);
  const hasEnglishLetter = /[a-zA-Z]/.test(selectedText);

  if (!hasVietnamese && !hasEnglishLetter) return;
  if (currentMode === "en-vi" && hasVietnamese) return;

  if (selectedText !== lastSelectedText) {
    if (checkContext()) {
      lastSelectedText = selectedText;
      try {
        chrome.storage.local.set({ sharedInputText: selectedText });
      } catch (e) {}
    }

    if (selectedText.length > 500) {
      showTooltip("Văn bản dài quá 500 ký tự", x, y);
      return;
    }

    if (checkContext()) {
      const requestId = ++selectionRequestId;
      try {
        chrome.runtime.sendMessage(
          { action: "detect", text: selectedText.substring(0, 100) },
          (response) => {
            try {
              if (!checkContext()) return;
              if (requestId !== selectionRequestId) return;
              let detectedLang = null;
              let isReliable = false;

              if (
                response &&
                response.languages &&
                response.languages.length > 0
              ) {
                detectedLang = response.languages[0].language;
                isReliable = response.isReliable;
              }

              if (
                shouldBlockSelectionByMode(
                  selectedText,
                  currentMode,
                  detectedLang,
                  isReliable,
                )
              ) {
                lastSelectedText = "";
                removeTooltip();
                return;
              }

              if (!isEnabled) {
                showTranslateLauncher(selectedText, x, y);
                return;
              }

              if (isPinnedActive) {
                sendSelectionToPinnedView(selectedText).then((delivered) => {
                  if (delivered) return;

                  isPinnedActive = false;
                  try {
                    chrome.storage.local.set({ isPinnedActive: false });
                  } catch (err) {}
                  translateText(selectedText, x, y);
                });
                return;
              }

              translateText(selectedText, x, y);
            } catch (err) {
              console.warn("DeepTranslate: Detect callback error:", err);
            }
          },
        );
      } catch (e) {}
    }
  }
}

let selectionTimer = null;
// Lắng nghe sự kiện bôi đen xong (mouseup)
document.addEventListener("mouseup", function (e) {
  // Bỏ qua nếu extension đang bị tắt hoặc context bị vô hiệu hóa
  if (!checkContext()) return;

  // Không xử lý nếu click vào bên trong tooltipHost
  if (tooltipHost && e.composedPath().includes(tooltipHost)) return;

  clearTimeout(selectionTimer);
  // Sử dụng setTimeout để đảm bảo trình duyệt đã cập nhật vùng chọn và hỗ trợ double click
  selectionTimer = setTimeout(() => {
    let selectedText = getSelectedText();

    // Hỗ trợ lấy text bôi đen trong input và textarea
    if (!selectedText) {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")
      ) {
        if (activeEl.type !== "password" && activeEl.type !== "hidden") {
          try {
            selectedText = activeEl.value
              .substring(activeEl.selectionStart, activeEl.selectionEnd)
              .trim();
          } catch (err) {
            // Một số loại input không hỗ trợ selectionStart/End
          }
        }
      }
    }

    // Nếu không có text nào được chọn, reset lastSelectedText để có thể bôi đen lại chính từ đó
    if (selectedText.length === 0) {
      lastSelectedText = "";
      return;
    }

    // Kiểm tra logic ngôn ngữ
    handleSelectedText(selectedText, e.pageX + 15, e.pageY + 15);
    return;

    if (selectedText.length > 0) {
      const hasVietnamese = CONFIG.VIETNAMESE_REGEX.test(selectedText);
      const hasEnglishLetter = /[a-zA-Z]/.test(selectedText);

      if (!hasVietnamese && !hasEnglishLetter) return;
      if (currentMode === "en-vi" && hasVietnamese) return;
      // Chế độ vi-en: Không chặn nếu không có dấu, để dịch được từ tiếng Việt không dấu.

      if (selectedText !== lastSelectedText) {
        if (checkContext()) {
          lastSelectedText = selectedText;
          try {
            chrome.storage.local.set({ sharedInputText: selectedText });
          } catch (e) {}
        }

        if (selectedText.length > 500) {
          showTooltip(
            "⚠️ Văn bản quá dài (tối đa 500 ký tự).",
            e.pageX + 15,
            e.pageY + 15,
          );
          return;
        }

        // Bước 1: Detect ngôn ngữ thực sự để tuân thủ nguyên tắc chọn mode nào dịch mode đó
        if (checkContext()) {
          const requestId = ++selectionRequestId;
          try {
            chrome.runtime.sendMessage(
              { action: "detect", text: selectedText.substring(0, 100) },
              (response) => {
                try {
                  if (!checkContext()) return;
                  if (requestId !== selectionRequestId) return;
                  let detectedLang = null;
                  let isReliable = false;

                  if (
                    response &&
                    response.languages &&
                    response.languages.length > 0
                  ) {
                    detectedLang = response.languages[0].language;
                    isReliable = response.isReliable;
                  }

                  if (
                    shouldBlockSelectionByMode(
                      selectedText,
                      currentMode,
                      detectedLang,
                      isReliable,
                    )
                  ) {
                    lastSelectedText = "";
                    removeTooltip();
                    return;
                  }

                  // Bước 2: Tiến hành dịch nếu khớp mode hoặc là từ nghi ngờ (không dấu)
                  if (isPinnedActive) {
                    sendSelectionToPinnedView(selectedText).then(
                      (delivered) => {
                        if (delivered) return;

                        isPinnedActive = false;
                        try {
                          chrome.storage.local.set({ isPinnedActive: false });
                        } catch (err) {}
                        translateText(selectedText, e.pageX + 15, e.pageY + 15);
                      },
                    );
                    return;
                  }
                  translateText(selectedText, e.pageX + 15, e.pageY + 15);
                } catch (err) {
                  console.warn("DeepTranslate: Detect callback error:", err);
                }
              },
            );
          } catch (e) {}
        }
      }
    }
  }, 150);
});

// Lắng nghe sự kiện click chuột xuống để ẩn tooltip khi click ra ngoài (mousedown)
document.addEventListener("mousedown", function (e) {
  if (!checkContext()) return;

  // Đặt lại lastSelectedText ngay khi click chuột để luôn sẵn sàng cho lần chọn tiếp theo
  // (Đặc biệt quan trọng khi ở chế độ ghim - Pinned Mode)
  lastSelectedText = "";

  // Xóa tooltip khi người dùng click vào vùng bất kỳ ngoài tooltip
  if (tooltipHost && !e.composedPath().includes(tooltipHost)) {
    removeTooltip();
  }
});

// --- Entertainment Site SPA & Trigger Support ---
window.addEventListener("yt-navigate-finish", () => {
  if (typeof applySettingsLogic === "function") applySettingsLogic();
});
window.addEventListener("popstate", () => {
  if (typeof applySettingsLogic === "function") applySettingsLogic();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "show_flashcard_invite_trigger") {
    console.log("[DeepTranslate] Received flashcard trigger. force:", request.force);

    // Nếu là trigger thủ công từ popup (force: true), bỏ qua kiểm tra entertainment site
    if (request.force) {
      if (typeof showFlashcardPopup === "function") {
        showFlashcardPopup();
        sendResponse({ success: true, source: "manual" });
      } else {
        sendResponse({ success: false, reason: "showFlashcardPopup not available" });
      }
      return true;
    }

    // Trigger tự động từ background: vẫn giữ nguyên logic kiểm tra entertainment site
    if (!extSettings || !extSettings.flashcard_popup || !extSettings.flashcard_popup.enabled) {
      return;
    }
    const currentHost = window.location.hostname.replace("www.", "");
    const isEntertainment = extSettings.flashcard_popup.entertainment_urls?.some(
      (item) => currentHost.includes(item.url) && item.enabled
    );
    if (!isEntertainment) {
      return;
    }
    if (typeof showFlashcardPopup === "function") {
      showFlashcardPopup();
    }
  }
});

