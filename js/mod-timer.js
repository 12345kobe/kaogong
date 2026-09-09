/* 模块：上岸计时器
   - 自定义任务名；可选「计入今日计划」某个计划项；
   - 开始 / 暂停 / 继续 / 停止；停止时把时长计入当日专注分钟与该计划项；
   - 计时跨界面持续（状态存于 DB，顶栏常驻显示），切到其他页面也不中断。
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
        const elapsed = DB.timerElapsedMs();

        const planOpts = ['<option value="">（不计入计划）</option>']
          .concat(plan.items.map(it => `<option value="${it.id}" ${s.planId === it.id ? "selected" : ""}>${esc(it.text.slice(0, 18))}</option>`))
          .join("");

        body.innerHTML = `<div class="card">
          <h3>⏱ 上岸计时器</h3>
          <div class="muted small">自定义任务名，开始专注；可计入「今日计划」某项，停止时自动累计时长。计时跨界面持续，顶栏也会显示。</div>
        </div>
        <div class="card" style="margin-top:8px;text-align:center">
          <div id="tElapsed" style="font-size:48px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:1px">${fmt(elapsed)}</div>
          <div id="tState" class="muted small" style="margin:6px 0 12px">${running ? "⏳ 计时中…" : (s.task ? "已暂停" : "未开始")}${s.task ? " · " + esc(s.task) : ""}</div>
          <div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap">
            ${running
              ? `<button class="btn" id="pause">⏸ 暂停</button>`
              : `<button class="btn primary" id="start">${s.task ? "▶ 继续" : "▶ 开始"}</button>`}
            <button class="btn danger" id="stop" ${running || s.accumulated || s.task ? "" : "disabled"}>⏹ 停止并结算</button>
            <button class="btn ghost" id="reset" ${s.accumulated || s.task || running ? "" : "disabled"}>↺ 清空</button>
          </div>
        </div>
        <div class="card" style="margin-top:8px">
          <label class="fld">任务名（可选）</label>
          <input id="tTask" class="full" placeholder="例如：复习类比推理 / 申论大作文" value="${esc(s.task || "")}"/>
          <label class="fld" style="margin-top:10px">计入今日计划</label>
          <select id="tPlan" class="full">${planOpts}</select>
          <div class="muted small" style="margin-top:8px">选好后点「开始/继续」即绑定；停止时把本次时长写进该计划项。</div>
        </div>`;

        const el = body.querySelector("#tElapsed");
        if (running) {
          iv = setInterval(() => { if (el) el.textContent = fmt(DB.timerElapsedMs()); }, 500);
        }

        const taskInput = body.querySelector("#tTask");
        const planSel = body.querySelector("#tPlan");
        const startBtn = body.querySelector("#start");
        if (startBtn) startBtn.onclick = () => {
          const task = taskInput.value.trim();
          const planId = planSel.value || null;
          if (planId) {
            const it = plan.items.find(x => x.id === planId);
            if (it && task && it.text !== task) it.text = task;
            DB.save();
          }
          DB.timerStart(task, planId);
          render();
          window.__updateTopTimer && window.__updateTopTimer();
        };
        const pauseBtn = body.querySelector("#pause");
        if (pauseBtn) pauseBtn.onclick = () => { DB.timerPause(); render(); window.__updateTopTimer && window.__updateTopTimer(); };
        body.querySelector("#stop").onclick = () => {
          if (iv) { clearInterval(iv); iv = null; }
          const sec = DB.timerStop();
          const mins = Math.max(1, Math.round(sec / 60));
          DB.addTimerMinutes("计时器", mins);
          const planId = s.planId;
          if (planId) {
            const it = DB.getPlan(date).items.find(x => x.id === planId);
            if (it) { it.minutes = (it.minutes || 0) + mins; DB.save(); }
          }
          UI.toast(`已结算：专注 ${fmt(sec)}（约 ${mins} 分钟）`);
          render(); window.__updateTopTimer && window.__updateTopTimer();
        };
        body.querySelector("#reset").onclick = () => { DB.timerReset(); render(); window.__updateTopTimer && window.__updateTopTimer(); };
      }

      render();
    }
  };
})();
