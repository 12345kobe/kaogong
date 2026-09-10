/* 模块：必会对应关系（类比推理必会对应关系）
   - 每天自动展示一个专题（按日期循环），学完点「已复习」记一次（计入已学习历史）；
   - 也可前后翻看其它专题；已复习的专题带标记。
*/
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};
  const KEY = "relation";
  const HEAD = /^[（(][一二三四五六七八九十]+[)）]|^(真题示例|知识积累)$/;

  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // 把「真题示例」正文解析成：1. 题目 / 题干逻辑关系 / 正确答案 / 答案逻辑关系，逐行加粗换行
  function parseExams(text) {
    const s = (text || "").replace(/题于逻辑关系/g, "题干逻辑关系");
    const parts = s.split(/(?=\d+\.)/);
    let html = "";
    parts.forEach(part => {
      const m = part.match(/^(\d+)\.\s*([\s\S]*)$/);
      if (!m) { const t = part.trim(); if (t) html += `<div class="exam-line">${esc(t)}</div>`; return; }
      const num = m[1];
      let body = m[2].trim();
      let q = body, logic = "", ans = "", ansLogic = "";
      const li = body.search(/题干逻辑关系/);
      if (li >= 0) {
        q = body.slice(0, li).trim();
        let after = body.slice(li + 5).replace(/^[:：]/, "").trim();
        const ai = after.search(/正确答案/);
        if (ai >= 0) {
          logic = after.slice(0, ai).trim().replace(/[:：]$/, "");
          let ansPart = after.slice(ai + 4).replace(/^[:：]/, "").trim();
          const ali = ansPart.search(/答案逻辑关系/);
          if (ali >= 0) { ans = ansPart.slice(0, ali).trim().replace(/[:：]$/, ""); ansLogic = ansPart.slice(ali + 5).replace(/^[:：]/, "").trim(); }
          else ans = ansPart.trim().replace(/[:：]$/, "");
        } else { logic = after; }
      } else {
        const ai = body.search(/正确答案/);
        if (ai >= 0) {
          q = body.slice(0, ai).trim();
          const idx = body.indexOf("正确答案");
          ans = body.slice(idx + 4).replace(/^[:：]/, "").trim();
        }
      }
      html += `<div class="exam-item">
        <div class="exam-q"><b>${num}. ${esc(q)}</b></div>
        ${logic ? `<div class="exam-line"><b>题干逻辑关系：</b>${esc(logic)}</div>` : ""}
        ${ans ? `<div class="exam-line"><b>正确答案：</b>${esc(ans)}</div>` : ""}
        ${ansLogic ? `<div class="exam-line"><b>答案逻辑关系：</b>${esc(ansLogic)}</div>` : ""}
      </div>`;
    });
    return html;
  }

  window.MODULES.relation = {
    title: "必会对应关系", icon: "relation",
    render(body) {
      const DB = window.DB, UI = window.UI, LH = window.LearnedHistory;
      const topics = (window.RELATION && window.RELATION.topics) || [];
      if (!topics.length) {
        body.innerHTML = `<div class="card empty">暂无专题数据。请把《类比推理必会对应关系.pdf》放入 essays_raw/ 后运行 tools/_gen_relation.py。</div>`;
        return;
      }
      // 今天的专题：按「自纪元起的天数」循环，保证每天固定一个
      const dayNo = Math.floor(Date.now() / 86400000);
      let todayIdx = ((dayNo % topics.length) + topics.length) % topics.length;

      let viewIdx = todayIdx;

      function render() {
        const t = topics[viewIdx];
        const isToday = viewIdx === todayIdx;
        const reviewed = LH.isLearned(KEY, t.id);
        const totalReviewed = LH.count(KEY);

        let parasHtml = "";
        let expectingExam = false;
        t.paras.forEach(p => {
          const pt = p.trim();
          if (HEAD.test(pt)) {
            parasHtml += `<div class="rel-head">${esc(pt)}</div>`;
            expectingExam = (pt === "真题示例");
            return;
          }
          if (expectingExam) { parasHtml += parseExams(p); expectingExam = false; }
          else parasHtml += `<p class="rel-p">${esc(p)}</p>`;
        });

        body.innerHTML = `
          <div class="card">
            <div class="row spread">
              <span class="muted small">📅 每日一题 · 必会对应关系</span>
              <div class="row" style="gap:6px">
                <button class="btn xs ghost" id="prev">‹ 上一篇</button>
                <button class="btn xs ghost" id="next">下一篇 ›</button>
              </div>
            </div>
            <div class="row spread" style="margin-top:8px;align-items:baseline">
              <h3 style="margin:0">专题${t.num} · ${esc(t.name)}</h3>
              ${isToday ? '<span class="tag">今日</span>' : '<span class="muted small">浏览</span>'}
            </div>
            <div class="muted small" style="margin-top:4px">第 ${viewIdx + 1} / ${topics.length} 个专题 · 已复习 ${totalReviewed} 个</div>
          </div>
          <div class="card" style="margin-top:8px">
            <div class="allu-sec">${parasHtml || '<div class="muted small">（暂无正文）</div>'}</div>
            <div class="row" style="margin-top:12px">
              ${isToday
                ? `<button class="btn primary" id="review" ${reviewed ? "disabled" : ""}>${reviewed ? "✓ 今日已复习" : "✓ 我复习完了"}</button>`
                : ""}
            </div>
          </div>
          <div class="card" style="margin-top:8px"><div class="muted small">💡 每天固定推送一个专题，循环复习；点「我复习完了」即记入学习历史（可在「已学过」中按日期查看 / 导出）。</div></div>
        `;

        body.querySelector("#prev").onclick = () => { viewIdx = (viewIdx - 1 + topics.length) % topics.length; render(); };
        body.querySelector("#next").onclick = () => { viewIdx = (viewIdx + 1) % topics.length; render(); };
        const rv = body.querySelector("#review");
        if (rv) rv.onclick = () => {
          LH.record(KEY, [t.id]);
          UI.toast("✓ 已记录复习：" + t.name);
          render();
        };
      }

      render();
    }
  };
})();
