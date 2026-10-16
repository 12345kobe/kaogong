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
    title: "上岸计时器", icon: "timer", noCollapse: true,
    render(body) {
      const DB = window.DB, UI = window.UI;
      const date = DB.today();

      function render() {
        if (iv) { clearInterval(iv); iv = null; }
        const s = DB.timerState();
        const plan = DB.getPlan(date);
        const running = s.running;
        const isCountdown = s.targetMs && s.targetMs > 0;
        const elapsed = DB.timerElapsedMs();
        const overtime = isCountdown && elapsed >= s.targetMs;
        const displayMs = overtime ? (elapsed - s.targetMs) : (isCountdown ? Math.max(0, DB.timerRemainingMs()) : elapsed);
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
          <div id="tElapsed" style="font-size:48px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:1px${overtime ? ";color:#ff6b81" : ""}">${fmt(displayMs)}</div>
          <div id="tState" class="muted small" style="margin:6px 0 12px">${running ? (overtime ? "⏰ 已延迟 · 正向计时中" : (isCountdown ? "⏳ 倒计时中…" : "⏳ 计时中…")) : (s.task ? "已暂停" : (isCountdown ? "未开始（倒计时）" : "未开始"))}${overtime ? "（已延迟 " + fmt(elapsed - s.targetMs) + "）" : ""}${s.task ? " · " + esc(s.task) : ""}</div>
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
          <select id="tSubj" class="full">${(function(){ const subs = (window.KG_SUBJECTS || ["言语理解","资料分析","数量关系","判断推理","常识判断","政治理论","申论"]); const sel = (pending && pending.subject) ? pending.subject : (s.subject || ""); return '<option value="">（不选学科）</option>' + subs.map(x => `<option value="${esc(x)}" ${sel === x ? "selected" : ""}>${esc(x)}</option>`).join(""); })()}</select>
          <label class="fld" style="margin-top:10px">② 任务名（专注内容）</label>
          <input id="tTask" class="full" placeholder="例如：复习类比推理 / 申论大作文" value="${esc(s.task || (pending ? pending.text : (prefill || "")))}"/>
          <label class="row" style="margin-top:10px;cursor:pointer;gap:8px"><input type="checkbox" id="tCount" style="width:auto" ${s.planId || pending ? "checked" : "checked"}/> 计入今日计划（默认开启，可取消）</label>
          <label class="fld" style="margin-top:10px">绑定计划项（留空则自动新建）</label>
          <select id="tPlan" class="full">${planOpts}</select>
          <label class="fld" style="margin-top:10px">专注时长（分钟，留空为累计计时）</label>
          <input id="tMin" type="number" min="1" class="full" placeholder="例如 25（到点自动结算）" value="${pending ? (pending.focusMin || "") : (isCountdown ? Math.round(s.targetMs / 60000) : "")}"/>
          <div class="muted small" style="margin-top:8px">填写时长即倒计时模式，到点自动标记计划项完成；不填则正序累计计时。</div>
        </div>` +
        /* ===== 考试模式（国考/省考配速）+ 综合刷题 —— v20261017a 从倒计时页移入 ===== */
        (function () {
          const EM = window.KGExam;
          if (!EM) return "";
          const subs = EM.subjects();
          const curMode = EM.mode();
          const modeLabel = EM.label();
          const otherLabel = curMode === "shengkao" ? "国考" : "省考";
          const paceList = subs.map(s => `<div class="muted small">· ${esc(s)}：${esc(EM.paceText(s))}</div>`).join("");
          const examCard = `<div class="card" style="margin-top:8px;border-left:5px solid var(--cyan)">
            <div class="spread" style="align-items:center;gap:10px">
              <h3 style="margin:0">🎯 ${esc(modeLabel)}模式</h3>
              <button class="btn sm" id="examSwitch">⇄ 切换为${esc(otherLabel)}模式</button>
            </div>
            <div class="muted small" style="margin-top:6px">各模块配速（参考题量 ÷ 参考用时 = 每题用时，填题数即可自动折算时限）：</div>
            <div style="margin-top:6px">${paceList}</div>
            <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap;align-items:center">
              <select id="qSubj" class="full" style="max-width:150px">${subs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}</select>
              <input id="qCount" type="number" min="1" step="1" placeholder="刷几题" style="max-width:110px"/>
              <span id="qSuggest" class="muted small" style="font-weight:700;color:var(--cyan)">填题数后显示时限</span>
            </div>
            <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap;align-items:center">
              <input id="qMin" type="number" min="1" step="1" placeholder="时限(分)可改" style="max-width:130px"/>
              <button class="btn primary" id="qStart">▶ 开始刷题倒计时</button>
            </div>
            <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap;align-items:center">
              <input id="rNote" placeholder="复盘备注（可选，如：错题回顾）" style="flex:1;min-width:150px"/>
              <button class="btn" id="rStart">📝 开始复盘（正向计时）</button>
            </div>
            <div class="muted small" style="margin-top:6px">复盘为正序计时，不设时限；停止后时长同样计入该科目今日专注时长。</div>
          </div>`;
          const comboCard = `<div class="card" style="margin-top:8px;border-left:5px solid #9b6cff">
            <div class="spread" style="align-items:center;gap:10px">
              <h3 style="margin:0">🧩 综合刷题（多模块合并）</h3>
            </div>
            <div class="muted small" style="margin-top:6px">勾选多个模块、分别填题数，系统给出每科建议时间与总时限，合并成一个倒计时一起刷；超时未停会自动转正向并记「已延迟」。</div>
            <div id="comboList" style="margin-top:10px">
              ${subs.map(s => `<div class="combo-item" data-subj="${esc(s)}" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
                <input type="checkbox" class="combo-chk" data-subj="${esc(s)}" style="width:auto"/>
                <b style="min-width:84px">${esc(s)}</b>
                <input type="number" min="0" class="combo-count" data-subj="${esc(s)}" placeholder="题数" style="max-width:80px"/>
                <span class="combo-sug muted small" data-subj="${esc(s)}" style="color:var(--cyan)"></span>
              </div>`).join("")}
            </div>
            <div class="row" style="margin-top:8px;gap:8px;align-items:center">
              <span id="comboTotal" class="muted small" style="font-weight:700;color:var(--cyan)">勾选并填题数后显示总时限</span>
            </div>
            <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap;align-items:center">
              <input id="comboMin" type="number" min="1" step="1" placeholder="总时限(分)可改" style="max-width:150px"/>
              <button class="btn primary" id="comboStart">▶ 开始综合刷题倒计时</button>
            </div>
          </div>`;
          return examCard + comboCard;
        })();

        const el = body.querySelector("#tElapsed");
        if (running) {
          iv = setInterval(() => {
            const st = DB.timerState();
            const eMs = DB.timerElapsedMs();
            const ot = st.targetMs > 0 && eMs >= st.targetMs;
            if (el) {
              const v = ot ? (eMs - st.targetMs) : (st.targetMs > 0 ? Math.max(0, DB.timerRemainingMs()) : eMs);
              el.textContent = fmt(v);
              el.style.color = ot ? "#ff6b81" : "";
            }
            if (st.targetMs && st.targetMs > 0 && eMs >= st.targetMs) {
              // 刷题模式（tt.shuati）：由全屏/小屏自行显示「已延迟」正向计时，不弹窗结算
              if (st.shuati) return;
              clearInterval(iv); iv = null;
              // 倒计时到点统一交给考试模式处理（弹窗 + 震动 + 结算），避免两处重复结算
              if (window.KGExam && KGExam.onCountdownEnd) KGExam.onCountdownEnd();
              else doStop();
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

        /* ===== 考试模式 / 限时刷题 / 复盘 / 综合刷题 交互（自倒计时页移入）===== */
        const EM2 = window.KGExam;
        const examSwitch = body.querySelector("#examSwitch");
        if (examSwitch && EM2) examSwitch.onclick = () => { EM2.toggleMode(); render(); UI.toast("已切换为" + EM2.label() + "模式"); };
        const qSubj = body.querySelector("#qSubj");
        const qCount = body.querySelector("#qCount");
        const qSuggest = body.querySelector("#qSuggest");
        const qMin = body.querySelector("#qMin");
        function updSuggest() {
          if (!EM2 || !qSubj || !qCount || !qSuggest) return;
          const n = parseInt(qCount.value, 10);
          if (!n || n <= 0) { qSuggest.textContent = "填题数后显示时限"; if (qMin) qMin.placeholder = "时限(分)可改"; return; }
          const mins = EM2.suggestMin(qSubj.value, n);
          qSuggest.textContent = n + " 题 ≈ " + mins + " 分钟（" + EM2.fmtMin(EM2.perMin(qSubj.value)) + "/题）";
          if (qMin && !qMin.value) qMin.placeholder = "建议 " + Math.max(1, Math.round(mins)) + " 分钟";
        }
        if (qSubj) qSubj.onchange = updSuggest;
        if (qCount) qCount.oninput = updSuggest;
        updSuggest();
        const qStart = body.querySelector("#qStart");
        if (qStart && EM2) qStart.onclick = () => {
          const n = parseInt(qCount.value, 10);
          if (!n || n <= 0) { UI.toast("请先填写题目数量"); return; }
          const ov = parseInt(qMin && qMin.value, 10);
          const mins = (ov && ov > 0) ? ov : Math.max(1, Math.round(EM2.suggestMin(qSubj.value, n)));
          window.__shuatiLaunch = { mode: "quiz", subject: qSubj.value, count: n, mins: mins };
          window.__updateTopTimer && window.__updateTopTimer();
          location.hash = "#/shuati";
        };
        const rStart = body.querySelector("#rStart");
        if (rStart && EM2) rStart.onclick = () => {
          const noteEl = body.querySelector("#rNote");
          window.__shuatiLaunch = { mode: "review", subject: qSubj.value, note: (noteEl && noteEl.value || "").trim() };
          location.hash = "#/shuati";
        };
        function updCombo() {
          if (!EM2) return;
          let total = 0, any = false;
          body.querySelectorAll(".combo-item").forEach(it => {
            const subj = it.dataset.subj;
            const chk = it.querySelector(".combo-chk");
            const cnt = parseInt(it.querySelector(".combo-count").value, 10);
            const sug = it.querySelector(".combo-sug");
            if (chk.checked && cnt > 0) {
              const m = Math.max(1, Math.round(EM2.suggestMin(subj, cnt)));
              sug.textContent = cnt + " 题 ≈ " + m + " 分";
              total += m; any = true;
            } else { sug.textContent = ""; }
          });
          const tot = body.querySelector("#comboTotal");
          if (tot) tot.textContent = any ? ("总建议时限 ≈ " + total + " 分钟（可手动改总时限）") : "勾选并填题数后显示总时限";
        }
        body.querySelectorAll(".combo-chk, .combo-count").forEach(el => { el.onchange = updCombo; el.oninput = updCombo; });
        updCombo();
        const comboStart = body.querySelector("#comboStart");
        if (comboStart && EM2) comboStart.onclick = () => {
          const items = [];
          body.querySelectorAll(".combo-item").forEach(it => {
            const subj = it.dataset.subj;
            const chk = it.querySelector(".combo-chk");
            const cnt = parseInt(it.querySelector(".combo-count").value, 10);
            if (chk.checked && cnt > 0) items.push({ subject: subj, count: cnt, mins: Math.max(1, Math.round(EM2.suggestMin(subj, cnt))) });
          });
          if (!items.length) { UI.toast("请至少勾选一个模块并填写题数"); return; }
          const ov = parseInt(body.querySelector("#comboMin").value, 10);
          if (ov && ov > 0) {
            const sum = items.reduce((a, b) => a + b.mins, 0);
            if (sum > 0) items.forEach(it => { it.mins = Math.max(1, Math.round(it.mins / sum * ov)); });
          }
          window.__shuatiLaunch = { mode: "combo", combo: items };
          location.hash = "#/shuati";
        };

        function doStop() {
          if (iv) { clearInterval(iv); iv = null; }
          // 在停止前快照分段（timerSettle 内部会清空 laps）；保留给 toast 显示
          const finalLaps = (DB.timerState().laps || []).slice();
          // 复盘（正向计时）标记：结算时额外记一笔该科目复盘时长
          const tt0 = DB.timerState();
          const wasReview = !!tt0.review, revSubj = tt0.subject || "";
          const wasShuati = !!tt0.shuati;
          // 刷题模式（含超时延迟段）按实际用时计；其余按原逻辑（倒计时计计划时限）
          const r = DB.timerSettle("计时器", wasShuati);
          if (wasReview && window.KGExam && KGExam.logReview) {
            KGExam.logReview(revSubj, r.mins);
            try { DB.timerState().review = false; DB.save(); } catch (e) {}
          }
          let extra = "";
          if (finalLaps.length) {
            const totalMs = finalLaps.reduce((a, b) => a + b, 0);
            extra = ` · 共 ${finalLaps.length} 段（${fmt(totalMs)}）`;
          }
          UI.toast(`${wasReview ? "复盘" : "已结算"}：专注 ${fmt(r.sec)}${extra}${r.planId ? "，已记入今日计划 ✓" : ""}`);
          render(); window.__updateTopTimer && window.__updateTopTimer();
        }
      }

      render();
    }
  };
})();
