/* 模块：行测5000题 · 知识点题目训练（v20261018c）
   数据源：assets/data/x5000_zl.js / x5000_sl.js（tools/x5_build.py 从扫描版 PDF OCR 生成）
   结构：window.KG_X5000 = { zl:{title,tree}, sl:{title,tree} }
   tree 节点：{ name, kp?:[{h,t}], kpImg?, mat?:{t,img}, qs?:[{q,options,a,e,img}], children? }
   - kp：文本知识点（按 PDF 排版：小标题+段落）
   - kpImg：思维导图/图表截图（点开大图，可保存到相册/桌面）
   - mat：材料（题组共用，题干图）
   - qs：题目（img=材料图或题干图）
   入口：资料分析/数量关系 模块顶部方格「📘 行测5000题 · 知识点题目训练」；
   同时把题目树注入 刷题中心（科目「行测5000题·资料分析」「行测5000题·数量关系」）。 */
(function () {
  "use strict";
  function esc(s) { return (window.UI && UI.esc) ? UI.esc(s == null ? "" : s) : String(s == null ? "" : s); }

  /* ---------- 树工具 ---------- */
  function eachNode(node, fn, path) {
    path = path || [];
    const p = path.concat(node.name || "");
    fn(node, p);
    (node.children || []).forEach(c => eachNode(c, fn, p));
  }
  function collectQs(node) {
    const out = [];
    (function walk(n) {
      if (n.mat && n.qs) n.qs.forEach(q => { if (q && !q.img && n.mat.img) q.img = n.mat.img; });
      (n.qs || []).forEach(q => out.push(q));
      (n.children || []).forEach(walk);
    })(node);
    return out;
  }
  function countQs(node) { return collectQs(node).length; }

  /* ---------- 知识点学习页（路由 #/data/x5 与 #/quantity/x5） ---------- */
  function renderBook(subjectKey, body) {
    const book = (window.KG_X5000 || {})[subjectKey];
    body.innerHTML = "";
    if (!book || !book.tree) { body.appendChild(UI.el('<div class="card empty">题库数据尚未加载（x5000 数据文件缺失）。</div>')); return; }
    const root = book.tree;

    const head = UI.el('<div class="card" style="border-top:3px solid #34e7e4"><b style="font-size:17px">📗 行测5000题 · ' + esc(book.title) + ' · 知识点题目训练</b>' +
      '<div class="muted small" style="margin-top:6px">知识点按原书排版收录，思维导图/图表已截图（点开可看大图并保存到相册/桌面）。每个考点可单独刷题，题目与答案解析一一匹配。</div></div>');
    body.appendChild(head);

    const list = UI.el('<div class="kg-tiles"></div>');
    let idx = 0;
    eachNode(root, (n) => {
      if (!n.children || !n.children.length) return; // 只给有分层的节点做入口
      const qs = countQs(n);
      if (!qs) return;
      idx++;
      list.appendChild(Pager.tile("📘", n.name + "（" + qs + " 题）", "#/" + subjectKey + "/x5/" + idx));
    });
    if (!idx) {
      // 单层书：直接列叶子
      (root.children || []).forEach((n, i) => {
        list.appendChild(Pager.tile("📘", n.name + "（" + countQs(n) + " 题）", "#/" + subjectKey + "/x5/" + (i + 1)));
      });
    }
    body.appendChild(list);

    /* 注册子页：#/subject/x5/N —— N 为「含题量节点」的序号 */
    const nodes = [];
    eachNode(root, (n) => { if ((n.children || []).length && countQs(n)) nodes.push(n); });
    (root.children || []).forEach(n => { if (!(n.children || []).length && countQs(n)) nodes.push(n); });
    nodes.forEach((n, i) => {
      Pager.define(subjectKey + "/x5/" + (i + 1), {
        title: "行测5000题 · " + n.name,
        parent: subjectKey,
        build(box) { renderPoint(box, n, book.title); }
      });
    });
  }

  /* ---------- 考点详情：知识点 + 思维导图 + 刷题 ---------- */
  function renderPoint(box, node, bookTitle) {
    const wrap = UI.el('<div></div>');
    box.appendChild(wrap);

    /* 知识点（文本，按原书层级排版） */
    if (node.kp && node.kp.length) {
      const kc = UI.el('<div class="card" style="border-left:4px solid #9b6cff"><h3 style="margin:0 0 8px">📖 知识点</h3></div>');
      node.kp.forEach(seg => {
        if (seg.h) kc.appendChild(UI.el('<div style="font-weight:800;margin:10px 0 4px">' + esc(seg.h) + '</div>'));
        if (seg.t) kc.appendChild(UI.el('<div style="line-height:1.75;margin:2px 0">' + esc(seg.t).replace(/\n/g, "<br>") + '</div>'));
      });
      wrap.appendChild(kc);
    }
    /* 思维导图/梳理截图 */
    if (node.kpImg) {
      const im = UI.el('<div class="card" style="text-align:center"><h3 style="margin:0 0 8px">🧠 知识梳理图（点击看大图）</h3>' +
        '<img src="' + esc(node.kpImg) + '" style="max-width:100%;border-radius:10px;cursor:zoom-in" alt="知识梳理图"/></div>');
      im.querySelector("img").onclick = () => { try { UI.viewImage(node.kpImg, "行测5000题-知识梳理.jpg"); } catch (e) {} };
      wrap.appendChild(im);
    }
    /* 材料截图 */
    if (node.mat && node.mat.img) {
      const im = UI.el('<div class="card" style="text-align:center"><h3 style="margin:0 0 8px">📊 题目材料（点击看大图）</h3>' +
        '<img src="' + esc(node.mat.img) + '" style="max-width:100%;border-radius:10px;cursor:zoom-in" alt="材料图"/></div>');
      im.querySelector("img").onclick = () => { try { UI.viewImage(node.mat.img, "行测5000题-材料.jpg"); } catch (e) {} };
      wrap.appendChild(im);
    }

    /* 刷题入口：整节点 + 各子节点 */
    const qs = collectQs(node);
    const pc = UI.el('<div class="card"><h3 style="margin:0 0 8px">✏️ 刷题（共 ' + qs.length + ' 题）</h3>' +
      '<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">' +
      '<span class="muted small">本题量</span>' +
      '<select id="x5per" style="max-width:100px"><option value="5">5 题</option><option value="10" selected>10 题</option><option value="20">20 题</option><option value="0">全部</option></select>' +
      '<button class="btn primary" id="x5go">开始刷题（随机）</button>' +
      '</div><div class="x5-kids" style="margin-top:10px"></div></div>');
    wrap.appendChild(pc);
    pc.querySelector("#x5go").onclick = () => {
      const per = parseInt(pc.querySelector("#x5per").value, 10);
      startRandom(node, isNaN(per) ? 10 : per);
    };
    const kids = pc.querySelector(".x5-kids");
    (node.children || []).forEach(c => {
      const n = countQs(c);
      if (!n) return;
      const row = UI.el('<div class="row" style="justify-content:space-between;align-items:center;padding:7px 0;border-top:1px dashed var(--line)">' +
        '<span>' + esc(c.name) + ' <span class="muted small">（' + n + ' 题）</span></span>' +
        '<button class="btn sm ghost">随机刷</button></div>');
      row.querySelector("button").onclick = () => startRandom(c, 10);
      kids.appendChild(row);
    });
    if (!(node.children || []).length && qs.length) {
      /* 叶子节点：直接给「从第 1 题顺序刷」入口 */
      const row = UI.el('<div class="row" style="margin-top:8px"><button class="btn ghost sm" id="x5seq">📄 顺序练全部题</button></div>');
      row.querySelector("#x5seq").onclick = () => {
        const host = UI.el('<div></div>');
        wrap.appendChild(host);
        window.Quiz.start(host, qs.slice(), "行测5000题·" + (node.name || bookTitle), {});
      };
      wrap.appendChild(row);
    }

    function startRandom(n, per) {
      const opt = {
        returnLabel: "‹ 返回知识点",
        returnAction: () => { try { host.remove(); } catch (e) {} }
      };
      const host = UI.el('<div></div>');
      wrap.appendChild(host);
      /* 材料类（资料分析/数量关系）：按整篇材料分组刷（选 10 题＝2 篇），分栏显示 */
      const groups = [];
      (function walk(x) {
        if (x.qs && x.qs.length && x.mat && (x.mat.img || x.mat.t)) { groups.push({ mat: x.mat, qs: x.qs.slice() }); return; }
        (x.children || []).forEach(walk);
      })(n);
      if (groups.length && window.SplitQuiz) {
        for (let i = groups.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = groups[i]; groups[i] = groups[j]; groups[j] = t; }
        let sel = [], cnt = 0;
        for (let i = 0; i < groups.length; i++) { sel.push(groups[i]); cnt += groups[i].qs.length; if (per > 0 && cnt >= per) break; }
        window.SplitQuiz.startGroups(host, sel, "行测5000题·" + (n.name || bookTitle), opt);
        return;
      }
      let pool = collectQs(n).slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
      if (per > 0) pool = pool.slice(0, per);
      if (!pool.length) { UI.toast("该节点暂无题目"); return; }
      window.Quiz.start(host, pool, "行测5000题·" + (n.name || bookTitle), opt);
    }
  }

  /* ---------- 注入刷题中心树 ---------- */
  function drillsSubjects() {
    const out = [];
    const X = window.KG_X5000 || {};
    [["zl", "行测5000题·资料分析"], ["sl", "行测5000题·数量关系"]].forEach(([k, name]) => {
      const b = X[k];
      if (!b || !b.tree) return;
      out.push({ id: "x5." + k, name: name, children: b.tree.children || [] });
    });
    return out;
  }

  window.KGX5 = { renderBook, drillsSubjects, collectQs, countQs };

  /* 注册路由：#/data/x5、#/quantity/x5（在 Pager 加载后执行，本文件排在 pager.js 之后） */
  if (window.Pager) {
    Pager.define("data/x5", { title: "行测5000题 · 资料分析", parent: "data", build: (box) => renderBook("zl", box) });
    Pager.define("quantity/x5", { title: "行测5000题 · 数量关系", parent: "quantity", build: (box) => renderBook("sl", box) });
  }
})();
