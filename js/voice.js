/* 语音转文字（Web Speech API）
   - 浮动 🎤 按钮：任意文本框 / 文本域聚焦时出现于右下角，点击开始识别，再次点击停止；
   - 语言切换：🎤 旁的语言按钮在「🇨🇳 普通话 / 🇬🇧 English」之间切换；
   - 识别结果实时插入当前输入框（追加，自动补空格）。
   依赖浏览器原生 SpeechRecognition（Chrome / Edge / Safari 支持；需 https + 麦克风权限）。
*/
(function () {
  "use strict";
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SR;

  const LANGS = [
    { key: "zh-CN", label: "🇨🇳 普通话" },
    { key: "en-US", label: "🇬🇧 English" }
  ];
  let langIdx = 0;
  let recog = null;
  let listening = false;
  let lastEditable = null;          // 最近一次聚焦的可输入元素（用于插入文字）
  let fab, langBtn, micBtn;

  function editable(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") {
      const t = (el.type || "text").toLowerCase();
      return ["text", "search", "email", "url", "tel", ""].indexOf(t) >= 0;
    }
    return false;
  }

  function initFloating() {
    if (!supported) return;
    fab = document.createElement("div");
    fab.id = "kgVoice";
    fab.innerHTML =
      `<button id="kgVoiceLang" class="kg-voice-lang" type="button">${LANGS[langIdx].label}</button>` +
      `<button id="kgVoiceMic" class="kg-voice-mic" type="button" title="语音转文字（再次点击停止）">🎤</button>`;
    document.body.appendChild(fab);
    langBtn = fab.querySelector("#kgVoiceLang");
    micBtn = fab.querySelector("#kgVoiceMic");
    langBtn.onclick = () => {
      langIdx = (langIdx + 1) % LANGS.length;
      langBtn.textContent = LANGS[langIdx].label;
    };
    micBtn.onclick = toggle;
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
  }

  function onFocus(e) {
    if (editable(e.target)) {
      lastEditable = e.target;
      if (!listening) fab.style.display = "flex";
    }
  }
  function onBlur() {
    if (listening) return;
    setTimeout(() => {
      if (listening) return;
      const a = document.activeElement;
      if (a && a.closest && a.closest("#kgVoice")) return; // 点到语音控件，保持显示
      fab.style.display = "none";
    }, 120);
  }

  function toggle() {
    const el = lastEditable || document.activeElement;
    if (!editable(el)) {
      (window.UI && window.UI.toast) ? window.UI.toast("请先点一下要输入的文本框") : alert("请先点一下要输入的文本框");
      return;
    }
    if (listening) stop();
    else start(el);
  }

  function start(el) {
    lastEditable = el;
    if (!recog) recog = new SR();
    recog.lang = LANGS[langIdx].key;
    recog.interimResults = true;
    recog.continuous = true;
    recog.onresult = onResult;
    recog.onerror = (ev) => {
      const msg = ev && ev.error ? ev.error : "出错";
      if (window.UI) window.UI.toast("语音识别：" + msg);
      stop();
    };
    recog.onend = () => {
      // 仍在监听时自动重启（部分浏览器会在停顿后结束）
      if (listening) { try { recog.start(); } catch (e) {} }
    };
    listening = true;
    micBtn.classList.add("on");
    micBtn.textContent = "🔴";
    try { recog.start(); } catch (e) {}
  }

  function stop() {
    listening = false;
    if (recog) { try { recog.stop(); } catch (e) {} }
    if (micBtn) { micBtn.classList.remove("on"); micBtn.textContent = "🎤"; }
  }

  function onResult(e) {
    let final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript;
    }
    if (final && lastEditable) {
      const cur = lastEditable.value || "";
      lastEditable.value = (cur && !/\s$/.test(cur) ? cur + " " : cur) + final;
      // 通知框架（部分模块按 input/change 读取，这里派发事件保险）
      try {
        lastEditable.dispatchEvent(new Event("input", { bubbles: true }));
        lastEditable.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (err) {}
    }
  }

  window.KGVoice = {
    supported: supported,
    enableFloating: initFloating,
    toggle: toggle,
    stop: stop
  };
})();
