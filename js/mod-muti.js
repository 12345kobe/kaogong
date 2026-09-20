/* 模块：母题特训（本地：C:\Users\28621\Desktop\政治理论）
   - 顶部「混合练习」：跨全部母题按 判断:单选:多选 ≈ 1:1:1 比例抽题，整体打乱；
   - 下方「各本母题」：每一本（章）单独可刷，自主选择题数；
   每题均支持手写标注与计时。资料由本地 PDF 解析生成（见 tools/build_muti.py）。 */
(function () {
  window.MODULES = window.MODULES || {};
  const SUBJECT = "政治"; // 错题归入政治错题本

  function totalQuestions(data) {
    return (data.chapters || []).reduce((n, c) => n + (c.questions ? c.questions.length : 0), 0);
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function clamp(v, lo, hi) { v = Math.floor(v); if (isNaN(v)) v = lo; return Math.max(lo, Math.min(hi, v)); }

  /* 题型推断：多选=答案多字母/多数字串；判断=≤2选项；其余单选 */
  function qType(q) {
    const o = q.options || [];
    const a = q.a;
    if (typeof a === "string" && a.replace(/[^0-9A-Za-z]/g, "").length > 1) return "多选";
    if (o.length <= 2) return "判断";
    return "单选";
  }

  /* 按题型均衡抽题：分组→各自打乱→floor(n/3) 平分→余量轮询补足→合并再打乱 */
  function pickBalanced(allQs, count) {
    count = clamp(count, 1, allQs.length);
    const groups = { "判断": [], "单选": [], "多选": [] };
    allQs.forEach(q => groups[qType(q)].push(q));
    const types = Object.keys(groups).filter(t => groups[t].length > 0);
    if (!types.length) return shuffle(allQs).slice(0, count);
    types.forEach(t => { groups[t] = shuffle(groups[t]); });
    const alloc = {}; types.forEach(t => alloc[t] = 0);
    let remain = count;
    const base = Math.floor(count / types.length);
    types.forEach(t => { const give = Math.min(base, groups[t].length); alloc[t] = give; remain -= give; });
    let ti = 0, guard = 0;
    while (remain > 0 && guard++ < count * 4 + 10) {
      const t = types[ti % types.length];
      if (alloc[t] < groups[t].length) { alloc[t]++; remain--; }
      ti++;
    }
    let out = [];
    types.forEach(t => { out = out.concat(groups[t].slice(0, alloc[t])); });
    return shuffle(out);
  }

  function totalQuestionsHint() {
    const d = window.MUTI;
    return d && d.chapters ? totalQuestions(d) : 0;
  }

  function renderMuti(body) {
    const UI = window.UI;
    const data = window.MUTI;
    const chapters = (data && data.chapters) || [];

    /* 全部母题（带稳定 _key：章序号_题序号） */
    function buildAll() {
      const all = [];
      chapters.forEach((c, ci) => (c.questions || []).forEach((q, qi) => { q._key = ci + "_" + qi; all.push(q); }));
      return all;
    }

    body.appendChild(UI.el(`<div class="card">
      <div class="arc-head">
        <h3>📘 母题特训（本地：政治理论）</h3>
        <div class="row" style="margin-top:6px;gap:8px;flex-wrap:wrap;align-items:center">
          <span class="fld" style="font-weight:700">混合练习（全部题型按 ≈1:1:1 比例，整体打乱）</span>
        </div>
        <div class="row" style="margin-top:6px;gap:8px;flex-wrap:wrap;align-items:center">
          <label class="fld" style="margin:0">题数</label>
          <input id="mixCount" type="number" min="1" max="${totalQuestionsHint() || 1}" value="15" style="width:64px">
          <button class="btn primary" id="mixStart">开始混合练习</button>
          <button class="btn" id="doneBtn">📋 已做过的题目</button>
          <button class="btn" id="refresh">🔄 刷新</button>
          <span id="mutiTime" class="muted small"></span>
        </div>
        <div class="muted small" style="margin-top:8px">
          资料来自本地目录 <code>C:\\Users\\28621\\Desktop\\政治理论</code> 的 PDF，已自动解析为 <b>${totalQuestionsHint()}</b> 道母题（含 <b>${chapters.length}</b> 本）。
          顶部「混合练习」按 判断:单选:多选 ≈ <b>1:1:1</b> 比例抽题并整体打乱；下方可<b>逐本单独刷、自主选择题数</b>。每题均支持手写标注与计时。新增 PDF 后重新运行 <code>tools/build_muti.py</code> 并刷新即可更新。
        </div>
      </div>
      <div id="mutiHost" class="kp-quiz"></div>
    </div>`));

    /* 各本母题列表（单独刷） */
    const listCard = UI.el(`<div class="card"><h3>📚 各本母题（单独刷）</h3><div id="chList" style="display:flex;flex-direction:column;gap:8px;margin-top:8px"></div></div>`);
    body.appendChild(listCard);
    const chList = listCard.querySelector("#chList");

    chapters.forEach((c, ci) => {
      const qs = c.questions || [];
      const cnt = { "判断": 0, "单选": 0, "多选": 0 };
      qs.forEach(q => cnt[qType(q)]++);
      const badge = `<span class="muted small" style="margin-left:6px">单选 ${cnt["单选"]} · 多选 ${cnt["多选"]} · 判断 ${cnt["判断"]}</span>`;
      const row = UI.el(`<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center;padding:8px 10px;border:1px solid #eee;border-radius:8px;background:#fafafa">
        <div style="flex:1;min-width:180px"><b>${UI.esc(c.name)}</b> <span class="muted small">· ${qs.length} 题</span>${badge}</div>
        <label class="fld" style="margin:0">题数</label>
        <input class="ch-count" data-ci="${ci}" type="number" min="1" max="${qs.length || 1}" value="${Math.min(10, qs.length || 1)}" style="width:60px">
        <button class="btn primary sm ch-start" data-ci="${ci}">开始练习</button>
      </div>`);
      chList.appendChild(row);
    });

    const timeEl = body.querySelector("#mutiTime");
    const host = body.querySelector("#mutiHost");
    const mixCount = body.querySelector("#mixCount");
    const mixStart = body.querySelector("#mixStart");

    timeEl.textContent = "最后更新：" + ((data && data.updatedAt) || "—") + "　共 " + chapters.length + " 本 / " + totalQuestionsHint() + " 题";

    function startMixed() {
      const all = buildAll();
      if (!all.length) { UI.toast("暂无资料"); return; }
      const count = clamp(parseInt(mixCount.value, 10), 1, all.length);
      const qs = pickBalanced(all, count);
      host.innerHTML = "";
      window.Quiz.start(host, qs, SUBJECT, {
        onDone: (r) => { recordHistory(qs, r); },
        onAgain: () => startMixed()
      });
      try { host.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
    }

    function startChapter(ci) {
      const c = chapters[ci];
      const qs = (c.questions || []).map((q, qi) => { q._key = ci + "_" + qi; return q; });
      if (!qs.length) { UI.toast("本章暂无题目"); return; }
      const input = chList.querySelector('.ch-count[data-ci="' + ci + '"]');
      const count = clamp(parseInt(input.value, 10), 1, qs.length);
      const picked = shuffle(qs).slice(0, count);
      host.innerHTML = "";
      window.Quiz.start(host, picked, SUBJECT, {
        onDone: (r) => { recordHistory(picked, r); },
        onAgain: () => startChapter(ci)
      });
      try { host.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
    }

    mixStart.onclick = startMixed;
    chList.querySelectorAll(".ch-start").forEach(b => {
      b.onclick = () => startChapter(parseInt(b.getAttribute("data-ci"), 10));
    });

    function recordHistory(qs, r) {
      const items = qs.map(q => ({ q: q.q, options: (q.options || []).slice(), a: q.a, e: q.e || "" }));
      DB.state.mutiHistory = DB.state.mutiHistory || [];
      DB.state.mutiHistory.unshift({ date: DB.today() + " " + DB.fmtTime(new Date()), count: qs.length, correct: r.correct, total: r.total, items });
      DB.save();
      UI.toast("已记录本次练习（" + r.correct + "/" + r.total + "）到「已做过的题目」");
    }

    function openHistory() {
      const hist = DB.state.mutiHistory || [];
      if (!hist.length) { UI.toast("还没有做过的题目"); return; }
      const box = UI.el(`<div style="display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow:auto"></div>`);
      hist.forEach((h, hi) => {
        const row = UI.el(`<div class="todo" style="align-items:flex-start">
          <div style="flex:1">
            <b>${UI.esc(h.date)}</b> <span class="muted small">· ${h.correct}/${h.total} 正确 · ${h.count} 题</span>
            <div class="muted small">${h.items.length} 道题已存档</div>
          </div>
          <button class="btn sm" data-act="review">复习</button>
          <button class="btn sm" data-act="pdf">导出PDF</button>
          <button class="btn sm ghost" data-act="del">删除</button>
        </div>`);
        row.querySelector('[data-act="review"]').onclick = () => {
          const qs = h.items.map(it => ({ q: it.q, options: it.options.slice(), a: it.a, e: it.e || "" }));
          const hhost = UI.el(`<div class="kp-quiz" style="max-height:68vh;overflow:auto"></div>`);
          UI.modal({ title: "母题特训 · 复习 (" + h.date + ")", body: hhost, width: "720px", actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }] });
          function run() { hhost.innerHTML = ""; window.Quiz.start(hhost, qs, SUBJECT, { mode: "memorize", onAgain: run }); }
          run();
        };
        row.querySelector('[data-act="pdf"]').onclick = () => window.PDF.exportWrongList("政治母题特训 · 已做题目 (" + h.date + ")", h.items.map(it => ({ q: it.q, options: it.options.slice(), a: it.a, e: it.e || "" })));
        row.querySelector('[data-act="del"]').onclick = () => {
          DB.state.mutiHistory = (DB.state.mutiHistory || []).filter((_, i) => i !== hi); DB.save(); row.remove();
        };
        box.appendChild(row);
      });
      UI.modal({ title: "📋 已做过的题目（" + hist.length + " 次）", body: box, width: "640px", actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }] });
    }

    body.querySelector("#doneBtn").onclick = openHistory;
    body.querySelector("#refresh").onclick = () => {
      UI.toast("正在刷新…");
      const url = "assets/data/muti.js?t=" + Date.now();
      fetch(url).then(r => r.text()).then(() => {
        const s = document.createElement("script");
        s.src = url; s.onload = () => { host.innerHTML = ""; UI.toast("已刷新"); };
        document.body.appendChild(s);
      }).catch(() => UI.toast("刷新失败，请确认已同步并解析"));
    };
  }

  window.MODULES.muti = { render: renderMuti, renderMuti };
})();
