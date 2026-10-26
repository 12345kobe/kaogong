/* 模块：刷题模式（全屏）
   - 进入：打卡日历里「刷题」类计划点「📱 进入刷题」即进入；或计时器页「进入刷题模式」；
          倒计时页「省考/国考 开始刷题」「复盘」「综合刷题」直接带着配置全屏进入。
   - 全屏覆盖整个屏幕，可自定义背景图、字体颜色；可「退出全屏」回到小屏（上岸计时器），计时继续。
   - 限时刷题（quiz/combo）：自动开始倒计时；到点不弹窗，而是从 0:00 直接转正向计时，
     上方显示「已延迟 HH:MM:SS」（即下方跳秒的时间）；结束两段时长（计划段 + 延迟段）相加计入总时长。
   - 正向计时（plain/review）：毫秒级计时，可暂停/分段/清空。
   - 结束 → 弹出记录表单（综合刷题逐模块填题数/答对），保存后按学科记入正确率并返回打卡日历。
   - 顶栏白噪音在本界面也可控制（window.WhiteNoise）。
*/
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};
  let iv = null, buzzed = false, lastOt = false;

  /* ★v20261021 会话状态提到模块级（原来是 render() 闭包里的局部变量）。
     病根：App 任何时候整体重渲染（云端同步落地、计划变更、 sliceUI 刷新…）都会重新执行
     render()，闭包里的 started/ended/planId 全部回到初始值；autoStart 模式随即判定
     「没开始过」→ 再次 startLaunched() → 又放一遍 3→2→1→GO 重新计时。
     用户描述的「对答案那十几秒，页面突然又 321 go」正是这个。提到模块级后，
     重渲染只重绘界面，不会重启计时，也不会丢掉 planId（导致计划打不上勾）。 */
  const SS = {
    key: "",            // 本次会话标识（进入配置签名）
    started: false,     // 已开始计时
    ended: false,       // 已结束、填写记录中
    finalElapsedMs: 0,  // 结束时刻的实际总时长（含超时段）
    finalLaps: [],
    planId: null,
    task: "",
    subject: "",
    lastCount: 0        // 上次的答题数，用于记录表单预填（★不再让用户每次重填）
  };
  function _sig(launch, pending) {
    try { return JSON.stringify(launch || {}) + "|" + ((pending && pending.planId) || ""); } catch (e) { return ""; }
  }

  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function fmtMsFull(ms) {
    ms = Math.max(0, ms);
    const cs = ms % 1000;
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    const p = n => String(n).padStart(2, "0");
    return (h > 0 ? h + ":" : "") + p(m) + ":" + p(ss) + "." + p(cs);
  }

  function renderLaps(laps) {
    if (!laps || !laps.length) return "";
    const arr = laps.map((d, i) => ({ n: i + 1, dur: d }));
    const fastestIdx = arr.length > 1 ? arr.reduce((best, x, i, a) => x.dur < a[best].dur ? i : best, 0) : -1;
    const fastestN = fastestIdx >= 0 ? arr[fastestIdx].n : -1;
    const latestN = arr[arr.length - 1].n;
    return arr.slice().reverse().map(it => {
      const cls = [];
      if (it.n === latestN) cls.push("lap-latest");
      if (it.n === fastestN && arr.length > 1) cls.push("lap-fast");
      return `<div class="lap-row ${cls.join(' ')}"><span class="lap-label">分段 ${it.n}</span><span class="lap-time">${fmtMsFull(it.dur)}</span></div>`;
    }).join("");
  }

  function getBg() { try { return localStorage.getItem("kg_shuati_bg") || ""; } catch (e) { return ""; } }
  function setBg(v) { try { if (v) localStorage.setItem("kg_shuati_bg", v); else localStorage.removeItem("kg_shuati_bg"); } catch (e) {} }
  function getFontColor() { try { return localStorage.getItem("kg_shuati_fontcolor") || ""; } catch (e) { return ""; } }
  function setFontColor(v) { try { if (v) localStorage.setItem("kg_shuati_fontcolor", v); else localStorage.removeItem("kg_shuati_fontcolor"); } catch (e) {} }
  function subjOpts(sel) {
    const subs = (window.KG_SUBJECTS || ["言语理解", "资料分析", "数量关系", "判断推理", "常识判断", "政治理论", "申论"]);
    return '<option value="">（不选学科）</option>' + subs.map(s => `<option value="${esc(s)}" ${sel === s ? "selected" : ""}>${esc(s)}</option>`).join("");
  }

  window.MODULES.shuati = {
    title: "刷题模式", icon: "timer",
    render(body) {
      const DB = window.DB, UI = window.UI;

      // 进入配置：优先用一次性 __shuatiLaunch，其次用持久化的 DB.state.shuatiLaunch（刷新可续）
      let launch = window.__shuatiLaunch || (DB.state && DB.state.shuatiLaunch) || null;
      if (window.__shuatiLaunch) window.__shuatiLaunch = null;
      if (launch && DB.state) { DB.state.shuatiLaunch = launch; try { DB.save(); } catch (e) {} }

      // 解析模式
      let mode = "plain";       // plain（手动正向）/ quiz（单科限时）/ combo（综合限时）/ review（复盘正向）
      let combo = [], quizSubject = "", quizCount = 0, quizMins = 0, reviewNote = "";
      if (launch) {
        if (launch.mode === "combo") { mode = "combo"; combo = launch.combo || []; }
        else if (launch.mode === "review") { mode = "review"; quizSubject = launch.subject || ""; reviewNote = launch.note || ""; }
        else { mode = "quiz"; quizSubject = launch.subject || ""; quizCount = launch.count || 0; quizMins = launch.mins || 0; }
      }
      const autoStart = (mode === "quiz" || mode === "combo" || mode === "review");

      let pending = window.__pendingFocus;
      window.__pendingFocus = null;
      const pendingSubject = pending && pending.subject ? pending.subject : "";

      /* 把会话状态落到 DB.state.shuatiSession：连「页面被系统重载」也能正确续上，
         不会把已经跑过的 3→2→1→GO 再放一遍（用户反馈的重启计时，最后一重保险）。 */
      function _persistSS() {
        try {
          DB.state.shuatiSession = {
            key: SS.key, started: SS.started, ended: SS.ended,
            finalElapsedMs: SS.finalElapsedMs, finalLaps: SS.finalLaps,
            planId: SS.planId, task: SS.task, subject: SS.subject, lastCount: SS.lastCount
          };
          DB.save();
        } catch (e) {}
      }
      function _clearSS() {
        try { SS.started = false; SS.ended = false; SS.finalElapsedMs = 0; SS.finalLaps = []; DB.state.shuatiSession = null; DB.save(); } catch (e) {}
      }

      /* 会话轴：同一会话跨 render() 复用 SS；新会话（签名变化 / 上一轮已结算干净）才重置。
         ★v20261026a 巨大 bug 修复：旧签名把一次性的 __pendingFocus 也算进去
         （_sig(launch, pending)）。点「暂停」→ render() 第二次执行时 pending 已被
         window.__pendingFocus = null 消费掉 → 签名从 "…|planId" 变成 "…|" →
         判定为新会话 → SS.started 被重置为 false → autoStart 再次 startLaunched()
         → 又放一遍 3→2→1→GO，且 timerStart 不带 resume → accumulated 清零 = 从头计时。
         签名只认 launch（持久化、跨 render 稳定）；pending 只用于首次进入补 planId。 */
      const sig = _sig(launch, null);
      const persisted = (DB.state && DB.state.shuatiSession) || null;
      if (persisted && persisted.key === sig) {
        // 同一会话（含重载）：原样恢复，保证不重放倒计时、不丢 planId
        SS.key = sig;
        SS.started = !!persisted.started;
        SS.ended = !!persisted.ended;
        SS.finalElapsedMs = persisted.finalElapsedMs || 0;
        SS.finalLaps = persisted.finalLaps || [];
        SS.planId = persisted.planId || null;
        SS.task = persisted.task || "";
        SS.subject = persisted.subject || "";
        SS.lastCount = persisted.lastCount || 0;
      } else if (SS.key !== sig) {
        SS.key = sig; SS.started = false; SS.ended = false;
        SS.finalElapsedMs = 0; SS.finalLaps = [];
        SS.planId = pending ? pending.planId : null;
        SS.task = pending ? pending.text : (mode === "plain" ? (DB.timerState().task || "刷题") : "");
        SS.subject = "";
        SS.lastCount = 0;
      }
      // 上一轮已经彻底结算干净（已结束且计时器已清空）→ 允许同签名重新开始新的一轮
      if (SS.ended && !DB.timerState().running && DB.timerElapsedMs() === 0) {
        SS.started = false; SS.ended = false; SS.finalElapsedMs = 0; SS.finalLaps = [];
        SS.planId = pending ? pending.planId : null;
        SS.task = pending ? pending.text : (mode === "plain" ? (DB.timerState().task || "刷题") : "");
        SS.subject = "";
        if (DB.state) { DB.state.shuatiSession = null; try { DB.save(); } catch (e) {} }
      }
      let planId = SS.planId;      // 本地别名（同一 render 内多处使用）
      let task = SS.task;
      let subject = SS.subject;    // 短名（quiz/review/plain 用；combo 为空）
      const syncSession = () => { SS.planId = planId; SS.task = task; SS.subject = subject; };

      let bg = getBg();
      let fontColor = getFontColor();

      // 若此前已在计时（异常残留 / 刷新续接），视为已 started
      if (DB.timerState().running) SS.started = true;

      function goBack() {
        // 返回 = 退出全屏到小屏（上岸计时器），计时继续（见 app.js：shuati→timer 不结算）
        exitFull();
      }

      function startLaunched() {
        let subj = "", t = "", target = 0, pId = null, planTask = "";
        if (mode === "quiz") {
          subj = DB.subjectShort(quizSubject);
          target = Math.round(quizMins * 60000);
          planTask = quizSubject + " " + quizCount + " 题（限时 " + quizMins + " 分钟）";
        } else if (mode === "combo") {
          const totalMin = combo.reduce((a, b) => a + (b.mins || 0), 0);
          target = Math.round(totalMin * 60000);
          planTask = "综合刷题（" + combo.length + " 模块 · " + totalMin + " 分钟）";
        } else { // review（复盘，正向不限时）
          subj = DB.subjectShort(quizSubject);
          planTask = "📝 " + quizSubject + "复盘" + (reviewNote ? " · " + reviewNote : "");
        }
        try {
          // 复用同一天「同文本、未完成」的专注项：绝不重复创建（之前每次 render 都新建一条，
          // 暂停几次就多出几条空白计划项）；计划时限放 focusMin 供展示，minutes 只记实际专注时长
          const plan = DB.getPlan(DB.today());
          const exist = plan.items.find(x => !x.done && x.type === "focus" && x.text === planTask);
          const it = exist || DB.addPlanItem(DB.today(), { module: subj || "计时器", type: "focus", text: planTask, minutes: 0, focusMin: Math.round((target || 0) / 60000) });
          pId = it && it.id;
        } catch (e) {}
        SS.planId = planId = pId; SS.subject = subject = subj; SS.task = task = planTask;
        SS.started = true; _persistSS();   // 先标记，render 才会渲染计时 UI（倒计时遮罩盖在其上）

        // 真正开始计时（先建计划项，倒计时结束后再启动，保证「3→2→1→GO 后才开始答题」）
        const reallyStart = () => {
          DB.timerStart(planTask, pId, target, subj);
          const tt = DB.timerState();
          tt.shuati = true;                 // 标记：由刷题模式自行处理超时，屏蔽考试模式弹窗
          if (mode === "review") tt.review = true;
          try { DB.save(); } catch (e) {}
          try { window.__updateTopTimer && window.__updateTopTimer(); } catch (e) {}
          render();
        };

        // 国省考「刷题」入口（quiz / combo）：先放 3→2→1→GO 巨大数字倒计时，再开始计时答题；
        // 复盘（review）直接开始，不走倒计时
        if ((mode === "quiz" || mode === "combo") && window.KGExam && window.KGExam.bigCountdown) {
          window.KGExam.bigCountdown(reallyStart);
        } else {
          reallyStart();
        }
      }

      function bindCommon() {
        const backBtn = body.querySelector("#backBtn");
        if (backBtn) backBtn.onclick = goBack;
        const wnBtn = body.querySelector("#wnBtn");
        if (wnBtn) wnBtn.onclick = () => { if (window.WhiteNoise) { window.WhiteNoise.toggle(); render(); } };
        const bgBtn = body.querySelector("#bgBtn");
        if (bgBtn) bgBtn.onclick = () => body.querySelector("#bgFile").click();
        const bgFile = body.querySelector("#bgFile");
        if (bgFile) bgFile.onchange = e => {
          const f = e.target.files[0]; if (!f) return;
          const rd = new FileReader();
          rd.onload = () => { bg = rd.result; setBg(bg); render(); };
          rd.readAsDataURL(f);
        };
        const bgClear = body.querySelector("#bgClear");
        if (bgClear) bgClear.onclick = () => { bg = ""; setBg(""); render(); };
        const fc = body.querySelector("#fontColor");
        if (fc) fc.oninput = () => { fontColor = fc.value; setFontColor(fontColor); render(); };
      }

      function taskColor() { return fontColor ? `color:${fontColor}` : ""; }

      function exitFull() {
        // 退出全屏：保留计时，跳到小屏上岸计时器（app.js 在 shuati→timer 时不会结算）
        if (iv) { clearInterval(iv); iv = null; }
        location.hash = "#/timer";
      }

      function render() {
        if (iv) { clearInterval(iv); iv = null; }
        // 自动开始（限时 / 复盘 / 综合）：只启动一次（以 started 为准）。
        // 之前用 !running 判断 —— 暂停后 running=false 会再次触发 startLaunched()，
        // 造成：① 重复创建计划项（多出空白任务）② 计时被重启、超时基准被重置、暂停失效
        /* ★v20261026a 第二重保险：本轮计时器里已经有数据（正在跑 / 暂停中 / 已累计）却还没
           标记 started —— 一律只补标记，绝不重启。否则任何一次意外重置 SS 都会导致
           「按暂停后再继续，倒计时从 55:00 从头开始」。 */
        if (autoStart && !SS.started && !SS.ended) {
          const _tt = DB.timerState() || {};
          if (_tt.running || (_tt.accumulated || 0) > 0 || (_tt.startTs || 0) > 0) {
            SS.started = true; _persistSS();
          } else startLaunched();
        }

        const s = DB.timerState();
        const running = s.running;
        const hasTime = s.accumulated > 0 || running;
        const isCD = s.targetMs && s.targetMs > 0;
        const elapsed = DB.timerElapsedMs();
        const overtime = isCD && elapsed >= s.targetMs;
        const bigMs = overtime ? (elapsed - s.targetMs) : (isCD ? Math.max(0, DB.timerRemainingMs()) : elapsed);
        const laps = s.laps || [];
        const wnOn = window.WhiteNoise && window.WhiteNoise.isOn();

        let statusTxt, subTxt;
        if (overtime) { statusTxt = "⏰ 已超计划时限 · 正向计时中"; subTxt = "从 0:00 起正向累计（下方跳秒即延迟时长）"; }
        else if (isCD) { statusTxt = running ? "⏳ 限时倒计时中" : (hasTime ? "⏸ 已暂停（倒计时）" : "未开始"); subTxt = running ? "到点后自动转正向计时并标记「已延迟」" : ""; }
        else { statusTxt = running ? "⏱ 计时中（毫秒）" : (hasTime ? "⏸ 已暂停" : "未开始"); subTxt = ""; }

        let inner = "";
        if (SS.ended) {
          inner = endFormInner();
        } else if (SS.started) {
          inner = `<div class="shuati-center">
              <div id="stElapsed" class="shuati-time" style="${taskColor()}">${fmtMsFull(bigMs)}</div>
              <div class="shuati-sub" id="stStatus">${statusTxt}</div>
              ${subTxt ? `<div class="shuati-sub" style="margin-top:2px;opacity:.7;font-size:12px">${subTxt}</div>` : ''}
              <div id="overdueLbl" class="shuati-overdue" style="display:${overtime ? 'block' : 'none'}">已延迟 ${fmtMsFull(bigMs)}</div>
            </div>
            <div class="shuati-btns">
              <button class="btn big primary" id="endBtn">⏹ 结束计时</button>
              <button class="btn big" id="pauseBtn">${running ? '⏸ 暂停计时' : (hasTime ? '▶ 继续计时' : '▶ 开始计时')}</button>
              <button class="btn big" id="lapBtn" ${running ? '' : 'disabled'}>⏱ 分段</button>
              <button class="btn big ghost" id="exitBtn">↩ 退出全屏</button>
              ${mode === "plain" ? `<button class="btn big ghost" id="resetBtn" ${hasTime || running ? '' : 'disabled'}>↺ 清空</button>` : ''}
            </div>
            ${laps.length ? `<div class="shuati-laps"><div class="muted small" style="margin-bottom:6px;color:#cdd6f0">分段记录（最新在最上 · <span style="color:#34e7e4">绿</span>最快 · <span style="color:#ff5cf0">粉/红</span>最新）· 共 ${laps.length} 段</div><div class="lap-list">${renderLaps(laps)}</div></div>` : ''}`;
        } else {
          inner = `<div class="shuati-center">
              <div id="stElapsed" class="shuati-time" style="${taskColor()}">00:00.00</div>
              <div class="shuati-sub">未开始计时</div>
              <label class="fld" style="color:#cdd6f0;margin-top:16px;text-align:left">① 选择学科（模块）</label>
              <select id="subjSel" class="shuati-input" style="text-align:left">${subjOpts(pendingSubject || (subject ? DB.fullSubject(subject) : ""))}</select>
              <label class="fld" style="color:#cdd6f0;margin-top:10px;text-align:left">② 本次刷题任务（自填）</label>
              <input id="taskInput" class="shuati-input" placeholder="例如：行测类比推理专项" value="${esc(task)}"/>
              <div class="shuati-relate">
                <button class="btn ghost sm" id="relateBtn">📎 关联今日任务</button>
                <button class="btn ghost sm" id="newBtn">➕ 新建今日任务</button>
              </div>
            </div>
            <div class="shuati-btns">
              <button class="btn big primary" id="startBtn">▶ 开始计时</button>
            </div>`;
        }

        body.innerHTML = `<div class="shuati" style="${bg ? `background-image:url('${esc(bg)}')` : ''}">
          <div class="shuati-mask"></div>
          <div class="shuati-top">
            <button class="shuati-back" id="backBtn">← 返回</button>
            <div class="shuati-task" style="${taskColor()}">📚 ${esc(SS.ended ? (s.task || task) : (SS.started ? (s.task || task) : (task || "刷题")))}</div>
            <span id="topOverdue" class="shuati-otpill" style="display:${overtime ? 'inline-block' : 'none'}">⏰ 已延迟 ${fmtMsFull(bigMs)}</span>
            <button class="shuati-wn ${wnOn ? 'on' : ''}" id="wnBtn">🎧${wnOn ? ' · 播放中' : ''}</button>
          </div>
          ${inner}
          <div class="shuati-foot">
            <button class="btn ghost sm" id="bgBtn">🖼 自定义背景图片</button>
            ${bg ? `<button class="btn ghost sm" id="bgClear">🗑 清除背景</button>` : ''}
            <label class="shuati-fontrow" style="color:#cdd6f0">🎨 字体颜色 <input type="color" id="fontColor" value="${fontColor || "#ffffff"}" style="width:36px;height:28px;border:none;background:none;vertical-align:middle;cursor:pointer"/></label>
            <span class="muted small" style="color:#cdd6f0">${SS.ended ? '保存记录将返回打卡日历' : (autoStart ? '结束计时返回打卡日历；「↩ 退出全屏」可回小屏继续计时' : '结束计时返回打卡日历；退出本界面即结束计时')}</span>
          </div>
          <input type="file" id="bgFile" accept="image/*" style="display:none"/>
        </div>`;

        // 毫秒级刷新（仅 started 且 running）
        const el = body.querySelector("#stElapsed");
        if (SS.started && running && !SS.ended) {
          iv = setInterval(() => {
            const cur = DB.timerState();
            if (!cur.running) { render(); return; }
            const eMs = DB.timerElapsedMs();
            const ot = cur.targetMs > 0 && eMs >= cur.targetMs;
            const val = ot ? (eMs - cur.targetMs) : (cur.targetMs > 0 ? Math.max(0, DB.timerRemainingMs()) : eMs);
            if (el) el.textContent = fmtMsFull(val);
            const od = fmtMsFull(ot ? (eMs - cur.targetMs) : 0);
            const ol = body.querySelector("#overdueLbl");
            if (ol) { ol.style.display = ot ? 'block' : 'none'; if (ot) ol.textContent = "已延迟 " + od; }
            const tp = body.querySelector("#topOverdue");
            if (tp) { tp.style.display = ot ? 'inline-block' : 'none'; if (ot) tp.textContent = "⏰ 已延迟 " + od; }
            if (ot && !buzzed) { buzzed = true; if (window.KGExam && KGExam.buzz) KGExam.buzz(); }
            lastOt = ot;
          }, 33);
        }

        bindCommon();
        wire();
      }

      /* ★v20261021 结束后：正中间大字显示本次计时总时长。
         若超出计划时限，大数 = 计划段 + 超时段 相加（即本次实际总时长），并用小字拆开给你看，
         再补一行「超时 X:XX」—— 以前这块是空白的，用户看不到这次刷了多久。 */
      function endBigTime() {
        const total = SS.finalElapsedMs || 0;
        const tgt = targetMsOf();
        const over = tgt > 0 ? Math.max(0, total - tgt) : 0;
        let sub = "⏹ 本次计时（总时长）";
        if (tgt > 0) {
          sub = over > 0
            ? `⏹ 本次计时：计划 ${Math.round(tgt / 60000)} 分钟 + 超时 ${fmtMsFull(over)} ＝ <b>${fmtMsFull(total)}</b>`
            : `⏹ 本次计时（限时 ${Math.round(tgt / 60000)} 分钟内完成，未超时）`;
        }
        return `<div class="shuati-center st-end">
            <div class="shuati-time st-end-time" style="${taskColor()}">${fmtMsFull(total)}</div>
            <div class="shuati-sub">${sub}</div>
            ${over > 0 ? `<div class="shuati-overdue" style="display:block">⏰ 已超时 ${fmtMsFull(over)}</div>` : ""}
          </div>`;
      }

      function endFormInner() {
        if (mode === "combo") {
          const rows = combo.map((c, i) => `
            <div class="combo-row" style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
              <b style="min-width:84px;text-align:left">${UI.esc(c.subject)}</b>
              <span class="muted small" style="color:#cdd6f0">建议 ${c.mins} 分</span>
              <label class="muted small" style="color:#cdd6f0">刷<input id="cCount${i}" type="number" min="0" class="shuati-input" style="width:64px;display:inline-block;margin:0 4px" value="${c.count || 0}"/>道</label>
              <label class="muted small" style="color:#cdd6f0">对<input id="cCorrect${i}" type="number" min="0" class="shuati-input" style="width:64px;display:inline-block;margin:0 4px" placeholder="0"/>道</label>
            </div>`).join("");
          return `${endBigTime()}
            <div class="shuati-form">
              <div class="muted small" style="margin-bottom:8px;color:#cdd6f0">题数已按计划预填（可自行改成实际刷的题数），各模块正确率将分别记入对应学科的学习统计。</div>
              ${rows}
            </div>
            <div class="shuati-btns">
              <button class="btn big primary" id="saveBtn">💾 保存记录</button>
              <button class="btn big ghost" id="skipBtn">跳过</button>
            </div>`;
        }
        /* prefill 优先级：本次进入配置带的题数 > 上次记录的题数 > 空（★不再每次强制手填） */
        const defCount = (mode === "quiz" && quizCount) ? quizCount : (SS.lastCount || "");
        return `${endBigTime()}
          <div class="shuati-form">
            <label class="fld" style="color:#cdd6f0;text-align:left">本次刷题数量（道）</label>
            <input id="qCount" class="shuati-input" type="number" min="0" inputmode="numeric" placeholder="例如 30" value="${defCount}"/>
            <label class="fld" style="color:#cdd6f0;margin-top:10px;text-align:left">答对数量（道）</label>
            <input id="qCorrect" class="shuati-input" type="number" min="0" inputmode="numeric" placeholder="例如 25"/>
            <div class="muted small" style="margin-top:8px;color:#cdd6f0">正确率将自动计算，并按所选学科记入学习统计（一一对应）。</div>
          </div>
          <div class="shuati-btns">
            <button class="btn big primary" id="saveBtn">💾 保存记录</button>
            <button class="btn big ghost" id="skipBtn">跳过</button>
          </div>`;
      }

      function wire() {
        if (SS.ended) {
          body.querySelector("#saveBtn").onclick = () => doSave();
          body.querySelector("#skipBtn").onclick = () => doSkip();
          return;
        }
        if (!SS.started) {
          body.querySelector("#startBtn").onclick = () => {
            const t = body.querySelector("#taskInput").value.trim();
            const subjName = body.querySelector("#subjSel").value;
            SS.subject = subject = subjName ? DB.subjectShort(subjName) : "";
            DB.timerStart(t || "刷题", planId, 0, subject);
            const tt = DB.timerState(); tt.shuati = true;
            try { DB.save(); } catch (e) {}
            SS.task = task = (t || "刷题");
            SS.started = true; _persistSS();
            render(); window.__updateTopTimer && window.__updateTopTimer();
          };
          const relateBtn = body.querySelector("#relateBtn");
          if (relateBtn) relateBtn.onclick = () => openRelate();
          const newBtn = body.querySelector("#newBtn");
          if (newBtn) newBtn.onclick = () => openNew();
          return;
        }
        // started
        body.querySelector("#endBtn").onclick = () => doEnd();
        body.querySelector("#pauseBtn").onclick = () => {
          if (DB.timerState().running) DB.timerPause();
          else DB.timerStart(DB.timerState().task || task, DB.timerState().planId, DB.timerState().targetMs, DB.timerState().subject, true);   // resume=true：继续暂停中的同一节
          render(); window.__updateTopTimer && window.__updateTopTimer();
        };
        body.querySelector("#lapBtn").onclick = () => { DB.timerLap(); render(); window.__updateTopTimer && window.__updateTopTimer(); };
        body.querySelector("#exitBtn").onclick = () => exitFull();
        const resetBtn = body.querySelector("#resetBtn");
        if (resetBtn) resetBtn.onclick = () => { DB.timerReset(); SS.started = false; if (DB.state) DB.state.shuatiSession = null; render(); window.__updateTopTimer && window.__updateTopTimer(); };
      }

      function openRelate() {
        const plan = DB.getPlan(DB.today());
        const items = plan.items.filter(x => !x.done);
        const box = UI.el(`<div></div>`);
        if (!items.length) {
          box.innerHTML = `<div class="muted small">今日还没有可关联的任务。点「➕ 新建今日任务」创建一个吧。</div>`;
        } else {
          box.innerHTML = `<div class="muted small" style="margin-bottom:8px">选择今日计划项，关联后开始计时会记入该任务（含学科）。</div>` +
            items.map(it => `<div class="rel-item" data-id="${it.id}" style="padding:10px 12px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px;cursor:pointer;background:var(--panel2)">
              <b>${esc(it.text)}</b> <span class="muted small">· ${esc(it.module || "")}</span></div>`).join("");
        }
        UI.modal({
          title: "关联今日任务", body: box, width: "460px",
          actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }]
        });
        box.querySelectorAll(".rel-item").forEach(r => r.onclick = () => {
          const it = DB.getPlan(DB.today()).items.find(x => x.id === r.dataset.id);
          if (it) {
            planId = SS.planId = it.id; task = SS.task = it.text; _persistSS();
            const known = (window.KG_SUBJECTS || []).indexOf(it.module) >= 0;
            subject = SS.subject = known ? DB.subjectShort(it.module) : (DB.subjectShort(it.module) || "");
            document.querySelector(".modal-mask") && document.querySelector(".modal-mask").remove();
            UI.toast("已关联：" + it.text);
            render();
          }
        });
      }

      function openNew() {
        const box = UI.el(`<div></div>`);
        box.innerHTML = `
          <label class="fld">学科（模块）</label><select id="nSubj" class="full">${subjOpts("")}</select>
          <label class="fld" style="margin-top:8px">任务内容</label><input id="nText" class="full" placeholder="例如：做言语理解 30 题"/>
          <div class="muted small" style="margin-top:6px">新建的任务类型为「刷题」，会显示在今日计划并计入对应学科。</div>`;
        UI.modal({
          title: "新建今日任务", body: box, width: "460px",
          actions: [
            { label: "取消", cls: "ghost", onClick: (m, c) => c() },
            { label: "创建并关联", cls: "primary", onClick: (m, c) => {
              const subjName = box.querySelector("#nSubj").value;
              const text = box.querySelector("#nText").value.trim() || (subjName ? subjName + " 刷题" : "刷题任务");
              const subj = subjName ? DB.subjectShort(subjName) : "";
              const it = DB.addPlanItem(DB.today(), { module: subj || "刷题", type: "quiz", text: text, focusMin: 0, count: null });
              planId = SS.planId = it.id; task = SS.task = text; subject = SS.subject = subj; _persistSS();
              c(); render(); UI.toast("已创建并关联：" + text);
            } }
          ]
        });
      }

      function doEnd() {
        if (iv) { clearInterval(iv); iv = null; }
        SS.finalLaps = DB.timerState().laps.slice();
        SS.finalElapsedMs = DB.timerElapsedMs();
        /* ★必须在 timerStop() 之前留存 planId —— timerStop 会把 planId 清成 null，
           之后 timerSettle 就找不到计划项 → 每日计划永远打不上勾（用户反馈的病根）。 */
        SS.planId = planId || DB.timerState().planId;
        DB.timerStop(); // 冻结计时（flush 末段 + 清 laps），不再自动累计
        window.__updateTopTimer && window.__updateTopTimer();
        SS.ended = true; _persistSS();
        render(); // 切到记录表单
      }

      function finalize(mins, creditActual) {
        /* ★计划打勾兜底：timerSettle 内部会调 timerStop()，而 timerStop 把 planId 清成 null，
           导致它再也命中不到计划项 → 每日计划不会自动划掉。这里用 doEnd 时留存下来的 id 显式补刀。 */
        const pid = SS.planId || planId;
        const r = DB.timerSettle("刷题模式", creditActual);
        try {
          const id = pid || (r && r.planId);
          if (id) {
            const it = DB.getPlan(DB.today()).items.find(x => x.id === id);
            if (it) {
              // 若 timerSettle 已命中同一项（罕见），就不要再加一次分钟，防止时长翻倍
              if (!(r && r.planId === id)) it.minutes = (it.minutes || 0) + mins;
              it.done = true;
              DB.save();
              // 通知打卡日历实时刷新
              try { window.dispatchEvent(new Event("kg-plan-changed")); } catch (e) {}
            }
            SS.planId = planId = id;
          }
        } catch (e) {}
        window.__updateTopTimer && window.__updateTopTimer();
        return r;
      }

      /* 限时刷题 / 综合刷题：把「超时」时长（实际用时 - 计划时限，秒）标到计划项上，
         打卡日历的每日计划里会显示 ⏰ 超时 X分Y秒 */
      function targetMsOf() {
        if (mode === "quiz") return Math.round((quizMins || 0) * 60000);
        if (mode === "combo") return Math.round(combo.reduce((a, b) => a + (b.mins || 0), 0) * 60000);
        return 0;
      }
      function recordOvertime() {
        try {
          if (!planId) return;
          const t = targetMsOf();
          if (!t) return;
          const over = SS.finalElapsedMs - t;
          if (over <= 0) return;
          const it = DB.getPlan(DB.today()).items.find(x => x.id === planId);
          if (it) { it.overtime = Math.round(over / 1000); DB.save(); }
        } catch (e) {}
      }

      function doSave() {
        // 校验
        if (mode === "combo") {
          for (let i = 0; i < combo.length; i++) {
            const cnt = parseInt(body.querySelector("#cCount" + i).value, 10);
            if (isNaN(cnt) || cnt < 0) { UI.toast("请填写「" + combo[i].subject + "」的刷题数量"); return; }
            const cor = parseInt(body.querySelector("#cCorrect" + i).value, 10);
            if (!isNaN(cor) && cor > cnt) { UI.toast(combo[i].subject + "：答对数量不能大于刷题数量"); return; }
          }
        } else if (mode !== "review") {
          /* ★v20261021 题数已预填，且「留空」不再拦截保存（按 0 处理），
             避免用户已经填了 P1 却被反复要求先填刷题数量。 */
          const cntRaw = body.querySelector("#qCount").value;
          const cnt = cntRaw === "" ? 0 : parseInt(cntRaw, 10);
          if (!isNaN(cnt) && cnt < 0) { UI.toast("刷题数量不能为负"); return; }
          const cor = parseInt(body.querySelector("#qCorrect").value, 10);
          if (!isNaN(cor) && cor > Math.max(0, cnt || 0)) { UI.toast("答对数量不能大于刷题数量"); return; }
        }
        const mins = Math.max(1, Math.round(SS.finalElapsedMs / 60000));
        finalize(mins, true); // 实际用时计（计划段+延迟段相加）
        recordOvertime();
        if (mode === "combo") {
          combo.forEach((c, i) => {
            const cnt = parseInt(body.querySelector("#cCount" + i).value, 10) || 0;
            const cor = parseInt(body.querySelector("#cCorrect" + i).value, 10) || 0;
            DB.recordAccuracy(DB.subjectShort(c.subject), cor, cnt);
          });
          if (planId) {
            const it = DB.getPlan(DB.today()).items.find(x => x.id === planId);
            if (it) {
              it.combo = combo.map((c, i) => ({ subject: c.subject, count: parseInt(body.querySelector("#cCount" + i).value, 10) || 0, correct: parseInt(body.querySelector("#cCorrect" + i).value, 10) || 0 }));
              DB.save();
            }
          }
        } else if (mode === "review") {
          if (window.KGExam && KGExam.logReview) KGExam.logReview(subject, mins);
        } else {
          /* ★v20261021 普通刷题（plain，手动从计时器进入）以前完全没有记账，
             导致这类刷题的正确率永远看不到。现在与 quiz 统一统计到所选学科。 */
          const cnt = parseInt(body.querySelector("#qCount").value, 10) || 0;
          const cor = parseInt(body.querySelector("#qCorrect").value, 10);
          if (cnt > 0) {
            const sub = subject || (DB.subjectShort(DB.timerState().subject || "") || "");
            if (sub) DB.recordAccuracy(sub, isNaN(cor) ? 0 : cor, cnt);
          }
          SS.lastCount = cnt;   // 记住本次题数，下次记录表单自动预填
          _persistSS();
          if (planId) { const it = DB.getPlan(DB.today()).items.find(x => x.id === planId); if (it) { it.count = cnt; it.correct = isNaN(cor) ? null : cor; DB.save(); } }
        }
        if (mode === "quiz") {
          const cnt = parseInt(body.querySelector("#qCount").value, 10) || 0;
          const cor = parseInt(body.querySelector("#qCorrect").value, 10);
          if (subject) DB.recordAccuracy(subject, isNaN(cor) ? 0 : cor, cnt);
          SS.lastCount = cnt; _persistSS();
          if (planId) { const it = DB.getPlan(DB.today()).items.find(x => x.id === planId); if (it) { it.count = cnt; it.correct = isNaN(cor) ? null : cor; DB.save(); } }
        }
        // 清理持久化的 launch（已结束）
        if (DB.state && DB.state.shuatiLaunch) { DB.state.shuatiLaunch = null; try { DB.save(); } catch (e) {} }
        _clearSS();
        const extra = (mode === "combo") ? " · 综合刷题 " + combo.length + " 模块" : (subject ? " · 学科 " + DB.fullSubject(subject) : "");
        const rec = SS.finalElapsedMs ? ` · 专注 ${fmtMsFull(SS.finalElapsedMs)}` : "";
        UI.toast(`刷题模式结束${rec}${extra}${planId ? "，已记入今日计划 ✓" : ""}`);
        location.hash = "#/calendar";
      }

      function doSkip() {
        const mins = Math.max(1, Math.round(SS.finalElapsedMs / 60000));
        finalize(mins, true);
        recordOvertime();
        if (DB.state && DB.state.shuatiLaunch) { DB.state.shuatiLaunch = null; try { DB.save(); } catch (e) {} }
        _clearSS();
        UI.toast(`刷题模式结束：专注 ${fmtMsFull(SS.finalElapsedMs)}${planId ? "，已记入今日计划 ✓" : ""}`);
        location.hash = "#/calendar";
      }

      render();

      // 离开本模块（哈希变化）时若仍在计时，由 app.js 统一处理（shuati→timer 保留，其它结算）；
      // 这里仅保证组件卸载时清掉 interval
      window.__shuatiCleanup = () => { if (iv) { clearInterval(iv); iv = null; } };
    }
  };
})();
