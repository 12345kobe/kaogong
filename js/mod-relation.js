/* 模块：必对应关系（类比推理必会对应关系）
   - 每天自动展示一个专题（按日期循环），学完点「已复习」记一次（计入已学习历史）；
   - 也可前后翻看其它专题；已复习的专题带标记。
*/
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};
  const KEY = "relation";
  const HEAD = /^[（(][一二三四五六七八九十]+[)）]|^(真题示例|知识积累)$/;

  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  window.MODULES.relation = {
    title: "必对应关系", icon: "relation",
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

        let paras = t.paras.map(p => {
          if (HEAD.test(p.trim())) return `<div class="rel-head">${esc(p)}</div>`;
          return `<p class="rel-p">${esc(p)}</p>`;
        }).join("");

        body.innerHTML = `
          <div class="card">
            <div class="row spread">
              <span class="muted small">📅 每日一题 · 必对应关系</span>
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
            <div class="allu-sec">${paras || '<div class="muted small">（暂无正文）</div>'}</div>
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
