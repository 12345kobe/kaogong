/* 共享 UI 组件：toast / modal / 上课计时器 / 待办 / 每日进度 */
(function () {
  "use strict";
  const DB = window.DB;

  // 答题（写题）过程中的手写笔迹：仅本次训练会话内有效，训练结束/切模块即丢弃（不落盘 DB）
  let _hwSession = {};
  function _hwKey(subject, id) { return subject + "\u0001" + id; }

  function el(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  /* 轻量 Markdown -> HTML 渲染器：先转义防 XSS，再处理常用语法。
     支持：```代码块``` #~###### 标题、> 引用、-/* 无序列表、1. 有序列表、--- 分隔线、
     **加粗**、*斜体*、__加粗__、_斜体_、~~删除线~~、`行内代码`、[文字](链接)。 */
  function md(src) {
    const raw = String(src == null ? "" : src).replace(/\r\n/g, "\n");
    const lines = raw.split("\n");
    const out = [];
    let listType = null, listBuf = [];
    function flushList() {
      if (listType) {
        out.push(`<${listType}>` + listBuf.map(li => `<li>${inline(li)}</li>`).join("") + `</${listType}>`);
        listType = null; listBuf = [];
      }
    }
    function inline(t) {
      // 先做 HTML 转义防 XSS，再替换内联标记（**加粗** / *斜体* / `代码` / 链接 等）
      t = esc(t);
      t = t.replace(/`([^`]+)`/g, (m, c) => `<code>${c}</code>`);
      t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      t = t.replace(/__([^_]+)__/g, "<strong>$1</strong>");
      t = t.replace(/\*([^*\s][^*]*?)\*/g, "<em>$1</em>");
      t = t.replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?]|$)/g, "$1<em>$2</em>");
      t = t.replace(/~~([^~]+)~~/g, "<del>$1</del>");
      t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*|#[^\s)]*)\)/g, (m, txt, url) =>
        `<a href="${url}" target="_blank" rel="noopener">${txt}</a>`);
      return t;
    }
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const fence = /^```(.*)$/.exec(line);
      if (fence) {
        const buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; flushList();
        out.push(`<pre><code>${buf.map(esc).join("\n")}</code></pre>`);
        continue;
      }
      const h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) { flushList(); const lv = h[1].length; out.push(`<h${lv}>${inline(h[2])}</h${lv}>`); i++; continue; }
      if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { flushList(); out.push("<hr>"); i++; continue; }
      const bq = /^>\s?(.*)$/.exec(line);
      if (bq) {
        flushList();
        const buf = [];
        while (i < lines.length) { const m = /^>\s?(.*)$/.exec(lines[i]); if (!m) break; buf.push(m[1]); i++; }
        out.push(`<blockquote>${inline(buf.join("<br>"))}</blockquote>`);
        continue;
      }
      const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
      const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
      if (ul || ol) {
        const ty = ul ? "ul" : "ol";
        if (listType && listType !== ty) flushList();
        listType = ty; listBuf.push(ul ? ul[1] : ol[1]); i++; continue;
      }
      if (/^\s*$/.test(line)) { flushList(); i++; continue; }
      flushList();
      out.push(`<p>${inline(line)}</p>`);
      i++;
    }
    flushList();
    return out.join("");
  }

  const UI = {
    el, esc, md,
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

    /* ===== 全屏手写板（截图同款）+ 压感 + 色卡 =====
       UI.Handwriting.open({subject, id, title, anchor, onChange, fresh})
         - fresh：打开时清空已有笔迹（刷题每题独立）
         - 工具栏：✕ 关闭 | ✎ 钢笔 | 橡皮擦 | ↶ 撤回 | ↷ 重做 | 🗑 清空
         - 点击钢笔按钮弹出「色卡 + 笔迹粗细滑块」，默认红色/50%
         - 压感：Apple Pencil / pointer pressure 动态线宽
       UI.Notes.get/set/has/overlayHtml/inlineOverlay  —— 通用存取、导出 SVG、页内笔迹覆盖 */
    Handwriting: {
      open(opts) {
        const subject = opts.subject, id = opts.id, anchor = opts.anchor || null;
        const onChange = opts.onChange, fresh = opts.fresh;
        const session = !!opts.session; // true：本次训练会话级笔迹（不落盘，结束训练即清）
        const DB = window.DB;
        const notesRoot = DB.state.notes = DB.state.notes || {};
        notesRoot[subject] = notesRoot[subject] || {};
        const saved = notesRoot[subject][id];
        let notes;
        if (session) {
          // 会话模式：始终从会话缓存还原（fresh 不再清空，保证「写完关闭→再打开」能看到当时的笔迹）
          const sess = _hwSession[_hwKey(subject, id)];
          notes = sess ? JSON.parse(JSON.stringify(sess)) : { vw: 0, vh: 0, strokes: [] };
        } else {
          notes = fresh ? { vw: 0, vh: 0, strokes: [] }
            : (saved ? JSON.parse(JSON.stringify(saved)) : { vw: 0, vh: 0, strokes: [] });
        }
        if (!notes.strokes) notes.strokes = [];
        let keepNotes = !!(saved && saved.strokes && saved.strokes.length); // 已有永久笔记时默认「保留」
        let dirty = false, redo = [];
        let tool = "pen";                 // pen | erase
        let cur = null, drawing = false;  // cur.points 为屏幕像素坐标，含压感 p
        let color = "#ff6b4a";
        let widthPct = 50;
        const minW = 1, maxW = 10;
        let penW = minW + (maxW - minW) * widthPct / 100;
        const eraseW = 24;

        const overlay = el(`<div class="hw-overlay">
          <div class="hw-tools">
            <button class="hw-tool close" title="关闭并保存">✕</button>
            <button class="hw-tool t-pen active" data-tool="pen" title="钢笔（点我选色/调粗细）">✎</button>
            <button class="hw-tool t-erase" data-tool="erase" title="橡皮擦">🧽</button>
            <button class="hw-tool undo" title="撤回上一笔">↶</button>
            <button class="hw-tool redo" title="重做上一笔">↷</button>
            <button class="hw-tool clear" title="清空全部">🗑</button>
            <button class="hw-tool persist" title="存入笔记（跨会话永久保留）" style="display:none">💾</button>
          </div>
          <div class="hw-palette" style="display:none">
            <div class="hw-palette-colors">
              <span data-c="#ff6b4a" style="background:#ff6b4a" class="active"></span>
              <span data-c="#34e7e4" style="background:#34e7e4"></span>
              <span data-c="#3ddc97" style="background:#3ddc97"></span>
              <span data-c="#ffd166" style="background:#ffd166"></span>
              <span data-c="#9b6cff" style="background:#9b6cff"></span>
              <span data-c="#111111" style="background:#111111"></span>
              <span data-c="#ffffff" style="background:#ffffff;border:1px solid var(--line)"></span>
            </div>
            <div class="hw-palette-width">
              <label>笔迹粗细</label>
              <input type="range" min="10" max="100" value="50">
              <span class="hw-palette-pct">50%</span>
            </div>
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
        let cvLeft = 0, cvTop = 0; // 画布在视口中的左上角（用于把视口坐标换算成画布本地坐标）
        let anchorRect = null;
        function refreshMetrics() {
          const r = canvas.getBoundingClientRect();
          screenW = r.width; screenH = r.height;
          cvLeft = r.left; cvTop = r.top; // 关键：画布并非在视口 (0,0)，而是 top:56px（工具栏下方）
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
        // 视口坐标 → 画布本地坐标（绘制/命中都在画布 2D 上下文里进行）
        function cxy(p) { return { x: p.x - cvLeft, y: p.y - cvTop }; }
        function widthFromPct(p) { return Math.max(minW, minW + (maxW - minW) * (p / 100)); }
        function pressureMul(p) {
          const v = 0.35 + (p == null ? 0.5 : p) * 1.25;
          return Math.max(0.35, Math.min(1.8, v));
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
          // 返回视口坐标（与 toNorm/toScreen 的语义一致）；绘制时由 cxy 折算回画布本地坐标
          return { x: e.clientX, y: e.clientY, p: e.pressure == null ? 0.5 : e.pressure };
        }
        function drawLine(ctx, a, b, w, col) {
          ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round";
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        function drawStroke(ctx, st) {
          if (!st.points || st.points.length < 2) return;
          const base = st.width || penW;
          const col = st.color || color;
          for (let i = 1; i < st.points.length; i++) {
            const a = st.points[i - 1], b = st.points[i];
            const s0 = cxy(toScreen(a.x, a.y)), s1 = cxy(toScreen(b.x, b.y));
            const mul = (a.p != null || b.p != null) ? pressureMul(((a.p == null ? 0.5 : a.p) + (b.p == null ? 0.5 : b.p)) / 2) : 1;
            drawLine(ctx, s0, s1, base * mul, col);
          }
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
            for (let i = 1; i < cur.points.length; i++) {
              const a = cur.points[i - 1], b = cur.points[i];
              const mul = pressureMul(b.p == null ? 0.5 : b.p);
              drawLine(ctx, cxy(a), cxy(b), penW * mul, color);
            }
          } else if (tool === "erase") {
            ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = eraseW; ctx.lineCap = "round"; ctx.lineJoin = "round";
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            cur.points.forEach((p, idx) => { const q = cxy(p); idx === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y); });
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
            notes.strokes.push({ type: "pen", color: color, width: penW, points: cur.points.map(p => ({ ...toNorm(p.x, p.y), p: p.p })) });
          } else if (tool === "erase" && cur.points.length >= 2) {
            eraseByPoints(cur.points);
          }
          dirty = true; redo = []; cur = null; drawing = false;
          renderToOffscreen(); blit();
        }

        function hidePalette() { overlay.querySelector(".hw-palette").style.display = "none"; }
        function showPalette() {
          const pal = overlay.querySelector(".hw-palette");
          pal.style.display = (pal.style.display === "none" ? "" : "none");
        }

        canvas.addEventListener("pointerdown", e => {
          e.preventDefault();
          hidePalette();
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
          if (dirty) {
            if (session) {
              /* 会话模式：笔迹只留在「当前这一题/这份文档」里，默认不落盘。
                 用户点 💾 显式存入后才永久保存，避免退出训练后笔记被带到别处。 */
              const k = _hwKey(subject, id);
              if (notes.strokes.length) _hwSession[k] = JSON.parse(JSON.stringify(notes));
              else delete _hwSession[k];
              if (keepNotes) notesRoot[subject][id] = JSON.parse(JSON.stringify(notes));
              DB.save(); if (onChange) onChange();
            } else {
              if (notes.strokes.length) notesRoot[subject][id] = notes; else if (saved) delete notesRoot[subject][id];
              DB.save(); if (onChange) onChange();
            }
          }
          document.body.style.overflow = prevBodyOverflow;
          window.removeEventListener("resize", sizeCanvas);
          if (window.visualViewport) window.visualViewport.removeEventListener("resize", sizeCanvas);
          overlay.remove();
        }

        overlay.querySelector(".hw-tool.close").onclick = saveAndClose;
        overlay.querySelector(".hw-tool.undo").onclick = () => {
          if (!notes.strokes.length) return;
          redo.push(notes.strokes.pop()); dirty = true;
          renderToOffscreen(); blit();
        };
        overlay.querySelector(".hw-tool.redo").onclick = () => {
          if (!redo.length) return;
          notes.strokes.push(redo.pop()); dirty = true;
          renderToOffscreen(); blit();
        };
        /* 显式存入笔记：只在用户主动点 💾 时才永久落盘 */
        const persistBtn = overlay.querySelector(".hw-tool.persist");
        const syncPersistBtn = () => {
          persistBtn.style.display = session ? "" : "none";
          persistBtn.classList.toggle("active", keepNotes);
          persistBtn.title = keepNotes ? "已在笔记中保存（点击取消保存）" : "存入笔记（跨会话永久保留）";
        };
        if (persistBtn) {
          persistBtn.onclick = () => {
            keepNotes = !keepNotes;
            syncPersistBtn();
            if (keepNotes && notes.strokes.length) { notesRoot[subject][id] = JSON.parse(JSON.stringify(notes)); DB.save(); UI.toast("已存入笔记"); }
            if (onChange) onChange();
          };
        }
        overlay.querySelector(".hw-tool.clear").onclick = () => {
          if (!notes.strokes.length) return;
          // 一键删除全部笔迹：需二次确认，防止误删
          UI.confirm("确定删除本页全部笔迹吗？删除后不可恢复。").then(ok => {
            if (!ok) return;
            notes.strokes = []; redo = []; dirty = true;
            renderToOffscreen(); blit();
          });
        };
        overlay.querySelectorAll("[data-tool]").forEach(b => {
          b.onclick = () => {
            if (b.dataset.tool === "pen") { if (tool === "pen") showPalette(); else { setTool("pen"); showPalette(); } }
            else { hidePalette(); setTool(b.dataset.tool); }
          };
        });
        overlay.querySelectorAll(".hw-palette-colors span").forEach(span => {
          span.onclick = () => {
            color = span.dataset.c;
            overlay.querySelectorAll(".hw-palette-colors span").forEach(s => s.classList.remove("active"));
            span.classList.add("active");
            const penBtn = overlay.querySelector(".hw-tool.t-pen");
            if (penBtn) penBtn.style.color = color;
          };
        });
        const widthRange = overlay.querySelector(".hw-palette-width input");
        const widthPctLabel = overlay.querySelector(".hw-palette-pct");
        widthRange.oninput = () => {
          widthPct = parseInt(widthRange.value, 10);
          penW = widthFromPct(widthPct);
          widthPctLabel.textContent = widthPct + "%";
        };

        if (syncPersistBtn) syncPersistBtn();
        sizeCanvas();
        window.addEventListener("resize", sizeCanvas);
        if (window.visualViewport) window.visualViewport.addEventListener("resize", sizeCanvas);
      },

      /* ===== 会话级笔迹（答题写题用）：仅当次训练有效，结束训练/切模块即清，不落盘 ===== */
      hasSession(subject, id) {
        const n = _hwSession[_hwKey(subject, id)];
        return !!(n && n.strokes && n.strokes.length);
      },
      /* 清空会话笔迹：默认只清内存；purgeDom=true 时连题面上残留的覆盖层一起摘掉，
         避免退出训练后笔迹「跟着带出来」贴在别的卡片上。 */
      clearSession(purgeDom) {
        _hwSession = {};
        if (purgeDom !== false) {
          try {
            document.querySelectorAll(".kg-hw-session-ov").forEach(n => n.remove());
          } catch (e) {}
        }
      },
      /* 摘掉某个容器（题目卡片）上的会话笔迹覆盖层 */
      clearInline(container) {
        try { if (container) container.querySelectorAll(".kg-hw-session-ov").forEach(n => n.remove()); } catch (e) {}
      },
      /* 在题目卡片上直接显示本次会话的笔迹覆盖层：关闭面板后仍能看到写过的痕迹，精准对齐题目 */
      renderInline(container, subject, id) {
        const card = container;
        const existing = card.querySelector(".kg-hw-session-ov");
        if (existing) existing.remove();
        const notes = _hwSession[_hwKey(subject, id)];
        if (!notes || !notes.strokes || !notes.strokes.length) return;
        const W = notes.vw || card.clientWidth || 720;
        const H = notes.vh || card.scrollHeight || 800;
        const inner = (window.UI && UI.Notes && UI.Notes._svgInner) ? UI.Notes._svgInner(notes, W, H) : "";
        const ov = el(`<div class="kg-hw-session-ov" style="position:absolute;left:0;top:0;width:100%;height:${H}px;pointer-events:none;z-index:6;overflow:visible"><svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${inner}</svg></div>`);
        card.style.position = "relative";
        card.appendChild(ov);
      }
    },

    /* ===== 通用笔记：存取手写矢量 + 页内覆盖 + 导出 SVG + 附件（图片/PDF） ===== */
    Notes: {
      get(subject, id) {
        const n = (window.DB.state.notes || {})[subject];
        return n && n[id] ? n[id] : null;
      },
      has(subject, id) {
        const n = this.get(subject, id);
        return !!(n && n.strokes && n.strokes.length);
      },
      _svgInner(notes, W, H) {
        if (!notes || !notes.strokes || !notes.strokes.length) return "";
        let inner = "";
        notes.strokes.forEach(st => {
          if (st.type === "hl") {
            inner += `<rect x="${(st.x * W).toFixed(1)}" y="${(st.y * H).toFixed(1)}" width="${(st.w * W).toFixed(1)}" height="${(st.h * H).toFixed(1)}" fill="${st.color || "#ffd166"}" opacity="0.42"/>`;
          } else if (st.points && st.points.length >= 2) {
            const base = st.width || 3.2, col = st.color || "#ff6b4a";
            if (st.points[0].p != null) {
              for (let i = 1; i < st.points.length; i++) {
                const a = st.points[i - 1], b = st.points[i];
                const w = base * (0.35 + (((a.p == null ? 0.5 : a.p) + (b.p == null ? 0.5 : b.p)) / 2) * 1.25);
                inner += `<line x1="${(a.x * W).toFixed(1)}" y1="${(a.y * H).toFixed(1)}" x2="${(b.x * W).toFixed(1)}" y2="${(b.y * H).toFixed(1)}" stroke="${col}" stroke-width="${w.toFixed(2)}" stroke-linecap="round"/>`;
              }
            } else {
              const pts = st.points.map(p => `${(p.x * W).toFixed(1)},${(p.y * H).toFixed(1)}`).join(" ");
              inner += `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="${base}" stroke-linecap="round" stroke-linejoin="round"/>`;
            }
          }
        });
        return inner;
      },
      /* 返回绝对定位的覆盖层（含 SVG），用于导出 PDF：需放进 position:relative 且宽度 = notes.vw 的容器里 */
      overlayHtml(notes) {
        if (!notes || !notes.strokes || !notes.strokes.length) return "";
        const W = notes.vw || 720, H = notes.vh || 800;
        return `<div class="kg-anno-ov" style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;z-index:5"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${this._svgInner(notes, W, H)}</svg></div>`;
      },
      /* 在页面上直接显示/隐藏已存笔迹覆盖层（双击隐藏/显示） */
      inlineOverlay(container, subject, id) {
        const notes = this.get(subject, id);
        const existing = container.querySelector(".kg-inline-ov");
        if (existing) existing.remove();
        if (!notes || !notes.strokes || !notes.strokes.length) return;
        const W = notes.vw || container.clientWidth || 720;
        const H = notes.vh || container.scrollHeight || 800;
        const ov = el(`<div class="kg-inline-ov" title="双击隐藏/显示笔迹" style="width:100%;height:${H}px"><svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${this._svgInner(notes, W, H)}</svg></div>`);
        container.style.position = "relative";
        container.appendChild(ov);
        ov.ondblclick = () => ov.classList.toggle("kg-inline-ov-hidden");
      },
      toggleInlineOverlay(container) {
        const ov = container.querySelector(".kg-inline-ov");
        if (ov) ov.classList.toggle("kg-inline-ov-hidden");
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
        <h3>📝 我的笔记（文字 / 手写 / 附件）</h3>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <button class="btn kg-qnote-btn">✏️ 文字笔记</button>
          <button class="btn kg-hw-btn">✎ 手写标注</button>
          <button class="btn kg-ov-btn">👁 查看笔迹</button>
          <button class="btn kg-ov-clear">🗑 清除笔迹</button>
          <label class="btn kg-att-btn">📎 添加图片/PDF<input type="file" accept="image/*,application/pdf" multiple hidden class="kg-att-file"/></label>
        </div>
        <div class="kg-qnote-view muted small" style="white-space:pre-wrap;display:none"></div>
        <div class="kg-att-grid"></div>
      </div>`);
      const qnView = wrap.querySelector(".kg-qnote-view");
      function renderQNote() {
        const t = DB.qnote(subject, id);
        qnView.style.display = t ? "" : "none";
        qnView.textContent = t ? "🗒 笔记：\n" + t : "";
      }
      wrap.querySelector(".kg-qnote-btn").onclick = () => UI.textNote(subject, id, renderQNote);
      const grid = wrap.querySelector(".kg-att-grid");
      function renderGrid() { grid.innerHTML = UI.Attachments.gridHtml(subject, id);
        grid.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { UI.Attachments.remove(subject, id, +b.dataset.rm); renderGrid(); });
        grid.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { const a = UI.Attachments.get(subject, id)[+b.dataset.open]; if (a) window.open(a.data, "_blank"); });
      }
      function refreshOverlay() { if (anchor) UI.Notes.inlineOverlay(anchor, subject, id); }
      wrap.querySelector(".kg-hw-btn").onclick = () => UI.Handwriting.open({ subject, id, anchor, onChange: () => { renderGrid(); refreshOverlay(); } });
      wrap.querySelector(".kg-ov-btn").onclick = () => { if (anchor) UI.Notes.toggleInlineOverlay(anchor); };
      wrap.querySelector(".kg-ov-clear").onclick = () => {
        UI.confirm("确定清除本页手写笔迹？").then(ok => {
          if (!ok) return;
          const r = DB.state.notes[subject];
          if (r && r[id]) delete r[id];
          DB.save(); refreshOverlay();
        });
      };
      wrap.querySelector(".kg-att-file").onchange = e => { UI.Attachments.addFiles(subject, id, e.target.files); e.target.value = ""; renderGrid(); };
      renderQNote(); renderGrid(); refreshOverlay();
      return wrap;
    },

    /* 题目文字笔记弹窗：用户手填 + AI 解答自动追加，保存即入库并随云端同步 */
    textNote(subject, id, onChange) {
      const DB = window.DB;
      const cur = DB.qnote(subject, id);
      const body = el(`<div>
        <div class="muted small" style="margin-bottom:6px">记录本题的思路、易错点；点「🤖 没看懂？询问 AI」后，AI 的解答也会自动存进这里。</div>
        <textarea class="kg-qnote-ta" style="width:100%;min-height:180px;resize:vertical;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);font:inherit"></textarea>
      </div>`);
      const ta = body.querySelector(".kg-qnote-ta");
      ta.value = cur;
      UI.modal({
        title: "📝 题目笔记",
        body: body,
        width: "560px",
        actions: [
          { label: "取消", cls: "ghost", onClick: (m, c) => c() },
          { label: "💾 保存并同步", cls: "primary", onClick: (m, c) => { DB.setQNote(subject, id, ta.value); UI.toast("✓ 笔记已保存，云端同步中"); if (onChange) onChange(); c(); } }
        ]
      });
      setTimeout(() => ta.focus(), 80);
    },

    /* 左下角悬浮标注按钮：点击进入笔记模式（手写见解），笔迹直接覆盖在内容上。
       UI.floatingAnno(subject, id, anchor) —— anchor 为要标记的阅读内容容器；
       按钮为「全局常驻单例」，挂在 document.body（而非 pageBody），因此：
       ① 模块内部任何重渲染（重置/下一组等会清空 pageBody）都不会把它删掉；
       ② 每个模块进入时重新配置 subject/id/anchor 即可，保证所有模块都有手写悬浮窗。
       （AI 咨询 / 设置 / 刷题页通过 UI.hideAnnoFab 隐藏） */
    _annoFab: null,
    _ensureAnnoFab() {
      if (this._annoFab && this._annoFab.isConnected) return this._annoFab;
      const b = el(`<button class="kg-anno-fab" title="标记笔记 · 写下你的见解">✍<span class="kg-anno-dot" style="display:none">•</span></button>`);
      document.body.appendChild(b);
      this._annoFab = b;
      return b;
    },
    floatingAnno(subject, id, anchor) {
      if (!anchor) return null;
      const btn = this._ensureAnnoFab();
      btn.style.display = "";
      function refreshDot() {
        const has = UI.Notes.has(subject, id);
        const dot = btn.querySelector(".kg-anno-dot");
        if (dot) dot.style.display = has ? "inline" : "none";
        btn.classList.toggle("has", has);
      }
      function refreshOverlay() { try { UI.Notes.inlineOverlay(anchor, subject, id); } catch (e) {} }
      btn.onclick = () => {
        UI.Handwriting.open({
          subject, id, anchor,
          onChange: () => { refreshOverlay(); refreshDot(); }
        });
      };
      refreshDot();
      if (UI.Notes.has(subject, id)) refreshOverlay();
      return btn;
    },
    hideAnnoFab() {
      const btn = this._ensureAnnoFab();
      btn.style.display = "none";
    },

    /* ===== 全局：给所有文字输入框加「清空」按钮，点击即清空整框 =====
       覆盖 input[type=text/search/email/url/tel]、无 type（默认 text）、textarea；
       排除 number/date/range/color/file/checkbox/radio/button/submit/hidden/image 等，
       以及 readonly/disabled 或带 data-kg-no-clear 的框。
       用 MutationObserver 监听 DOM 变化，自动给路由切换 / 弹窗 / 异步模块里
       动态生成的输入框也补上清除按钮。 */
    initClearButtons() {
      if (this._clearReady) return;
      this._clearReady = true;
      const SEL = 'input[type="text"],input[type="search"],input[type="email"],input[type="url"],input[type="tel"],input:not([type]),textarea';
      const EXCLUDE_TYPE = { number: 1, date: 1, "datetime-local": 1, month: 1, week: 1, time: 1, range: 1, color: 1, file: 1, checkbox: 1, radio: 1, button: 1, submit: 1, reset: 1, hidden: 1, image: 1 };
      const SKIP = function (inp) {
        if (!inp || inp.dataset.kgNoClear === "1") return true;
        if (inp.readOnly || inp.disabled) return true;
        const t = (inp.getAttribute("type") || "").toLowerCase();
        if (EXCLUDE_TYPE[t]) return true;
        return false;
      };
      const SIZE = 26;
      const recs = [];
      /* 关键：按钮挂 body 上用 fixed 定位——不依赖父容器 position/overflow/z-index，
         任何布局（flex、折叠区、弹窗、全屏页）都能稳定显示在输入框内右侧。 */
      const place = function (rec) {
        const inp = rec.inp, btn = rec.btn;
        if (!inp.isConnected) { try { btn.remove(); } catch (e) {} return false; }
        const has = !!(inp.value && inp.value.length);
        if (!has) { btn.style.display = "none"; return true; }
        const r = inp.getBoundingClientRect();
        const vw = window.innerWidth || document.documentElement.clientWidth;
        const vh = window.innerHeight || document.documentElement.clientHeight;
        if (r.width < 56 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) { btn.style.display = "none"; return true; }
        btn.style.display = "flex";
        btn.style.left = Math.max(2, Math.min(r.right - SIZE - 6, vw - SIZE - 2)) + "px";
        btn.style.top = (inp.tagName === "TEXTAREA"
          ? Math.max(2, Math.min(r.bottom - SIZE - 6, vh - SIZE - 2))
          : r.top + Math.max(2, (r.height - SIZE) / 2)) + "px";
        return true;
      };
      const placeAll = function () {
        for (let i = recs.length - 1; i >= 0; i--) { if (!place(recs[i])) recs.splice(i, 1); }
      };
      const addTo = function (inp) {
        if (inp.dataset.kgClear === "1" || SKIP(inp)) return;
        inp.dataset.kgClear = "1";
        const ta = inp.tagName === "TEXTAREA";
        inp.classList.add(ta ? "kg-has-clear-ta" : "kg-has-clear");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "kg-clear-btn" + (ta ? " ta" : "");
        btn.setAttribute("aria-label", "清空");
        btn.title = "清空";
        btn.textContent = "✕";
        btn.style.cssText = "position:fixed;display:none;align-items:center;justify-content:center;" +
          "width:26px;height:26px;border-radius:50%;border:1.5px solid #fff;background:#e23b54;color:#fff;" +
          "font-size:15px;font-weight:700;line-height:1;padding:0;cursor:pointer;z-index:10030;box-shadow:0 1px 6px rgba(0,0,0,.35)";
        let lastClear = 0;
        const doClear = function () {
          const now = Date.now();
          if (now - lastClear < 400) return;   // 防重复触发（touchend + click）
          lastClear = now;
          inp.value = "";
          try {
            inp.dispatchEvent(new Event("input", { bubbles: true }));
            inp.dispatchEvent(new Event("change", { bubbles: true }));
          } catch (err) {}
          try { inp.focus(); } catch (err) {}
          place(rec);
        };
        btn.addEventListener("mousedown", function (e) { e.preventDefault(); }); // 桌面：避免点按钮时输入框失焦
        btn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); doClear(); });
        // iOS：touchend 里清（touchstart 若 preventDefault 会把 click 一起吞掉，导致点了没反应）
        btn.addEventListener("touchend", function (e) { e.preventDefault(); e.stopPropagation(); doClear(); });
        document.body.appendChild(btn);
        const rec = { inp: inp, btn: btn };
        recs.push(rec);
        ["input", "focus", "keyup", "change", "paste"].forEach(function (ev) {
          inp.addEventListener(ev, function () { place(rec); });
        });
        place(rec);
      };
      const scan = function () {
        try {
          document.querySelectorAll(SEL).forEach(function (inp) { if (inp.dataset.kgClear !== "1") addTo(inp); });
        } catch (e) {}
      };
      scan();
      // 输入/滚动/缩放/布局变化时重新定位；另有低频轮询兜底（含动态生成的弹窗与模块）
      document.addEventListener("scroll", placeAll, true);
      window.addEventListener("resize", placeAll);
      window.addEventListener("orientationchange", placeAll);
      setInterval(placeAll, 400);
      let pending = false;
      const sched = function () { if (pending) return; pending = true; setTimeout(function () { pending = false; scan(); placeAll(); }, 80); };
      const obs = new MutationObserver(sched);
      obs.observe(document.body, { childList: true, subtree: true });
    }
  };

  window.UI = UI;
})();
