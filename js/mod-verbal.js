/* 模块：言语理解（成语辨析 / 例句挖空 / 艾宾浩斯复习 / 错题） */
(function () {
  window.MODULES = window.MODULES || {};
  const DB = window.DB;
  const SUBJECT = "言语";
  const INTERVALS = [0, 1, 2, 4, 7, 15, 30];

  function buildPool() {
    return (window.IDIOM_DATA || []).map(w => {
      const ex = (w.example || "").replace(/～/g, w.word);
      return {
        word: w.word, def: w.def || "", ex: ex,
        examples: w.examples || [], group: w.group || "", theme: w.theme || "",
        src: w.source, stars: w.stars
      };
    }).filter(w => w.word && w.def); // 有词+释义即可入池（可作干扰项）
  }
  const POOL = buildPool();
  // 只有例句含本词、能挖空出题的词才作为“题干目标”
  const POOL_TARGETS = POOL.filter(w => w.ex && w.ex.includes(w.word));

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // 释义相似度（字符 Jaccard），用于跨组挑选“意思相近”的词
  function sim(a, b) {
    const sa = new Set((a.def || "").split(""));
    const sb = new Set((b.def || "").split(""));
    if (!sa.size || !sb.size) return 0;
    let inter = 0;
    sa.forEach(c => { if (sb.has(c)) inter++; });
    const union = sa.size + sb.size - inter;
    return union ? inter / union : 0;
  }

  /* 剥离「单字字面释义」段（如 "差：尚，稍微。" "博大：广大。精深：精湛深刻。"），只保留「表达意思」。
     规则：冒号前仅 1–2 字（单字拆解）或其后仍紧跟拆解链时剥离；「成语：释义」这类完整释义保留。 */
  function idiomMeaning(def) {
    if (!def) return "";
    let s = def;
    const gloss = /^[（(]?([\u4e00-\u9fff]{1,6})[：:]([^。；]*)[。；]/;
    for (let guard = 0; guard < 12; guard++) {
      const m = s.match(gloss);
      if (!m) break;
      const x = m[1];
      const after = s.slice(m[0].length);
      const isCharGloss = x.length <= 2;
      const nextIsGloss = gloss.test(after);
      if (isCharGloss || nextIsGloss) s = after;
      else break; // X 是词本身且后面不是拆解链 → 「词：释义」保留
    }
    s = s.replace(/^[。；\s]+/, "").replace(/\s+$/, "");
    return s || def;
  }

  /* 停留计时：视图保持 ms 毫秒后触发一次 onFire；返回取消函数 */
  function startDwell(ms, onFire) {
    const t = setTimeout(onFire, ms);
    return () => clearTimeout(t);
  }

  /* 组顺序（按组名里的数字排序，便于「相邻组」取词） */
  function groupOrder() {
    const seen = new Set();
    const gs = [];
    POOL.forEach(w => { if (w.group && !seen.has(w.group)) { seen.add(w.group); gs.push(w.group); } });
    return gs.sort((a, b) => (groupNum(a) - groupNum(b)));
  }
  function groupNum(g) { const m = (g || "").match(/(\d+)/); return m ? +m[1] : 9999; }

  // 选项优先同组；若同组不足，则从其他组按意思相近补充
  function pickDistractors(target, n) {
    const sameGrp = shuffle(POOL.filter(w => w.word !== target.word && w.group === target.group));
    const others = POOL.filter(w => w.word !== target.word && w.group !== target.group);
    const used = new Set([target.word]);
    const chosen = [];
    for (const w of sameGrp) { if (chosen.length >= n) break; if (!used.has(w.word)) { chosen.push(w); used.add(w.word); } }
    if (chosen.length < n) {
      const ranked = others.filter(w => !used.has(w.word))
        .map(w => ({ w, s: sim(target, w) }))
        .sort((x, y) => y.s - x.s);
      for (const r of ranked) { if (chosen.length >= n) break; if (!used.has(r.w.word)) { chosen.push(r.w); used.add(r.w.word); } }
    }
    return chosen;
  }

  function makeQuestion(target) {
    const sentence = target.ex.split(target.word).join("____");
    const distractors = pickDistractors(target, 3);
    const all = shuffle([target, ...distractors]);
    const opts = all.map(w => w.word);
    // 每个选项的释义+例句，供“展示答案时每个词汇都解释”
    const optInfo = all.map(w => ({
      word: w.word,
      def: w.def,
      ex: (w.examples && w.examples[0]) || w.ex || ""
    }));
    return {
      q: "填入恰当的成语：" + sentence,
      options: opts,
      a: opts.indexOf(target.word),
      e: target.def + (target.ex ? "\n例句：" + target.ex : ""),
      word: target.word,
      group: target.group,
      optInfo: optInfo
    };
  }

  function dueWords() {
    const rv = DB.state.reviews.verbal = DB.state.reviews.verbal || {};
    const today = DB.today();
    const due = POOL_TARGETS.filter(w => { const r = rv[w.word]; return !r || r.next <= today; });
    return due.length ? due : POOL_TARGETS;
  }

  function generate(count, reviewMode) {
    const base = reviewMode ? dueWords() : POOL_TARGETS;
    const chosen = [];
    const used = new Set();
    const src = base.slice();
    while (chosen.length < count && src.length) {
      const i = Math.floor(Math.random() * src.length);
      const w = src.splice(i, 1)[0];
      if (used.has(w.word)) continue;
      used.add(w.word); chosen.push(w);
    }
    return chosen.map(makeQuestion);
  }

  function recordReview(word, correct) {
    const rv = DB.state.reviews.verbal = DB.state.reviews.verbal || {};
    const r = rv[word] || { box: 0, next: DB.today() };
    if (correct) { r.box = Math.min(r.box + 1, INTERVALS.length - 1); r.next = addDays(DB.today(), INTERVALS[r.box]); }
    else { r.box = 0; r.next = DB.today(); }
    rv[word] = r; DB.save();
  }
  function addDays(dateStr, n) {
    const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + n);
    return DB.fmtDate(d);
  }

  window.MODULES.verbal = {
    title: "言语理解", icon: "verbal",
    render(body) {
      const DB = window.DB, UI = window.UI;
      UI.StudyPanel("verbal", body);

      const panel = UI.el(`<div class="card"><h3>📚 成语辨析 · 选择题练习</h3>
        <div class="muted small">基于《成语与实词辨析1500词》，将官媒例句关键词挖空成题干。每次练习可选 5–20 题（默认 10），记录正确率，错题自动入「言语」错题本。</div>
        <div class="row" style="margin-top:10px">
          <label class="fld" style="margin:0">题数</label>
          <select id="cnt" style="width:80px">
            ${[5, 8, 10, 12, 15, 20].map(n => `<option ${n === 10 ? "selected" : ""}>${n}</option>`).join("")}
          </select>
          <label class="row" style="margin:0;cursor:pointer"><input type="checkbox" id="rev" style="width:auto"/> 艾宾浩斯复习模式</label>
          <button class="btn primary" id="start">开始练习</button>
          <button class="btn" id="exp">导出错题PDF</button>
          <button class="btn ghost" id="browse">浏览全部成语</button>
        </div>
        <div id="quiz" style="margin-top:14px"></div>
      </div>`);
      body.appendChild(panel);

      panel.querySelector("#start").onclick = () => {
        const count = +panel.querySelector("#cnt").value || 10;
        const review = panel.querySelector("#rev").checked;
        const qs = generate(count, review);
        UI.toast(review ? "复习模式：优先安排待复习词条" : "开始练习");
        window.Quiz.start(panel.querySelector("#quiz"), qs, SUBJECT, {
          onAnswer: (qq, correct) => recordReview(qq.word, correct),
          onAgain: () => panel.querySelector("#start").click()
        });
      };
      panel.querySelector("#exp").onclick = () => window.PDF.exportWrong(SUBJECT);
      panel.querySelector("#browse").onclick = () => browseAll();

      /* ================= 词语释义练习（700词 · 四选一） =================
         每次 10 个词，每词给出 4 个「释义」选项（只有 1 个正确）；
         10 题结束显示正确率 x/10；答错的词自动记入「错词本」模块。      */
      const EBv = window.Ebbinghaus;
      const WD_GROUP = "verbal_def";
      const WD_N = 10;
      const WD_POOL = POOL.filter(w => w.word && w.def);

      function mulberry32(a) {
        return function () {
          a |= 0; a = a + 0x6D2B79F5 | 0;
          let t = Math.imul(a ^ a >>> 15, 1 | a);
          t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
          return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
      }
      function seededShuffle(arr, seed) {
        const rnd = mulberry32(seed >>> 0);
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        return a;
      }

      const wdState = DB.state.verbalDef = DB.state.verbalDef || { seed: 0, ptr: 0, round: 1 };
      if (!wdState.seed) { wdState.seed = (Math.random() * 1e9) | 0; wdState.ptr = 0; wdState.round = 1; }

      function defDeckOrder() { return seededShuffle(WD_POOL.map(w => w.word), wdState.seed); }
      function pickDefGroup() {
        if (!WD_POOL.length) return [];
        let ord = defDeckOrder();
        if (wdState.ptr >= ord.length) {
          wdState.seed = (Math.random() * 1e9) | 0; wdState.ptr = 0;
          wdState.round = (wdState.round || 1) + 1;
          ord = defDeckOrder();
        }
        const words = ord.slice(wdState.ptr, wdState.ptr + WD_N);
        if (words.length < WD_N) words.push(...ord.slice(0, WD_N - words.length));
        wdState.ptr += WD_N;
        DB.save();
        const map = {}; WD_POOL.forEach(w => map[w.word] = w);
        return words.map(w => map[w]).filter(Boolean);
      }

      // 干扰项：优先同组；同组不足时按「相邻组」（组号距离）补充；选项只显示表达意思
      function pickDefDistractors(target, n) {
        const used = new Set([target.word]);
        const chosen = [];
        const tMean = idiomMeaning(target.def);
        const order = groupOrder();
        const gi = order.indexOf(target.group);
        // 1) 同组优先
        const same = shuffle(WD_POOL.filter(w => w.word !== target.word && w.group === target.group && w.def && idiomMeaning(w.def) !== tMean));
        for (const w of same) { if (chosen.length >= n) break; if (!used.has(w.word)) { chosen.push(w); used.add(w.word); } }
        // 2) 相邻组（按与 target 组号的距离，近的优先）
        if (chosen.length < n) {
          const adj = [];
          for (let d = 1; d < order.length && chosen.length < n; d++) {
            [gi - d, gi + d].forEach(idx => { if (idx >= 0 && idx < order.length) adj.push(order[idx]); });
          }
          for (const g of adj) {
            if (chosen.length >= n) break;
            const cands = shuffle(WD_POOL.filter(w => w.word !== target.word && w.group === g && w.def && idiomMeaning(w.def) !== tMean && !used.has(w.word)));
            for (const w of cands) { if (chosen.length >= n) break; if (!used.has(w.word)) { chosen.push(w); used.add(w.word); } }
          }
        }
        return chosen;
      }

      function makeDefQuestion(target) {
        const ds = pickDefDistractors(target, 3);
        const all = shuffle([target, ...ds]);
        const opts = all.map(w => idiomMeaning(w.def)); // 只显示表达意思，不显示字面拆解
        return {
          q: "「" + target.word + "」的意思是：",
          options: opts,
          a: opts.indexOf(idiomMeaning(target.def)),
          e: (target.def || "") + (target.ex ? "\n例句：" + target.ex : ""),
          word: target.word, group: target.group,
          optInfo: all.map(w => ({ word: w.word, def: w.def, ex: (w.examples && w.examples[0]) || w.ex || "" }))
        };
      }

      const wdCard = UI.el(`<div class="card" style="margin-top:16px">
        <h3>📖 词语释义练习（700词 · 四选一）</h3>
        <div class="muted small">每次展示 <b>10 个词</b>，每个词给出 4 个释义选项（A/B/C/D 中只有 1 个正确，干扰项取自同组或意思相近的词）。10 题结束后显示本次正确率（如 5/10），<b>答错的词自动记入「错词本」</b>并按艾宾浩斯安排复习。</div>
        <div id="wdStats" class="eb-stats" style="margin:10px 0"></div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button class="btn primary" id="wdStart">▶ 开始一组（10词）</button>
          <button class="btn" id="wdNext">🔀 下一组</button>
          <button class="btn ghost" id="wdReset">重置进度</button>
        </div>
        <div id="wdQuiz" style="margin-top:14px"></div>
      </div>`);
      body.appendChild(wdCard);

      function renderWdStats() {
        const st = EBv.getStats(WD_GROUP);
        const unrev = Math.max(0, st.total - st.seen);
        const ww = (DB.state.wrongwords || []).length;
        wdCard.querySelector("#wdStats").innerHTML = `
          <div class="eb-stat"><span class="n">${st.seen}/${st.total}</span><span class="l">已复习 / 总词数</span></div>
          <div class="eb-stat"><span class="n">${unrev}</span><span class="l">未复习</span></div>
          <div class="eb-stat"><span class="n">${st.due}</span><span class="l">待复习(到期)</span></div>
          <div class="eb-stat"><span class="n">${st.accuracy}%</span><span class="l">正确率</span></div>
          <div class="eb-stat"><span class="n">${wdState.round || 1}</span><span class="l">轮次</span></div>
          <div class="eb-stat"><span class="n">${ww}</span><span class="l">错词本</span></div>`;
      }

      let wdBatch = [];
      function startDefRound() {
        wdBatch = pickDefGroup();
        if (!wdBatch.length) { UI.toast("词库为空"); return; }
        renderWdStats();
        const qs = wdBatch.map(makeDefQuestion);
        window.Quiz.start(wdCard.querySelector("#wdQuiz"), qs, SUBJECT, {
          mode: "memorize", // 词语释义练习：保持原行为（写一道展示一道），不受全局练题模式影响
          onAnswer: (qq, correct) => {
            // 艾宾浩斯调度（按词）
            EBv.updateAfterReview(WD_GROUP, qq.word, correct);
            // 答错 → 记入错词本
            if (!correct) addWrongWord(qq);
          },
          onDone: ({ correct, total }) => {
            UI.toast(`本次正确率 ${correct}/${total}`);
            renderWdStats();
          },
          onAgain: () => startDefRound()
        });
      }

      function addWrongWord(qq) {
        const arr = DB.state.wrongwords = DB.state.wrongwords || [];
        const exist = arr.find(x => x.word === qq.word);
        if (exist) { exist.reviewCount = (exist.reviewCount || 0); exist.date = DB.today(); DB.save(); return; }
        const src = WD_POOL.find(w => w.word === qq.word) || {};
        arr.push({
          id: DB.uid(), word: qq.word, def: src.def || "", ex: src.ex || "",
          group: src.group || "", date: DB.today(), reviewCount: 0, correctStreak: 0, note: ""
        });
        DB.save();
      }

      wdCard.querySelector("#wdStart").onclick = () => startDefRound();
      wdCard.querySelector("#wdNext").onclick = () => { startDefRound(); UI.toast("已换一组"); };
      wdCard.querySelector("#wdReset").onclick = () => {
        EBv.resetGroup(WD_GROUP);
        DB.state.verbalDef = { seed: (Math.random() * 1e9) | 0, ptr: 0, round: 1 };
        DB.save(); renderWdStats(); UI.toast("已重置词语释义练习进度");
      };
      renderWdStats();

      /* ================= 按组别浏览（点击浏览 → 目录 → 翻书式） =================
         直接从 PDF 提取的文字（window.VERBAL_BOOK），保持原书排版；
         若未提取则回退到词库分组。翻书：进入组别后逐词 prev/next 翻看。 */
      const revG = DB.state.idiomReview = DB.state.idiomReview || {};
      const BOOK = window.VERBAL_BOOK || null;
      const bookGroups = BOOK ? BOOK.groups : groupOrder().map(g => ({
        num: "", name: g, stars: 0,
        words: POOL.filter(w => w.group === g).map(w => ({ word: w.word, def: w.def, example: w.ex || "" }))
      }));
      let bookTimer = null;

      const grpCard = UI.el(`<div class="card" style="margin-top:16px">
        <h3>📖 按组别浏览（翻书式 · 直接提取 PDF 文字）</h3>
        <div class="muted small">点击「点击浏览」进入目录，选择组别后以翻书方式逐词查看（含释义与例句，保持原书排版）。在本组停留满 <b>5 秒</b> 自动记 1 次复习打卡。</div>
        <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn primary" id="openBook">📖 点击浏览</button>
          <span class="muted small">共 ${bookGroups.length} 组 · ${bookGroups.reduce((s, x) => s + x.words.length, 0)} 词${BOOK ? "" : "（PDF 文本未提取，已用词库）"}</span>
        </div>
        <div id="bookHost"></div>
      </div>`);
      body.appendChild(grpCard);
      grpCard.querySelector("#openBook").onclick = () => openBookDir();

      function openBookDir() {
        const box = UI.el(`<div></div>`);
        box.innerHTML = `<input id="kw" placeholder="搜索组别 / 词…" style="margin-bottom:10px"/>
          <div id="dir" style="max-height:56vh;overflow:auto;display:flex;flex-direction:column;gap:6px"></div>`;
        UI.modal({ title: "📑 成语辨析 · 目录（" + bookGroups.length + " 组）", body: box, width: "680px",
          actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => { if (bookTimer) clearTimeout(bookTimer); c(); } }] });
        function render(kw) {
          kw = (kw || "").trim();
          const list = kw ? bookGroups.filter(g => g.name.includes(kw) || g.words.some(w => w.word.includes(kw) || (w.def || "").includes(kw))) : bookGroups;
          box.querySelector("#dir").innerHTML = list.map((g, i) => {
            const gi = bookGroups.indexOf(g);
            const stars = "★".repeat(g.stars || 0);
            return `<button class="book-dir-item" data-i="${gi}">
              ${g.num ? '<span class="book-dir-no">第' + UI.esc(g.num) + '组</span>' : ""}
              <b>${UI.esc(g.name)}</b>${stars ? ' <span class="chip star">${stars}</span>' : ""}
              <span class="muted small">${g.words.length} 词</span></button>`;
          }).join("") || `<div class="empty">无匹配组别</div>`;
          box.querySelectorAll(".book-dir-item").forEach(b => b.onclick = () => openGroupReader(bookGroups[+b.dataset.i]));
        }
        box.querySelector("#kw").oninput = e => render(e.target.value.trim());
        render("");
      }

      function openGroupReader(g) {
        if (bookTimer) { clearTimeout(bookTimer); bookTimer = null; }
        const host = UI.el(`<div class="book-reader"></div>`);
        UI.modal({
          title: "📖 " + UI.esc(g.name) + (g.num ? "（第" + g.num + "组）" : ""),
          body: host, width: "720px",
          actions: [
            { label: "← 目录", cls: "ghost", onClick: (m, c) => { if (bookTimer) clearTimeout(bookTimer); c(); openBookDir(); } },
            { label: "关闭", cls: "ghost", onClick: (m, c) => { if (bookTimer) clearTimeout(bookTimer); c(); } }
          ]
        });
        const words = g.words;
        let wi = 0;
        function renderWord() {
          const w = words[wi];
          const c = revG[w.word] || 0;
          host.innerHTML = `
            <div class="book-page">
              <div class="book-page-head">
                <span class="muted small">${g.num ? "第 " + g.num + " 组 · " : ""}第 ${wi + 1} / ${words.length} 词</span>
                <span class="chip" style="font-size:11px">复习 ${c} 次</span>
              </div>
              <div class="book-word">${UI.esc(w.word)}</div>
              <div class="book-def"><b style="color:var(--cyan)">[${UI.esc(w.word)}]：</b>${UI.esc(w.def || "")}</div>
              ${w.example ? `<div class="book-ex"><b style="color:var(--magenta)">例句：</b>${UI.esc(w.example)}</div>` : ""}
            </div>
            <div class="book-nav">
              <button class="btn" id="prev" ${wi === 0 ? "disabled" : ""}>← 上一词</button>
              <span class="muted small" id="pind">${wi + 1} / ${words.length}</span>
              <button class="btn primary" id="next" ${wi === words.length - 1 ? "disabled" : ""}>下一词 →</button>
            </div>`;
          host.querySelector("#prev").onclick = () => { if (wi > 0) { wi--; renderWord(); } };
          host.querySelector("#next").onclick = () => { if (wi < words.length - 1) { wi++; renderWord(); } };
        }
        renderWord();
        // 停留满 5 秒记本组全部词复习 +1（保留原打卡功能）
        bookTimer = setTimeout(() => {
          words.forEach(w => { revG[w.word] = (revG[w.word] || 0) + 1; });
          DB.save();
          const chip = host.querySelector(".book-page-head .chip");
          if (chip && words[wi]) chip.textContent = "复习 " + (revG[words[wi].word] || 0) + " 次";
          UI.toast("「" + g.name + "」复习 +1（" + words.length + " 词）");
          bookTimer = null;
        }, 5000);
      }

      function browseAll() {
        const box = UI.el(`<div></div>`);
        box.innerHTML = `<input id="kw" placeholder="搜索成语 / 释义…" style="margin-bottom:10px"/>
          <div id="lst" style="max-height:55vh;overflow:auto;display:flex;flex-direction:column;gap:8px"></div>`;
        UI.modal({ title: "成语库（" + POOL.length + " 条可读例句）", body: box, width: "680px",
          actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }] });
        function list(kw) {
          const arr = (kw ? POOL.filter(w => w.word.includes(kw) || (w.def || "").includes(kw)) : POOL).slice(0, 200);
          box.querySelector("#lst").innerHTML = arr.map(w => `<div class="todo" style="flex-direction:column;align-items:flex-start">
            <div><b>${UI.esc(w.word)}</b> ${w.stars ? '<span class="chip star' + w.stars + '">' + "★".repeat(w.stars) + "</span>" : ""}</div>
            <div class="small" style="color:#9fb0d8">${UI.esc(w.def)}</div>
            <div class="small">例句：${UI.esc(w.ex)}</div></div>`).join("") || `<div class="empty">无匹配</div>`;
        }
        box.querySelector("#kw").oninput = e => list(e.target.value.trim());
        list("");
      }
    }
  };
})();
