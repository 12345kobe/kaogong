/* 模块：倒计时（v20261017b：国考日期强制锁定 2026-11-29，迁移不再依赖旧值恰好 11-30）
   —— 省考模式/综合刷题已移至「上岸计时器」（mod-timer.js）
   —— 国考日期确定 2026-11-29：一次性迁移 11-30 → 11-29，并注入科目时间两行 */
(function () {
  /* ===== 国考日期强制锁定 2026-11-29 + 注入科目时间 =====
     ★不依赖「旧值恰好是 11-30」这种脆弱的一次性迁移——只要国考日期不是 11-29 就改。
     ★云端同步（kg-state-restored）会把 exams 整体覆盖回来，所以迁移必须同时监听恢复事件；
       恢复后若用户正在看倒计时页，立即重渲染，避免页面仍显示旧日期。 */
  function migrateGuokao(rerender) {
    try {
      const DB0 = window.DB;
      if (DB0 && DB0.state && DB0.state.countdown && Array.isArray(DB0.state.countdown.exams)) {
        let touched = false;
        DB0.state.countdown.exams.forEach(ex => {
          if (ex.name === "国考") {
            if (ex.date !== "2026-11-29") { ex.date = "2026-11-29"; touched = true; }
            if (!ex.subjects) {
              ex.subjects = [
                { n: "行测", t: "11月29日 9:00-11:00" },
                { n: "申论", t: "11月29日 14:00-17:00" }
              ];
              touched = true;
            }
          }
        });
        if (touched) {
          DB0.save();
          if (rerender) {
            const cur = (location.hash.replace("#/", "") || "countdown").split("/")[0];
            if (cur === "countdown") {
              setTimeout(() => { try { window.dispatchEvent(new Event("hashchange")); } catch (e) {} }, 0);
            }
          }
        }
      }
    } catch (e) {}
  }
  migrateGuokao(false);
  window.addEventListener("kg-state-restored", () => migrateGuokao(true));
  window.MODULES = window.MODULES || {};

  window.MODULES.countdown = {
    title: "倒计时", icon: "countdown", noCollapse: true,
    render(body) {
      const DB = window.DB, UI = window.UI;
      migrateGuokao(false); // ★兜底：每次进入倒计时页都强制锁定国考日期为 2026-11-29（不依赖加载时序/云端是否恢复）
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
        let html = `<div class="card"><h3>📅 考试倒计时</h3>
          <div class="muted small">设置各考试日期，自动计算剩余天数。可自由增删。</div></div>
          ${banner}
          <div class="grid g3">`;
        exams.forEach(ex => {
          const dl = daysLeft(ex.date);
          const n = dl == null ? "—" : (dl >= 0 ? dl : "已结束");
          const sub = dl == null ? "未设置日期" : (dl >= 0 ? "天后开考" : "已过去 " + (-dl) + " 天");
          /* 科目时间两行（如国考：行测 9:00-11:00 / 申论 14:00-17:00） */
          const subjRows = Array.isArray(ex.subjects) && ex.subjects.length
            ? `<div style="margin-top:8px;border-top:1px dashed var(--line);padding-top:8px">` +
              ex.subjects.map(s => `<div class="muted small" style="margin:2px 0">📝 <b>${UI.esc(s.n)}</b>：${UI.esc(s.t)}</div>`).join("") +
              `</div>` : "";
          html += `<div class="card" style="border-top:3px solid ${ex.color}">
            <div class="spread"><b style="font-size:16px">${UI.esc(ex.name)}</b>
              <button class="del" data-del="${ex.id}" style="border:none;background:none;color:#ff6b81;font-size:16px">✕</button></div>
            <div class="center" style="margin:10px 0"><div style="font-size:42px;font-weight:800;color:${ex.color}">${n}</div>
              <div class="muted small">${sub}</div></div>
            <label class="fld">考试日期</label>
            <input type="date" value="${ex.date || ""}" data-date="${ex.id}"/>
            <label class="fld">名称</label>
            <input type="text" value="${UI.esc(ex.name)}" data-name="${ex.id}"/>
            ${subjRows}
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
      }
      render();
    }
  };
})();
