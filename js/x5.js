/* 模块：行测5000题 · 知识点题目训练（v20261018c）
   数据源：assets/data/x5000_zl.js / x5000_sl.js（tools/x5_build.py 从扫描版 PDF OCR 生成）
   结构：window.KG_X5000 = { zl:{title,tree}, sl:{title,tree} }
   tree 节点：{ name, kp?:[{h,t}], kpImg?, kpImgs?:[路径], mat?:{t,img}, qs?:[{q,options,a,e,img}], children? }
   - kp：文本知识点（按 PDF 排版：小标题+段落）
   - kpImgs：思维导图/图表截图数组（可多张，点开大图，可保存到相册/桌面）；kpImg 为兼容单张字段
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
      /* ★v20261019c 用户死命令：每道题下面**不要**重复挂材料图——材料只在分栏的材料面板显示。
         旧逻辑把 n.mat.img 塞进每个 q.img，导致同一篇材料在题目区反复出现（视频已实锤）。 */
      (n.qs || []).forEach(q => out.push(q));
      (n.children || []).forEach(walk);
    })(node);
    return out;
  }
  function countQs(node) { return collectQs(node).length; }

  function getX() {
    let X = window.KG_X5000;
    if (!X || typeof X !== "object") X = window.KG_X5000 = {};
    if (window.KG_X5000_ZL_DATA && !X.zl) X.zl = window.KG_X5000_ZL_DATA;
    if (window.KG_X5000_SL_DATA && !X.sl) X.sl = window.KG_X5000_SL_DATA;
    return X;
  }

  /* ---------- 知识点学习页（路由 #/data/x5 与 #/quantity/x5） ---------- */
  function renderBook(subjectKey, body) {
    const book = getX()[subjectKey];
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
  /* 思维导图/梳理截图（支持多张：kpImgs 优先，兼容单张 kpImg） */
  const imgs = (node.kpImgs && node.kpImgs.length) ? node.kpImgs : (node.kpImg ? [node.kpImg] : []);
  if (imgs.length) {
    imgs.forEach((src, ii) => {
      const im = UI.el('<div class="card" style="text-align:center"><h3 style="margin:0 0 8px">🧠 知识梳理图' + (imgs.length > 1 ? "（" + (ii + 1) + "/" + imgs.length + "）" : "") + '（点击看大图）</h3>' +
        '<img src="' + esc(src) + '" style="max-width:100%;border-radius:10px;cursor:zoom-in" alt="知识梳理图"/></div>');
      im.querySelector("img").onclick = () => { try { UI.viewImage(src, "行测5000题-知识梳理.jpg"); } catch (e) {} };
      wrap.appendChild(im);
    });
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
        window.Quiz.start(host, qs.slice(), "行测5000题·" + (node.name || bookTitle), {
          returnLabel: "‹ 返回知识点",
          returnAction: () => { try { host.remove(); } catch (e) {} },
          homeLabel: "🏠 返回刷题中心",
          homeAction: goDrills
        });
      };
      wrap.appendChild(row);
    }

    /* ★v20261021 「返回刷题中心」：用户反馈退回流于内环——能退回知识点页，
       却到不了「选择科目」那一层。这里给答题界面直接挂一条通往刷题中心的捷径。 */
    /* ★v20261022c 「返回刷题中心」真正生效：答题发生在 #/drills 路由内，
       直接赋相同 hash 不触发 hashchange（老 bug）——hash 相同就原地重渲染刷题中心。
       全屏类先退全屏；异常时退回 hash 赋值兜底。 */
    function goDrills() {
      try { document.body.classList.remove("kg-dq-full"); document.body.classList.remove("kg-sq-wide"); } catch (e) {}
      try {
        window.__kgBackAt = Date.now();
        if (String(location.hash || "") !== "#/drills") { location.hash = "#/drills"; return; }
        const pb = document.getElementById("pageBody");
        if (pb && window.MODULES && window.MODULES.drills && window.MODULES.drills.render) {
          window.MODULES.drills.render(pb);
          try { window.setActiveNav && window.setActiveNav("drills"); } catch (er) {}
        } else { location.reload(); }
      } catch (e) { try { location.hash = "#/drills"; } catch (e2) {} }
    }
    function baseOpt(back) {
      return {
        returnLabel: "‹ 返回知识点",
        returnAction: back,
        homeLabel: "🏠 返回刷题中心",
        homeAction: goDrills
      };
    }
    function startRandom(n, per) {
      const opt = baseOpt(() => { try { host.remove(); } catch (e) {} });
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
  /* ★v20261024j 给 x5000 树每个节点补稳定 id（x5.zl.0.1…）：原数据节点没有 id，
     刷题中心的「刷题进度/继续刷」按 node.id 存取 —— 没有 id 全部挤进 undefined 一条记录。 */
  function tagIds(node, prefix) {
    if (!node) return;
    if (!node.id) node.id = prefix;
    (node.children || []).forEach((c, i) => tagIds(c, prefix + "." + i));
  }
  function drillsSubjects() {
    const out = [];
    const X = getX();
    [["zl", "行测5000题·资料分析"], ["sl", "行测5000题·数量关系"]].forEach(([k, name]) => {
      const b = X[k];
      if (!b || !b.tree) return;
      tagIds(b.tree, "x5." + k);
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
