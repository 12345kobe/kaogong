/* 资料分析 · 速算闯关「消消乐」
   —— 5 个闯关：百化分 / 平方数 / 三次方 / 四次方 / 开根号
   玩法：网格中点选「题目卡」与「答案卡」配对，配对成功即消除（消消乐）；
        点错闪红、不消除，直到点中正确的一对；全部消除即通关。
   含计时（右上角）、暂停、对照表、提示；结束统计 正确率 = 正确次数 / 总尝试次数。
   通过 window.MatchGame.open() 入口（关卡选择），或 window.MatchGame.openLevel(key) 直进某关。 */
(function () {
  "use strict";

  const CATS = [
    { key: "baihuafen", name: "百化分", desc: "百分数 ⇄ 分数（1/x）" },
    { key: "squaring",  name: "平方数", desc: "n² = ?" },
    { key: "cubing",    name: "三次方", desc: "n³ = ?" },
    { key: "fourth",    name: "四次方", desc: "n⁴ = ?" },
    { key: "rooting",   name: "开根号", desc: "√n = ?" }
  ];
  const CAP = { baihuafen: 12 };   // 百化分条目多，每关随机抽 12 组；其余全上

  let styleInjected = false;
  function injectStyle() {
    if (styleInjected) return;
    const s = document.createElement("style");
    s.textContent = `
.kg-match,.kg-match-pick{background:#0f1730!important;color:#e8eefc;border:1px solid #2a3a66;border-radius:16px;}
.kg-match{width:min(960px,98vw);max-height:96vh;display:flex;flex-direction:column;overflow:hidden;}
.kg-match-top{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #2a3a66;}
.kg-match-title{font-size:18px;font-weight:800;flex:1;letter-spacing:1px;}
.kg-match-timer{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:#34e7e4;background:#0a1226;padding:4px 12px;border-radius:10px;}
.kg-match-x{border:none;background:#16224a;color:#9fb0d8;width:32px;height:32px;border-radius:8px;font-size:16px;cursor:pointer;}
.kg-match-x:hover{color:#fff;background:#24345f;}
.kg-match-sub{padding:8px 16px;color:#9fb0d8;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;}
.kg-match-board{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:14px 16px;overflow:auto;flex:1;align-content:start;}
.kg-card{border:none;border-radius:12px;padding:14px 8px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;
  transition:transform .15s,box-shadow .15s,opacity .25s;min-height:56px;display:flex;align-items:center;justify-content:center;
  text-align:center;word-break:break-word;line-height:1.2;user-select:none;-webkit-user-select:none;}
.kg-card-q{background:#34e7e4;color:#06243a;box-shadow:0 4px 0 #1c9aa0;}
.kg-card-a{background:#ff5cf0;color:#3a0033;box-shadow:0 4px 0 #c23fb0;}
.kg-card:active{transform:translateY(1px) scale(.98);}
.kg-card.sel{outline:3px solid #ffd166;transform:translateY(-2px) scale(1.05);box-shadow:0 0 0 3px #ffd166,0 6px 18px rgba(255,209,102,.5);}
.kg-card.kg-wrong{animation:kgwrong .42s;background:#ff4d4f!important;color:#fff!important;box-shadow:0 4px 0 #b02a2c!important;}
.kg-card.kg-gone{animation:kggone .28s forwards;pointer-events:none;}
.kg-card.kg-hint{animation:kghint 1.5s;}
@keyframes kgwrong{0%,100%{transform:scale(1)}20%{transform:scale(.9) rotate(-4deg)}50%{transform:scale(.9) rotate(4deg)}80%{transform:scale(.95)}}
@keyframes kggone{to{transform:scale(0);opacity:0}}
@keyframes kghint{0%,100%{box-shadow:0 4px 0 rgba(0,0,0,.25)}50%{box-shadow:0 0 0 4px #ffd166,0 0 18px #ffd166}}
.kg-match-ctrl{display:flex;gap:8px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid #2a3a66;}
.kg-toast{position:absolute;left:50%;top:64px;transform:translateX(-50%);background:#3ddc97;color:#06321f;font-weight:800;
  padding:8px 18px;border-radius:20px;box-shadow:0 6px 20px rgba(61,220,151,.5);opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;z-index:5;}
.kg-toast.show{opacity:1;transform:translateX(-50%) translateY(6px);}
.kg-match-pick{width:min(700px,96vw);padding:18px;}
.kg-pick-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-top:14px;}
.kg-pick{background:#16224a;border:1px solid #2a3a66;border-radius:12px;padding:14px;color:#e8eefc;cursor:pointer;text-align:left;transition:border-color .15s,transform .15s;}
.kg-pick:hover{border-color:#34e7e4;transform:translateY(-2px);}
.kg-pick-name{font-size:17px;font-weight:800;margin-bottom:4px;}
.kg-pick-best{margin-top:10px;font-size:12px;color:#34e7e4;font-weight:700;}
.kg-result{display:flex;flex-direction:column;align-items:center;gap:10px;padding:26px 16px;text-align:center;}
.kg-result h2{margin:0;font-size:24px;}
.kg-result .big{font-size:40px;font-weight:900;color:#34e7e4;}
.kg-result .row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:8px;}
@media (max-width:480px){.kg-match-board{grid-template-columns:repeat(4,1fr);gap:7px;padding:10px}.kg-card{font-size:14px;min-height:48px;padding:10px 4px}.kg-match-title{font-size:16px}}
`;
    document.head.appendChild(s);
    styleInjected = true;
  }

  function DB() { return window.DB; }
  function ESC(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function getItems(catKey) {
    const ALL = window.FORMULA_ITEMS || [];
    return ALL.filter(x => x.cat === catKey);
  }
  function shuffle(a) {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = r[i]; r[i] = r[j]; r[j] = t; }
    return r;
  }
  function sample(a, n) {
    if (a.length <= n) return a.slice();
    return shuffle(a).slice(0, n);
  }
  function fmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  /* ===== 关卡选择 ===== */
  function open() {
    injectStyle();
    const host = document.createElement("div");
    host.className = "modal-mask";
    host.innerHTML = `<div class="modal kg-match-pick">
      <div class="kg-match-top"><div class="kg-match-title">🎮 速算闯关 · 消消乐</div><button class="kg-match-x" id="mgClose">✕</button></div>
      <div class="muted small" style="color:#9fb0d8">在网格中点选「题目卡」与「答案卡」配对，配对成功即消除（消消乐）；点错会闪红且不会消除，直到点中正确的一对。全部消除即通关。</div>
      <div class="kg-pick-grid" id="mgPick"></div>
    </div>`;
    const root = document.getElementById("modalRoot") || document.body;
    root.appendChild(host);
    const grid = host.querySelector("#mgPick");
    const DBx = DB();
    CATS.forEach(c => {
      const best = DBx && DBx.state && DBx.state.matchBest && DBx.state.matchBest[c.key];
      const b = document.createElement("button");
      b.className = "kg-pick";
      b.innerHTML = `<div class="kg-pick-name">${ESC(c.name)}</div><div class="muted small" style="color:#9fb0d8">${ESC(c.desc)}</div>
        <div class="kg-pick-best">${best ? ("最佳 " + best.acc + "% · " + fmt(best.sec * 1000)) : "未挑战"}</div>`;
      b.onclick = () => { host.remove(); openLevel(c.key); };
      grid.appendChild(b);
    });
    host.querySelector("#mgClose").onclick = () => host.remove();
    host.onclick = e => { if (e.target === host) host.remove(); };
  }

  /* ===== 单关游戏 ===== */
  function openLevel(catKey, fromIdx) {
    injectStyle();
    const cat = CATS.find(c => c.key === catKey) || CATS[0];
    const DBx = DB();
    let pool = getItems(catKey);
    const cap = CAP[catKey] || pool.length;
    pool = sample(pool, cap);

    // 构建卡片：每对 = 题目卡(q) + 答案卡(a)
    let cards = [];
    pool.forEach((it, idx) => {
      cards.push({ id: "q" + idx, pair: idx, side: "q", text: it.prompt, matched: false });
      cards.push({ id: "a" + idx, pair: idx, side: "a", text: it.answer, matched: false });
    });
    cards = shuffle(cards);

    let correct = 0, total = 0, selected = null, paused = false, finished = false;
    let startTs = Date.now(), pausedAccum = 0, pauseStart = 0, timerIv = null;

    const host = document.createElement("div");
    host.className = "modal-mask";
    host.innerHTML = `<div class="modal kg-match" style="position:relative">
      <div class="kg-toast" id="mgToast">✅ 配对成功</div>
      <div class="kg-match-top">
        <div class="kg-match-title">🎮 ${ESC(cat.name)} · 速算闯关</div>
        <div class="kg-match-timer" id="mgTimer">00:00</div>
        <button class="kg-match-x" id="mgClose">✕</button>
      </div>
      <div class="kg-match-sub">
        <span id="mgProg">剩余 ${cards.length / 2} 组</span>
        <span id="mgAcc">正确率 100%</span>
      </div>
      <div class="kg-match-board" id="mgBoard"></div>
      <div class="kg-match-ctrl">
        <button class="btn sm" id="mgPause">⏸ 暂停</button>
        <button class="btn sm" id="mgRef">📋 对照表</button>
        <button class="btn sm" id="mgHint">💡 提示（高亮一对）</button>
        <button class="btn sm ghost" id="mgRestart">↺ 重玩本关</button>
      </div>
    </div>`;
    const root = document.getElementById("modalRoot") || document.body;
    root.appendChild(host);

    const board = host.querySelector("#mgBoard");
    const timerEl = host.querySelector("#mgTimer");
    const progEl = host.querySelector("#mgProg");
    const accEl = host.querySelector("#mgAcc");
    const toastEl = host.querySelector("#mgToast");

    function elapsed() {
      const now = Date.now();
      const pa = pausedAccum + (paused ? (now - pauseStart) : 0);
      return now - startTs - pa;
    }
    function updateSub() {
      const left = cards.filter(c => !c.matched).length / 2;
      progEl.textContent = "剩余 " + left + " 组";
      accEl.textContent = "正确率 " + (total ? Math.round(correct / total * 100) : 100) + "%";
    }
    function showToast(txt) {
      toastEl.textContent = txt;
      toastEl.classList.add("show");
      setTimeout(() => toastEl.classList.remove("show"), 700);
    }
    function renderBoard() {
      board.innerHTML = "";
      cards.forEach(c => {
        if (c.matched) return;
        const b = document.createElement("button");
        b.className = "kg-card kg-card-" + c.side + (selected && selected.id === c.id ? " sel" : "");
        b.textContent = c.text;
        b.dataset.id = c.id;
        b.onclick = () => onCard(c, b);
        board.appendChild(b);
      });
    }
    function pulse(id, cls, ms) {
      const b = board.querySelector('[data-id="' + id + '"]');
      if (!b) return;
      b.classList.add(cls);
      setTimeout(() => { try { b.classList.remove(cls); } catch (e) {} }, ms);
    }

    function onCard(c, btn) {
      if (finished || paused || c.matched) return;
      if (selected && selected.id === c.id) { selected = null; renderBoard(); return; }
      if (!selected) { selected = c; renderBoard(); return; }
      // 第二张：判定
      total++;
      if (selected.pair === c.pair) {
        correct++;
        const a = selected; selected = null;
        a.matched = true; c.matched = true;
        pulse(a.id, "kg-gone", 300); pulse(c.id, "kg-gone", 300);
        showToast("✅ 配对成功");
        setTimeout(() => { renderBoard(); updateSub(); checkDone(); }, 300);
      } else {
        pulse(selected.id, "kg-wrong", 440); pulse(c.id, "kg-wrong", 440);
        selected = null;
        setTimeout(() => renderBoard(), 440);
      }
      updateSub();
    }

    function checkDone() {
      if (cards.every(c => c.matched)) finish();
    }
    function finish() {
      finished = true;
      if (timerIv) { clearInterval(timerIv); timerIv = null; }
      const sec = Math.max(1, Math.round(elapsed() / 1000));
      const mins = Math.max(1, Math.round(sec / 60));
      const acc = total ? Math.round(correct / total * 100) : 100;
      recordResult(catKey, acc, sec, mins);
      showResult(acc, sec, mins);
    }
    function recordResult(catKey, acc, sec, mins) {
      const D = DB(); if (!D) return;
      try {
        D.state.matchBest = D.state.matchBest || {};
        const prev = D.state.matchBest[catKey];
        if (!prev || acc > prev.acc || (acc === prev.acc && sec < prev.sec)) {
          D.state.matchBest[catKey] = { acc: acc, sec: sec };
        }
        D.addTimerMinutes("data", mins);
        D.addSubjectSession("data", mins);
        const ac = D.state.accuracyCumulative = D.state.accuracyCumulative || {};
        ac["资料"] = ac["资料"] || { correct: 0, total: 0 };
        ac["资料"].correct += correct; ac["资料"].total += total;
        D.save();
      } catch (e) {}
    }
    function showResult(acc, sec, mins) {
      const idx = CATS.findIndex(c => c.key === catKey);
      const next = CATS[(idx + 1) % CATS.length];
      board.style.display = "none";
      host.querySelector(".kg-match-ctrl").style.display = "none";
      const sub = host.querySelector(".kg-match-sub");
      if (sub) sub.style.display = "none";
      const panel = document.createElement("div");
      panel.className = "kg-result";
      panel.innerHTML = `
        <h2>🎉 通关！${ESC(cat.name)}</h2>
        <div class="big">${acc}%</div>
        <div class="muted small" style="color:#9fb0d8">本次正确率（正确 ${correct} / 尝试 ${total}）· 用时 ${fmt(sec * 1000)} · 已记录「资料分析」学习 ${mins} 分钟</div>
        <div class="row">
          <button class="btn primary" id="mgNext">➡ 下一关（${ESC(next.name)}）</button>
          <button class="btn" id="mgRe">↺ 再来一次</button>
          <button class="btn ghost" id="mgBack">🏠 返回选关</button>
        </div>`;
      host.querySelector(".kg-match").insertBefore(panel, host.querySelector(".kg-match-ctrl"));
      panel.querySelector("#mgNext").onclick = () => { host.remove(); openLevel(next.key); };
      panel.querySelector("#mgRe").onclick = () => { host.remove(); openLevel(catKey); };
      panel.querySelector("#mgBack").onclick = () => { host.remove(); open(); };
    }

    function pauseToggle() {
      if (finished) return;
      const btn = host.querySelector("#mgPause");
      if (!paused) {
        paused = true; pauseStart = Date.now();
        if (btn) btn.textContent = "▶ 继续";
        board.style.opacity = ".45"; board.style.pointerEvents = "none";
      } else {
        paused = false; pausedAccum += Date.now() - pauseStart;
        if (btn) btn.textContent = "⏸ 暂停";
        board.style.opacity = "1"; board.style.pointerEvents = "auto";
      }
    }
    function openRef() {
      const list = pool;
      const box = document.createElement("div");
      box.innerHTML = `<div style="max-height:60vh;overflow:auto;display:flex;flex-direction:column;gap:6px">
        ${list.map(it => `<div class="todo"><div style="flex:1"><b>${ESC(it.prompt)}</b>
          <span style="color:#34e7e4;font-family:monospace"> = ${ESC(it.answer)}</span></div></div>`).join("")}
      </div>`;
      const UI = window.UI;
      if (UI && UI.modal) UI.modal({ title: cat.name + " · 对照表（" + list.length + " 组）", body: box, width: "520px",
        actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }] });
    }
    function hint() {
      if (finished || paused) return;
      const left = cards.filter(c => !c.matched);
      const byPair = {};
      left.forEach(c => { (byPair[c.pair] = byPair[c.pair] || []).push(c); });
      const keys = Object.keys(byPair).filter(k => byPair[k].length === 2);
      if (!keys.length) return;
      const k = keys[Math.floor(Math.random() * keys.length)];
      byPair[k].forEach(c => pulse(c.id, "kg-hint", 1500));
    }

    renderBoard();
    updateSub();
    timerIv = setInterval(() => { if (timerEl && !paused && !finished) timerEl.textContent = fmt(elapsed()); }, 250);

    host.querySelector("#mgClose").onclick = () => { if (timerIv) clearInterval(timerIv); host.remove(); };
    host.querySelector("#mgPause").onclick = pauseToggle;
    host.querySelector("#mgRef").onclick = openRef;
    host.querySelector("#mgHint").onclick = hint;
    host.querySelector("#mgRestart").onclick = () => { if (timerIv) clearInterval(timerIv); host.remove(); openLevel(catKey); };
    host.onclick = e => { if (e.target === host) { if (timerIv) clearInterval(timerIv); host.remove(); } };
  }

  window.MatchGame = { open: open, openLevel: openLevel, CATS: CATS };
})();
