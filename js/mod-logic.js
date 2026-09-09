/* 模块：逻辑判断
   - 类比推理板块（来自《类比常识积累手册》）：按「篇 / 专题」组织，保留「考点直击」原排版；
   - 学完可点「开始做题」走通用 Quiz 引擎（自动记错题 / 正确率 / 错题本）。
*/
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};
  const KEY = "analogy";

  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  window.MODULES.logic = {
    title: "逻辑判断", icon: "logic",
    render(body) {
      const DB = window.DB, UI = window.UI, LH = window.LearnedHistory;
      const DATA = window.ANALOGY || { units: [] };
      const units = DATA.units || [];

      // 按 篇(chapter) 分组
      const chapters = [];
      const map = {};
      units.forEach(u => {
        if (!map[u.chapter]) { map[u.chapter] = []; chapters.push(u.chapter); }
        map[u.chapter].push(u);
      });

      const totalLearned = LH.count(KEY);

      function renderHome() {
        if (!units.length) {
          body.innerHTML = `<div class="card empty">暂无类比数据。请把《类比常识积累手册.pdf》放入 essays_raw/ 后运行 tools/_gen_analogy.py。</div>`;
          return;
        }
        let html = `<div class="card">
          <h3>🧠 逻辑判断</h3>
          <div class="muted small">本模块含「类比推理板块」：${units.length} 个专题 / ${units.reduce((a, u) => a + u.points.length, 0)} 个考点 / ${units.reduce((a, u) => a + u.questions.length, 0)} 道真题自测。先学「考点直击」，再点「开始做题」巩固。</div>
        </div>`;
        chapters.forEach(ch => {
          html += `<div class="card" style="margin-top:8px">
            <div class="row spread"><b style="font-size:16px">📘 ${esc(ch)}</b><span class="muted small">${map[ch].length} 个专题</span></div>
            <div class="grid g2" style="margin-top:10px">`;
          map[ch].forEach(u => {
            const learned = LH.isLearned(KEY, u.id);
            html += `<div class="card allu-card" style="margin:0;cursor:pointer" data-unit="${esc(u.id)}">
              <div class="row spread">
                <b>${esc(u.topic)}</b>
                ${learned ? '<span class="tag ok">已学</span>' : ''}
              </div>
              <div class="muted small" style="margin-top:4px">考点 ${u.points.length} · 题 ${u.questions.length}</div>
              <div class="row" style="margin-top:8px;gap:6px">
                <button class="btn xs" data-study="${esc(u.id)}">📖 学考点</button>
                ${u.questions.length ? `<button class="btn xs primary" data-do="${esc(u.id)}">🎯 开始做题(${u.questions.length})</button>` : ''}
              </div>
            </div>`;
          });
          html += `</div></div>`;
        });
        html += `<div class="card" style="margin-top:8px"><div class="muted small">💡 「学考点」按 PDF 原排版还原「考点直击」；「开始做题」走通用答题引擎，错题自动进入逻辑错题本。</div></div>`;
        body.innerHTML = html;

        body.querySelectorAll("[data-study]").forEach(b => b.onclick = e => { e.stopPropagation(); openStudy(b.dataset.study); });
        body.querySelectorAll("[data-do]").forEach(b => b.onclick = e => { e.stopPropagation(); startQuiz(b.dataset.do); });
        body.querySelectorAll("[data-unit]").forEach(c => c.onclick = () => openStudy(c.dataset.unit));
      }

      function openStudy(uid) {
        const u = units.find(x => x.id === uid);
        if (!u) return;
        let pts = "";
        if (u.points.length) {
          pts = u.points.map(p => {
            if (p.type === "item") return `<li class="al-li">${esc(p.text)}</li>`;
            return `<p class="al-p">${esc(p.text)}</p>`;
          }).join("");
        } else {
          pts = `<div class="muted small">（本专题无「考点直击」文本）</div>`;
        }

        const markLearned = () => {
          LH.record(KEY, [uid]);
          UI.toast("✓ 已学：" + u.topic);
          renderHome();
        };

        let html = `<div class="card">
          <div class="row spread">
            <button class="btn xs ghost" id="back">‹ 返回</button>
            <button class="btn xs" id="markL">✓ 标记为已学</button>
          </div>
          <h3 style="margin:10px 0 4px">${esc(u.chapter)} · ${esc(u.topic)}</h3>
          <div class="muted small">📌 考点直击（按 PDF 原排版还原）</div>
          <div class="allu-sec" style="margin-top:8px">${pts}</div>
          ${u.questions.length ? `<div class="row" style="margin-top:12px"><button class="btn primary" id="doQuiz">🎯 开始做题（${u.questions.length} 题）</button></div>` : ''}
        </div>`;
        body.innerHTML = html;
        body.querySelector("#back").onclick = renderHome;
        body.querySelector("#markL").onclick = markLearned;
        const dq = body.querySelector("#doQuiz");
        if (dq) dq.onclick = () => startQuiz(uid);
      }

      function startQuiz(uid) {
        const u = units.find(x => x.id === uid);
        if (!u || !u.questions.length) { UI.toast("本专题暂无题目"); return; }
        const qs = u.questions.map(q => ({ q: q.q, options: q.o, a: q.a, e: q.e }));
        // 用通用答题引擎；完成后回到学习页
        body.innerHTML = "";
        const wrap = UI.el(`<div class="quiz-host"></div>`);
        body.appendChild(wrap);
        const back = UI.el(`<div class="card" style="margin-bottom:6px"><button class="btn xs ghost" id="bq">‹ 返回专题</button></div>`);
        body.insertBefore(back, wrap);
        back.querySelector("#bq").onclick = () => openStudy(uid);
        window.Quiz.start(wrap, qs, "逻辑", {
          onDone() {
            // 做题也算「已学」该专题
            LH.record(KEY, [uid]);
            UI.toast("本专题已标记为已学");
            setTimeout(renderHome, 600);
          }
        });
        window.scrollTo(0, 0);
      }

      renderHome();
    }
  };
})();
