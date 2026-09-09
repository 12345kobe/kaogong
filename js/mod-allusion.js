/* 申论典故模块：
   - 每次展示 3 条（按顺序循环，可上下批切换），保留【例文】【典故】【赏析】三块原始排版；
   - 打钩才算已学（计入已学习历史，按日期索引可查/导出）；
   - 导出 PDF 支持选择日期范围。
*/
(function () {
  "use strict";
  const KEY_IDX = "kg_allusion_idx";
  const KEY = "allusion";

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function nl2p(s) {
    if (!s) return "";
    return s.split(/\n+/).filter(x => x.trim()).map(p => `<p class="al-p">${esc(p)}</p>`).join("");
  }

  window.MODULES.allusion = {
    title: "📜 申论典故",
    icon: "allusion",
    resolveId(id) {
      const list = window.ALLUSIONS || [];
      const it = list.find(x => x.id === id);
      if (!it) return null;
      return { primary: it.title, secondary: (it.allusion || "").slice(0, 60) };
    },
    render(body) {
      const UI = window.UI, DB = window.DB;
      const LIST = (window.ALLUSIONS || []);
      if (!LIST.length) { body.innerHTML = `<div class="card empty">暂无典故数据。请把「申论典故赏析汇编.pdf」放入 essays_raw/ 后运行 tools/_gen_allusion.py。</div>`; return; }

      let idx = 0;
      try { idx = Math.max(0, parseInt(localStorage.getItem(KEY_IDX) || "0", 10) || 0); } catch (e) {}

      const LH = window.LearnedHistory;
      const totalLearned = LH.count(KEY);

      function today() { return DB.today(); }
      function isLearned(id) {
        const log = (DB.state.learnedLog || {})[KEY] || {};
        for (const d in log) { if ((log[d] || []).includes(id)) return true; }
        return false;
      }
      function getSlice() {
        const a = idx % LIST.length;
        const b = (idx + 1) % LIST.length;
        const c = (idx + 2) % LIST.length;
        return [LIST[a], LIST[b], LIST[c]];
      }
      function go(delta) {
        idx = (idx + delta * 3 + LIST.length * 10) % LIST.length;
        try { localStorage.setItem(KEY_IDX, String(idx)); } catch (e) {}
        render();
      }

      function renderCard(it) {
        const checked = isLearned(it.id);
        return `<div class="card allu-card" data-id="${esc(it.id)}">
          <div class="row spread allu-head">
            <h3 class="allu-title">${esc(it.title)}</h3>
            <label class="allu-check"><input type="checkbox" data-id="${esc(it.id)}" ${checked?"checked":""}> 已学</label>
          </div>
          ${it.example ? `<div class="allu-sec"><span class="allu-label">📝 【例文】</span>${nl2p(it.example)}</div>` : ""}
          ${it.allusion ? `<div class="allu-sec"><span class="allu-label">📚 【典故】</span>${nl2p(it.allusion)}</div>` : ""}
          ${it.analysis ? `<div class="allu-sec"><span class="allu-label">💡 【赏析】</span>${nl2p(it.analysis)}</div>` : ""}
        </div>`;
      }

      function render() {
        const sl = getSlice();
        body.innerHTML = `<div class="card" style="margin-bottom:8px">
          <div class="row spread">
            <span class="muted small">📌 每天 3 条 · 已学 ${totalLearned} / ${LIST.length}</span>
            <div class="row">
              <button class="btn xs" id="prev3">← 上一批</button>
              <button class="btn primary xs" id="next3">下一批 →</button>
              <button class="btn xs ghost" id="viewLearned">📖 已学过</button>
              <button class="btn xs ghost" id="dlPdf">⬇ 导出PDF</button>
            </div>
          </div>
          <div class="muted small" style="margin-top:6px">学完点击右上角「已学」勾选 → 计入已学习记录（按日期索引）。打钩才算已学。</div>
        </div>
        ${sl.map(renderCard).join("")}
        <div class="card" style="margin-top:6px">
          <div class="muted small">💡 提示：本数据按 PDF 原排版还原。三块顺序 = 例文 / 典故 / 赏析，与源 PDF 一致。</div>
        </div>`;

        body.querySelector("#prev3").onclick = () => go(-1);
        body.querySelector("#next3").onclick = () => go(1);
        body.querySelector("#viewLearned").onclick = () => LH.open(KEY, "申论典故", window.MODULES.allusion.resolveId);
        body.querySelector("#dlPdf").onclick = openRangeExport;
        body.querySelectorAll(".allu-check input").forEach(cb => {
          cb.onchange = () => {
            const id = cb.dataset.id;
            const cur = isLearned(id);
            if (cur && !cb.checked) {
              // 取消已学（删除今日该 id）
              const day = today();
              const log = DB.state.learnedLog = DB.state.learnedLog || {};
              const arr = (log[KEY] = log[KEY] || {});
              arr[day] = (arr[day] || []).filter(x => x !== id);
              DB.save();
              if (UI.toast) UI.toast("已取消勾选");
            } else if (!cur && cb.checked) {
              LH.record(KEY, [id]);
              if (UI.toast) UI.toast("✓ 已学习：" + (LIST.find(x => x.id === id) || {}).title);
            }
          };
        });
      }

      // 导出 PDF（按日期范围）
      function openRangeExport() {
        const LH2 = LH, DB2 = DB;
        const log = (DB2.state.learnedLog || {})[KEY] || {};
        const allDays = Object.keys(log).filter(d => log[d] && log[d].length).sort();
        const today = DB2.today();
        const defFrom = allDays.length ? allDays[0] : today;
        const defTo = today;
        const overlay = UI.el(`<div class="modal-mask"><div class="modal" style="max-width:520px">
          <h3 style="margin:0 0 8px">⬇ 导出 PDF</h3>
          <div class="muted small" style="margin-bottom:12px">选择日期范围（仅导出该范围内「已学」典故）</div>
          <div class="row" style="gap:8px;margin-bottom:12px">
            <label>起：<input type="date" id="al-from" value="${defFrom}"></label>
            <label>止：<input type="date" id="al-to" value="${defTo}"></label>
          </div>
          <div class="muted small" id="al-count" style="margin-bottom:10px"></div>
          <div class="row" style="justify-content:flex-end;gap:8px">
            <button class="btn ghost" id="al-cancel">取消</button>
            <button class="btn primary" id="al-ok">导出</button>
          </div>
        </div></div>`);
        document.body.appendChild(overlay);
        function updateCount() {
          const f = overlay.querySelector("#al-from").value, t = overlay.querySelector("#al-to").value;
          const ids = new Set();
          Object.keys(log).filter(d => d >= f && d <= t).forEach(d => (log[d] || []).forEach(id => ids.add(id)));
          overlay.querySelector("#al-count").textContent = `将导出 ${ids.size} 条典故（${f} ~ ${t}）`;
        }
        updateCount();
        overlay.querySelector("#al-from").onchange = updateCount;
        overlay.querySelector("#al-to").onchange = updateCount;
        overlay.querySelector("#al-cancel").onclick = () => overlay.remove();
        overlay.querySelector("#al-ok").onclick = () => {
          const f = overlay.querySelector("#al-from").value, t = overlay.querySelector("#al-to").value;
          const ids = new Set();
          Object.keys(log).filter(d => d >= f && d <= t).forEach(d => (log[d] || []).forEach(id => ids.add(id)));
          overlay.remove();
          const items = LIST.filter(x => ids.has(x.id));
          if (!items.length) { if (UI.toast) UI.toast("该日期范围内无已学典故"); return; }
          const html = items.map(it => `
            <div style="margin-bottom:16px;padding:10px;border:1px solid #ddd;border-radius:8px;page-break-inside:avoid">
              <h3 style="margin:0 0 6px;font-size:17px;border-bottom:2px solid #9b6cff;padding-bottom:4px">${esc(it.title)}</h3>
              ${it.example ? `<div style="margin:6px 0"><b style="color:#9b6cff">【例文】</b>${nl2p(it.example)}</div>` : ""}
              ${it.allusion ? `<div style="margin:6px 0"><b style="color:#9b6cff">【典故】</b>${nl2p(it.allusion)}</div>` : ""}
              ${it.analysis ? `<div style="margin:6px 0"><b style="color:#9b6cff">【赏析】</b>${nl2p(it.analysis)}</div>` : ""}
            </div>`).join("");
          window.PDF.exportHtml(`申论典故（${f} ~ ${t} · ${items.length}条）`, html);
          if (UI.toast) UI.toast("已生成 PDF，请另存为");
        };
      }

      render();
    }
  };
})();