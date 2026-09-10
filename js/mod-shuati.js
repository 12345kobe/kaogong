/* 模块：刷题模式（全屏）
   - 进入：打卡日历里「刷题」类计划点「📱 进入刷题」即进入；或计时器页「进入刷题模式」。
   - 全屏覆盖整个屏幕，背景图片可用户自定义（覆盖整屏）。
   - 中间为毫秒级计时；四个控制按钮：结束计时 / 暂停计时（暂停留屏，可继续）/ 分段 / 清空。
   - 结束计时 → 返回打卡日历；暂停计时 → 留在原界面；退出本界面去其他模块 → 计时结束（见 app.js）。
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

      // 进入即带着计划项信息自动开始（来自打卡日历「进入刷题」或计时器入口）
      let pending = window.__pendingFocus;
      window.__pendingFocus = null;
      const planId = pending ? pending.planId : null;
      const task = pending ? pending.text : (DB.timerState().task || "刷题");
      let bg = getBg();

      if (!DB.timerState().running) {
        DB.timerStart(task || "刷题", planId, 0);
      } else if (planId && !DB.timerState().planId) {
        DB.timerState().planId = planId; DB.save();
      }
      window.__updateTopTimer && window.__updateTopTimer();

      function render() {
        if (iv) { clearInterval(iv); iv = null; }
        const s = DB.timerState();
        const running = s.running;
        const hasTime = s.accumulated > 0 || running;
        const laps = s.laps || [];
        const wnOn = window.WhiteNoise && window.WhiteNoise.isOn();

        body.innerHTML = `<div class="shuati" style="${bg ? `background-image:url('${esc(bg)}')` : ''}">
          <div class="shuati-mask"></div>
          <div class="shuati-top">
            <div class="shuati-task">📚 ${esc(s.task || "刷题")}</div>
            <button class="shuati-wn ${wnOn ? 'on' : ''}" id="wnBtn">🎧 白噪音${wnOn ? ' · 播放中' : ''}</button>
          </div>
          <div class="shuati-center">
            <div id="stElapsed" class="shuati-time">${fmtMsFull(DB.timerElapsedMs())}</div>
            <div class="shuati-sub">${running ? '⏱ 计时中（毫秒）' : (hasTime ? '⏸ 已暂停' : '未开始')}</div>
          </div>
          <div class="shuati-btns">
            <button class="btn big primary" id="endBtn">⏹ 结束计时</button>
            <button class="btn big" id="pauseBtn">${running ? '⏸ 暂停计时' : (hasTime ? '▶ 继续计时' : '▶ 开始计时')}</button>
            <button class="btn big" id="lapBtn" ${running ? '' : 'disabled'}>⏱ 分段</button>
            <button class="btn big ghost" id="resetBtn" ${hasTime || running ? '' : 'disabled'}>↺ 清空</button>
          </div>
          ${laps.length ? `<div class="shuati-laps"><div class="muted small" style="margin-bottom:6px;color:#cdd6f0">分段记录（最新在最上 · <span style="color:#34e7e4">绿</span>最快 · <span style="color:#ff5cf0">粉/红</span>最新）· 共 ${laps.length} 段</div><div class="lap-list">${renderLaps(laps)}</div></div>` : ''}
          <div class="shuati-foot">
            <button class="btn ghost sm" id="bgBtn">🖼 自定义背景图片</button>
            ${bg ? `<button class="btn ghost sm" id="bgClear">🗑 清除背景</button>` : ''}
            <span class="muted small" style="color:#cdd6f0">结束计时返回打卡日历；退出本界面即结束计时</span>
          </div>
          <input type="file" id="bgFile" accept="image/*" style="display:none"/>
        </div>`;

        // 毫秒级刷新
        const el = body.querySelector("#stElapsed");
        if (running) {
          iv = setInterval(() => { if (el) el.textContent = fmtMsFull(DB.timerElapsedMs()); }, 33);
        }

        // 白噪音
        const wnBtn = body.querySelector("#wnBtn");
        if (wnBtn) wnBtn.onclick = () => {
          if (window.WhiteNoise) { window.WhiteNoise.toggle(); render(); }
        };

        // 自定义背景
        body.querySelector("#bgBtn").onclick = () => body.querySelector("#bgFile").click();
        body.querySelector("#bgFile").onchange = e => {
          const f = e.target.files[0]; if (!f) return;
          const rd = new FileReader();
          rd.onload = () => { bg = rd.result; setBg(bg); render(); };
          rd.readAsDataURL(f);
        };
        const bgClear = body.querySelector("#bgClear");
        if (bgClear) bgClear.onclick = () => { bg = ""; setBg(""); render(); };

        // 结束计时 → 结算并返回打卡日历
        body.querySelector("#endBtn").onclick = () => doEnd();
        // 暂停 / 继续 / 开始
        body.querySelector("#pauseBtn").onclick = () => {
          if (DB.timerState().running) { DB.timerPause(); }
          else { DB.timerStart(DB.timerState().task || "刷题", DB.timerState().planId, 0); }
          render(); window.__updateTopTimer && window.__updateTopTimer();
        };
        body.querySelector("#lapBtn").onclick = () => { DB.timerLap(); render(); window.__updateTopTimer && window.__updateTopTimer(); };
        body.querySelector("#resetBtn").onclick = () => { DB.timerReset(); render(); window.__updateTopTimer && window.__updateTopTimer(); };
      }

      function doEnd() {
        if (iv) { clearInterval(iv); iv = null; }
        const finalLaps = DB.timerState().laps.slice();
        const r = DB.timerSettle("刷题模式");
        let extra = "";
        if (finalLaps.length) extra = ` · 共 ${finalLaps.length} 段`;
        UI.toast(`刷题模式结束：专注 ${fmtMsFull(r.sec * 1000)}${extra}${r.planId ? "，已记入今日计划 ✓" : ""}`);
        window.__updateTopTimer && window.__updateTopTimer();
        location.hash = "#/calendar";
      }

      render();

      // 离开本模块（哈希变化）时若仍在计时，由 app.js 统一结算；
      // 这里仅保证组件卸载时清掉 interval
      window.__shuatiCleanup = () => { if (iv) { clearInterval(iv); iv = null; } };
    }
  };
})();
