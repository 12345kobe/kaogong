/* 已学习历史助手：记录每日「看了/学了哪些知识点」并按日期查看/导出。
   被 常识常用知识点、申论名言、申论规范词 复用。
   - record(stateKey, ids)   记录当日学习（按先后、去重）
   - open(stateKey, title, resolve)  弹窗：日期列表 → 当天条目 → 导出PDF / 返回
   resolve(id) 返回 { primary, secondary } 或 null（找不到则跳过）
*/
(function () {
  "use strict";
  window.LearnedHistory = {
    record(stateKey, ids) {
      if (!ids || !ids.length) return;
      const DB = window.DB;
      const log = DB.state.learnedLog = DB.state.learnedLog || {};
      const day = DB.today();
      const arr = log[stateKey] = log[stateKey] || {};
      const cur = arr[day] = arr[day] || [];
      ids.forEach(id => { if (id != null && !cur.includes(id)) cur.push(id); });
      DB.save();
    },
    count(stateKey) {
      const log = (window.DB.state.learnedLog || {})[stateKey] || {};
      return Object.keys(log).reduce((s, d) => s + (log[d] ? log[d].length : 0), 0);
    },
    isLearned(stateKey, id) {
      const log = (window.DB.state.learnedLog || {})[stateKey] || {};
      for (const d in log) { if (log[d] && log[d].includes(id)) return true; }
      return false;
    },
    dates(stateKey) {
      const log = (window.DB.state.learnedLog || {})[stateKey] || {};
      return Object.keys(log).filter(d => log[d] && log[d].length).sort().reverse();
    },
    open(stateKey, title, resolve) {
      const DB = window.DB, UI = window.UI;
      const log = (DB.state.learnedLog || {})[stateKey] || {};
      const dates = Object.keys(log).filter(d => log[d] && log[d].length).sort().reverse();
      const box = UI.el(`<div></div>`);

      function renderDateList() {
        box.innerHTML = `<div class="muted small" style="margin-bottom:8px">按日期查看「${UI.esc(title)}」的学习记录，点击某天查看当天所学（按学习先后排序）。</div>
          <div id="dates" style="display:flex;flex-direction:column;gap:8px"></div>`;
        const dEl = box.querySelector("#dates");
        if (!dates.length) { dEl.innerHTML = `<div class="empty">暂无学习记录</div>`; return; }
        dates.forEach(d => {
          const ids = log[d];
          const row = UI.el(`<div class="todo" style="cursor:pointer"><div style="flex:1"><b>${UI.esc(d)}</b> <span class="muted small">· 学习 ${ids.length} 条</span></div><span class="arc-toggle">查看 ▾</span></div>`);
          row.onclick = () => renderDay(d);
          dEl.appendChild(row);
        });
      }

      function renderDay(d) {
        const ids = log[d];
        const items = ids.map(id => resolve(id)).filter(Boolean);
        const rows = items.map((it, i) => `<div class="todo" style="flex-direction:column;align-items:flex-start;gap:4px">
          <div><b class="muted small">${i + 1}.</b> ${UI.esc(it.primary || "")}</div>
          ${it.secondary ? `<div class="small" style="color:#9fb0d8">${UI.esc(it.secondary)}</div>` : ""}
        </div>`).join("") || `<div class="empty">无内容</div>`;
        box.innerHTML = `<div class="row" style="gap:8px;margin-bottom:8px">
            <button class="btn ghost" id="back">← 返回日期列表</button>
            <button class="btn" id="exp">导出当日PDF</button>
          </div>
          <div class="muted small" style="margin-bottom:8px">${UI.esc(d)} · 共 ${ids.length} 条（按学习先后排序）</div>
          <div id="list" style="display:flex;flex-direction:column;gap:8px">${rows}</div>`;
        box.querySelector("#back").onclick = renderDateList;
        box.querySelector("#exp").onclick = () => {
          const html = items.map((it, i) => `<div class="item"><b>${i + 1}. ${UI.esc(it.primary || "")}</b>${it.secondary ? `<div class="muted small">${UI.esc(it.secondary)}</div>` : ""}</div>`).join("");
          window.PDF.exportHtml(`${title}（${d}）`, html);
        };
      }

      UI.modal({
        title: `📅 ${title} · 已学习`,
        body: box, width: "680px",
        actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }]
      });
      renderDateList();
    }
  };
})();
