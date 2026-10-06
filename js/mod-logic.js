/* 模块：判断推理
   - 类比推理板块（来自《类比常识积累手册》）：按「篇 / 专题」组织，保留「考点直击」原排版；
   - 学完可点「开始做题」走通用 Quiz 引擎（自动记错题 / 正确率 / 错题本）。
*/
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};
  const KEY = "analogy";

  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  window.MODULES.logic = {
    title: "判断推理", icon: "logic",
    render(body) {
      const DB = window.DB, UI = window.UI, LH = window.LearnedHistory;
      /* 类比推理（手册数据）与翻译推理（精讲 PDF）分离：翻译推理与类比推理并列，不互相嵌套 */
      const aUnits = (window.ANALOGY && window.ANALOGY.units) || [];
      const tUnits = (window.KG_TRANSLATION && window.KG_TRANSLATION.units) || [];
      const units = aUnits.concat(tUnits);   // 供 openStudy / startQuiz 查找

      // 类比推理：按 篇(chapter) 分组
      const chapters = [];
      const map = {};
      aUnits.forEach(u => {
        if (!map[u.chapter]) { map[u.chapter] = []; chapters.push(u.chapter); }
        map[u.chapter].push(u);
      });
      // 翻译推理：按 chapter 分组（当前只有「翻译推理」一组，保持独立并列）
      const tChapters = [];
      const tMap = {};
      tUnits.forEach(u => {
        if (!tMap[u.chapter]) { tMap[u.chapter] = []; tChapters.push(u.chapter); }
        tMap[u.chapter].push(u);
      });

      const totalLearned = LH.count(KEY);

      function unitCard(u) {
        const learned = LH.isLearned(KEY, u.id);
        return `<div class="card allu-card" style="margin:0;cursor:pointer" data-unit="${esc(u.id)}">
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
      }

      function renderHome() {
        if (!units.length) {
          body.innerHTML = `<div class="card empty">暂无学习材料数据。</div>`;
          return;
        }
        let html = "";
        /* 类比推理：收纳必会对应关系 + 各篇（用户点开这一个板块看全部） */
        if (aUnits.length) {
          html += `<details class="kg-det"><summary class="kg-det-s"><span class="kg-det-t">🧠 类比推理</span><span class="muted small" style="font-weight:400;color:var(--txt-dim)">${aUnits.length} 个专题 · ${aUnits.reduce((a, u) => a + u.questions.length, 0)} 道真题</span><span class="kg-det-arrow">▸</span></summary><div class="kg-det-b">`;
          html += `<div class="muted small" style="margin-top:6px">先学「考点直击」，再点「开始做题」巩固。</div>`;
          html += `<details class="kg-det" style="margin-top:8px"><summary class="kg-det-s"><span class="kg-det-t">📐 必会对应关系（类比推理·每日一题）</span><span class="kg-det-arrow">▸</span></summary><div class="kg-det-b" id="relSec"></div></details>`;
          chapters.forEach(ch => {
            html += `<div style="font-weight:700;margin:12px 0 6px">📘 ${esc(ch)}</div><div class="grid g2" style="margin-bottom:4px">`;
            map[ch].forEach(u => { html += unitCard(u); });
            html += `</div>`;
          });
          html += `</div></details>`;
        }
        /* 翻译推理：与类比推理并列的独立板块 */
        tChapters.forEach(ch => {
          html += `<details class="kg-det"><summary class="kg-det-s"><span class="kg-det-t">📘 ${esc(ch)}</span><span class="muted small" style="font-weight:400;color:var(--txt-dim)">${tMap[ch].length} 个专题</span><span class="kg-det-arrow">▸</span></summary><div class="kg-det-b"><div class="grid g2" style="margin-top:4px">`;
          tMap[ch].forEach(u => { html += unitCard(u); });
          html += `</div></div></details>`;
        });
        html += `<div class="card" style="margin-top:8px"><div class="muted small">💡 「学考点」按 PDF 原排版还原「考点直击」；「开始做题」走通用答题引擎，错题自动进入逻辑错题本。</div></div>`;
        body.innerHTML = html;

        body.querySelectorAll("[data-study]").forEach(b => b.onclick = e => { e.stopPropagation(); openStudy(b.dataset.study); });
        body.querySelectorAll("[data-do]").forEach(b => b.onclick = e => { e.stopPropagation(); startQuiz(b.dataset.do); });
        body.querySelectorAll("[data-unit]").forEach(c => c.onclick = () => openStudy(c.dataset.unit));

        // 必会对应关系：渲染到上面的可折叠块里
        const relSec = body.querySelector("#relSec");
        if (relSec && window.MODULES.relation) {
          try { window.MODULES.relation.render(relSec); }
          catch (e) { relSec.innerHTML = `<div class="card empty">必会对应关系加载失败：${UI.esc(e.message)}</div>`; }
        }
      }

      // 题目清洗：去掉「判断推理常识积累…真题链接」等无关前缀，直接从（2022联考）开始
      function cleanQ(q) {
        if (!q) return q;
        let s = q;
        const dl = s.indexOf("真题链接");
        if (dl >= 0) {
          s = s.slice(dl + 4);
          s = s.replace(/^[（(][一二三四五六七八九十]+[)）]\s*/, "");
        }
        return s.trim();
      }

      function openStudy(uid) {
        const u = units.find(x => x.id === uid);
        if (!u) return;
        let pts = "";
        if (u.points.length) {
          // 整句语义完整再断行：每个考点块就是一段；二级标题（t="item"）加粗加大 + emoji
          pts = u.points.map(p => {
            const txt = esc(p.x || "");
            if (p.t === "item") return `<div class="al-sub"><b>🔹 ${txt}</b></div>`;
            return `<p class="al-p">${txt}</p>`;
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
        const qs = u.questions.map(q => ({ q: cleanQ(q.q), options: q.o, a: q.a, e: cleanQ(q.e) }));
        // 用通用答题引擎；完成后回到学习页
        body.innerHTML = "";
        const wrap = UI.el(`<div class="quiz-host"></div>`);
        body.appendChild(wrap);
        const back = UI.el(`<div class="card" style="margin-bottom:6px"><button class="btn xs ghost" id="bq">‹ 返回专题</button></div>`);
        body.insertBefore(back, wrap);
        back.querySelector("#bq").onclick = () => openStudy(uid);
        window.Quiz.start(wrap, qs, "逻辑", {
          returnLabel: "‹ 返回专题",
          returnAction: () => openStudy(uid),
          onDone() {
            // 做题也算「已学」该专题
            LH.record(KEY, [uid]);
            UI.toast("本专题已标记为已学，可继续查看解析或返回");
          }
        });
        window.scrollTo(0, 0);
      }

      renderHome();
    }
  };
})();
