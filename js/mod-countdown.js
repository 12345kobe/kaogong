/* 模块：倒计时 */
(function () {
  window.MODULES = window.MODULES || {};
  window.MODULES.countdown = {
    title: "倒计时", icon: "countdown",
    render(body) {
      const DB = window.DB, UI = window.UI;
      function daysLeft(dateStr) {
        if (!dateStr) return null;
        const d = new Date(dateStr + "T00:00:00");
        const t = new Date(); t.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
        return Math.round((d - t) / 86400000);
      }
      function render() {
        const exams = DB.state.countdown.exams;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        let nearest = null;
        exams.forEach(ex => {
          if (!ex.date) return;
          const d = new Date(ex.date + "T00:00:00"); d.setHours(0, 0, 0, 0);
          const diff = Math.round((d - today) / 86400000);
          if (diff >= 0 && (!nearest || diff < nearest.diff)) nearest = { ex, diff };
        });
        let banner = "";
        if (nearest) {
          banner = `<div class="card countdown-hero" style="border-left:5px solid ${nearest.ex.color}">
            <div class="muted small">最近一场考试</div>
            <div class="spread" style="align-items:baseline">
              <b style="font-size:22px">${UI.esc(nearest.ex.name)}</b>
              <span style="font-size:34px;font-weight:800;color:${nearest.ex.color}">${nearest.diff}<span style="font-size:14px;font-weight:500;color:var(--txt-dim)"> 天</span></span>
            </div>
            <div class="muted small">考试日期：${UI.esc(nearest.ex.date)}</div>
          </div>`;
        }
        // ===== 考试模式（国考 / 省考）+ 限时刷题 =====
        const EM = window.KGExam;
        const subs = EM ? EM.subjects() : [];
        const curMode = EM ? EM.mode() : "shengkao";
        const modeLabel = EM ? EM.label() : "省考";
        const otherLabel = curMode === "shengkao" ? "国考" : "省考";
        const paceList = subs.map(s => `<div class="muted small">· ${UI.esc(s)}：${UI.esc(EM.paceText(s))}</div>`).join("");
        const examCard = `<div class="card" style="border-left:5px solid var(--cyan)">
          <div class="spread" style="align-items:center;gap:10px">
            <h3 style="margin:0">🎯 ${UI.esc(modeLabel)}模式</h3>
            <button class="btn sm" id="examSwitch">⇄ 切换为${UI.esc(otherLabel)}模式</button>
          </div>
          <div class="muted small" style="margin-top:6px">各模块配速（参考题量 ÷ 参考用时 = 每题用时，填题数即可自动折算时限）：</div>
          <div style="margin-top:6px">${paceList}</div>
          <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap;align-items:center">
            <select id="qSubj" class="full" style="max-width:150px">${subs.map(s => `<option value="${UI.esc(s)}">${UI.esc(s)}</option>`).join("")}</select>
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

        let html = examCard + `<div class="card"><h3>📅 考试倒计时</h3>
          <div class="muted small">设置各考试日期，自动计算剩余天数。可自由增删。</div></div>
          ${banner}
          <div class="grid g3">`;
        exams.forEach(ex => {
          const dl = daysLeft(ex.date);
          const n = dl == null ? "—" : (dl >= 0 ? dl : "已结束");
          const sub = dl == null ? "未设置日期" : (dl >= 0 ? "天后开考" : "已过去 " + (-dl) + " 天");
          html += `<div class="card" style="border-top:3px solid ${ex.color}">
            <div class="spread"><b style="font-size:16px">${UI.esc(ex.name)}</b>
              <button class="del" data-del="${ex.id}" style="border:none;background:none;color:#ff6b81;font-size:16px">✕</button></div>
            <div class="center" style="margin:10px 0"><div style="font-size:42px;font-weight:800;color:${ex.color}">${n}</div>
              <div class="muted small">${sub}</div></div>
            <label class="fld">考试日期</label>
            <input type="date" value="${ex.date || ""}" data-date="${ex.id}"/>
            <label class="fld">名称</label>
            <input type="text" value="${UI.esc(ex.name)}" data-name="${ex.id}"/>
          </div>`;
        });
        html += `</div><div class="row" style="margin-top:14px"><button class="btn primary" id="addExam">＋ 添加考试</button></div>`;
        body.innerHTML = html;

        body.querySelectorAll("[data-date]").forEach(inp => inp.onchange = e => {
          const ex = DB.state.countdown.exams.find(x => x.id === inp.dataset.date);
          ex.date = e.target.value; DB.save(); render();
        });
        body.querySelectorAll("[data-name]").forEach(inp => inp.onchange = e => {
          const ex = DB.state.countdown.exams.find(x => x.id === inp.dataset.name);
          ex.name = e.target.value; DB.save(); render();
        });
        body.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
          DB.state.countdown.exams = DB.state.countdown.exams.filter(x => x.id !== b.dataset.del);
          DB.save(); render();
        });
        body.querySelector("#addExam").onclick = () => {
          DB.state.countdown.exams.push({ id: DB.uid(), name: "新考试", date: "", color: "#" + ["34e7e4", "ff5cf0", "ffd166", "9b6cff", "3ddc97"][DB.state.countdown.exams.length % 5] });
          DB.save(); render();
        };

        /* ===== 考试模式 / 限时刷题 / 复盘 交互 ===== */
        const examSwitch = body.querySelector("#examSwitch");
        if (examSwitch && EM) examSwitch.onclick = () => {
          EM.toggleMode(); render(); UI.toast("已切换为" + EM.label() + "模式");
        };
        const qSubj = body.querySelector("#qSubj");
        const qCount = body.querySelector("#qCount");
        const qSuggest = body.querySelector("#qSuggest");
        const qMin = body.querySelector("#qMin");
        function updSuggest() {
          if (!EM || !qSubj || !qCount || !qSuggest) return;
          const n = parseInt(qCount.value, 10);
          if (!n || n <= 0) { qSuggest.textContent = "填题数后显示时限"; if (qMin) qMin.placeholder = "时限(分)可改"; return; }
          const mins = EM.suggestMin(qSubj.value, n);
          qSuggest.textContent = n + " 题 ≈ " + mins + " 分钟（" + EM.fmtMin(EM.perMin(qSubj.value)) + "/题）";
          if (qMin && !qMin.value) qMin.placeholder = "建议 " + Math.max(1, Math.round(mins)) + " 分钟";
        }
        if (qSubj) qSubj.onchange = updSuggest;
        if (qCount) qCount.oninput = updSuggest;
        updSuggest();
        const qStart = body.querySelector("#qStart");
        if (qStart && EM) qStart.onclick = () => {
          const n = parseInt(qCount.value, 10);
          const ov = parseInt(qMin && qMin.value, 10);
          const r = EM.startQuiz(qSubj.value, n, (ov && ov > 0) ? ov : 0);
          if (!r) return;
          UI.toast("已开始 · " + r.task);
          window.__updateTopTimer && window.__updateTopTimer();
          location.hash = "#/timer";
        };
        const rStart = body.querySelector("#rStart");
        if (rStart && EM) rStart.onclick = () => {
          const noteEl = body.querySelector("#rNote");
          const r = EM.startReview(qSubj.value, (noteEl && noteEl.value || "").trim());
          if (!r) return;
          UI.toast("复盘开始（正向计时）：" + r.task);
          window.__updateTopTimer && window.__updateTopTimer();
          location.hash = "#/timer";
        };
      }
      render();
    }
  };
})();
