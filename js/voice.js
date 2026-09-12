/* 语音转文字（Web Speech API）
   - 按钮显示在聚焦的输入框/文本域正下方（插入到 DOM 中，非悬浮），不遮挡其他操作；
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
  let bar = null;

  function editable(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") {
      const t = (el.type || "text").toLowerCase();
      return ["text", "search", "email", "url", "tel", ""].indexOf(t) >= 0;
    }
    return false;
  }

  function ensureBar() {
    if (bar) return bar;
    bar = document.createElement("div");
    bar.id = "kgVoiceInline";
    bar.innerHTML =
      `<button class="kg-voice-lang" type="button">${LANGS[langIdx].label}</button>` +
      `<button class="kg-voice-mic" type="button" title="语音转文字（再次点击停止）">🎤</button>`;
    bar.querySelector(".kg-voice-lang").onclick = (e) => {
      e.stopPropagation();
      langIdx = (langIdx + 1) % LANGS.length;
      bar.querySelector(".kg-voice-lang").textContent = LANGS[langIdx].label;
    };
    bar.querySelector(".kg-voice-mic").onclick = (e) => {
      e.stopPropagation();
      toggle();
    };
    return bar;
  }

  function attachTo(el) {
    if (!el || !el.parentNode) return;
    const b = ensureBar();
    if (b.parentNode === el.parentNode && b.previousElementSibling === el) return;
    el.parentNode.insertBefore(b, el.nextSibling);
  }
  function detach() {
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
  }

  function initInline() {
    if (!supported) return;
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
  }

  function onFocus(e) {
    if (editable(e.target)) {
      lastEditable = e.target;
      attachTo(e.target);
    }
  }
  function onBlur(e) {
    if (listening) return;
    const rt = e && e.relatedTarget;
    if (rt && (rt === bar || (rt.closest && rt.closest("#kgVoiceInline")))) return;
    setTimeout(() => {
      if (listening) return;
      const a = document.activeElement;
      if (a && (a === bar || (a.closest && a.closest("#kgVoiceInline")))) return;
      if (editable(a)) {
        // 焦点移动到另一个输入框：attachTo 会在 focusin 里处理，这里不 detach
        return;
      }
      detach();
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
    const mic = bar ? bar.querySelector(".kg-voice-mic") : null;
    if (mic) { mic.classList.add("on"); mic.textContent = "🔴"; }
    try { recog.start(); } catch (e) {}
  }

  function stop() {
    listening = false;
    if (recog) { try { recog.stop(); } catch (e) {} }
    const mic = bar ? bar.querySelector(".kg-voice-mic") : null;
    if (mic) { mic.classList.remove("on"); mic.textContent = "🎤"; }
    setTimeout(() => {
      if (listening) return;
      const a = document.activeElement;
      if (editable(a) || (a && a.closest && a.closest("#kgVoiceInline"))) return;
      detach();
    }, 120);
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
    enableFloating: initInline,   // 保持 app.js 调用名不变
    toggle: toggle,
    stop: stop
  };
})();
