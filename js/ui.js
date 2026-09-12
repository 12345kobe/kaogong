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

    /* ===== 全屏手写 / 荧光笔 / 橡皮擦 标注覆盖层 =====
       UI.Handwriting.open({subject, id, title, anchor, onChange})
         - anchor：要锚定的内容容器（坐标归一化到它，导出 PDF 时位置不偏移）；不传则按整屏
         - 工具：✎手写 / 🖍荧光笔 / 🧽橡皮擦 / ↶撤回 / ↷重做 / 🗑清除 / 颜色 / ✓保存
         - 笔迹按 normalized 坐标存 DB.state.notes[subject][id]，跨设备还原
       UI.Notes.get/set/has/toSvg  —— 通用存取与导出矢量
       UI.Attachments.section/addFiles/gridHtml  —— 通用图片/PDF 附件笔记
       UI.notebook(subject,id,anchor) —— 一键挂载「手写 + 附件」笔记卡 */
    Handwriting: {
      open(opts) {
        const subject = opts.subject, id = opts.id, title = opts.title || "手写标注", anchor = opts.anchor || null;
        const onChange = opts.onChange;
        const DB = window.DB;
        const notesRoot = DB.state.notes = DB.state.notes || {};
        notesRoot[subject] = notesRoot[subject] || {};
        let notes = notesRoot[subject][id] ? JSON.parse(JSON.stringify(notesRoot[subject][id])) : null;
        if (!notes) notes = { vw: anchor ? anchor.clientWidth : window.innerWidth, vh: anchor ? (anchor.scrollHeight || anchor.clientHeight) : window.innerHeight, strokes: [] };
        if (!notes.strokes) notes.strokes = [];
        let redo = [];
        let tool = "pen";                 // pen | hl | erase
        let cur = null, drawing = false;  // cur.points 为像素坐标
        let color = "#ff6b4a", penW = 3.2, hlW = 20;
        let selected = null, drag = null, lastPx = null;

        const overlay = el(`<div class="hw-overlay">
          <div class="hw-tools">
            <button class="hw-tool close" title="关闭">✕</button>
            <button class="hw-tool t-pen active" data-tool="pen" title="手写笔">✎</button>
            <button class="hw-tool t-hl" data-tool="hl" title="荧光笔（横线/竖线自动规整）">🖍</button>
            <button class="hw-tool t-erase" data-tool="erase" title="橡皮擦（擦掉手写字迹）">🧽</button>
            <button class="hw-tool undo" title="撤回一笔">↶</button>
            <button class="hw-tool redo" title="重做（恢复刚撤回的笔画）">↷</button>
            <button class="hw-tool clear" title="清除全部">🗑</button>
            <span class="hw-sep"></span>
            <button class="hw-tool color active" data-c="#ff6b4a" style="color:#ff6b4a" title="红">●</button>
            <button class="hw-tool color" data-c="#34e7e4" style="color:#34e7e4" title="青">●</button>
            <button class="hw-tool color" data-c="#ffd166" style="color:#ffd166" title="黄">●</button>
            <button class="hw-tool color" data-c="#7CFFB2" style="color:#7CFFB2" title="绿">●</button>
            <button class="hw-tool color" data-c="#ffffff" style="color:#ffffff" title="白">●</button>
            <button class="hw-tool done" title="保存并关闭">✓</button>
          </div>
          <div class="hw-hint">在内容上直接书写 · ✎手写 / 🖍荧光笔（横线竖线自动规整，点选后可拖动调位置、拉角调长短）/ 🧽橡皮擦 · ↶撤回 ↷重做</div>
          <canvas class="hw-layer"></canvas>
        </div>`);
        document.body.appendChild(overlay);

        const prevBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const canvas = overlay.querySelector(".hw-layer");
        const mainCtx = canvas.getContext("2d", { alpha: true });
        const offCanvas = document.createElement("canvas");
        const offCtx = offCanvas.getContext("2d", { alpha: true });

        function viewSize() {
          if (anchor) return { w: anchor.clientWidth, h: anchor.scrollHeight || anchor.clientHeight, dpr: window.devicePixelRatio || 1 };
          return { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 };
        }
        function absolute(e) {
          if (anchor) {
            const r = anchor.getBoundingClientRect();
            return { x: e.clientX - r.left + anchor.scrollLeft, y: e.clientY - r.top + anchor.scrollTop };
          }
          return { x: e.clientX, y: e.clientY };
        }
        function sizeCanvas() {
          const v = viewSize(), dpr = v.dpr;
          canvas.width = Math.max(1, Math.round(v.w * dpr));
          canvas.height = Math.max(1, Math.round(v.h * dpr));
          canvas.style.width = v.w + "px";
          canvas.style.height = v.h + "px";
          offCanvas.width = canvas.width; offCanvas.height = canvas.height;
          mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          notes.vw = v.w; notes.vh = v.h;
          renderToOffscreen(); blit();
        }
        function drawStroke(ctx, st) {
          const v = viewSize();
          if (st.type === "hl") {
            ctx.save();
            ctx.globalAlpha = 0.42;
            ctx.fillStyle = st.color || "#ffd166";
            ctx.fillRect(st.x * v.w, st.y * v.h, Math.max(2, st.w * v.w), Math.max(2, st.h * v.h));
            ctx.restore();
            return;
          }
          if (!st.points || st.points.length < 2) return;
          ctx.strokeStyle = st.color || color;
          ctx.lineWidth = st.width || penW;
          ctx.lineCap = "round"; ctx.lineJoin = "round";
          ctx.beginPath();
          st.points.forEach((p, idx) => { const x = p.x * v.w, y = p.y * v.h; idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
          ctx.stroke();
        }
        function renderToOffscreen() {
          const v = viewSize();
          offCtx.clearRect(0, 0, v.w, v.h);
          notes.strokes.forEach(st => drawStroke(offCtx, st));
        }
        function blit() {
          const v = viewSize();
          mainCtx.clearRect(0, 0, v.w, v.h);
          mainCtx.drawImage(offCanvas, 0, 0, v.w, v.h);
          if (tool === "hl" && selected) drawSelection(mainCtx, selected);
        }
        function drawSelection(ctx, st) {
          const v = viewSize();
          const x = st.x * v.w, y = st.y * v.h, w = st.w * v.w, h = st.h * v.h;
          ctx.save();
          ctx.strokeStyle = "#34e7e4"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
          [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(p => { ctx.beginPath(); ctx.fillStyle = "#34e7e4"; ctx.arc(p[0], p[1], 8, 0, 7); ctx.fill(); });
          ctx.restore();
        }
        function drawCurrent(ctx) {
          if (!cur) return;
          if (tool === "pen") {
            ctx.strokeStyle = color; ctx.lineWidth = penW; ctx.lineCap = "round"; ctx.lineJoin = "round";
            ctx.beginPath();
            cur.points.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
            ctx.stroke();
          } else if (tool === "erase") {
            ctx.strokeStyle = "rgba(255,107,74,.5)"; ctx.lineWidth = hlW; ctx.lineCap = "round"; ctx.lineJoin = "round";
            ctx.setLineDash([6, 5]);
            ctx.beginPath();
            cur.points.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
            ctx.stroke(); ctx.setLineDash([]);
          } else if (tool === "hl") {
            const hl = makeHighlight(cur.points);
            if (hl) {
              const v = viewSize();
              ctx.save(); ctx.globalAlpha = 0.42; ctx.fillStyle = color;
              ctx.fillRect(hl.x * v.w, hl.y * v.h, hl.w * v.w, hl.h * v.h); ctx.restore();
            }
          }
        }
        function makeHighlight(pts) {
          if (!pts || pts.length < 2) return null;
          const a = pts[0], b = pts[pts.length - 1];
          const dx = b.x - a.x, dy = b.y - a.y;
          const len = Math.hypot(dx, dy);
          if (len < 10) return null;
          const ang = Math.atan2(dy, dx) * 180 / Math.PI;
          let ax = a.x, ay = a.y, bx = b.x, by = b.y;
          if (Math.abs(ang) <= 18 || Math.abs(ang) >= 162) {     // 接近水平 → 规整横线
            ay = by = (a.y + b.y) / 2 - hlW / 2;
          } else if (Math.abs(ang) >= 72 && Math.abs(ang) <= 108) { // 接近垂直 → 规整竖线
            ax = bx = (a.x + b.x) / 2 - hlW / 2;
          }
          const v = viewSize();
          const rx = Math.min(ax, bx), ry = Math.min(ay, by);
          const rw = Math.max(10, Math.abs(bx - ax)), rh = Math.max(10, Math.abs(by - ay));
          return { type: "hl", color: color, x: rx / v.w, y: ry / v.h, w: rw / v.w, h: rh / v.h };
        }
        function bboxOf(st) {
          const v = viewSize();
          if (st.type === "hl") return { x: st.x * v.w, y: st.y * v.h, w: st.w * v.w, h: st.h * v.h };
          let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
          st.points.forEach(p => { const x = p.x * v.w, y = p.y * v.h; if (x < minx) minx = x; if (y < miny) miny = y; if (x > maxx) maxx = x; if (y > maxy) maxy = y; });
          return { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
        }
        function eraseStrokes(pts) {
          if (!pts || pts.length < 2) return;
          let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
          pts.forEach(p => { if (p.x < minx) minx = p.x; if (p.y < miny) miny = p.y; if (p.x > maxx) maxx = p.x; if (p.y > maxy) maxy = p.y; });
          const eb = { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
          const inter = (a, b) => !(a.x > b.x + b.w || a.x + a.w < b.x || a.y > b.y + b.h || a.y + a.h < b.y);
          notes.strokes = notes.strokes.filter(st => !inter(bboxOf(st), eb));
        }
        function hitHighlight(st, px, py) {
          const v = viewSize();
          const x = st.x * v.w, y = st.y * v.h, w = st.w * v.w, h = st.h * v.h;
          const near = (X, Y, r) => Math.hypot(px - X, py - Y) <= r;
          if (near(x, y, 14)) return "c1";
          if (near(x + w, y, 14)) return "c2";
          if (near(x, y + h, 14)) return "c3";
          if (near(x + w, y + h, 14)) return "c4";
          if (px >= x - 8 && px <= x + w + 8 && py >= y - 8 && py <= y + h + 8) return "move";
          return null;
        }
        function commitStroke() {
          if (!cur) { drawing = false; return; }
          if (tool === "pen" && cur.points.length >= 2) {
            const pts = cur.points.map(p => ({ x: p.x / viewSize().w, y: p.y / viewSize().h }));
            notes.strokes.push({ type: "pen", color: color, width: penW, points: pts });
          } else if (tool === "hl") {
            const hl = makeHighlight(cur.points);
            if (hl) { notes.strokes.push(hl); selected = hl; }
          } else if (tool === "erase" && cur.points.length >= 2) {
            eraseStrokes(cur.points);
          }
          redo = []; cur = null; drawing = false;
          renderToOffscreen(); blit();
        }

        canvas.addEventListener("pointerdown", e => {
          e.preventDefault();
          if (e.button > 0) return;
          const p = absolute(e);
          if (tool === "hl" && selected) {
            const ht = hitHighlight(selected, p.x, p.y);
            if (ht) {
              drag = { mode: ht, st: selected };
              if (ht !== "move") {
                const v = viewSize();
                const x = selected.x * v.w, y = selected.y * v.h, w = selected.w * v.w, h = selected.h * v.h;
                const corners = { c1: [x + w, y + h], c2: [x, y + h], c3: [x + w, y], c4: [x, y] };
                drag.fixed = corners[ht];
              }
              lastPx = p; return;
            }
          }
          drawing = true; cur = { points: [p] };
          try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        }, { passive: false });
        canvas.addEventListener("pointermove", e => {
          e.preventDefault();
          const p = absolute(e);
          if (drag) {
            const v = viewSize();
            if (drag.mode === "move") {
              selected.x += (p.x - lastPx.x) / v.w;
              selected.y += (p.y - lastPx.y) / v.h;
            } else {
              const fx = drag.fixed[0], fy = drag.fixed[1];
              const rx = Math.min(fx, p.x), ry = Math.min(fy, p.y);
              selected.x = rx / v.w; selected.y = ry / v.h;
              selected.w = Math.max(10, Math.abs(p.x - fx)) / v.w;
              selected.h = Math.max(10, Math.abs(p.y - fy)) / v.h;
            }
            lastPx = p; renderToOffscreen(); blit(); return;
          }
          if (!drawing || !cur) return;
          cur.points.push(p);
          renderToOffscreen(); blit(); drawCurrent(mainCtx);
        }, { passive: false });
        const endStroke = e => {
          if (e) e.preventDefault();
          if (drag) { drag = null; lastPx = null; return; }
          if (!drawing) return;
          commitStroke();
        };
        canvas.addEventListener("pointerup", endStroke, { passive: false });
        canvas.addEventListener("pointercancel", endStroke, { passive: false });

        // 工具栏
        overlay.querySelector(".hw-tool.close").onclick = saveAndClose;
        overlay.querySelector(".hw-tool.done").onclick = saveAndClose;
        overlay.querySelector(".hw-tool.undo").onclick = () => {
          if (!notes.strokes.length) return;
          redo.push(notes.strokes.pop()); selected = null;
          renderToOffscreen(); blit();
        };
        overlay.querySelector(".hw-tool.redo").onclick = () => {
          if (!redo.length) return;
          notes.strokes.push(redo.pop());
          renderToOffscreen(); blit();
        };
        overlay.querySelector(".hw-tool.clear").onclick = () => {
          notes.strokes = []; redo = []; selected = null;
          renderToOffscreen(); blit();
        };
        overlay.querySelectorAll(".hw-tool.color").forEach(b => {
          b.onclick = () => {
            overlay.querySelectorAll(".hw-tool.color").forEach(x => x.classList.remove("active"));
            b.classList.add("active");
            color = b.dataset.c;
            if (tool === "hl" && selected) { selected.color = color; renderToOffscreen(); blit(); }
          };
        });
        overlay.querySelectorAll("[data-tool]").forEach(b => {
          b.onclick = () => {
            tool = b.dataset.tool; selected = null;
            overlay.querySelectorAll("[data-tool]").forEach(x => x.classList.remove("active"));
            b.classList.add("active");
            blit();
          };
        });

        function saveAndClose() {
          if (notes.strokes.length) notesRoot[subject][id] = notes; else delete notesRoot[subject][id];
          DB.save(); if (onChange) onChange();
          document.body.style.overflow = prevBodyOverflow;
          window.removeEventListener("resize", sizeCanvas);
          overlay.remove();
        }

        sizeCanvas();
        window.addEventListener("resize", sizeCanvas);
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
