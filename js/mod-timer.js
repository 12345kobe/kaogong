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
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

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
          <div class="muted small">自定义任务名开始专注；默认计入「今日计划」，停止时自动记已完成 + 专注时长。计时跨界面持续，顶栏也会显示。</div>
        </div>
        <div class="card" style="margin-top:8px;text-align:center">
          <div id="tElapsed" style="font-size:48px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:1px">${fmt(displayMs)}</div>
          <div id="tState" class="muted small" style="margin:6px 0 12px">${running ? (isCountdown ? "⏳ 倒计时中…" : "⏳ 计时中…") : (s.task ? "已暂停" : (isCountdown ? "未开始（倒计时）" : "未开始"))}${s.task ? " · " + esc(s.task) : ""}</div>
          <div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap">
            ${running
              ? `<button class="btn" id="pause">⏸ 暂停</button>`
              : `<button class="btn primary" id="start">${s.task ? "▶ 继续" : "▶ 开始"}</button>`}
            <button class="btn danger" id="stop" ${running || s.accumulated || s.task ? "" : "disabled"}>⏹ 停止并结算</button>
            <button class="btn ghost" id="reset" ${s.accumulated || s.task || running ? "" : "disabled"}>↺ 清空</button>
          </div>
        </div>
        <div class="card" style="margin-top:8px">
          <label class="fld">任务名（专注内容）</label>
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
          }, 500);
        }

        const taskInput = body.querySelector("#tTask");
        const planSel = body.querySelector("#tPlan");
        const countChk = body.querySelector("#tCount");
        const minInput = body.querySelector("#tMin");
        const startBtn = body.querySelector("#start");
        if (startBtn) startBtn.onclick = () => {
          const task = taskInput.value.trim();
          const count = countChk.checked;
          const targetMin = parseInt(minInput.value, 10);
          const targetMs = (!isNaN(targetMin) && targetMin > 0) ? targetMin * 60000 : 0;
          let planId = count ? planSel.value : null;
          if (count && !planId) {
            const it = DB.addPlanItem(date, { module: "计时器", type: "focus", text: task || "专注学习", minutes: 0 });
            planId = it.id;
          } else if (planId) {
            const it = plan.items.find(x => x.id === planId);
            if (it && task && it.text !== task) it.text = task;
          }
          DB.timerStart(task || (planId ? "" : "专注学习"), planId, targetMs);
          render();
          window.__updateTopTimer && window.__updateTopTimer();
        };
        const pauseBtn = body.querySelector("#pause");
        if (pauseBtn) pauseBtn.onclick = () => { DB.timerPause(); render(); window.__updateTopTimer && window.__updateTopTimer(); };
        body.querySelector("#stop").onclick = () => doStop();
        body.querySelector("#reset").onclick = () => { DB.timerReset(); render(); window.__updateTopTimer && window.__updateTopTimer(); };

        function doStop() {
          if (iv) { clearInterval(iv); iv = null; }
          const st = DB.timerState();
          const planId = st.planId, targetMs = st.targetMs;
          const sec = DB.timerStop();
          const mins = targetMs && targetMs > 0 ? Math.max(1, Math.round(targetMs / 60000)) : Math.max(1, Math.round(sec / 60));
          DB.addTimerMinutes("计时器", mins);
          if (planId) {
            const it = DB.getPlan(date).items.find(x => x.id === planId);
            if (it) { it.minutes = (it.minutes || 0) + mins; it.done = true; DB.save(); }
          }
          UI.toast(`已结算：专注 ${fmt(sec)}（约 ${mins} 分钟）${planId ? "，已记入今日计划 ✓" : ""}`);
          render(); window.__updateTopTimer && window.__updateTopTimer();
        }
      }

      render();
    }
  };
})();
