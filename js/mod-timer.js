/* 模块：上岸计时器
   - 自定义任务名；默认「计入今日计划」（可取消勾选）；
   - 支持倒计时（设定专注时长）：到点自动结算并标记计划项完成；
   - 开始 / 暂停 / 继续 / 停止；停止时把时长计入当日专注分钟与该计划项（标记已完成 + 专注分钟）；
   - 计时跨界面持续（状态存于 DB，顶栏常驻显示），切到其他页面也不中断；
   - 打卡日历的计划项点「⏱ 开始专注」会带着任务名与时长直接进来并开始倒计时。
*/
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};
  let iv = null;

  function fmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    const p = n => String(n).padStart(2, "0");
    return (h > 0 ? h + ":" : "") + p(m) + ":" + p(ss);
  }
  function fmtMs(ms) {
    // 分段表里显示到百分秒：mm:ss.xx
    const s = Math.max(0, Math.floor(ms / 1000));
    const cs = Math.floor((ms % 1000) / 10);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    const p = n => String(n).padStart(2, "0");
    return (h > 0 ? h + ":" : "") + p(m) + ":" + p(ss) + "." + p(cs);
  }
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function renderLaps(laps, opts) {
    // 新→旧展示；最快段标绿、最新段标红；stop 后会用 .lap-final 标最后一段
    if (!laps || !laps.length) return "";
    const arr = laps.map((d, i) => ({ n: i + 1, dur: d }));
    const reversed = arr.slice().reverse(); // 最新在最上面
    const fastestIdx = arr.length > 1 ? arr.reduce((best, x, i, a) => x.dur < a[best].dur ? i : best, 0) : -1;
    const fastestN = fastestIdx >= 0 ? arr[fastestIdx].n : -1;
    const latestN = arr[arr.length - 1].n;
    const final = opts && opts.final;
    return reversed.map((it, i) => {
      const cls = [];
      if (it.n === latestN) cls.push("lap-latest");
      if (it.n === fastestN && arr.length > 1) cls.push("lap-fast");
      if (final && i === 0) cls.push("lap-latest");
      return `<div class="lap-row ${cls.join(' ')}"><span class="lap-label">分段 ${it.n}</span><span class="lap-time">${fmtMs(it.dur)}</span></div>`;
    }).join("");
  }

  window.MODULES.timer = {
    title: "上岸计时器", icon: "timer",
    render(body) {
      const DB = window.DB, UI = window.UI;
      const date = DB.today();

      function render() {
        if (iv) { clearInterval(iv); iv = null; }
        const s = DB.timerState();
        const plan = DB.getPlan(date);
        const running = s.running;
        const isCountdown = s.targetMs && s.targetMs > 0;
        const displayMs = isCountdown ? Math.max(0, DB.timerRemainingMs()) : DB.timerElapsedMs();
        const laps = s.laps || [];
        const fastestN = laps.length > 1 ? (() => { let mn = 0; laps.forEach((d, i) => { if (d < laps[mn]) mn = i; }); return mn + 1; })() : -1;

        // 默认计入计划：若有 pendingFocus（来自计划项「开始专注」）则直接绑定
        let pending = window.__pendingFocus;
        window.__pendingFocus = null;
        let prefill = window.__focusPrefill;
        window.__focusPrefill = null;

        const planOpts = ['<option value="">＋ 新建专注项（自动计入计划）</option>']
          .concat(plan.items.map(it => `<option value="${it.id}" ${s.planId === it.id ? "selected" : ""}>${esc((it.text || "").slice(0, 18))}</option>`))
          .join("");

        body.innerHTML = `<div class="card">
          <h3>⏱ 上岸计时器</h3>
          <div class="muted small">自定义任务名开始专注；默认计入「今日计划」，停止时自动记已完成 + 专注时长。计时跨界面持续，顶栏也会显示。运行中可按「⏱ 分段」记录当前节点。</div>
          <button class="btn ghost sm" id="toShuati" style="margin-top:10px">📱 进入刷题模式（全屏 · 可自定义背景图）</button>
        </div>
        <div class="card" style="margin-top:8px;text-align:center">
          <div id="tElapsed" style="font-size:48px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:1px">${fmt(displayMs)}</div>
          <div id="tState" class="muted small" style="margin:6px 0 12px">${running ? (isCountdown ? "⏳ 倒计时中…" : "⏳ 计时中…") : (s.task ? "已暂停" : (isCountdown ? "未开始（倒计时）" : "未开始"))}${s.task ? " · " + esc(s.task) : ""}</div>
          <div class="row" style="justify-content:center;gap:10px;flex-wrap:wrap">
            <button class="btn ${running ? 'lap-btn' : 'btn ghost'}" id="lapBtn" ${running ? '' : 'disabled'}>⏱ 分段</button>
            ${running
              ? `<button class="btn primary" id="pause">⏸ 暂停</button>`
              : `<button class="btn primary" id="start">${s.task ? "▶ 继续" : "▶ 开始"}</button>`}
            <button class="btn danger" id="stop" ${running || s.accumulated || s.task ? "" : "disabled"}>⏹ 停止并结算</button>
            <button class="btn ghost" id="reset" ${s.accumulated || s.task || running ? "" : "disabled"}>↺ 清空</button>
          </div>
        </div>
        ${laps.length ? `<div class="card" style="margin-top:8px">
          <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
            <div class="muted small">⏱ 分段记录（最新在最上 · <span style="color:#34e7e4">绿色</span>为最快段 · <span style="color:#ff5cf0">粉/红</span>为最新段）</div>
            <div class="muted small">${laps.length} 段 · 合计 ${fmt(laps.reduce((a,b)=>a+b,0))}</div>
          </div>
          <div id="lapsList" class="lap-list">${renderLaps(laps)}</div>
        </div>` : ''}
        <div class="card" style="margin-top:8px">
          <label class="fld">① 选择学科（模块）</label>
          <select id="tSubj" class="full">${(function(){ const subs = (window.KG_SUBJECTS || ["言语理解","资料分析","数量关系","逻辑判断","常识判断","政治理论","申论"]); const sel = (pending && pending.subject) ? pending.subject : (s.subject || ""); return '<option value="">（不选学科）</option>' + subs.map(x => `<option value="${esc(x)}" ${sel === x ? "selected" : ""}>${esc(x)}</option>`).join(""); })()}</select>
          <label class="fld" style="margin-top:10px">② 任务名（专注内容）</label>
          <input id="tTask" class="full" placeholder="例如：复习类比推理 / 申论大作文" value="${esc(s.task || (pending ? pending.text : (prefill || "")))}"/>
          <label class="row" style="margin-top:10px;cursor:pointer;gap:8px"><input type="checkbox" id="tCount" style="width:auto" ${s.planId || pending ? "checked" : "checked"}/> 计入今日计划（默认开启，可取消）</label>
          <label class="fld" style="margin-top:10px">绑定计划项（留空则自动新建）</label>
          <select id="tPlan" class="full">${planOpts}</select>
          <label class="fld" style="margin-top:10px">专注时长（分钟，留空为累计计时）</label>
          <input id="tMin" type="number" min="1" class="full" placeholder="例如 25（到点自动结算）" value="${pending ? (pending.focusMin || "") : (isCountdown ? Math.round(s.targetMs / 60000) : "")}"/>
          <div class="muted small" style="margin-top:8px">填写时长即倒计时模式，到点自动标记计划项完成；不填则正序累计计时。</div>
        </div>`;

        const el = body.querySelector("#tElapsed");
        if (running) {
          iv = setInterval(() => {
            const st = DB.timerState();
            if (el) el.textContent = fmt(st.targetMs && st.targetMs > 0 ? Math.max(0, DB.timerRemainingMs()) : DB.timerElapsedMs());
            if (st.targetMs && st.targetMs > 0 && DB.timerElapsedMs() >= st.targetMs) {
              clearInterval(iv); iv = null;
              doStop();
            }
          }, 250);
        }

        const taskInput = body.querySelector("#tTask");
        const subjSel = body.querySelector("#tSubj");
        const planSel = body.querySelector("#tPlan");
        const countChk = body.querySelector("#tCount");
        const minInput = body.querySelector("#tMin");
        const startBtn = body.querySelector("#start");
        if (startBtn) startBtn.onclick = () => {
          const task = taskInput.value.trim();
          const subjName = subjSel ? subjSel.value : "";
          const subject = subjName ? DB.subjectShort(subjName) : "";
          const count = countChk.checked;
          const targetMin = parseInt(minInput.value, 10);
          const targetMs = (!isNaN(targetMin) && targetMin > 0) ? targetMin * 60000 : 0;
          let planId = count ? planSel.value : null;
          if (count && !planId) {
            const it = DB.addPlanItem(date, { module: subject || "计时器", type: "focus", text: task || (subject ? DB.fullSubject(subject) + " 专注" : "专注学习"), minutes: 0 });
            planId = it.id;
          } else if (planId) {
            const it = plan.items.find(x => x.id === planId);
            if (it && task && it.text !== task) it.text = task;
          }
          DB.timerStart(task || (planId ? "" : "专注学习"), planId, targetMs, subject);
          render();
          window.__updateTopTimer && window.__updateTopTimer();
        };
        const pauseBtn = body.querySelector("#pause");
        if (pauseBtn) pauseBtn.onclick = () => { DB.timerPause(); render(); window.__updateTopTimer && window.__updateTopTimer(); };
        const lapBtn = body.querySelector("#lapBtn");
        if (lapBtn) lapBtn.onclick = () => { DB.timerLap(); render(); window.__updateTopTimer && window.__updateTopTimer(); };
        body.querySelector("#stop").onclick = () => doStop();
        body.querySelector("#reset").onclick = () => { DB.timerReset(); render(); window.__updateTopTimer && window.__updateTopTimer(); };
        const toShuati = body.querySelector("#toShuati");
        if (toShuati) toShuati.onclick = () => {
          const subjName = subjSel ? subjSel.value : "";
          window.__pendingFocus = { planId: DB.timerState().planId, text: DB.timerState().task || "刷题", focusMin: 0, subject: subjName ? DB.subjectShort(subjName) : (DB.timerState().subject || "") };
          location.hash = "#/shuati";
        };

        function doStop() {
          if (iv) { clearInterval(iv); iv = null; }
          // 在停止前快照分段（timerSettle 内部会清空 laps）；保留给 toast 显示
          const finalLaps = (DB.timerState().laps || []).slice();
          const r = DB.timerSettle("计时器");
          let extra = "";
          if (finalLaps.length) {
            const totalMs = finalLaps.reduce((a, b) => a + b, 0);
            extra = ` · 共 ${finalLaps.length} 段（${fmt(totalMs)}）`;
          }
          UI.toast(`已结算：专注 ${fmt(r.sec)}${extra}${r.planId ? "，已记入今日计划 ✓" : ""}`);
          render(); window.__updateTopTimer && window.__updateTopTimer();
        }
      }

      render();
    }
  };
})();
