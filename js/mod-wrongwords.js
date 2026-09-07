/* 模块：错词本（言语 700词释义练习答错的词）
   - 自动收集「词语释义练习」中答错的词
   - 列表展示：词语 / 正确释义 / 例句 / 首次错误日期 / 复习次数 / 连续答对
   - 复习：按「释义四选一」重新作答，累计答对 2 次自动消除
   - 支持导出 PDF
*/
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};
  const UI = window.UI, DB = window.DB;
  const SUBJECT = "言语";
  const BATCH = 10;

  function buildPool() {
    return (window.IDIOM_DATA || []).map(w => ({
      word: w.word,
      def: w.def || "",
      ex: (w.example || "").replace(/～/g, w.word),
      examples: w.examples || [],
      group: w.group || ""
    })).filter(w => w.word && w.def);
  }
  const POOL = buildPool();

  function shuffle(a) {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[r[i], r[j]] = [r[j], r[i]]; }
    return r;
  }
  function sim(a, b) {
    const sa = new Set((a.def || "").split(""));
    const sb = new Set((b.def || "").split(""));
    if (!sa.size || !sb.size) return 0;
    let inter = 0; sa.forEach(c => { if (sb.has(c)) inter++; });
    const union = sa.size + sb.size - inter;
    return union ? inter / union : 0;
  }
  function pickDistractors(target, n) {
    const used = new Set([target.word]);
    const chosen = [];
    const same = shuffle(POOL.filter(w => w.word !== target.word && w.group === target.group && w.def !== target.def));
    for (const w of same) { if (chosen.length >= n) break; if (!used.has(w.word)) { chosen.push(w); used.add(w.word); } }
    if (chosen.length < n) {
      const ranked = POOL.filter(w => !used.has(w.word) && w.def !== target.def)
        .map(w => ({ w, s: sim(target, w) })).sort((x, y) => y.s - x.s);
      for (const r of ranked) { if (chosen.length >= n) break; if (!used.has(r.w.word)) { chosen.push(r.w); used.add(r.w.word); } }
    }
    return chosen;
  }
  function makeQ(item) {
    const target = { word: item.word, def: item.def, ex: item.ex, group: item.group };
    const ds = pickDistractors(target, 3);
    const all = shuffle([target, ...ds]);
    const opts = all.map(w => w.def);
    return {
      q: "「" + item.word + "」的意思是：",
      options: opts,
      a: opts.indexOf(item.def),
      e: (item.def || "") + (item.ex ? "\n例句：" + item.ex : ""),
      word: item.word,
      optInfo: all.map(w => ({ word: w.word, def: w.def, ex: (w.examples && w.examples[0]) || w.ex || "" }))
    };
  }

  function getList() { return DB.state.wrongwords = DB.state.wrongwords || []; }

  window.MODULES.wrongwords = {
    title: "错词本", icon: "wrongwords",
    render(body) {
      const list = getList();

      const card = UI.el(`<div class="card">
        <h3>📗 错词本（词语释义）</h3>
        <div class="muted small">「言语理解 → 词语释义练习」中答错的词会自动汇集到这里。可随时复习（释义四选一），<b>累计答对 2 次自动消除</b>。</div>
        <div id="wwStats" class="eb-stats" style="margin:10px 0"></div>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <button class="btn primary" id="wwReview">▶ 开始复习（${Math.min(BATCH, list.length)}词）</button>
          <button class="btn" id="wwExp">📄 导出PDF</button>
          <button class="btn" id="wwBrowse">📖 浏览全部700词</button>
          <label class="row" style="gap:6px;align-items:center;font-size:13px;color:var(--txt2)"><input type="checkbox" id="wwShuf" checked/> 打乱顺序</label>
          <button class="btn ghost" id="wwClear">清空错词本</button>
        </div>
        <div id="wwList" style="display:flex;flex-direction:column;gap:10px"></div>
      </div>`);
      body.appendChild(card);

      function renderStats() {
        const arr = getList();
        const due = arr.filter(w => (w.correctStreak || 0) === 0).length;
        const near = arr.filter(w => (w.correctStreak || 0) === 1).length;
        card.querySelector("#wwStats").innerHTML = `
          <div class="eb-stat"><span class="n">${arr.length}</span><span class="l">错词总数</span></div>
          <div class="eb-stat"><span class="n">${due}</span><span class="l">待复习</span></div>
          <div class="eb-stat"><span class="n">${near}</span><span class="l">答对1次(再1次消除)</span></div>`;
      }

      function renderList() {
        const arr = getList();
        const box = card.querySelector("#wwList");
        if (!arr.length) {
          box.innerHTML = `<div class="empty">暂无错词 🎉 去「言语理解 → 词语释义练习」练几组吧</div>`;
          renderStats();
          return;
        }
        box.innerHTML = "";
        arr.slice().reverse().forEach(it => {
          const row = UI.el(`<div class="todo" style="flex-direction:column;align-items:flex-start;gap:6px">
            <div><span class="chip">${UI.esc(it.date || "")}</span> <b style="font-size:15px">${UI.esc(it.word)}</b>
              <span class="muted small">${it.group ? UI.esc(it.group) + " · " : ""}已复习 ${it.reviewCount || 0} 次 · 连续答对 ${it.correctStreak || 0}/2</span></div>
            <div class="small" style="color:#34e7e4">释义：${UI.esc(it.def || "")}</div>
            ${it.ex ? `<div class="small" style="color:#9fb0d8">例句：${UI.esc(it.ex)}</div>` : ""}
            <input placeholder="笔记…" value="${UI.esc(it.note || "")}" data-note="${it.id}" style="font-size:13px"/>
            <button class="del" data-del="${it.id}" style="border:none;background:none;color:#ff6b81">删除</button>
          </div>`);
          box.appendChild(row);
        });
        box.querySelectorAll("[data-note]").forEach(inp => inp.onchange = e => {
          const it = getList().find(x => x.id === inp.dataset.note);
          if (it) { it.note = e.target.value; DB.save(); }
        });
        box.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
          DB.state.wrongwords = getList().filter(x => x.id !== b.dataset.del);
          DB.save(); renderList();
        });
        renderStats();
      }

      card.querySelector("#wwReview").onclick = () => {
        const arr = getList();
        if (!arr.length) { UI.toast("暂无错词"); return; }
        const shuf = card.querySelector("#wwShuf").checked;
        const batch = (shuf ? shuffle(arr) : arr).slice(0, BATCH);
        const qs = batch.map(makeQ);
        const host = card.querySelector("#wwList");
        window.Quiz.start(host, qs, SUBJECT, {
          onAnswer: (qq, correct) => {
            const it = getList().find(x => x.word === qq.word);
            if (!it) return;
            it.reviewCount = (it.reviewCount || 0) + 1;
            it.correctStreak = correct ? (it.correctStreak || 0) + 1 : 0;
            DB.save();
          },
          onDone: () => {
            const before = getList().length;
            DB.state.wrongwords = getList().filter(x => (x.correctStreak || 0) < 2);
            const removed = before - DB.state.wrongwords.length;
            DB.save();
            if (removed) UI.toast(`🎉 已消除 ${removed} 个错词（连续答对2次）`);
            renderList();
            card.querySelector("#wwReview").textContent = `▶ 开始复习（${Math.min(BATCH, getList().length)}词）`;
          },
          onAgain: () => card.querySelector("#wwReview").click()
        });
      };

      card.querySelector("#wwExp").onclick = () => {
        const arr = getList();
        if (!arr.length) { UI.toast("暂无错词可导出"); return; }
        const html = arr.map((it, i) => `<div class="item"><b>${i + 1}. ${UI.esc(it.word)}</b>
          <div>释义：${UI.esc(it.def || "")}</div>
          ${it.ex ? `<div class="muted small">例句：${UI.esc(it.ex)}</div>` : ""}
          <div class="muted small">首次错误：${UI.esc(it.date || "")} · 已复习 ${it.reviewCount || 0} 次</div></div>`).join("");
        window.PDF.exportHtml("错词本 · 词语释义（" + arr.length + " 词 · " + DB.today() + "）", html);
      };

      card.querySelector("#wwBrowse").onclick = () => {
        const box = UI.el(`<div></div>`);
        box.innerHTML = `<input id="kw" placeholder="搜索词语 / 释义…" style="margin-bottom:10px"/>
          <div id="lst" style="max-height:55vh;overflow:auto;display:flex;flex-direction:column;gap:8px"></div>`;
        UI.modal({
          title: "700 词库（" + POOL.length + " 词）", body: box, width: "680px",
          actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }]
        });
        function list(kw) {
          const arr = (kw ? POOL.filter(w => w.word.includes(kw) || w.def.includes(kw)) : POOL).slice(0, 200);
          box.querySelector("#lst").innerHTML = arr.map(w => `<div class="todo" style="flex-direction:column;align-items:flex-start">
            <div><b>${UI.esc(w.word)}</b> <span class="chip">${UI.esc(w.group || "")}</span></div>
            <div class="small" style="color:#9fb0d8">${UI.esc(w.def)}</div>
            ${w.ex ? `<div class="small">例句：${UI.esc(w.ex)}</div>` : ""}</div>`).join("") || `<div class="empty">无匹配</div>`;
        }
        box.querySelector("#kw").oninput = e => list(e.target.value.trim());
        list("");
      };

      card.querySelector("#wwClear").onclick = async () => {
        if (!getList().length) { UI.toast("错词本已为空"); return; }
        if (await UI.confirm("确定清空错词本？该操作不可恢复。")) {
          DB.state.wrongwords = []; DB.save(); renderList();
          card.querySelector("#wwReview").textContent = "▶ 开始复习（0词）";
          UI.toast("已清空错词本");
        }
      };

      renderList();
    }
  };
})();
