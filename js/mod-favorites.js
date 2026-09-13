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
      const header = UI.el(`<div class="card"><h2>⭐ 收藏题目</h2><div class="muted small">答题时点击题目右上角的「☆」即可收藏；再次点击取消。</div></div>`);
      body.appendChild(header);
      let total = 0;
      SUBJECTS.forEach(subject => {
        const items = DB.state.favorites[subject] = DB.state.favorites[subject] || [];
        total += items.length;
        const card = UI.el(`<div class="card fav-card"><h3>${esc(subject)} · ${items.length} 题</h3><div class="fav-list"></div></div>`);
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
          const top = UI.el(`<div class="row" style="margin-bottom:10px;gap:8px"><button class="btn primary fav-exp-subj">导出本科目PDF</button></div>`);
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
