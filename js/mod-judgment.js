/* 模块：判断推理题册（v20261017a，用户死命令）
   数据源：assets/data/judgment-data.js（window.KG_JUDGMENT，行测3200题之判断题册/解析 PDF 自动提取，793+ 题）
   - 按题型分板块：图形推理（含立体重构/三视图/截面/立体拼接，每题带整题大图）、论证、翻译、
     分析、真假、结构评价、原因解释、归纳、类比、定义判断
   - 每板块可自选题数 → 通用 Quiz 引擎（计时/解析/错题本自动收录）
   - 全部单选，无多选 */
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};

  const SECTION_EMOJI = {
    graph: "🧩", graph3d: "📦", graphview: "📐", graphsec: "🍰", graphfit: "🧱",
    lunzheng: "🎯", fanyi: "🔀", fenxi: "🕵️", zhenjia: "⚖️", jiegou: "🏗️",
    yuanyin: "💡", guina: "📊", leibi: "🔗", dingyi: "📖", other: "📌"
  };

  window.MODULES.judgment = {
    title: "判断题册", icon: "logic",
    render(body) {
      const DB = window.DB, UI = window.UI;
      const data = window.KG_JUDGMENT;
      const secs = (data && data.sections) || [];

      function renderHome() {
        if (!secs.length) {
          body.innerHTML = `<div class="card"><h3>判断推理题册</h3><div class="muted small">题册数据尚未加载，请刷新页面重试。</div></div>`;
          return;
        }
        const total = data.total || secs.reduce((a, s) => a + s.items.length, 0);
        let html = `<div class="card"><h3>🧠 判断推理题册（3200 系列）</h3>
          <div class="muted small">从《行测3200题·判断推理》题册+解析自动提取，共 <b>${total}</b> 题，按题型分板块。图形推理每题附整题大图（题干图形 + ABCD 选项图形）。全部单选。</div></div>
          <div class="grid g3" style="margin-top:8px">`;
        secs.forEach(s => {
          html += `<div class="card" style="border-top:3px solid var(--cyan)">
            <div class="spread"><b style="font-size:15px">${SECTION_EMOJI[s.id] || "📌"} ${UI.esc(s.name)}</b>
              <span class="muted small">${s.items.length} 题</span></div>
            <div class="row" style="margin-top:10px;gap:8px;align-items:center">
              <input type="number" min="1" max="${s.items.length}" value="${Math.min(10, s.items.length)}" data-cnt="${s.id}" style="max-width:80px"/>
              <button class="btn sm primary" data-go="${s.id}">▶ 开始刷题</button>
            </div></div>`;
        });
        html += `</div><div class="card" style="margin-top:8px"><div class="muted small">💡 提示：图形推理题看图作答——大图包含题干图形序列与 A/B/C/D 四个选项图形；做完自动记错题本。AI 咨询图推题会自动切换可识图的模型帮你分析图形。</div></div>`;
        body.innerHTML = html;

        body.querySelectorAll("[data-go]").forEach(b => b.onclick = () => {
          const sid = b.dataset.go;
          const s = secs.find(x => x.id === sid);
          if (!s) return;
          const inp = body.querySelector('[data-cnt="' + sid + '"]');
          let n = parseInt(inp && inp.value, 10);
          if (!n || n < 1) n = 10;
          n = Math.min(n, s.items.length);
          startQuiz(s, n);
        });
      }

      function startQuiz(sec, n) {
        // 顺序切片（与纸质题册顺序一致），做过的也可重做
        const qs = sec.items.slice(0, n).map(q => ({
          q: q.q, options: (q.options || []).slice(), a: q.a, e: q.e || "", img: q.img || ""
        }));
        body.innerHTML = "";
        const wrap = UI.el(`<div class="quiz-host"></div>`);
        body.appendChild(wrap);
        const back = UI.el(`<div class="card" style="margin-bottom:6px"><button class="btn xs ghost" id="bqBack">‹ 返回题册</button></div>`);
        body.insertBefore(back, wrap);
        back.querySelector("#bqBack").onclick = renderHome;
        window.Quiz.start(wrap, qs, "判断", {
          returnLabel: "‹ 返回题册",
          returnAction: renderHome
        });
        window.scrollTo(0, 0);
      }

      renderHome();
    }
  };
})();
