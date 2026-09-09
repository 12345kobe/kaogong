/* 共享 UI 组件：toast / modal / 上课计时器 / 待办 / 每日进度 */
(function () {
  "use strict";
  const DB = window.DB;

  function el(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  const UI = {
    el, esc,
    toast(msg) {
      const t = el(`<div class="toast">${esc(msg)}</div>`);
      document.getElementById("toastRoot").appendChild(t);
      setTimeout(() => t.remove(), 2200);
    },
    modal({ title, body, actions, width }) {
      const mask = el(`<div class="modal-mask"></div>`);
      const m = el(`<div class="modal" style="${width ? "width:" + width : ""}"></div>`);
      m.appendChild(el(`<h2>${esc(title)}</h2>`));
      const bodyEl = el(`<div class="modal-body"></div>`);
      if (typeof body === "string") bodyEl.innerHTML = body; else bodyEl.appendChild(body);
      m.appendChild(bodyEl);
      const bar = el(`<div class="row" style="margin-top:16px;justify-content:flex-end"></div>`);
      (actions || []).forEach(a => {
        const b = el(`<button class="btn ${a.cls || ""}">${esc(a.label)}</button>`);
        b.onclick = () => a.onClick && a.onClick(m, close);
        bar.appendChild(b);
      });
      m.appendChild(bar);
      mask.appendChild(m);
      function close() { mask.remove(); }
      mask.onclick = (e) => { if (e.target === mask && !(actions && actions.some(a => a.keepOpen))) close(); };
      document.getElementById("modalRoot").appendChild(mask);
      return { el: m, body: bodyEl, close };
    },
    confirm(msg) {
      return new Promise(res => {
        UI.modal({
          title: "确认", body: `<p>${esc(msg)}</p>`,
          actions: [
            { label: "取消", cls: "ghost", onClick: (m, c) => { c(); res(false); } },
            { label: "确定", cls: "primary", onClick: (m, c) => { c(); res(true); } }
          ]
        });
      });
    },

    /* ===== 圆盘进度 ===== */
    disc(pct, centerHtml) {
      pct = Math.max(0, Math.min(1, pct));
      const r = 80, c = 2 * Math.PI * r;
      return `<div class="disc"><svg width="180" height="180" viewBox="0 0 180 180">
        <circle cx="90" cy="90" r="${r}" stroke="#27345f" stroke-width="12" fill="none"/>
        <circle cx="90" cy="90" r="${r}" stroke="url(#dg)" stroke-width="12" fill="none"
          stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/>
        <defs><linearGradient id="dg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#34e7e4"/><stop offset="1" stop-color="#ff5cf0"/></linearGradient></defs>
      </svg><div class="disc-center">${centerHtml}</div></div>`;
    },

    /* ===== 上岸计时器组件（大号电子钟倒计时 + 每次不同的激励语）===== */
    Timer(module, mount) {
      let remain = 0, total = DB.state.settings.timerGoalMin || 25, running = false, iv = null, doneMsg = "";
      let lastIdx = -1;
      const PHRASES = [
        "坚持很酷，今天的你比昨天更强一寸。",
        "把每一分钟，都变成上岸的台阶。",
        "专注的力量，会悄悄改写结局。",
        "你读过的每一页书，都在为未来铺路。",
        "别着急，按自己的节奏，稳稳地走。",
        "上岸不是运气，是日复一日的笃定。",
        "这一程的孤独，是为了下一段的辽阔。",
        "你现在的努力，是给未来的自己写情书。",
        "慢一点没关系，只要一直在向前。",
        "今天的专注，是明天考场上多一分底气。",
        "能坐得住冷板凳的人，才配得上热掌声。",
        "你离想要的生活，只差不肯放弃的自己。"
      ];
      function pickPhrase() {
        let i;
        do { i = Math.floor(Math.random() * PHRASES.length); } while (PHRASES.length > 1 && i === lastIdx);
        lastIdx = i;
        return PHRASES[i];
      }
      function fmt(s) { return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
      function render() {
        const todayMin = DB.getTodayMinutes();
        const goal = DB.state.timerGoal[module] || (DB.state.settings.timerGoalMin * 4);
        const pct = goal > 0 ? todayMin / goal : 0;
        const tm = (DB.state.timer.counts = DB.state.timer.counts || {});
        const cnt = tm[DB.today()] || 0;
        mount.innerHTML = `<div class="card">
          <h3>⏱ 上岸计时器</h3>
          <div class="disc-wrap">
            ${UI.disc(pct, `<div class="disc-min">${todayMin}</div><div class="disc-sub">/ ${goal} 分钟</div>`)}
            <div class="muted small">今日已完成专注 ${cnt} 次</div>
          </div>
          <div class="row" style="justify-content:center;margin-top:10px;flex-wrap:wrap;gap:8px">
            <label class="fld" style="margin:0">单段时长(分)</label>
            <input type="number" min="1" max="600" value="${total}" id="tDur" style="width:80px"/>
            <button class="btn primary" id="tStart">${running ? "暂停" : "开始"}</button>
            <button class="btn" id="tReset">重置</button>
            <button class="btn ghost" id="tLog" title="直接记录一段">＋记录</button>
          </div>
          <div id="tStatus" class="center muted small" style="margin-top:10px">${running ? "专注中，保持呼吸，稳住" : "设定时长后开始，结束自动记录"}</div>
          <div id="tClock" class="timer-clock ${running ? "show" : ""}">${fmt(running ? remain : total * 60)}</div>
          <div id="tDone" class="timer-done" style="${doneMsg ? "display:block" : "display:none"}">${doneMsg ? "🎉 " + doneMsg : ""}</div>
        </div>`;
        mount.querySelector("#tDur").onchange = e => { total = Math.max(1, +e.target.value || 25); if (!running) render(); };
        mount.querySelector("#tStart").onclick = () => running ? stop(false) : start();
        mount.querySelector("#tReset").onclick = () => stop(true);
        mount.querySelector("#tLog").onclick = () => { DB.addTimerMinutes(module, total); bump(); render(); UI.toast("已记录 " + total + " 分钟"); };
      }
      function start() {
        total = Math.max(1, +mount.querySelector("#tDur").value || 25);
        remain = total * 60; running = true; doneMsg = "";
        clearInterval(iv); iv = null;
        render();
        const clockEl = mount.querySelector("#tClock");
        iv = setInterval(() => {
          remain--;
          if (clockEl) clockEl.textContent = fmt(remain);
          if (remain <= 0) finish();
        }, 1000);
      }
      function finish() {
        running = false; clearInterval(iv); iv = null;
        DB.addTimerMinutes(module, total); bump();
        doneMsg = pickPhrase();
        UI.toast("🎉 专注完成 +" + total + " 分钟");
        render();
      }
      function stop(reset) {
        running = false; clearInterval(iv); iv = null; doneMsg = "";
        if (reset) remain = 0;
        render();
      }
      function bump() { const tm = DB.state.timer.counts = DB.state.timer.counts || {}; const t = DB.today(); tm[t] = (tm[t] || 0) + 1; DB.save(); }

      render();
    },

    /* ===== 待办事项 + 每日进度（合并卡片） ===== */
    StudyPanel(module, mount) {
      const wrap = el(`<div class="grid g2"></div>`);
      const left = el(`<div></div>`);
      const right = el(`<div></div>`);
      wrap.appendChild(left); wrap.appendChild(right);
      mount.appendChild(wrap);
      UI.Timer(module, left);

      // 待办
      const todoCard = el(`<div class="card"><h3>✅ 待办事项</h3></div>`);
      const modeRow = el(`<div class="row" style="gap:6px;margin-bottom:8px;align-items:center">
        <span class="muted small">答题模式</span>
        <button class="btn sm qmode" data-m="practice">练题</button>
        <button class="btn sm qmode" data-m="memorize">背题</button>
        <span class="muted small" id="qmodeHint"></span></div>`);
      const add = el(`<div class="row" style="margin-bottom:10px"><input id="tIn" placeholder="添加学习任务…"/><button class="btn primary" id="tAdd">添加</button></div>`);
      const list = el(`<div id="tList" style="display:flex;flex-direction:column;gap:8px"></div>`);
      todoCard.appendChild(modeRow); todoCard.appendChild(add); todoCard.appendChild(list);
      // 进度
      const progCard = el(`<div class="card"><h3>📊 每日学习进度</h3><div id="pWrap"></div></div>`);
      right.appendChild(todoCard); right.appendChild(progCard);

      function refreshMode() {
        const m = (DB.state.settings && DB.state.settings.quizMode) || "practice";
        modeRow.querySelectorAll(".qmode").forEach(b => b.classList.toggle("primary", b.dataset.m === m));
        modeRow.querySelector("#qmodeHint").textContent = m === "practice" ? "（先答完再看答案）" : "（选完即看答案）";
      }
      modeRow.querySelectorAll(".qmode").forEach(b => b.onclick = () => {
        DB.state.settings = DB.state.settings || {}; DB.state.settings.quizMode = b.dataset.m; DB.save();
        refreshMode(); UI.toast("默认答题模式：" + (b.dataset.m === "practice" ? "练题" : "背题"));
      });
      refreshMode();

      function reviewWrong(subjModule) {
        const subjMap = { verbal: "言语", politics: "政治", common: "常识", essay: "申论", data: "资料", logic: "逻辑", quantity: "数量" };
        const subject = subjMap[subjModule] || subjModule;
        const items = (DB.state.wrongbook[subject] || []).slice(-30);
        if (!items.length) { UI.toast("暂无错题可复盘"); return; }
        const host = el(`<div class="kp-quiz" style="max-height:68vh;overflow:auto"></div>`);
        UI.modal({ title: subject + " · 错题复盘", body: host, width: "720px", actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }] });
        const qs = items.map(it => ({ q: it.q, options: (it.options || []).slice(), a: it.a, e: it.e || "", optInfo: it.optInfo || null }));
        function done() {
          DB.state.todos[subjModule] = (DB.state.todos[subjModule] || []).filter(x => !(x.type === "quiz-wrong"));
          DB.state.reviewLog = DB.state.reviewLog || [];
          DB.state.reviewLog.push({ module: subjModule, subject, time: DB.today() + " " + DB.fmtTime(new Date()) });
          DB.save(); UI.toast("✅ 复盘完成，已记录并清除待办"); renderTodo(); renderProg();
        }
        function run() { host.innerHTML = ""; window.Quiz.start(host, qs, subject, { mode: "memorize", onDone: done, onAgain: run }); }
        run();
      }

      function renderTodo() {
        const arr = DB.state.todos[module] = DB.state.todos[module] || [];
        list.innerHTML = "";
        if (!arr.length) list.innerHTML = `<div class="empty">暂无任务，添加今日计划吧</div>`;
        arr.forEach(t => {
          const row = el(`<div class="todo ${t.done ? "done" : ""}">
            <div class="chk ${t.done ? "on" : ""}">${t.done ? "✓" : ""}</div>
            <div class="todo-text">${esc(t.text)}</div>
            ${t.type === "quiz-wrong" ? `<button class="btn sm" data-rev style="margin-left:auto">复盘</button>` : ""}
            <button class="del">✕</button></div>`);
          row.querySelector(".chk").onclick = () => { t.done = !t.done; DB.save(); renderTodo(); renderProg(); };
          if (row.querySelector("[data-rev]")) row.querySelector("[data-rev]").onclick = () => reviewWrong(module);
          row.querySelector(".del").onclick = () => { DB.state.todos[module] = arr.filter(x => x.id !== t.id); DB.save(); renderTodo(); renderProg(); };
          list.appendChild(row);
        });
      }
      function renderProg() {
        const arr = DB.state.todos[module] = DB.state.todos[module] || [];
        const done = arr.filter(t => t.done).length;
        const pct = arr.length ? Math.round(done / arr.length * 100) : 0;
        document.getElementById("pWrap").innerHTML =
          `<div class="disc-wrap"><div style="font-size:34px" class="pct">${pct}%</div>
           <div class="progress-bar" style="width:100%"><i style="width:${pct}%"></i></div>
           <div class="muted small">${done} / ${arr.length} 项已完成</div></div>`;
      }
      function addTodo() {
        const v = todoCard.querySelector("#tIn").value.trim();
        if (!v) return;
        DB.state.todos[module] = DB.state.todos[module] || [];
        DB.state.todos[module].push({ id: DB.uid(), text: v, done: false, day: DB.today() });
        todoCard.querySelector("#tIn").value = ""; DB.save(); renderTodo(); renderProg();
      }
      todoCard.querySelector("#tAdd").onclick = addTodo;
      todoCard.querySelector("#tIn").onkeydown = e => { if (e.key === "Enter") addTodo(); };

      renderTodo(); renderProg();
    },

    /* ===== 手写标注画板（Apple Pencil） =====
       open(subject, qid, questionText, onChange)
       - 书写时锁定页面滑动（touch-action:none + 锁定 content 滚动）
       - 工具栏：撤回(一笔) / 消除全部 / 完成(保存并恢复滑动)
       - 笔迹按 normalized 坐标存储，跨设备/尺寸可还原 */
    Handwriting: {
      open(subject, qid, questionText, onChange) {
        const DB = window.DB;
        const notesRoot = DB.state.notes = DB.state.notes || {};
        notesRoot[subject] = notesRoot[subject] || {};
        let strokes = notesRoot[subject][qid] ? JSON.parse(JSON.stringify(notesRoot[subject][qid])) : [];
        let cur = null, drawing = false;

        const mask = el(`<div class="modal-mask hw-mask"></div>`);
        const m = el(`<div class="modal hw-modal"></div>`);
        m.appendChild(el(`<h2>✏️ 手写标注</h2>`));
        m.appendChild(el(`<div class="hw-q">${esc(questionText)}</div>`));
        const wrap = el(`<div class="hw-canvas-wrap"></div>`);
        const canvas = el(`<canvas class="hw-canvas"></canvas>`);
        wrap.appendChild(canvas);
        m.appendChild(wrap);
        m.appendChild(el(`<div class="hw-tip">用 Apple Pencil 在画板上书写；书写时已锁定页面滑动。完成后点「完成」保存并恢复滑动。</div>`));
        const bar = el(`<div class="row" style="justify-content:center;margin-top:10px;gap:8px"></div>`);
        const undoBtn = el(`<button class="btn">↶ 撤回一笔</button>`);
        const clearBtn = el(`<button class="btn">🧹 消除笔迹</button>`);
        const doneBtn = el(`<button class="btn primary">完成</button>`);
        bar.appendChild(undoBtn); bar.appendChild(clearBtn); bar.appendChild(doneBtn);
        m.appendChild(bar);
        mask.appendChild(m);
        document.getElementById("modalRoot").appendChild(mask);

        // 锁定背景滚动
        const content = document.getElementById("content");
        const prevOverflow = content.style.overflow;
        content.style.overflow = "hidden";

        const ctx = canvas.getContext("2d");
        function rectSize() { return canvas.getBoundingClientRect(); }
        function redraw() {
          const r = rectSize();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.lineCap = "round"; ctx.lineJoin = "round";
          strokes.forEach(st => {
            if (!st.points.length) return;
            ctx.strokeStyle = st.color || "#ffd166"; ctx.lineWidth = st.width || 3;
            ctx.beginPath();
            st.points.forEach((p, idx) => {
              const x = p.x * r.width, y = p.y * r.height;
              idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            });
            ctx.stroke();
          });
        }
        function sizeCanvas() {
          const r = rectSize();
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.max(1, Math.round(r.width * dpr));
          canvas.height = Math.max(1, Math.round(r.height * dpr));
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          redraw();
        }
        function pos(e) { const r = rectSize(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }

        canvas.style.touchAction = "none";
        canvas.addEventListener("pointerdown", e => {
          drawing = true; cur = { color: "#ffd166", width: 3, points: [] };
          cur.points.push(pos(e));
          try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        });
        canvas.addEventListener("pointermove", e => {
          if (!drawing) return;
          cur.points.push(pos(e)); redraw();
        });
        const endStroke = () => { if (!drawing) return; drawing = false; if (cur && cur.points.length) strokes.push(cur); cur = null; };
        canvas.addEventListener("pointerup", endStroke);
        canvas.addEventListener("pointercancel", endStroke);

        undoBtn.onclick = () => { strokes.pop(); redraw(); };
        clearBtn.onclick = () => { strokes = []; redraw(); };
        const save = () => {
          if (strokes.length) notesRoot[subject][qid] = strokes; else delete notesRoot[subject][qid];
          DB.save(); if (onChange) onChange();
        };
        const close = () => { content.style.overflow = prevOverflow; window.removeEventListener("resize", sizeCanvas); mask.remove(); };
        doneBtn.onclick = () => { save(); close(); };
        mask.onclick = e => { if (e.target === mask) { save(); close(); } };

        requestAnimationFrame(sizeCanvas);
        window.addEventListener("resize", sizeCanvas);
      }
    }
  };

  window.UI = UI;
})();
