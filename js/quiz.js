/* 通用答题引擎：渲染题目、即时反馈、自动收录错题、统计正确率
   通用能力：① 写题计时（总用时 + 各题用时）② 手写标注（Apple Pencil，每题可记笔记）
   两种模式（顶部可切换，默认练题）：
     - practice（练题）：先答完全部题目，再点左下角固定「交卷」统一揭示；
       未答完点交卷会提醒并定位（滚动+高亮）到第一道未答题目。
     - memorize（背题）：选完立即展示答案与解析。
   错题看答案仍不懂：可点「🤖 没看懂？询问 AI」，把题目整理成结构化文本填入 AI 输入框。 */
(function () {
  "use strict";
  const DB = window.DB, UI = window.UI;
  const A = i => String.fromCharCode(65 + i);
  const nl2br = s => (s == null ? "" : UI.esc(s)).replace(/\n/g, "<br>");

  // 稳定的题目 ID（用于手写笔记持久化，同一道题跨会话可复用）
  function hashId(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return h.toString(36); }
  function fmt(sec) { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0"); }

  const Quiz = {
    start(container, questions, subject, opts) {
      opts = opts || {};
      // 模式：优先 opts.mode，否则全局设置，默认 practice（练题）
      const mode = opts.mode || (DB.state.settings && DB.state.settings.quizMode) || "practice";
      if (Quiz._handler) { try { document.removeEventListener("keydown", Quiz._handler); } catch (e) {} Quiz._handler = null; }
      if (Quiz._timer) { try { clearInterval(Quiz._timer); } catch (e) {} Quiz._timer = null; }
      Quiz._answered = 0;

      // ===== 模式选择条：练题 / 背题（默认练题） =====
      const modeBar = UI.el(`<div class="quiz-modebar">
        <span class="qz-mlabel">模式</span>
        <button class="qm-chip" data-m="practice">📝 练题</button>
        <button class="qm-chip" data-m="memorize">📖 背题</button>
        <span class="qz-mhint">练题＝全部答完再交卷；背题＝选完立即看答案</span>
      </div>`);
      container.appendChild(modeBar);
      modeBar.querySelectorAll(".qm-chip").forEach(b => {
        b.classList.toggle("on", b.dataset.m === mode);
        b.onclick = () => {
          const nm = b.dataset.m;
          if (nm === mode) return;
          const go = () => {
            try { DB.state.settings = DB.state.settings || {}; DB.state.settings.quizMode = nm; DB.save(); } catch (e) {}
            Quiz.start(container, questions, subject, Object.assign({}, opts, { mode: nm }));
          };
          if (Quiz._answered > 0) {
            let p = null;
            try { p = UI.confirm("切换模式会重新开始本组题目，确定吗？"); } catch (e) { p = null; }
            if (p && typeof p.then === "function") { p.then(ok => { if (ok) go(); }); }
            else if (window.confirm("切换模式会重新开始本组题目，确定吗？")) go();
          } else go();
        };
      });

      // ===== 计时 =====
      const quizStart = Date.now();
      let lastAnswer = quizStart;
      const qTimes = new Array(questions.length).fill(0);
      let liveTimer = null;

      const keyHandler = (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const k = (e.key || "").toLowerCase();
        const map = { a: 0, b: 1, c: 2, d: 3, "1": 0, "2": 1, "3": 2, "4": 3 };
        if (!(k in map)) return;
        const card = container.querySelector('.quiz-q[data-done="0"]');
        if (!card) return;
        const ob = card.querySelectorAll(".opt")[map[k]];
        if (ob) ob.click();
      };
      Quiz._handler = keyHandler;
      document.addEventListener("keydown", keyHandler);

      const results = new Array(questions.length).fill(null); // {ua, right}
      container.innerHTML = "";
      // 模式条重建（上面 innerHTML 清空会丢掉它）
      container.appendChild(modeBar);

      // 计时条
      const timerBar = UI.el(`<div class="quiz-timer">
        <span class="qz-t">⏱ 总用时 00:00</span>
        <span class="qz-hint">${mode === "practice" ? "练题模式：答完本轮再交卷" : "背题模式：选完即看答案"} · 含手写标注 · 支持 A/B/C/D 或 1-4 快捷键</span>
      </div>`);
      container.appendChild(timerBar);
      const tLabel = timerBar.querySelector(".qz-t");
      liveTimer = setInterval(() => { tLabel.textContent = "⏱ 总用时 " + fmt((Date.now() - quizStart) / 1000); }, 1000);
      Quiz._timer = liveTimer;

      // 练题模式：左下角固定「交卷」按钮（未答完会提醒并定位到未答题目）
      let revealBar = null;
      function updateSubmitHint() {
        if (!revealBar) return;
        const h = revealBar.querySelector("#revHint");
        if (h) h.textContent = `已答 ${answeredCount()}/${questions.length}` + (answeredCount() === questions.length ? " · 可交卷" : "");
      }
      if (mode === "practice") {
        revealBar = UI.el(`<div class="quiz-submit">
          <button class="btn primary" id="showAns">📄 交卷</button>
          <span class="muted small" id="revHint"></span>
        </div>`);
        container.appendChild(revealBar);
        revealBar.querySelector("#showAns").onclick = () => {
          const un = [];
          results.forEach((r, qi) => { if (r === null) un.push(qi); });
          if (un.length) {
            UI.toast(`还有 ${un.length} 题未作答，已定位到第 ${un[0] + 1} 题`);
            const c = container.querySelector(`.quiz-q[data-qi="${un[0]}"]`);
            if (c) {
              c.scrollIntoView({ behavior: "smooth", block: "center" });
              c.classList.add("qz-flash");
              setTimeout(() => c.classList.remove("qz-flash"), 1800);
            }
            return;
          }
          questions.forEach((_, qi) => revealCard(qi));
          if (revealBar) revealBar.style.display = "none";
          finish();
        };
        updateSubmitHint();
      }

      function answeredCount() { return results.filter(r => r !== null).length; }

      /* ===== 把错题整理成 AI 看得懂的结构化文本，填入 AI 输入框 ===== */
      function askAI(qq, ua) {
        const optsTxt = (qq.options || []).map((o, i) => A(i) + ". " + (o == null ? "" : o)).join("\n");
        const myAns = (ua === undefined || ua === null || isNaN(ua)) ? "未作答" : A(ua);
        const txt =
          `【科目】${subject}\n` +
          `【题目】${qq.q || ""}\n` +
          (optsTxt ? `【选项】\n${optsTxt}\n` : "") +
          `【我的答案】${myAns}\n` +
          `【正确答案】${A(qq.a)}\n` +
          (qq.e ? `【解析】${qq.e}\n` : "") +
          `\n我看了解析还是没弄懂，请用通俗的方式一步步讲清楚：这道题的考点是什么、正确选项为什么对、我的思路错在哪里。\n我的疑惑点：（请在这里补充）`;
        try {
          if (window.KGAI && window.KGAI.ask) { window.KGAI.ask(txt); }
          else { UI.toast("AI 模块未就绪"); }
        } catch (e) { UI.toast("跳转 AI 失败：" + e.message); }
      }

      function revealCard(qi) {
        const card = container.querySelector(`.quiz-q[data-qi="${qi}"]`);
        if (!card || card.dataset.revealed === "1") return;
        const qq = questions[qi];
        const ua = parseInt(card.dataset.ua, 10);
        const right = ua === qq.a;
        // 关键：把判定结果写回 results，否则 practice（练题）模式下 finish() 统计恒为 0 正确
        results[qi] = { ua: ua, right: right };
        card.dataset.revealed = "1"; card.dataset.done = "1";
        card.querySelectorAll(".opt").forEach((ob, oi) => {
          ob.classList.add("dim");
          if (oi === qq.a) ob.classList.add("correct");
        });
        const sel = card.querySelector(".opt.selected");
        if (sel && !right) sel.classList.add("wrong");
        const exp = card.querySelector(".exp");
        exp.style.display = "block";
        let html = (right ? "✅ <b>回答正确！</b>" : "❌ <b>回答错误。</b> 正确答案：" + A(qq.a) + ". " + nl2br(qq.options[qq.a]));
        if (qq.optInfo && qq.optInfo.length) {
          html += '<div class="opt-exps">';
          qq.optInfo.forEach((oi, oi2) => {
            const isCorrect = oi2 === qq.a;
            html += '<div class="opt-exp' + (isCorrect ? " ok" : "") + '">'
              + '<div class="oe-head"><b>' + A(oi2) + ". " + nl2br(oi.word) + "</b>"
              + (isCorrect ? ' <span class="oe-tag">正确答案</span>' : "")
              + "</div>"
              + '<div class="oe-def">释义：' + nl2br(oi.def || "") + "</div>"
              + (oi.ex ? '<div class="oe-ex">例：' + nl2br(oi.ex) + "</div>" : "")
              + "</div>";
          });
          html += "</div>";
        } else if (qq.e) {
          html += "<br>" + nl2br(qq.e);
        }
        exp.innerHTML = html;
        if (!right) {
          recordWrong(subject, qq, ua);
          const askWrap = UI.el(`<div class="qz-ask"><button class="btn ghost sm ask-ai">🤖 没看懂？询问 AI</button></div>`);
          exp.appendChild(askWrap);
          askWrap.querySelector(".ask-ai").onclick = () => askAI(qq, ua);
        }
        if (opts.onAnswer) opts.onAnswer(qq, right);
      }

      function maybeFinish() {
        if (answeredCount() === questions.length) finish();
      }

      questions.forEach((qq, qi) => {
        const qid = hashId(subject + "|" + qq.q);
        const hasNote = !!(DB.state.notes && DB.state.notes[subject] && DB.state.notes[subject][qid] && DB.state.notes[subject][qid].length);
        const card = UI.el(`<div class="quiz-q" data-done="0" data-qi="${qi}">
          <div class="q-head">
            <span class="tag">第 ${qi + 1} 题</span>
            <span class="q-time muted small" style="margin-left:auto"></span>
            <button class="pen-btn ${hasNote ? "has" : ""}" title="手写标注（Apple Pencil）">✏️${hasNote ? "•" : ""}</button>
          </div>
          <div class="q">${nl2br(qq.q)}</div>
          <div class="opts"></div>
          <div class="exp" style="display:none"></div></div>`);
        const optsWrap = card.querySelector(".opts");

        card.querySelector(".pen-btn").onclick = () => UI.Handwriting.open(subject, qid, qq.q, () => {
          const has = !!(DB.state.notes && DB.state.notes[subject] && DB.state.notes[subject][qid] && DB.state.notes[subject][qid].length);
          const b = card.querySelector(".pen-btn");
          b.classList.toggle("has", has);
          b.textContent = "✏️" + (has ? "•" : "");
        });

        qq.options.forEach((o, i) => {
          const b = UI.el(`<button class="opt">${A(i)}. ${nl2br(o)}</button>`);
          b.onclick = () => {
            if (card.dataset.done === "1") return;
            card.dataset.ua = i;
            const now = Date.now();
            // 每道题用时（自上一题作答以来的时间，首题自开始计时）
            qTimes[qi] = now - lastAnswer; lastAnswer = now;
            const qtEl = card.querySelector(".q-time");
            if (qtEl) qtEl.textContent = "⏱ 用时 " + fmt(qTimes[qi] / 1000);
            if (mode === "practice") {
              // 仅标记选择，不揭示
              optsWrap.querySelectorAll(".opt").forEach(ob => ob.classList.remove("selected"));
              b.classList.add("selected");
              results[qi] = { ua: i, right: null };
              Quiz._answered = answeredCount();
              updateSubmitHint();
            } else {
              // 背题：立即揭示
              results[qi] = { ua: i, right: i === qq.a };
              Quiz._answered = answeredCount();
              revealCard(qi);
              maybeFinish();
            }
          };
          optsWrap.appendChild(b);
        });
        container.appendChild(card);
      });

      function recordWrong(subject, qq, ua) {
        const arr = DB.state.wrongbook[subject] = DB.state.wrongbook[subject] || [];
        arr.push({ id: DB.uid(), q: qq.q, options: qq.options.slice(), a: qq.a, ua: ua, date: DB.today(), e: qq.e || "", optInfo: qq.optInfo || null, note: "", img: "" });
        DB.save();
        // 自动写入对应模块「待办事项」：X 错题 N 道（复盘后删去）
        autoTodoOnWrong(subject, qq);
      }

      function finish() {
        if (liveTimer) clearInterval(liveTimer);
        if (Quiz._timer) { try { clearInterval(Quiz._timer); } catch (e) {} Quiz._timer = null; }
        if (Quiz._handler) { try { document.removeEventListener("keydown", Quiz._handler); } catch (e) {} Quiz._handler = null; }
        const correct = results.filter(r => r && r.right).length;
        const totalSec = Math.floor((Date.now() - quizStart) / 1000);
        const pct = questions.length ? Math.round(correct / questions.length * 100) : 0;
        // 学习时长
        try {
          const mins = Math.max(1, Math.round(totalSec / 60));
          DB.addTimerMinutes(subject, mins);
          DB.addSubjectSession(subject, mins);
          DB.autoPlanRecord("quiz", subject, { text: subject + "刷题 " + questions.length + " 题 · 正确率 " + pct + "%", pct: pct, count: questions.length });
        } catch (e) {}
        // 累计正确率（统一走 DB.recordAccuracy，subjectShort 归一，保证与学习统计一一对应）
        try {
          DB.recordAccuracy(subject, correct, questions.length);
        } catch (e) {}
        try {
          DB.state.accuracy = DB.state.accuracy || [];
          DB.state.accuracy.push({ date: DB.today(), subject: DB.subjectShort(subject), pct: pct });
          if (DB.state.accuracy.length > 500) DB.state.accuracy = DB.state.accuracy.slice(-500);
          DB.save();
        } catch (e) {}
        const breakdown = questions.map((qq, qi) => {
          const t = qTimes[qi] ? fmt(qTimes[qi] / 1000) : "—";
          return `<div class="qz-row"><span>第 ${qi + 1} 题</span><span class="${qTimes[qi] ? "" : "muted"}">${t}</span></div>`;
        }).join("");
        const returnBtn = opts.returnLabel && opts.returnAction
          ? `<button class="btn ghost" id="retBtn">${UI.esc(opts.returnLabel)}</button>` : "";
        const bar = UI.el(`<div class="card center" style="margin-top:6px">
          <div style="font-size:22px" class="pct">本次正确率 ${pct}%</div>
          <div class="muted small">${correct} / ${questions.length} 题正确 · 错题已自动收入「${UI.esc(subject)}」错题本</div>
          <div class="qz-summary">
            <div class="qz-total">⏱ 总用时 <b>${fmt(totalSec)}</b></div>
            <div class="qz-detail"><div class="qz-detail-title">各题用时</div>${breakdown}</div>
          </div>
          <div class="row" style="justify-content:center;margin-top:10px;gap:8px;flex-wrap:wrap">
            <button class="btn" id="expWrong">导出错题PDF</button>
            <button class="btn primary" id="again">再来一组</button>
            ${returnBtn}
          </div></div>`);
        container.appendChild(bar);
        bar.querySelector("#expWrong").onclick = () => window.PDF.exportWrong(subject);
        bar.querySelector("#again").onclick = () => opts.onAgain ? opts.onAgain() : location.reload();
        const retBtn = bar.querySelector("#retBtn");
        if (retBtn && opts.returnAction) retBtn.onclick = () => { try { opts.returnAction(); } catch (e) {} };
        if (opts.onDone) opts.onDone({ correct, total: questions.length, pct, totalSec, qTimes, answers: results, wrong: questions.filter((q, i) => results[i] && !results[i].right) });
      }
    }
  };

  /* 错一题即向对应模块待办写入「X 错题 N 道」；复盘（重做错题并全对）后由模块删去并记录时间 */
  function autoTodoOnWrong(subject, qq) {
    try {
      const map = { "言语": "verbal", "政治": "politics", "常识": "common", "申论": "essay", "资料": "data", "逻辑": "logic", "数量": "quantity" };
      const module = map[subject] || null;
      if (!module) return;
      const todos = DB.state.todos[module] = DB.state.todos[module] || [];
      const n = (DB.state.wrongbook[subject] || []).length;
      const text = `${subject}错题 ${n} 道（待复盘）`;
      const exist = todos.find(t => t.type === "quiz-wrong" && !t.done);
      if (exist) { exist.text = text; exist.day = DB.today(); }
      else todos.push({ id: DB.uid(), type: "quiz-wrong", text, done: false, day: DB.today(), createdAt: Date.now() });
      DB.save();
    } catch (e) {}
  }

  window.Quiz = Quiz;
})();
