/* 模块：刷题模式（全屏）
   - 进入：打卡日历里「刷题」类计划点「📱 进入刷题」即进入；或计时器页「进入刷题模式」。
   - 全屏覆盖整个屏幕，背景图片可用户自定义（覆盖整屏）。
   - 进入后不立即计时，需点击「开始计时」；中间为毫秒级计时。
   - 四个控制按钮：结束计时 / 暂停计时（暂停留屏，可继续）/ 分段 / 清空。
   - 结束计时 → 弹出「本次刷题数量 / 答对数量」记录表单，保存后返回打卡日历并记入计划（含正确率）；暂停计时 → 留在原界面；退出本界面去其他模块 → 计时结束（见 app.js）。
   - 顶栏白噪音在本界面也可控制（window.WhiteNoise）。
*/
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};
  let iv = null;

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

  window.MODULES.shuati = {
    title: "刷题模式", icon: "timer",
    render(body) {
      const DB = window.DB, UI = window.UI;

      // 进入时不自动开始计时；await 用户点「开始计时」
      let pending = window.__pendingFocus;
      window.__pendingFocus = null;
      const planId = pending ? pending.planId : null;
      let task = pending ? pending.text : (DB.timerState().task || "刷题");
      let bg = getBg();

      // 状态机：started（已开始计时）/ ended（已结束、填写记录中）
      let started = false;
      let ended = false;
      let finalElapsedMs = 0;
      let finalLaps = [];

      // 若此前已在计时（异常残留），视为已 started
      if (DB.timerState().running) started = true;

      function bindCommon() {
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
      }

      function render() {
        if (iv) { clearInterval(iv); iv = null; }
        const s = DB.timerState();
        const running = s.running;
        const hasTime = s.accumulated > 0 || running;
        const laps = s.laps || [];
        const wnOn = window.WhiteNoise && window.WhiteNoise.isOn();

        let inner = "";
        if (ended) {
          // 结束记录表单
          inner = `<div class="shuati-center">
              <div class="shuati-time">${fmtMsFull(finalElapsedMs)}</div>
              <div class="shuati-sub">⏹ 已结束 · 记录本次刷题</div>
            </div>
            <div class="shuati-form">
              <label class="fld" style="color:#cdd6f0;text-align:left">本次刷题数量（道）</label>
              <input id="qCount" class="shuati-input" type="number" min="0" inputmode="numeric" placeholder="例如 30"/>
              <label class="fld" style="color:#cdd6f0;margin-top:10px;text-align:left">答对数量（道）</label>
              <input id="qCorrect" class="shuati-input" type="number" min="0" inputmode="numeric" placeholder="例如 25"/>
              <div class="muted small" style="margin-top:8px;color:#cdd6f0">正确率将自动计算并记录到今日计划</div>
            </div>
            <div class="shuati-btns">
              <button class="btn big primary" id="saveBtn">💾 保存记录</button>
              <button class="btn big ghost" id="skipBtn">跳过</button>
            </div>`;
        } else if (started) {
          inner = `<div class="shuati-center">
              <div id="stElapsed" class="shuati-time">${fmtMsFull(DB.timerElapsedMs())}</div>
              <div class="shuati-sub">${running ? '⏱ 计时中（毫秒）' : (hasTime ? '⏸ 已暂停' : '未开始')}</div>
            </div>
            <div class="shuati-btns">
              <button class="btn big primary" id="endBtn">⏹ 结束计时</button>
              <button class="btn big" id="pauseBtn">${running ? '⏸ 暂停计时' : (hasTime ? '▶ 继续计时' : '▶ 开始计时')}</button>
              <button class="btn big" id="lapBtn" ${running ? '' : 'disabled'}>⏱ 分段</button>
              <button class="btn big ghost" id="resetBtn" ${hasTime || running ? '' : 'disabled'}>↺ 清空</button>
            </div>
            ${laps.length ? `<div class="shuati-laps"><div class="muted small" style="margin-bottom:6px;color:#cdd6f0">分段记录（最新在最上 · <span style="color:#34e7e4">绿</span>最快 · <span style="color:#ff5cf0">粉/红</span>最新）· 共 ${laps.length} 段</div><div class="lap-list">${renderLaps(laps)}</div></div>` : ''}`;
        } else {
          inner = `<div class="shuati-center">
              <div id="stElapsed" class="shuati-time">00:00.00</div>
              <div class="shuati-sub">未开始计时</div>
              <label class="fld" style="color:#cdd6f0;margin-top:16px;text-align:left">本次刷题任务</label>
              <input id="taskInput" class="shuati-input" placeholder="例如：行测类比推理专项" value="${esc(task)}"/>
            </div>
            <div class="shuati-btns">
              <button class="btn big primary" id="startBtn">▶ 开始计时</button>
            </div>`;
        }

        body.innerHTML = `<div class="shuati" style="${bg ? `background-image:url('${esc(bg)}')` : ''}">
          <div class="shuati-mask"></div>
          <div class="shuati-top">
            <div class="shuati-task">📚 ${esc(ended ? (s.task || task) : (started ? (s.task || task) : (task || "刷题")))}</div>
            <button class="shuati-wn ${wnOn ? 'on' : ''}" id="wnBtn">🎧 白噪音${wnOn ? ' · 播放中' : ''}</button>
          </div>
          ${inner}
          <div class="shuati-foot">
            <button class="btn ghost sm" id="bgBtn">🖼 自定义背景图片</button>
            ${bg ? `<button class="btn ghost sm" id="bgClear">🗑 清除背景</button>` : ''}
            <span class="muted small" style="color:#cdd6f0">${ended ? '保存记录将返回打卡日历' : '结束计时返回打卡日历；退出本界面即结束计时'}</span>
          </div>
          <input type="file" id="bgFile" accept="image/*" style="display:none"/>
        </div>`;

        // 毫秒级刷新（仅 started 且 running）
        const el = body.querySelector("#stElapsed");
        if (started && running && !ended) {
          iv = setInterval(() => { if (el) el.textContent = fmtMsFull(DB.timerElapsedMs()); }, 33);
        }

        bindCommon();
        wire();
      }

      function wire() {
        if (ended) {
          body.querySelector("#saveBtn").onclick = () => doSave();
          body.querySelector("#skipBtn").onclick = () => doSkip();
          return;
        }
        if (!started) {
          body.querySelector("#startBtn").onclick = () => {
            const t = body.querySelector("#taskInput").value.trim();
            DB.timerStart(t || "刷题", planId, 0);
            started = true;
            render(); window.__updateTopTimer && window.__updateTopTimer();
          };
          return;
        }
        // started
        body.querySelector("#endBtn").onclick = () => doEnd();
        body.querySelector("#pauseBtn").onclick = () => {
          if (DB.timerState().running) DB.timerPause();
          else DB.timerStart(DB.timerState().task || "刷题", DB.timerState().planId, 0);
          render(); window.__updateTopTimer && window.__updateTopTimer();
        };
        body.querySelector("#lapBtn").onclick = () => { DB.timerLap(); render(); window.__updateTopTimer && window.__updateTopTimer(); };
        body.querySelector("#resetBtn").onclick = () => { DB.timerReset(); started = false; render(); window.__updateTopTimer && window.__updateTopTimer(); };
      }

      function doEnd() {
        if (iv) { clearInterval(iv); iv = null; }
        finalLaps = DB.timerState().laps.slice();
        finalElapsedMs = DB.timerElapsedMs();
        DB.timerStop(); // 冻结计时（flush 末段 + 清 laps），不再自动累计
        window.__updateTopTimer && window.__updateTopTimer();
        ended = true;
        render(); // 切到记录表单
      }

      function finalize(mins) {
        DB.addTimerMinutes("刷题模式", mins);
        if (planId) {
          const it = DB.getPlan(DB.today()).items.find(x => x.id === planId);
          if (it) { it.minutes = (it.minutes || 0) + mins; it.done = true; DB.save(); }
        }
        window.__updateTopTimer && window.__updateTopTimer();
      }

      function doSave() {
        const countRaw = body.querySelector("#qCount").value;
        const correctRaw = body.querySelector("#qCorrect").value;
        const count = parseInt(countRaw, 10);
        const correct = parseInt(correctRaw, 10);
        if (isNaN(count) || count < 0) { UI.toast("请填写有效的刷题数量"); return; }
        if (!isNaN(correct) && correct > count) { UI.toast("答对数量不能大于刷题数量"); return; }
        const mins = Math.max(1, Math.round(finalElapsedMs / 60000));
        finalize(mins);
        if (planId) {
          const it = DB.getPlan(DB.today()).items.find(x => x.id === planId);
          if (it) { it.count = count; it.correct = isNaN(correct) ? null : correct; DB.save(); }
        }
        const pct = (!isNaN(correct) && count) ? Math.round(correct / count * 100) : null;
        const extra = ` · 刷题 ${count} 道 · 对 ${isNaN(correct) ? "?" : correct} 道${pct != null ? "（正确率 " + pct + "%）" : ""}`;
        UI.toast(`刷题模式结束：专注 ${fmtMsFull(finalElapsedMs)}${extra}${planId ? "，已记入今日计划 ✓" : ""}`);
        location.hash = "#/calendar";
      }

      function doSkip() {
        const mins = Math.max(1, Math.round(finalElapsedMs / 60000));
        finalize(mins);
        UI.toast(`刷题模式结束：专注 ${fmtMsFull(finalElapsedMs)}${planId ? "，已记入今日计划 ✓" : ""}`);
        location.hash = "#/calendar";
      }

      render();

      // 离开本模块（哈希变化）时若仍在计时，由 app.js 统一结算；
      // 这里仅保证组件卸载时清掉 interval
      window.__shuatiCleanup = () => { if (iv) { clearInterval(iv); iv = null; } };
    }
  };
})();
