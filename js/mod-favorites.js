/* 模块：收藏题目（按科目分类、可练习、可导出 PDF） */
(function () {
  "use strict";
  const DB = window.DB, UI = window.UI;
  const A = i => String.fromCharCode(65 + i);
  const SUBJECTS = ["言语", "资料", "逻辑", "政治", "数量", "常识", "申论"];

  function esc(s) { return UI.esc(s == null ? "" : s); }

  function itemsHtml(items) {
    let html = `<h2 class="sec">一、题目（共 ${items.length} 题）</h2>`;
    items.forEach((it, i) => {
      html += `<div class="item"><div class="q"><span class="qnum">${i + 1}.</span> ${esc(it.q).replace(/\n/g, "<br>")}</div>`;
      if (it.options && it.options.length) it.options.forEach((o, j) => html += `<div class="opt">${A(j)}. ${esc(o).replace(/\n/g, "<br>")}</div>`);
      html += `</div>`;
    });
    html += `<h2 class="sec">二、答案与解析</h2>`;
    items.forEach((it, i) => {
      html += `<div class="aitem"><span class="anum">${i + 1}.</span>正确答案：<b>${A(it.a)}</b>`;
      if (it.e) html += `<div class="exp">解析：${esc(it.e).replace(/\n/g, "<br>")}</div>`;
      html += `</div>`;
    });
    return html;
  }

  function exportItems(items, subject) {
    if (!items || !items.length) { UI.toast("暂无内容可导出"); return; }
    window.PDF.exportHtml(`${subject} · 收藏题目（${items.length}题）`, itemsHtml(items));
  }

  function exportAll(state) {
    const blocks = SUBJECTS.filter(s => state.favorites[s] && state.favorites[s].length).map(s => ({ subject: s, items: state.favorites[s].slice() }));
    if (!blocks.length) { UI.toast("暂无收藏题目"); return; }
    let html = "", counter = 0;
    blocks.forEach(b => {
      html += `<div class="subhead">${b.subject} · ${b.items.length} 题</div>`;
      b.items.forEach(it => {
        counter++;
        html += `<div class="item"><div class="q"><span class="qnum">${counter}.</span> ${esc(it.q).replace(/\n/g, "<br>")}</div>`;
        if (it.options && it.options.length) it.options.forEach((o, j) => html += `<div class="opt">${A(j)}. ${esc(o).replace(/\n/g, "<br>")}</div>`);
        html += `</div>`;
      });
    });
    html += `<h2 class="sec">答案与解析</h2>`;
    counter = 0;
    blocks.forEach(b => {
      b.items.forEach(it => {
        counter++;
        html += `<div class="aitem"><span class="anum">${counter}.</span>正确答案：<b>${A(it.a)}</b>`;
        if (it.e) html += `<div class="exp">解析：${esc(it.e).replace(/\n/g, "<br>")}</div>`;
        html += `</div>`;
      });
    });
    window.PDF.exportHtml(`全部科目 · 收藏题目（${counter}题）`, html);
  }

  function startQuiz(it, subject) {
    const mask = UI.el(`<div class="modal-mask"><div class="modal" style="max-width:820px;max-height:88vh;overflow:auto"><h3>⭐ 收藏 · ${esc(subject)}</h3><div class="fav-quiz"></div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost fav-close">关闭</button></div></div></div>`);
    document.body.appendChild(mask);
    mask.querySelector(".fav-close").onclick = () => mask.remove();
    mask.onclick = e => { if (e.target === mask) mask.remove(); };
    try { window.Quiz.start(mask.querySelector(".fav-quiz"), [{ q: it.q, options: it.options, a: it.a, e: it.e }], subject, {}); }
    catch (e) { mask.querySelector(".fav-quiz").innerHTML = `<div class="card empty">练习启动失败：${esc(e.message)}</div>`; }
  }

  window.MODULES = window.MODULES || {};
  window.MODULES.favorites = {
    title: "收藏", icon: "favorite",
    render(body) {
      DB.state.favorites = DB.state.favorites || {};
      body.innerHTML = "";
      const header = UI.el(`<div class="card"><h2>⭐ 收藏题目</h2><div class="muted small" style="margin-bottom:8px">答题时点击题目右上角的「☆」即可收藏；再次点击取消。</div>
        <div class="row" style="gap:8px;margin-top:6px"><button class="btn primary" id="favBatch">📚 批量练题</button></div></div>`);
      body.appendChild(header);
      header.querySelector("#favBatch").onclick = () => startBatch();

      /* 批量练题：默认 10 题（可选 5–20），练题/背题模式（默认练题），带提交按钮 */
      function startBatch() {
        const all = [];
        SUBJECTS.forEach(s => (DB.state.favorites[s] || []).forEach(it => all.push({ q: it.q, options: it.options, a: it.a, e: it.e, subject: it.subject || s, qid: it.qid })));
        if (!all.length) { UI.toast("还没有收藏的题目，去答题时点 ☆ 收藏吧"); return; }
        const mask = UI.el(`<div class="modal-mask"><div class="modal" style="max-width:480px">
          <h3>⭐ 收藏批量练题</h3>
          <div class="muted small" style="margin:6px 0">共 ${all.length} 道收藏题，选择本次题量与模式。</div>
          <div style="margin:14px 0">
            <label class="muted small">题量（5–20）</label>
            <input type="range" min="5" max="20" value="10" id="bN" style="width:100%">
            <div style="text-align:center;font-size:22px;font-weight:800;margin-top:4px" id="bNv">10 题</div>
          </div>
          <div class="row" style="gap:8px;margin:10px 0;align-items:center">
            <span class="muted small">模式</span>
            <button class="qm-chip on" id="bP">📝 练题</button>
            <button class="qm-chip" id="bM">📖 背题</button>
          </div>
          <div class="muted small" style="margin-top:4px">练题＝答完再交卷；背题＝选完即看答案。错题仍自动进对应科目错题本。</div>
          <div class="row" style="justify-content:flex-end;gap:8px;margin-top:14px">
            <button class="btn ghost" id="bCancel">取消</button>
            <button class="btn primary" id="bStart">开始练习</button>
          </div>
        </div></div>`);
        document.body.appendChild(mask);
        let mode = "practice";
        const nInput = mask.querySelector("#bN");
        const nVal = mask.querySelector("#bNv");
        nInput.oninput = () => nVal.textContent = nInput.value + " 题";
        mask.querySelector("#bP").onclick = () => { mode = "practice"; mask.querySelector("#bP").classList.add("on"); mask.querySelector("#bM").classList.remove("on"); };
        mask.querySelector("#bM").onclick = () => { mode = "memorize"; mask.querySelector("#bM").classList.add("on"); mask.querySelector("#bP").classList.remove("on"); };
        mask.querySelector("#bCancel").onclick = () => mask.remove();
        mask.onclick = e => { if (e.target === mask) mask.remove(); };
        mask.querySelector("#bStart").onclick = () => {
          const n = Math.max(5, Math.min(20, parseInt(nInput.value, 10) || 10));
          const take = Math.min(n, all.length);
          mask.remove();
          runBatchQuiz(all, mode, take, all.length);
        };
      }
      function runBatchQuiz(all, mode, take, total) {
        const mask = UI.el(`<div class="modal-mask"><div class="modal" style="max-width:880px;max-height:92vh;overflow:auto">
          <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
            <h3 style="margin:0">⭐ 收藏练题（${take}/${total}）</h3>
            <button class="btn ghost" id="bBack">返回收藏</button>
          </div>
          <div class="fav-quiz"></div>
        </div></div>`);
        document.body.appendChild(mask);
        mask.querySelector("#bBack").onclick = () => { mask.remove(); MODULES.favorites.render(body); };
        mask.onclick = e => { if (e.target === mask) { mask.remove(); MODULES.favorites.render(body); } };
        const host = mask.querySelector(".fav-quiz");
        // 连练：交卷后点「再来一组」直接在当前弹窗内随机抽新一组，不刷新页面、不返回原界面
        function newSet() {
          const pool = all.slice();
          for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
          const picked = pool.slice(0, Math.min(take, pool.length));
          try {
            window.Quiz.start(host, picked, "收藏", { mode: mode, noStats: true, onAgain: newSet });
          } catch (e) {
            host.innerHTML = `<div class="card empty">练习启动失败：${UI.esc(e.message)}</div>`;
          }
        }
        newSet();
      }
      /* 单科目批量练习：自选题量（默认 10），从本科目收藏随机抽题（不按收藏顺序） */
      function startSubjectBatch(subject, items, body) {
        const pool = (items || []).map(it => ({ q: it.q, options: it.options, a: it.a, e: it.e, subject: it.subject || subject, qid: it.qid }));
        if (!pool.length) { UI.toast("该科目还没有收藏题目"); return; }
        const full = window.KGSubjectFull ? window.KGSubjectFull(subject) : subject;
        const mask = UI.el(`<div class="modal-mask"><div class="modal" style="max-width:460px">
          <h3>🎲 ${esc(full)} · 批量练习</h3>
          <div class="muted small" style="margin:6px 0">共收藏 ${pool.length} 题，选择本次练习数量（随机抽取，不按收藏顺序）。</div>
          <div class="row" style="gap:8px;margin:14px 0;flex-wrap:wrap">
            ${[5, 10, 20, 30].map(n => `<button class="qm-chip${n === 10 ? " on" : ""}" data-n="${n}">${n} 题</button>`).join("")}
            <button class="qm-chip" data-n="0">全部（${Math.min(pool.length, 200)} 题）</button>
          </div>
          <div class="row" style="gap:8px;margin:10px 0;align-items:center">
            <span class="muted small">模式</span>
            <button class="qm-chip on" id="sbP">📝 练题</button>
            <button class="qm-chip" id="sbM">📖 背题</button>
          </div>
          <div class="row" style="justify-content:flex-end;gap:8px;margin-top:14px">
            <button class="btn ghost" id="sbCancel">取消</button>
            <button class="btn primary" id="sbStart">开始练习</button>
          </div>
        </div></div>`);
        document.body.appendChild(mask);
        let n = 10, mode = "practice";
        mask.querySelectorAll("[data-n]").forEach(b => {
          b.onclick = () => {
            n = parseInt(b.dataset.n, 10) || 10;
            mask.querySelectorAll("[data-n]").forEach(x => x.classList.toggle("on", x === b));
          };
        });
        mask.querySelector("#sbP").onclick = () => { mode = "practice"; mask.querySelector("#sbP").classList.add("on"); mask.querySelector("#sbM").classList.remove("on"); };
        mask.querySelector("#sbM").onclick = () => { mode = "memorize"; mask.querySelector("#sbM").classList.add("on"); mask.querySelector("#sbP").classList.remove("on"); };
        const close = () => mask.remove();
        mask.querySelector("#sbCancel").onclick = close;
        mask.onclick = e => { if (e.target === mask) close(); };
        mask.querySelector("#sbStart").onclick = () => {
          const take = n > 0 ? Math.min(n, pool.length) : Math.min(pool.length, 200);
          close();
          runSubjectBatch(full + " · 收藏", pool, mode, take, body);
        };
      }
      function runSubjectBatch(title, pool, mode, take, body) {
        const mask = UI.el(`<div class="modal-mask"><div class="modal" style="max-width:880px;max-height:92vh;overflow:auto">
          <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
            <h3 style="margin:0">⭐ ${esc(title)}（${take}/${pool.length} 随机）</h3>
            <button class="btn ghost" id="sbBack">返回收藏</button>
          </div>
          <div class="fav-quiz"></div>
        </div></div>`);
        document.body.appendChild(mask);
        mask.querySelector("#sbBack").onclick = () => { mask.remove(); MODULES.favorites.render(body); };
        mask.onclick = e => { if (e.target === mask) { mask.remove(); MODULES.favorites.render(body); } };
        const host = mask.querySelector(".fav-quiz");
        function newSet() {
          const p = pool.slice();
          for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
          const picked = p.slice(0, Math.min(take, p.length));
          try { window.Quiz.start(host, picked, title, { mode: mode, noStats: true, onAgain: newSet }); }
          catch (e) { host.innerHTML = `<div class="card empty">练习启动失败：${UI.esc(e.message)}</div>`; }
        }
        newSet();
      }
      let total = 0;
      SUBJECTS.forEach(subject => {
        const items = DB.state.favorites[subject] = DB.state.favorites[subject] || [];
        total += items.length;
        const card = UI.el(`<div class="card fav-card"><h3>${esc((window.KGSubjectFull ? KGSubjectFull(subject) : subject))} · ${items.length} 题</h3><div class="fav-list"></div></div>`);
        const list = card.querySelector(".fav-list");
        if (!items.length) {
          list.innerHTML = `<div class="muted small">暂无收藏</div>`;
        } else {
          items.forEach((it, i) => {
            const row = UI.el(`<div class="fav-item"><div class="fav-q">${i + 1}. ${esc((it.q || "").slice(0, 120))}</div></div>`);
            const btns = UI.el(`<div class="row fav-actions"><button class="btn sm fav-prac">练习</button><button class="btn sm fav-pdf">导PDF</button><button class="btn sm danger fav-rm">移除</button></div>`);
            row.appendChild(btns);
            btns.querySelector(".fav-prac").onclick = () => startQuiz(it, subject);
            btns.querySelector(".fav-pdf").onclick = () => exportItems([it], subject);
            btns.querySelector(".fav-rm").onclick = () => { items.splice(i, 1); DB.save(); this.render(body); };
            list.appendChild(row);
          });
          /* v20261018c（用户要求）：每个科目模块都能「批量练习」——
             自选题量（默认 10），从本科目收藏里**随机**抽题，不按收藏顺序。 */
          const top = UI.el(`<div class="row" style="margin-bottom:10px;gap:8px;flex-wrap:wrap">
            <button class="btn primary fav-batch-subj">🎲 批量练习（随机抽题）</button>
            <button class="btn ghost fav-exp-subj">导出本科目PDF</button>
          </div>`);
          top.querySelector(".fav-batch-subj").onclick = () => startSubjectBatch(subject, items, body);
          top.querySelector(".fav-exp-subj").onclick = () => exportItems(items, subject);
          card.insertBefore(top, list);
        }
        body.appendChild(card);
      });
      if (!total) body.appendChild(UI.el(`<div class="card empty">暂无收藏题目。</div>`));
      const bottom = UI.el(`<div class="row" style="margin-top:10px;gap:8px"><button class="btn primary" id="favExpAll">导出全部收藏PDF</button></div>`);
      bottom.querySelector("#favExpAll").onclick = () => exportAll(DB.state);
      body.appendChild(bottom);
    }
  };
})();
