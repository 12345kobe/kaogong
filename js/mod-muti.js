/* 模块：母题特训（本地：C:\Users\28621\Desktop\政治理论）
   按「遍」练习：先把全部母题练一遍（不重复、整体打乱顺序），练完才开启下一遍；
   中途退出会自动续练（已练的题目会记下，不再重复）。每题均支持手写标注与计时。
   资料由本地 PDF 解析生成（见 tools/build_muti.py）。 */
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
  function totalQuestionsHint() {
    const d = window.MUTI;
    return d && d.chapters ? totalQuestions(d) : 0;
  }

  function renderMuti(body) {
    const UI = window.UI;
    body.appendChild(UI.el(`<div class="card">
      <div class="arc-head">
        <h3>📘 母题特训（本地：政治理论）</h3>
        <div class="row" style="margin-top:6px;gap:8px;flex-wrap:wrap">
          <button class="btn primary" id="start">开始练习</button>
          <button class="btn" id="doneBtn">📋 已做过的题目</button>
          <button class="btn" id="refresh">🔄 刷新</button>
          <span id="mutiTime" class="muted small"></span>
        </div>
        <div id="mutiProgress" class="muted small" style="margin-top:8px"></div>
        <div class="muted small" style="margin-top:8px">
          资料来自本地目录 <code>C:\\Users\\28621\\Desktop\\政治理论</code> 的 PDF，已自动解析为 <b>${totalQuestionsHint()}</b> 道母题。
          <b>按「遍」练习：先把全部母题练一遍（不重复），练完才会开启下一遍，每遍整体打乱顺序；中途退出会自动续练。</b>
          每题均支持手写标注与计时。新增 PDF 后重新运行 <code>tools/build_muti.py</code> 并刷新即可更新。
        </div>
      </div>
      <div id="mutiHost" class="kp-quiz"></div>
    </div>`));

    const timeEl = body.querySelector("#mutiTime");
    const startBtn = body.querySelector("#start");
    const progressEl = body.querySelector("#mutiProgress");
    const host = body.querySelector("#mutiHost");

    /* 全部母题（带稳定 _key：章序号_题序号） */
    function buildAll() {
      const data = window.MUTI;
      const all = [];
      if (data && data.chapters) data.chapters.forEach((c, ci) => (c.questions || []).forEach((q, qi) => { q._key = ci + "_" + qi; all.push(q); }));
      return all;
    }

    function getRound() {
      DB.state.mutiRound = DB.state.mutiRound || { round: 1, done: {} };
      if (typeof DB.state.mutiRound.round !== "number") DB.state.mutiRound.round = 1;
      DB.state.mutiRound.done = DB.state.mutiRound.done || {};
      return DB.state.mutiRound;
    }

    function refreshControls() {
      const all = buildAll();
      const total = all.length;
      const st = getRound();
      const doneKeys = all.filter(q => st.done[q._key]).length;
      timeEl.textContent = "最后更新：" + ((window.MUTI && window.MUTI.updatedAt) || "—") + "　共 " + ((window.MUTI && window.MUTI.chapters) ? window.MUTI.chapters.length : 0) + " 章 / " + total + " 题";
      if (total === 0) { progressEl.textContent = "暂无资料（先在本地同步并运行解析脚本）"; startBtn.textContent = "开始练习"; startBtn.disabled = true; return; }
      startBtn.disabled = false;
      if (doneKeys >= total) {
        progressEl.innerHTML = `🎉 <b>第 ${st.round} 遍已完成！</b> 共 ${total} 题 · 可开启第 ${st.round + 1} 遍`;
        startBtn.textContent = `开启第 ${st.round + 1} 遍`;
      } else if (doneKeys === 0) {
        progressEl.innerHTML = `第 ${st.round} 遍 · 共 ${total} 题，尚未开始`;
        startBtn.textContent = `开始第 ${st.round} 遍`;
      } else {
        progressEl.innerHTML = `第 ${st.round} 遍 · 已练 ${doneKeys}/${total} 题`;
        startBtn.textContent = `继续第 ${st.round} 遍（剩 ${total - doneKeys}）`;
      }
    }

    function startRound() {
      const all = buildAll();
      const st = getRound();
      let remaining = all.filter(q => !st.done[q._key]);
      if (remaining.length === 0) { st.round += 1; st.done = {}; DB.save(); remaining = all.slice(); }
      remaining = shuffle(remaining);
      host.innerHTML = "";
      window.Quiz.start(host, remaining, SUBJECT, {
        onAnswer: (qq) => { if (qq && qq._key) { st.done[qq._key] = true; DB.save(); refreshControls(); } },
        onDone: (r) => { recordHistory(remaining, r); finalizeRound(); },
        onAgain: () => startRound()
      });
      try { host.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
      refreshControls();
    }

    /* 本遍是否全部练完：完成则提醒并开启下一遍 */
    function finalizeRound() {
      const all = buildAll();
      const st = getRound();
      const doneKeys = all.filter(q => st.done[q._key]).length;
      DB.save();
      if (doneKeys >= all.length && all.length > 0) {
        const finishedRound = st.round;
        st.round += 1; st.done = {}; DB.save();
        UI.modal({
          title: "🎉 第 " + finishedRound + " 遍完成",
          body: UI.el(`<div style="line-height:1.8">你已完成 <b>第 ${finishedRound} 遍</b> 全部 ${all.length} 道母题！<br>做错的题目已自动归入「政治」错题本。<br><br>是否开启 <b>第 ${st.round} 遍</b> 练习？</div>`),
          width: "440px",
          actions: [
            { label: "开启第 " + st.round + " 遍", cls: "primary", onClick: (m, c) => { c(); startRound(); } },
            { label: "稍后再说", cls: "ghost", onClick: (m, c) => { c(); refreshControls(); } }
          ]
        });
      }
      refreshControls();
    }

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

    startBtn.onclick = () => startRound();
    body.querySelector("#doneBtn").onclick = openHistory;
    body.querySelector("#refresh").onclick = () => {
      UI.toast("正在刷新…");
      const url = "assets/data/muti.js?t=" + Date.now();
      fetch(url).then(r => r.text()).then(() => {
        const s = document.createElement("script");
        s.src = url; s.onload = () => { host.innerHTML = ""; refreshControls(); UI.toast("已刷新"); };
        document.body.appendChild(s);
      }).catch(() => UI.toast("刷新失败，请确认已同步并解析"));
    };

    refreshControls();
  }

  // app.js 统一按 MODULES[key].render(body) 调用，这里必须暴露 render
  window.MODULES.muti = { render: renderMuti, renderMuti };
})();
