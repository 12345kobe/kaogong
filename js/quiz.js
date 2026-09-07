/* 通用答题引擎：渲染题目、即时反馈、自动收录错题、统计正确率
   通用能力：① 写题计时（总用时 + 各题用时）② 手写标注（Apple Pencil，每题可记笔记）
   两种模式：
     - memorize（背题）：选完立即展示答案与解析（原行为）
     - practice（练题，默认）：先答完全部题目，再点底部「展示答案」统一揭示并跳转错题解析 */
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

      // 计时条
      const timerBar = UI.el(`<div class="quiz-timer">
        <span class="qz-t">⏱ 总用时 00:00</span>
        <span class="qz-hint">${mode === "practice" ? "练题模式：答完本轮再统一看答案" : "背题模式：选完即看答案"} · 含手写标注 · 支持 A/B/C/D 或 1-4 快捷键</span>
      </div>`);
      container.appendChild(timerBar);
      const tLabel = timerBar.querySelector(".qz-t");
      liveTimer = setInterval(() => { tLabel.textContent = "⏱ 总用时 " + fmt((Date.now() - quizStart) / 1000); }, 1000);

      // 练题模式：底部「展示答案」条
      let revealBar = null;
      if (mode === "practice") {
        revealBar = UI.el(`<div class="quiz-reveal-bar" style="display:none">
          <span class="muted small" id="revHint">已全部作答</span>
          <button class="btn primary" id="showAns">🔍 展示答案 / 查看错题解析</button>
        </div>`);
        container.appendChild(revealBar);
      }

      function answeredCount() { return results.filter(r => r !== null).length; }

      function revealCard(qi) {
        const card = container.querySelector(`.quiz-q[data-qi="${qi}"]`);
        if (!card || card.dataset.revealed === "1") return;
        const qq = questions[qi];
        const ua = parseInt(card.dataset.ua, 10);
        const right = ua === qq.a;
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
        if (!right) recordWrong(subject, qq, ua);
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
            if (mode === "practice") {
              // 仅标记选择，不揭示
              optsWrap.querySelectorAll(".opt").forEach(ob => ob.classList.remove("selected"));
              b.classList.add("selected");
              results[qi] = { ua: i, right: null };
              const now = Date.now();
              qTimes[qi] = now - lastAnswer; lastAnswer = now;
              if (answeredCount() === questions.length && revealBar) {
                revealBar.style.display = "flex";
              }
            } else {
              // 背题：立即揭示
              results[qi] = { ua: i, right: i === qq.a };
              revealCard(qi);
              maybeFinish();
            }
          };
          optsWrap.appendChild(b);
        });
        container.appendChild(card);
      });

      if (revealBar) {
        revealBar.querySelector("#showAns").onclick = () => {
          // 揭示全部并结算
          questions.forEach((_, qi) => revealCard(qi));
          revealBar.style.display = "none";
          finish();
        };
      }

      function recordWrong(subject, qq, ua) {
        const arr = DB.state.wrongbook[subject] = DB.state.wrongbook[subject] || [];
        arr.push({ id: DB.uid(), q: qq.q, options: qq.options.slice(), a: qq.a, ua: ua, date: DB.today(), e: qq.e || "", optInfo: qq.optInfo || null, note: "", img: "" });
        DB.save();
        // 自动写入对应模块「待办事项」：X 错题 N 道（复盘后删去）
        autoTodoOnWrong(subject, qq);
      }

      function finish() {
        if (liveTimer) clearInterval(liveTimer);
        if (Quiz._handler) { try { document.removeEventListener("keydown", Quiz._handler); } catch (e) {} Quiz._handler = null; }
        const correct = results.filter(r => r && r.right).length;
        const totalSec = Math.floor((Date.now() - quizStart) / 1000);
        const pct = questions.length ? Math.round(correct / questions.length * 100) : 0;
        // 学习时长
        try {
          const mins = Math.max(1, Math.round(totalSec / 60));
          DB.addTimerMinutes(subject, mins);
          DB.addSubjectSession(subject, mins);
        } catch (e) {}
        // 累计正确率
        try {
          const ac = DB.state.accuracyCumulative = DB.state.accuracyCumulative || {};
          ac[subject] = ac[subject] || { correct: 0, total: 0 };
          ac[subject].correct += correct;
          ac[subject].total += questions.length;
        } catch (e) {}
        try {
          DB.state.accuracy = DB.state.accuracy || [];
          DB.state.accuracy.push({ date: DB.today(), subject: subject, pct: pct });
          if (DB.state.accuracy.length > 500) DB.state.accuracy = DB.state.accuracy.slice(-500);
          DB.save();
        } catch (e) {}
        const breakdown = questions.map((qq, qi) => {
          const t = qTimes[qi] ? fmt(qTimes[qi] / 1000) : "—";
          return `<div class="qz-row"><span>第 ${qi + 1} 题</span><span class="${qTimes[qi] ? "" : "muted"}">${t}</span></div>`;
        }).join("");
        const bar = UI.el(`<div class="card center" style="margin-top:6px">
          <div style="font-size:22px" class="pct">本次正确率 ${pct}%</div>
          <div class="muted small">${correct} / ${questions.length} 题正确 · 错题已自动收入「${UI.esc(subject)}」错题本</div>
          <div class="qz-summary">
            <div class="qz-total">⏱ 总用时 <b>${fmt(totalSec)}</b></div>
            <div class="qz-detail"><div class="qz-detail-title">各题用时</div>${breakdown}</div>
          </div>
          <div class="row" style="justify-content:center;margin-top:10px">
            <button class="btn" id="expWrong">导出错题PDF</button>
            <button class="btn primary" id="again">再来一组</button>
          </div></div>`);
        container.appendChild(bar);
        bar.querySelector("#expWrong").onclick = () => window.PDF.exportWrong(subject);
        bar.querySelector("#again").onclick = () => opts.onAgain ? opts.onAgain() : location.reload();
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
      const wrongs = (DB.state.wrongbook[subject] || []).slice(-50);
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
