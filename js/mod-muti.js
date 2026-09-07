/* 模块：母题特训（本地：C:\Users\28621\Desktop\政治理论）
   支持「章节顺序」与「随机打乱」两种展示；开始练习接入通用答题引擎，
   自动获得写题计时与手写标注。资料由本地 PDF 解析生成（见 tools/build_muti.py）。 */
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
        <div class="row" style="margin-top:6px">
          <label class="fld" style="margin:0 4px 0 0">展示方式</label>
          <select id="mode" style="width:150px">
            <option value="chapter">按章节顺序</option>
            <option value="shuffle">随机打乱</option>
          </select>
          <label class="fld" style="margin:0 4px 0 0">题数(5-20)</label>
          <input id="qcount" type="number" min="5" max="20" value="10" style="width:64px">
          <button class="btn primary" id="start">开始练习</button>
          <button class="btn" id="refresh">🔄 刷新</button>
          <button class="btn" id="doneBtn">📋 已做过的题目</button>
          <span id="mutiTime" class="muted small"></span>
        </div>
        <div class="muted small" style="margin-top:8px">
          资料来自本地目录 <code>C:\\Users\\28621\\Desktop\\政治理论</code> 的 PDF，已自动解析为 <b>${totalQuestionsHint()}</b> 道母题。
          可选择按章节顺序或随机打乱练习，每题均支持手写标注与计时。新增 PDF 后重新运行 <code>tools/build_muti.py</code> 并刷新即可更新。
        </div>
      </div>
      <div id="mutiList" class="arc-list"></div>
    </div>`));

    const list = body.querySelector("#mutiList");
    const timeEl = body.querySelector("#mutiTime");

    function load() {
      const data = window.MUTI;
      if (!data || !data.chapters) {
        list.innerHTML = `<div class="muted">暂时没有资料（先在本地同步网盘「全部文件/政治理论」并运行解析脚本）。</div>`;
        return;
      }
      timeEl.textContent = "最后更新：" + (data.updatedAt || "—") + "　共 " + data.chapters.length + " 章 / " + totalQuestions(data) + " 题";
      list.innerHTML = data.chapters.map((d, i) => {
        const qs = (d.questions || []).map((q, qi) => `
          <div class="arc-q">
            <div class="arc-q-title">${i + 1}.${qi + 1} ${UI.esc(q.q)}</div>
            <div class="arc-opts">
              ${q.options.map((o, oi) => `<span class="arc-opt ${oi === q.a ? "right" : ""}">${String.fromCharCode(65 + oi)}. ${UI.esc(o)}${oi === q.a ? " ✓" : ""}</span>`).join("")}
            </div>
            ${q.e ? `<div class="arc-an"><b>解析：</b>${UI.esc(q.e)}</div>` : ""}
          </div>`).join("");
        return `<div class="arc-item">
          <div class="arc-item-head" data-i="${i}">
            <span class="arc-month">第 ${i + 1} 章</span>
            <span class="arc-name">${UI.esc(d.name || "")}</span>
            <span class="arc-file">📄 ${UI.esc(d.file || "")}</span>
            <span class="arc-toggle">展开 ▾</span>
          </div>
          <div class="arc-body" style="display:none">
            ${d.text ? `<div class="arc-text">${UI.esc(d.text)}</div>` : ""}
            ${qs ? `<div class="arc-qs"><h4 style="margin:10px 0 6px">本章题目（${d.questions.length}）</h4>${qs}</div>` : ""}
          </div>
        </div>`;
      }).join("");

      list.querySelectorAll(".arc-item-head").forEach(h => {
        h.onclick = () => {
          const b = h.nextElementSibling;
          const open = b.style.display !== "none";
          b.style.display = open ? "none" : "block";
          h.querySelector(".arc-toggle").textContent = open ? "展开 ▾" : "收起 ▴";
        };
      });
    }

    function collect(mode, count) {
      const data = window.MUTI;
      if (!data || !data.chapters) { UI.toast("暂无资料"); return null; }
      let qs = [];
      data.chapters.forEach(c => (c.questions || []).forEach(q => qs.push(q)));
      if (!qs.length) { UI.toast("该资料暂无题目"); return null; }
      if (mode === "shuffle") qs = shuffle(qs);
      // 取值范围 5-20；随机抽取 count 道（避免每次都是前 N 道）
      count = Math.max(5, Math.min(20, count || 10));
      if (qs.length > count) {
        const picked = [], used = new Set();
        while (picked.length < count && used.size < qs.length) {
          const i = Math.floor(Math.random() * qs.length);
          if (used.has(i)) continue; used.add(i); picked.push(qs[i]);
        }
        qs = picked;
      }
      return qs;
    }

    function recordHistory(qs, r) {
      const items = qs.map(q => ({ q: q.q, options: (q.options || []).slice(), a: (typeof q.a === "string" ? q.a.charCodeAt(0) - 65 : q.a), e: q.e || "" }));
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
          const host = UI.el(`<div class="kp-quiz" style="max-height:68vh;overflow:auto"></div>`);
          UI.modal({ title: "母题特训 · 复习 (" + h.date + ")", body: host, width: "720px", actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }] });
          function run() { host.innerHTML = ""; window.Quiz.start(host, qs, SUBJECT, { mode: "memorize", onAgain: run }); }
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

    body.querySelector("#start").onclick = () => {
      const mode = body.querySelector("#mode").value;
      const count = parseInt(body.querySelector("#qcount").value, 10);
      const qs = collect(mode, count);
      if (!qs) return;
      window.Quiz.start(list, qs, SUBJECT, { onAgain: () => body.querySelector("#start").click(), onDone: (r) => recordHistory(qs, r) });
    };
    body.querySelector("#doneBtn").onclick = openHistory;
    body.querySelector("#refresh").onclick = () => {
      UI.toast("正在刷新…");
      const url = "assets/data/muti.js?t=" + Date.now();
      fetch(url).then(r => r.text()).then(() => {
        const s = document.createElement("script");
        s.src = url; s.onload = () => { load(); UI.toast("已刷新"); };
        document.body.appendChild(s);
      }).catch(() => UI.toast("刷新失败，请确认已同步并解析"));
    };

    load();
  }

  // app.js 统一按 MODULES[key].render(body) 调用，这里必须暴露 render
  window.MODULES.muti = { render: renderMuti, renderMuti };
})();
