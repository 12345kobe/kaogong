/* 模块：错题本（按科目分类 / 文字+图片 / 导出PDF / 每日错题复习）
   每日错题复习逻辑：
   - 访问"错题本"页面时，自动检测每天若有错题则在 todos[wrongbook] 生成"X错题复习"待办
   - 点击待办进入复习：默认每次5题，可选打乱或顺序；累计作对2次自动消除
   - 复习完成：更新累计正确率与学习时长，并清掉今日错题复习待办
*/
(function () {
  window.MODULES = window.MODULES || {};
  const SUBJECTS = ["言语", "资料", "逻辑", "政治", "数量", "常识", "申论"];
  const A = i => String.fromCharCode(65 + i);
  const SUBJECT_LABELS = { 言语: "言语理解", 资料: "资料分析", 逻辑: "判断推理", 政治: "政治理论", 数量: "数量关系", 常识: "常识判断", 申论: "申论" };
  const BATCH = 5;  // 每次复习5题

  function countWrong(subject) { return ((window.DB && window.DB.state.wrongbook && window.DB.state.wrongbook[subject]) || []).length; }
  function getWrongs(subject) { return (window.DB.state.wrongbook[subject] || []).slice(); }
  function listSubjectsWithWrongs() {
    return SUBJECTS.filter(s => countWrong(s) > 0);
  }

  /* 生成今日待办（如果还没有） */
  function ensureDailyReviewTodos() {
    const DB = window.DB; if (!DB || !DB.state) return [];
    const today = DB.today();
    const subs = listSubjectsWithWrongs();
    const todos = DB.state.todos["wrongbook"] = DB.state.todos["wrongbook"] || [];
    const added = [];
    subs.forEach(s => {
      const w = countWrong(s);
      const text = `${SUBJECT_LABELS[s]}错题复习（${w}题）`;
      const hasToday = todos.find(t => t.text === text && t.day === today);
      if (!hasToday) {
        const t = { id: DB.uid(), text, done: false, day: today, subject: s, type: "wrong-review" };
        todos.push(t);
        added.push(t);
      }
    });
    if (added.length) DB.save();
    return todos.filter(t => t.type === "wrong-review" && t.day === today);
  }

  /* 把错题题数变化时同步刷新今日待办的"X题"提示 */
  function syncDailyReviewTodos() {
    const DB = window.DB;
    const today = DB.today();
    const todos = DB.state.todos["wrongbook"] || [];
    let dirty = false;
    todos.forEach(t => {
      if (t.type === "wrong-review" && t.day === today && t.subject) {
        const w = countWrong(t.subject);
        const newText = `${SUBJECT_LABELS[t.subject]}错题复习（${w}题）`;
        if (t.text !== newText) { t.text = newText; dirty = true; }
      }
    });
    if (dirty) DB.save();
  }

  /* ===== 错误复习执行 ===== */
  function startWrongReview(subject, body, afterAll, presetItems) {
    const UI = window.UI, DB = window.DB;
    let wrongs = (presetItems && presetItems.length) ? presetItems.slice() : getWrongs(subject);
    if (!wrongs.length) { UI.toast("该范围内暂无错题"); return; }

    // 顺序或打乱？默认按原顺序
    let shuffleMode = false;
    let batchQueue = wrongs.slice();

    function shuffleArr(a) {
      const r = a.slice();
      for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
      return r;
    }

    const host = document.createElement("div");
    host.className = "modal-mask";
    const m = document.createElement("div");
    m.className = "modal";
    m.style.cssText = "width:min(720px,96vw);max-height:90vh;overflow:auto";
    m.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">📕 ${UI.esc(SUBJECT_LABELS[subject])}错题复习（${wrongs.length}题）</h2>
        <div>
          <button class="btn ghost" id="goHome">← 返回主页面</button>
        </div>
      </div>
      <div class="row" style="margin:8px 0;flex-wrap:wrap;gap:8px">
        <label><input type="checkbox" id="shuf"/> 打乱顺序</label>
        <span class="muted small">每次${BATCH}题（小于则全部） · 累计答对2次自动消除</span>
      </div>
      <div id="review-host"></div>`;
    host.appendChild(m);
    document.getElementById("modalRoot").appendChild(host);
    host.querySelector("#goHome").onclick = () => goHome();
    host.onclick = e => { if (e.target === host) finish(); };

    const reviewHost = m.querySelector("#review-host");
    const shufChk = m.querySelector("#shuf");
    shufChk.onchange = () => { shuffleMode = shufChk.checked; };

    function runOneBatch() {
      // 取下一批 BATCH 道题（过滤已消除的）
      const remain = (shuffleMode ? shuffleArr(batchQueue) : batchQueue).filter(w => (DB.state.wrongbook[subject] || []).some(x => x.id === w.id));
      if (!remain.length) { UI.toast("🎉 本轮错题已全部复习完成！"); finish(); return; }
      const batch = remain.slice(0, BATCH);

      reviewHost.innerHTML = "";
      const batchInfo = document.createElement("div");
      batchInfo.className = "muted small";
      batchInfo.style.marginBottom = "8px";
      batchInfo.textContent = `本次 ${batch.length} 题（第 ${wrongs.length - remain.length + 1}-${wrongs.length - remain.length + batch.length} 题 / 共 ${wrongs.length} 题）`;
      reviewHost.appendChild(batchInfo);

      const qsForQuiz = batch.map((w, qi) => {
        const opts = w.options && w.options.length ? w.options : ["A", "B", "C", "D"];
        return { q: w.q, options: opts, a: typeof w.a === "string" && w.a.length === 1 ? w.a.charCodeAt(0) - 65 : (w.a || 0), e: w.e || "", optInfo: w.optInfo || null, _wrongbookId: w.id };
      });

      window.Quiz.start(reviewHost, qsForQuiz, subject, {
        onAgain: () => { reviewHost.innerHTML = ""; runOneBatch(); },
        onDone: ({ correct, total }) => {
          // 累计正确率 + 学习时长
          try {
            const mins = 1;  // 按完成一次算1分钟
            DB.addTimerMinutes(subject, mins);
            DB.addSubjectSession(subject, mins);
            const ac = DB.state.accuracyCumulative = DB.state.accuracyCumulative || {};
            ac[subject] = ac[subject] || { correct: 0, total: 0 };
            ac[subject].correct += correct; ac[subject].total += total;
          } catch (e) {}
          // 更新每个错题的 correctStreak
          batch.forEach((w, i) => {
            const ok = reviewHost.querySelector(`.quiz-q[data-qi="${i}"]`)?.classList.contains("ok") ||
                       Array.from(reviewHost.querySelectorAll(`.quiz-q[data-qi="${i}"] .opt.correct`)).length > 0;
            const live = (DB.state.wrongbook[subject] || []).find(x => x.id === w.id);
            if (!live) return;  // 已被消除
            live.reviewCount = (live.reviewCount || 0) + 1;
            // 标记本次是否答对：通过 user answer 与 correct
            // 由于 quiz.start 已把信息传出，我们需要从 reviewHost 的 DOM 推断
            const card = reviewHost.querySelectorAll(".quiz-q")[i];
            const optClicked = card && card.dataset.done === "1";
            const wrongClicked = card && card.querySelector(".opt.wrong");
            const isCorrect = !wrongClicked;
            if (isCorrect) {
              live.correctStreak = (live.correctStreak || 0) + 1;
            } else {
              live.correctStreak = 0;
            }
          });
          DB.save();

          // 消除正确率到2的错题
          const removed = [];
          DB.state.wrongbook[subject] = (DB.state.wrongbook[subject] || []).filter(w => {
            if ((w.correctStreak || 0) >= 2) {
              removed.push(w);
              return false;
            }
            return true;
          });
          if (removed.length) {
            DB.save();
            UI.toast(`已自动消除 ${removed.length} 道（连续答对2次）`);
            syncDailyReviewTodos();
          }

          // 出现"继续下一批 / 结束复习"
          const tip = document.createElement("div");
          tip.className = "muted small";
          tip.style.marginTop = "10px";
          tip.innerHTML = `<b>本次正确率 ${correct}/${total}</b> · 累计答对2次的错题已自动消除。`;
          reviewHost.appendChild(tip);

          const remainAfter = (DB.state.wrongbook[subject] || []).filter(w => batch.some(b => b.id === w.id));
          const remainAll = (DB.state.wrongbook[subject] || []).length;
          const bar = document.createElement("div");
          bar.className = "row";
          bar.style.cssText = "justify-content:center;margin-top:12px;gap:8px";
          bar.innerHTML = `<button class="btn primary" id="nextBatch">下一批 ${BATCH} 题</button>` +
            (remainAll > 0 ? `<button class="btn ghost" id="exitReview">结束复习</button>` : "");
          reviewHost.appendChild(bar);
          bar.querySelector("#nextBatch").onclick = () => {
            batchQueue = DB.state.wrongbook[subject] || [];
            reviewHost.innerHTML = "";
            runOneBatch();
          };
          bar.querySelector("#exitReview")?.addEventListener("click", finish);
        }
      });
    }

    function finish() {
      host.remove();
      // 若该 subject 已无错题，标记今日 todo 为 done
      const remain = countWrong(subject);
      const todos = DB.state.todos["wrongbook"] || [];
      todos.forEach(t => {
        if (t.type === "wrong-review" && t.subject === subject && t.day === DB.today()) {
          if (remain === 0) t.done = true;
          else t.text = `${SUBJECT_LABELS[subject]}错题复习（${remain}题）`;
        }
      });
      DB.save();
      if (afterAll) afterAll();
    }

    runOneBatch();
  }

  function goHome() {
    document.querySelectorAll(".modal-mask").forEach(m => m.remove());
    if (location.hash !== "#/countdown") location.hash = "#/countdown";
  }

  /* ===== 模块入口 ===== */
  window.MODULES.wrongbook = {
    title: "错题本", icon: "wrongbook",
    render(body) {
      const DB = window.DB, UI = window.UI;
      let cur = SUBJECTS[0];

      const panel = UI.el(`<div class="card"><h3>📕 错题本</h3>
        <div class="muted small">所有练习错题按科目汇总，标注作答日期。系统每天自动生成「X错题复习」待办，<b>累计答对2次自动消除</b>。</div>
        <div class="row" style="margin:10px 0" id="tabs"></div>
        <div class="row" style="margin-bottom:10px;gap:8px;flex-wrap:wrap;align-items:center">
          <span class="muted small">📅 日期范围</span>
          <input type="date" id="dFrom" style="width:auto"/>
          <span class="muted small">~</span>
          <input type="date" id="dTo" style="width:auto"/>
          <button class="btn sm" id="dApply">应用</button>
          <button class="btn sm ghost" id="dClear">清除</button>
          <button class="btn sm ghost" id="d7">近7天</button>
          <button class="btn sm ghost" id="d30">近30天</button>
          <span class="muted small" id="dInfo"></span>
        </div>
        <div class="row" style="margin-bottom:10px">
          <button class="btn" id="add">＋ 手动添加</button>
          <button class="btn" id="exp">导出本科目PDF</button>
          <button class="btn" id="expRange">📄 按日期范围导出</button>
          <button class="btn magenta" id="expAll">导出全部PDF</button>
        </div>
        <div id="list"></div></div>`);
      body.appendChild(panel);

      /* ---- 日期范围筛选 ---- */
      let dFrom = "", dTo = "";
      function inRange(it) {
        if (!dFrom && !dTo) return true;
        const d = it.date || "";
        if (dFrom && d < dFrom) return false;
        if (dTo && d > dTo) return false;
        return true;
      }
      function filtered(subject) { return (DB.state.wrongbook[subject] || []).filter(inRange); }
      function rangeLabel() {
        if (!dFrom && !dTo) return "全部日期";
        return (dFrom || "最早") + " ~ " + (dTo || "至今");
      }
      function applyRange() {
        dFrom = panel.querySelector("#dFrom").value || "";
        dTo = panel.querySelector("#dTo").value || "";
        panel.querySelector("#dInfo").textContent = `当前筛选：${rangeLabel()} · 「${cur}」${filtered(cur).length} 题`;
        renderList();
      }
      panel.querySelector("#dApply").onclick = applyRange;
      panel.querySelector("#dClear").onclick = () => {
        dFrom = ""; dTo = "";
        panel.querySelector("#dFrom").value = ""; panel.querySelector("#dTo").value = "";
        applyRange();
      };
      function setRecent(n) {
        const end = new Date(), st = new Date();
        st.setDate(st.getDate() - (n - 1));
        const f = x => x.toISOString().slice(0, 10);
        dFrom = f(st); dTo = f(end);
        panel.querySelector("#dFrom").value = dFrom; panel.querySelector("#dTo").value = dTo;
        applyRange();
      }
      panel.querySelector("#d7").onclick = () => setRecent(7);
      panel.querySelector("#d30").onclick = () => setRecent(30);

      // 今日错题复习面板（自动生成待办 + 一键复习）
      const reviewCard = UI.el(`<div class="card"><h3>📅 今日错题复习（自动）</h3>
        <div class="muted small">系统自动扫描各科错题，每天生成对应的「错题复习」任务；完成复习后会更新累计正确率与时长。默认每次 5 题（可打乱），累计答对 2 次自动消除。</div>
        <div id="reviewList" style="margin-top:10px"></div>
      </div>`);
      body.appendChild(reviewCard);

      function renderReviewCard() {
        const todayList = ensureDailyReviewTodos();
        const lst = reviewCard.querySelector("#reviewList");
        if (!todayList.length) { lst.innerHTML = `<div class="empty">今日所有科目均无错题 🎉</div>`; return; }
        lst.innerHTML = "";
        todayList.forEach(t => {
          const row = UI.el(`<div class="todo ${t.done ? "done" : ""}">
            <div class="chk ${t.done ? "on" : ""}">${t.done ? "✓" : ""}</div>
            <div class="todo-text">${UI.esc(t.text)}</div>
            <button class="btn primary" data-act="start" data-sub="${UI.esc(t.subject)}">开始复习</button>
            <button class="del">✕</button>
          </div>`);
          row.querySelector(".chk").onclick = () => { t.done = !t.done; DB.save(); renderReviewCard(); renderTabs(); renderList(); };
          row.querySelector("[data-act='start']").onclick = () => {
            const items = filtered(t.subject);
            if (!items.length) { UI.toast("该日期范围内暂无错题"); return; }
            startWrongReview(t.subject, body, () => { renderReviewCard(); renderTabs(); renderList(); }, items);
          };
          row.querySelector(".del").onclick = async () => {
            if (await UI.confirm("确认移除今日该错题复习任务？")) {
              DB.state.todos["wrongbook"] = (DB.state.todos["wrongbook"] || []).filter(x => x.id !== t.id);
              DB.save(); renderReviewCard();
            }
          };
          lst.appendChild(row);
        });
      }

      function renderTabs() {
        const tabs = panel.querySelector("#tabs"); tabs.innerHTML = "";
        SUBJECTS.forEach(s => {
          const total = countWrong(s);
          const n = filtered(s).length;
          const label = (dFrom || dTo) ? `${s} (${n}/${total})` : `${s} (${n})`;
          const b = UI.el(`<button class="chip ${s === cur ? "star3" : ""}" style="cursor:pointer;padding:6px 12px">${label}</button>`);
          b.onclick = () => { cur = s; renderTabs(); renderList(); };
          tabs.appendChild(b);
        });
      }
      function renderList() {
        const arr = filtered(cur);
        const list = panel.querySelector("#list");
        if (!arr.length) {
          list.innerHTML = `<div class="empty">「${cur}」在 ${rangeLabel()} 内暂无错题</div>`;
          panel.querySelector("#dInfo").textContent = `当前筛选：${rangeLabel()} · 「${cur}」0 题`;
          return;
        }
        panel.querySelector("#dInfo").textContent = `当前筛选：${rangeLabel()} · 「${cur}」${arr.length} 题`;
        list.innerHTML = "";
        arr.slice().reverse().forEach(it => {
          const card = UI.el(`<div class="todo" style="flex-direction:column;align-items:flex-start;gap:6px">
            <div><span class="chip">${it.date}</span> ${UI.esc(it.q.replace(/____/g, '<span class="kw">____</span>'))}</div>
            ${it.options ? it.options.map((o, i) => `<div class="small ${i === it.a ? "ans" : ""}" style="color:${i === it.a ? "#3ddc97" : "#e6ecff"}">${A(i)}. ${UI.esc(o)}${i === it.a ? " ✓" : ""}</div>`).join("") : ""}
            ${it.e ? `<div class="exp">解析：${UI.esc(it.e)}</div>` : ""}
            <div class="muted small">已复习 ${it.reviewCount || 0} 次 · 连续答对 ${it.correctStreak || 0}/${Math.max(2, it.reviewCount || 0)}</div>
            <input type="file" accept="image/*" data-img="${it.id}" style="font-size:12px"/>
            ${it.img ? `<img class="img-thumb" src="${it.img}"/>` : ""}
            <input placeholder="笔记…" value="${UI.esc(it.note || "")}" data-note="${it.id}" style="font-size:13px"/>
            <button class="del" data-del="${it.id}" style="border:none;background:none;color:#ff6b81">删除</button>
          </div>`);
          list.appendChild(card);
        });
        list.querySelectorAll("[data-note]").forEach(inp => inp.onchange = e => {
          const it = (DB.state.wrongbook[cur] || []).find(x => x.id === inp.dataset.note);
          if (it) { it.note = e.target.value; DB.save(); }
        });
        list.querySelectorAll("[data-img]").forEach(inp => inp.onchange = e => {
          const f = e.target.files[0]; if (!f) return;
          const rd = new FileReader();
          rd.onload = () => { const it = (DB.state.wrongbook[cur] || []).find(x => x.id === inp.dataset.img); if (it) { it.img = rd.result; DB.save(); renderList(); } };
          rd.readAsDataURL(f);
        });
        list.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
          DB.state.wrongbook[cur] = (DB.state.wrongbook[cur] || []).filter(x => x.id !== b.dataset.del);
          DB.save(); renderTabs(); renderList(); renderReviewCard(); syncDailyReviewTodos();
        });
      }

      panel.querySelector("#exp").onclick = () => {
        const arr = filtered(cur);
        if (!arr.length) { UI.toast("该范围内暂无错题"); return; }
        window.PDF.exportWrongList(`${cur} · 错题本（${rangeLabel()}）`, arr);
      };
      panel.querySelector("#expRange").onclick = () => {
        // 按当前日期范围，跨科目导出
        const blocks = SUBJECTS.map(s => ({ s, items: filtered(s) })).filter(b => b.items.length);
        if (!blocks.length) { UI.toast("该日期范围内暂无错题"); return; }
        const all = [];
        blocks.forEach(b => b.items.forEach(it => all.push(Object.assign({ _sub: b.s }, it))));
        window.PDF.exportWrongList(`错题本 · ${rangeLabel()}（${blocks.map(b => b.s + b.items.length).join(" ")}）`, all);
      };
      panel.querySelector("#expAll").onclick = () => {
        if (dFrom || dTo) {
          // 有筛选时"导出全部"也按范围走
          const all = [];
          SUBJECTS.forEach(s => filtered(s).forEach(it => all.push(it)));
          if (!all.length) { UI.toast("该日期范围内暂无错题"); return; }
          window.PDF.exportWrongList(`全部科目 · 错题本（${rangeLabel()}）`, all);
        } else {
          window.PDF.exportAllWrong();
        }
      };
      panel.querySelector("#add").onclick = () => {
        const box = UI.el(`<div></div>`);
        box.innerHTML = `<label class="fld">科目</label><select id="sb" style="width:100%">${SUBJECTS.map(s => `<option ${s === cur ? "selected" : ""}>${s}</option>`).join("")}</select>
          <label class="fld">题干（可用 ____ 表示填空）</label><input id="q"/>
          <label class="fld">解析</label><input id="e"/>`;
        UI.modal({ title: "手动添加错题", body: box, actions: [
          { label: "取消", cls: "ghost", onClick: (m, c) => c() },
          { label: "保存", cls: "primary", onClick: (m, c) => {
            const sb = box.querySelector("#sb").value;
            const q = box.querySelector("#q").value.trim();
            if (!q) { UI.toast("题干必填"); return; }
            DB.state.wrongbook[sb] = DB.state.wrongbook[sb] || [];
            DB.state.wrongbook[sb].push({ id: DB.uid(), q, options: null, a: null, ua: null, date: DB.today(), e: box.querySelector("#e").value.trim(), note: "", img: "", reviewCount: 0, correctStreak: 0 });
            DB.save(); c(); cur = sb; renderTabs(); renderList(); renderReviewCard(); syncDailyReviewTodos(); UI.toast("已添加");
          } }
        ] });
      };

      renderReviewCard();
      renderTabs(); renderList();
    }
  };
})();
