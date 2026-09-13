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

    /* ===== 可折叠小板块（<details>，默认折叠，open:true 则默认展开） ===== */
    section(title, opts) {
      opts = opts || {};
      const open = opts.open ? " open" : "";
      return el(`<details class="kg-det"${open}>
        <summary class="kg-det-s"><span class="kg-det-t">${esc(title)}</span><span class="kg-det-arrow">▸</span></summary>
        <div class="kg-det-b"></div>
      </details>`);
    },

    /* ===== 通用折叠：把模块内「直接子卡片」自动包成可折叠小板块 =====
       说明：第一个卡片通常是模块主功能，保持展开；其余辅助小板块默认折叠。
       已在 .kg-det 内的、或已处理过的卡片会跳过，所以手动用 section() 包过的模块不会重复包裹。 */
    autoCollapse(body, opts) {
      if (!body || !body.children) return;
      opts = opts || {};
      const cards = Array.prototype.filter.call(body.children, function (c) {
        return c.classList && c.classList.contains("card") && !c.classList.contains("kg-det") && c.dataset.kgDet !== "1";
      });
      cards.forEach(function (card, i) {
        const head = card.querySelector("h3, h2, .card-title");
        let title = head ? (head.textContent || "").trim() : "";
        if (!title) title = opts.fallback || ("板块 " + (i + 1));
        const det = el(`<details class="kg-det"><summary class="kg-det-s"><span class="kg-det-t">${esc(title)}</span><span class="kg-det-arrow">▸</span></summary><div class="kg-det-b"></div></details>`);
        card.parentNode.insertBefore(det, card);
        det.querySelector(".kg-det-b").appendChild(card);
        if (head) head.style.display = "none"; // 标题已由 summary 显示，避免重复
        card.dataset.kgDet = "1";
        if (i === 0 && opts.openFirst !== false) det.setAttribute("open", "open");
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

    /* ===== 全屏手写板（截图同款） =====
       UI.Handwriting.open({subject, id, title, anchor, onChange})
         - 工具栏：✕ 关闭 | ✎ 钢笔（默认） | 橡皮擦 | ↶ 撤回 | ↷ 重做 | 🗑 清空
         - 笔迹按 normalized 坐标存 DB.state.notes[subject][id]，跨设备还原
       UI.Notes.get/set/has/overlayHtml  —— 通用存取与导出 SVG */
    Handwriting: {
      open(opts) {
        const subject = opts.subject, id = opts.id, anchor = opts.anchor || null;
        const onChange = opts.onChange;
        const DB = window.DB;
        const notesRoot = DB.state.notes = DB.state.notes || {};
        notesRoot[subject] = notesRoot[subject] || {};
        let notes = notesRoot[subject][id] ? JSON.parse(JSON.stringify(notesRoot[subject][id])) : null;
        if (!notes) notes = { vw: 0, vh: 0, strokes: [] };
        if (!notes.strokes) notes.strokes = [];
        let redo = [];
        let tool = "pen";                 // pen | erase
        let cur = null, drawing = false;  // cur.points 为屏幕像素坐标
        const color = "#ff6b4a", penW = 3.4, eraseW = 24;

        const overlay = el(`<div class="hw-overlay">
          <div class="hw-tools">
            <button class="hw-tool close" title="关闭并保存">✕</button>
            <button class="hw-tool t-pen active" data-tool="pen" title="手写笔">✎</button>
            <button class="hw-tool t-erase" data-tool="erase" title="橡皮擦">🧽</button>
            <button class="hw-tool undo" title="撤回上一笔">↶</button>
            <button class="hw-tool redo" title="重做上一笔">↷</button>
            <button class="hw-tool clear" title="清空全部">🗑</button>
          </div>
          <canvas class="hw-layer"></canvas>
        </div>`);
        document.body.appendChild(overlay);

        const prevBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const canvas = overlay.querySelector(".hw-layer");
        const mainCtx = canvas.getContext("2d", { alpha: true });
        const offCanvas = document.createElement("canvas");
        const offCtx = offCanvas.getContext("2d", { alpha: true });

        let screenW = 0, screenH = 0, normW = 1, normH = 1;
        let anchorRect = null;
        function refreshMetrics() {
          const r = canvas.getBoundingClientRect();
          screenW = r.width; screenH = r.height;
          if (anchor) {
            anchorRect = anchor.getBoundingClientRect();
            normW = Math.max(1, anchor.clientWidth || screenW);
            normH = Math.max(1, (anchor.scrollHeight || anchor.clientHeight || screenH));
          } else {
            anchorRect = null; normW = Math.max(1, screenW); normH = Math.max(1, screenH);
          }
          notes.vw = normW; notes.vh = normH;
        }
        function toNorm(px, py) {
          if (anchorRect) return { x: (px - anchorRect.left) / normW, y: (py - anchorRect.top + (anchor ? anchor.scrollTop : 0)) / normH };
          return { x: px / normW, y: py / normH };
        }
        function toScreen(nx, ny) {
          if (anchorRect) return { x: nx * normW + anchorRect.left, y: ny * normH + anchorRect.top - (anchor ? anchor.scrollTop : 0) };
          return { x: nx * normW, y: ny * normH };
        }

        function sizeCanvas() {
          refreshMetrics();
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.max(1, Math.round(screenW * dpr));
          canvas.height = Math.max(1, Math.round(screenH * dpr));
          canvas.style.width = screenW + "px";
          canvas.style.height = screenH + "px";
          offCanvas.width = canvas.width; offCanvas.height = canvas.height;
          mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          renderToOffscreen(); blit();
        }
        function absolute(e) {
          const r = canvas.getBoundingClientRect();
          return { x: e.clientX - r.left, y: e.clientY - r.top };
        }
        function drawStroke(ctx, st) {
          if (!st.points || st.points.length < 2) return;
          ctx.strokeStyle = st.color || color; ctx.lineWidth = st.width || penW;
          ctx.lineCap = "round"; ctx.lineJoin = "round";
          ctx.beginPath();
          st.points.forEach((p, idx) => { const s = toScreen(p.x, p.y); idx === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y); });
          ctx.stroke();
        }
        function renderToOffscreen() {
          offCtx.clearRect(0, 0, screenW, screenH);
          notes.strokes.forEach(st => drawStroke(offCtx, st));
        }
        function blit() {
          mainCtx.clearRect(0, 0, screenW, screenH);
          mainCtx.drawImage(offCanvas, 0, 0, screenW, screenH);
        }
        function drawCurrent(ctx) {
          if (!cur || cur.points.length < 2) return;
          if (tool === "pen") {
            ctx.strokeStyle = color; ctx.lineWidth = penW; ctx.lineCap = "round"; ctx.lineJoin = "round";
            ctx.beginPath();
            cur.points.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
            ctx.stroke();
          } else if (tool === "erase") {
            ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = eraseW; ctx.lineCap = "round"; ctx.lineJoin = "round";
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            cur.points.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
            ctx.stroke(); ctx.setLineDash([]);
          }
        }
        function distToSeg(P, A, B) {
          const l2 = (A.x - B.x) ** 2 + (A.y - B.y) ** 2;
          if (l2 === 0) return Math.hypot(P.x - A.x, P.y - A.y);
          let t = ((P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y)) / l2;
          t = Math.max(0, Math.min(1, t));
          return Math.hypot(P.x - (A.x + t * (B.x - A.x)), P.y - (A.y + t * (B.y - A.y)));
        }
        function eraseByPoints(pts) {
          if (!pts || pts.length < 2) return;
          const threshold = eraseW * 0.55;
          notes.strokes = notes.strokes.filter(st => {
            if (!st.points || st.points.length < 2) return false;
            const spts = st.points.map(p => toScreen(p.x, p.y));
            for (let i = 0; i < pts.length; i++) {
              for (let j = 0; j < spts.length - 1; j++) {
                if (distToSeg(pts[i], spts[j], spts[j + 1]) < threshold) return false;
              }
            }
            return true;
          });
        }
        function commitStroke() {
          if (!cur) { drawing = false; return; }
          if (tool === "pen" && cur.points.length >= 2) {
            notes.strokes.push({ type: "pen", color: color, width: penW, points: cur.points.map(p => toNorm(p.x, p.y)) });
          } else if (tool === "erase" && cur.points.length >= 2) {
            eraseByPoints(cur.points);
          }
          redo = []; cur = null; drawing = false;
          renderToOffscreen(); blit();
        }

        canvas.addEventListener("pointerdown", e => {
          e.preventDefault();
          if (e.button > 0) return;
          drawing = true; cur = { points: [absolute(e)] };
          try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        }, { passive: false });
        canvas.addEventListener("pointermove", e => {
          e.preventDefault();
          if (!drawing || !cur) return;
          cur.points.push(absolute(e));
          blit(); drawCurrent(mainCtx);
        }, { passive: false });
        const endStroke = e => {
          if (e) e.preventDefault();
          if (!drawing) return;
          commitStroke();
        };
        canvas.addEventListener("pointerup", endStroke, { passive: false });
        canvas.addEventListener("pointercancel", endStroke, { passive: false });

        function setTool(name) {
          tool = name;
          overlay.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("active", b.dataset.tool === name));
          canvas.style.cursor = name === "erase" ? "cell" : "crosshair";
        }
        function saveAndClose() {
          if (notes.strokes.length) notesRoot[subject][id] = notes; else delete notesRoot[subject][id];
          DB.save(); if (onChange) onChange();
          document.body.style.overflow = prevBodyOverflow;
          window.removeEventListener("resize", sizeCanvas);
          if (window.visualViewport) window.visualViewport.removeEventListener("resize", sizeCanvas);
          overlay.remove();
        }

        overlay.querySelector(".hw-tool.close").onclick = saveAndClose;
        overlay.querySelector(".hw-tool.undo").onclick = () => {
          if (!notes.strokes.length) return;
          redo.push(notes.strokes.pop());
          renderToOffscreen(); blit();
        };
        overlay.querySelector(".hw-tool.redo").onclick = () => {
          if (!redo.length) return;
          notes.strokes.push(redo.pop());
          renderToOffscreen(); blit();
        };
        overlay.querySelector(".hw-tool.clear").onclick = () => {
          if (!notes.strokes.length) { UI.toast("没有笔迹可清空"); return; }
          UI.confirm("确定清空全部手写笔迹？").then(ok => { if (!ok) return; notes.strokes = []; redo = []; renderToOffscreen(); blit(); });
        };
        overlay.querySelectorAll("[data-tool]").forEach(b => b.onclick = () => setTool(b.dataset.tool));

        sizeCanvas();
        window.addEventListener("resize", sizeCanvas);
        if (window.visualViewport) window.visualViewport.addEventListener("resize", sizeCanvas);
      }
    },
    /* ===== 通用笔记：存取手写矢量 + 导出 SVG + 附件（图片/PDF） ===== */
    Notes: {
      get(subject, id) {
        const n = (window.DB.state.notes || {})[subject];
        return n && n[id] ? n[id] : null;
      },
      has(subject, id) {
        const n = this.get(subject, id);
        return !!(n && n.strokes && n.strokes.length);
      },
      /* 返回绝对定位的覆盖层（含 SVG），需放进 position:relative 且宽度 = notes.vw 的容器里 */
      overlayHtml(notes) {
        if (!notes || !notes.strokes || !notes.strokes.length) return "";
        const W = notes.vw || 720, H = notes.vh || 800;
        let inner = "";
        notes.strokes.forEach(st => {
          if (st.type === "hl") {
            inner += `<rect x="${(st.x * W).toFixed(1)}" y="${(st.y * H).toFixed(1)}" width="${(st.w * W).toFixed(1)}" height="${(st.h * H).toFixed(1)}" fill="${st.color || "#ffd166"}" opacity="0.42"/>`;
          } else if (st.points && st.points.length >= 2) {
            const pts = st.points.map(p => `${(p.x * W).toFixed(1)},${(p.y * H).toFixed(1)}`).join(" ");
            inner += `<polyline points="${pts}" fill="none" stroke="${st.color || "#ff6b4a"}" stroke-width="${st.width || 3.2}" stroke-linecap="round" stroke-linejoin="round"/>`;
          }
        });
        return `<div class="kg-anno-ov" style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;z-index:5"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg></div>`;
      }
    },

    /* ===== 通用附件（图片 / PDF）笔记 ===== */
    Attachments: {
      _root() { const DB = window.DB; DB.state.attachments = DB.state.attachments || {}; return DB.state.attachments; },
      get(subject, id) { const r = this._root(); return (r[subject] && r[subject][id]) || []; },
      addFiles(subject, id, fileList) {
        const r = this._root(); r[subject] = r[subject] || {};
        const arr = r[subject][id] = r[subject][id] || [];
        const files = Array.prototype.slice.call(fileList || []);
        let pending = files.length;
        if (!pending) return Promise.resolve();
        return new Promise(resolve => {
          files.forEach(f => {
            const isImg = (f.type || "").indexOf("image/") === 0;
            const reader = new FileReader();
            reader.onload = () => {
              arr.push({ name: f.name || ("附件" + (arr.length + 1)), type: isImg ? "image" : "pdf", data: reader.result });
              if (--pending === 0) { window.DB.save(); resolve(); }
            };
            reader.onerror = () => { if (--pending === 0) { window.DB.save(); resolve(); } };
            reader.readAsDataURL(f);
          });
        });
      },
      remove(subject, id, idx) {
        const arr = this.get(subject, id);
        if (arr && arr[idx]) { arr.splice(idx, 1); window.DB.save(); }
      },
      gridHtml(subject, id) {
        const arr = this.get(subject, id);
        if (!arr.length) return `<div class="muted small">还没有附件，点「📎 添加图片/PDF」即可把照片或资料加进来。</div>`;
        return arr.map((a, i) => a.type === "image"
          ? `<div class="kg-att"><img src="${a.data}" alt="${UI.esc(a.name)}"/><div class="kg-att-n">${UI.esc(a.name)}</div><button class="kg-att-x" data-rm="${i}">✕</button></div>`
          : `<div class="kg-att"><div class="kg-att-pdf" data-open="${i}">📄<br>${UI.esc(a.name)}</div><button class="kg-att-x" data-rm="${i}">✕</button></div>`
        ).join("");
      },
      toHtml(subject, id) {
        const arr = this.get(subject, id);
        if (!arr.length) return "";
        return `<div class="subhead">附件（${arr.length}）</div>` + arr.map(a => a.type === "image"
          ? `<div class="item"><img src="${a.data}"/><div class="muted small">${UI.esc(a.name)}</div></div>`
          : `<div class="item">📄 <a href="${a.data}" target="_blank" rel="noopener">${UI.esc(a.name)}</a>（PDF，请在导出的打印窗口中点开下载）</div>`
        ).join("");
      }
    },

    /* 一键挂载「手写 + 附件」笔记卡，返回 DOM 节点，挂载到任意模块视图里 */
    notebook(subject, id, anchor) {
      const DB = window.DB;
      const wrap = el(`<div class="card kg-notebook" style="margin-top:12px">
        <h3>📝 我的笔记（手写 / 附件）</h3>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <button class="btn kg-hw-btn">✎ 手写标注</button>
          <label class="btn kg-att-btn">📎 添加图片/PDF<input type="file" accept="image/*,application/pdf" multiple hidden class="kg-att-file"/></label>
        </div>
        <div class="kg-att-grid"></div>
      </div>`);
      const grid = wrap.querySelector(".kg-att-grid");
      function renderGrid() { grid.innerHTML = UI.Attachments.gridHtml(subject, id);
        grid.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { UI.Attachments.remove(subject, id, +b.dataset.rm); renderGrid(); });
        grid.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { const a = UI.Attachments.get(subject, id)[+b.dataset.open]; if (a) window.open(a.data, "_blank"); });
      }
      wrap.querySelector(".kg-hw-btn").onclick = () => UI.Handwriting.open({ subject, id, anchor, onChange: renderGrid });
      wrap.querySelector(".kg-att-file").onchange = e => { UI.Attachments.addFiles(subject, id, e.target.files); e.target.value = ""; renderGrid(); };
      renderGrid();
      return wrap;
    }
  };

  window.UI = UI;
})();
