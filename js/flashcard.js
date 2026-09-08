/* 通用闪卡引擎（供 常识常用知识点 / 申论规范词 等复用）
   普通模式（闪卡翻转：记得/忘记）+ 困难模式（自行填写答案）
   按艾宾浩斯曲线调度；忘记/答错 → 记入对应科目错题本；含计时 + 正确率。

   用法：
   window.Flashcard.start({
     title, subtitle,
     group,            // Ebbinghaus 调度分组，如 "common_kp" / "essay_norm"
     subject,          // 错题本科目，如 "常识" / "申论"
     items: [{id, prompt, answer}],
     mode: "easy"|"hard",
     frontLabel, backLabel,   // 卡片正/反面说明，如 "应用场景" / "规范词汇"
     shuffle: false,          // 是否打乱顺序
     hardCheck,               // 可选：function(got, expected)->bool
     onExit                    // 可选：关闭时回调
   });
*/
(function () {
  "use strict";
  const UI = window.UI, DB = window.DB, EB = window.Ebbinghaus;
  const NODE = () => document.getElementById("modalRoot");

  function shuffleArr(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function defaultCheck(got, expected) {
    const g = String(got || "").trim().replace(/\s+/g, "");
    const e = String(expected || "").trim().replace(/\s+/g, "");
    return g === e;
  }

  function start(opts) {
    const {
      title = "闪卡练习", subtitle = "",
      group = "flash", subject = "通用",
      items = [], mode = "easy",
      frontLabel = "正面", backLabel = "答案",
      shuffle = false, hardCheck = defaultCheck, onExit = null,
      noWrongbook = false,   // true：不把答错的再写回错题本（错题本里复习时用，避免自我重复）
      onJudge = null         // (item, ok) => void：每次作答后的回调（供外部更新连续答对次数等）
    } = opts;

    if (!items.length) { UI.toast("暂无数据"); return; }

    const host = document.createElement("div");
    host.className = "modal-mask";
    const m = document.createElement("div");
    m.className = "modal";
    m.style.cssText = "width:min(720px,96vw);max-height:92vh;overflow:auto";
    m.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">📇 ${UI.esc(title)}（${mode === "hard" ? "困难模式 · 自行填写" : "普通模式 · 闪卡"}）</h2>
        <button class="btn ghost" id="goHome">← 返回主页面</button>
      </div>
      <div class="muted small" style="margin:8px 0">${UI.esc(subtitle)} · 共 ${items.length} 条${shuffle ? "（已打乱）" : ""} · 忘记/答错记入「${UI.esc(subject)}」错题本，并按艾宾浩斯曲线安排复习</div>
      <div id="fcStats" class="eb-stats"></div>
      <div id="fcCard" class="fc-card"></div>
    `;
    host.appendChild(m);
    NODE().appendChild(host);
    host.querySelector("#goHome").onclick = () => goHome();
    host.onclick = e => { if (e.target === host) endSession(); };

    const startTime = Date.now();
    let cur = 0, correctN = 0, totalN = 0;
    let queue = (shuffle ? shuffleArr(items) : items.slice())
      .map(x => ({ ...x, _streak: EB.getRecord(group, x.id)?.correctStreak || 0 }));
    const wrongIndices = [];
    const seenStreaks = {};

    function showTimer() {
      const sec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
    }
    function renderStats() {
      host.querySelector("#fcStats").innerHTML = `
        <div class="eb-stat"><span class="n">${queue.length}</span><span class="l">本轮题目</span></div>
        <div class="eb-stat"><span class="n">${correctN}/${totalN}</span><span class="l">正确数 / 已答</span></div>
        <div class="eb-stat"><span class="n">${totalN ? Math.round(correctN / totalN * 100) : 0}%</span><span class="l">正确率</span></div>
        <div class="eb-stat"><span class="n">${showTimer()}</span><span class="l">用时</span></div>
        <div class="eb-stat"><span class="n">${wrongIndices.length}</span><span class="l">本轮错题</span></div>`;
    }

    function next() {
      while (cur < queue.length) {
        const it = queue[cur];
        if ((seenStreaks[it.id] || 0) >= 2) { cur++; continue; }
        return renderCard(it);
      }
      const remain = wrongIndices.filter(idx => idx < queue.length);
      if (remain.length) {
        const toAdd = remain.map(idx => ({ ...queue[idx] }));
        queue.push(...toAdd);
        wrongIndices.length = 0;
        cur = queue.length - toAdd.length;
        return next();
      }
      endSession();
    }

    /* 回到上一个词条（自动跳过本轮已连对2次消除的） */
    function goPrev() {
      let i = cur - 1;
      while (i >= 0 && (seenStreaks[queue[i].id] || 0) >= 2) i--;
      if (i < 0) { UI.toast("已经是第一个了"); return; }
      cur = i;
      renderCard(queue[i]);
    }

    function renderCard(it) {
      const cardEl = host.querySelector("#fcCard");
      renderStats();
      if (mode === "easy") {
        cardEl.innerHTML = `
          <div class="fc-face fc-front">
            <div class="muted small">第 ${cur + 1} / ${queue.length} 题 · ${UI.esc(frontLabel)}</div>
            <div class="fc-big">${UI.esc(it.prompt)}</div>
            <div class="muted small">点下方按钮看${UI.esc(backLabel)}</div>
          </div>
          <div class="fc-actions"><button class="btn" id="flip">🔄 翻转看${UI.esc(backLabel)}</button></div>
          <div class="fc-judge" style="display:none">
            <button class="btn" data-judge="forgot">😵 忘记（错的）</button>
            <button class="btn primary" data-judge="remember">😊 记得（对的）</button>
          </div>
          <div class="fc-nav">
            <button class="btn" id="fcPrev">← 上一个</button>
            <button class="btn" id="fcNext">下一个 →</button>
          </div>`;
        let flipped = false;
        const face = cardEl.querySelector(".fc-face");
        const flipBtn = cardEl.querySelector("#flip");
        const judgeEl = cardEl.querySelector(".fc-judge");
        flipBtn.onclick = () => {
          flipped = !flipped;
          if (flipped) {
            face.classList.add("flipped");
            face.innerHTML = `<div class="muted small">第 ${cur + 1} / ${queue.length} 题 · ${UI.esc(backLabel)}</div>
              <div class="fc-big fc-ans">${UI.esc(it.answer)}</div>
              <div class="muted small">再点上方按钮可翻回正面核对，确认后点「记得 / 忘记」</div>`;
            flipBtn.textContent = "↩ 翻转回去";
            judgeEl.style.display = "flex";
          } else {
            face.classList.remove("flipped");
            face.innerHTML = `<div class="muted small">第 ${cur + 1} / ${queue.length} 题 · ${UI.esc(frontLabel)}</div>
              <div class="fc-big">${UI.esc(it.prompt)}</div>
              <div class="muted small">点下方按钮看${UI.esc(backLabel)}</div>`;
            flipBtn.textContent = "🔄 翻转看" + UI.esc(backLabel);
            judgeEl.style.display = "none";
          }
        };
        cardEl.querySelector("#fcPrev").onclick = () => goPrev();
        cardEl.querySelector("#fcNext").onclick = () => { cur++; next(); };
        cardEl.querySelectorAll("[data-judge]").forEach(b => b.onclick = () => {
          recordAnswer(it, b.dataset.judge === "remember");
          cur++; next();
        });
      } else {
        cardEl.innerHTML = `
          <div class="fc-face">
            <div class="muted small">第 ${cur + 1} / ${queue.length} 题 · ${UI.esc(frontLabel)} · 自行填写</div>
            <div class="fc-big">${UI.esc(it.prompt)}</div>
            <div class="muted small" style="margin-top:8px">请填写${UI.esc(backLabel)}</div>
            <input id="fcIn" class="fc-input" autocomplete="off" placeholder="在此输入答案" />
            <div class="row" style="margin-top:8px;gap:8px">
              <button class="btn primary" id="fcSubmit">提交</button>
              <button class="btn ghost" id="fcShowAns">提示</button>
            </div>
            <div id="fcVerdict" class="fc-verdict" style="display:none"></div>
          </div>`;
        const inp = cardEl.querySelector("#fcIn");
        const sub = cardEl.querySelector("#fcSubmit");
        const verdict = cardEl.querySelector("#fcVerdict");
        inp.focus();
        function checkAnswer() {
          const v = inp.value.trim();
          if (!v) return;
          const ok = hardCheck(v, it.answer);
          verdict.style.display = "block";
          verdict.className = "fc-verdict " + (ok ? "ok" : "ng");
          verdict.innerHTML = `<b>${ok ? "✅ 正确" : "❌ 错误"}</b> · 标准${UI.esc(backLabel)}：<code>${UI.esc(it.answer)}</code> · 你的答案：<code>${UI.esc(v)}</code>`;
          sub.disabled = true; inp.disabled = true;
          const nx = document.createElement("div");
          nx.className = "row"; nx.style = "margin-top:8px;gap:8px";
          nx.innerHTML = `<button class="btn primary" id="fcNext">下一题 →</button>`;
          verdict.appendChild(nx);
          nx.querySelector("#fcNext").onclick = () => { recordAnswer(it, ok); cur++; next(); };
        }
        sub.onclick = checkAnswer;
        inp.addEventListener("keydown", e => { if (e.key === "Enter") checkAnswer(); });
        cardEl.querySelector("#fcShowAns").onclick = () => { inp.value = it.answer; sub.disabled = false; };
      }
    }

    function recordAnswer(it, ok) {
      totalN++;
      if (ok) { correctN++; seenStreaks[it.id] = (seenStreaks[it.id] || 0) + 1; }
      else { seenStreaks[it.id] = 0; wrongIndices.push(cur); }
      EB.updateAfterReview(group, it.id, ok);
      if (onJudge) { try { onJudge(it, ok); } catch (e) { console.warn("onJudge 回调出错", e); } }
      if (!ok && !noWrongbook) {
        const arr = DB.state.wrongbook[subject] = DB.state.wrongbook[subject] || [];
        arr.push({ id: DB.uid(), q: it.prompt, e: it.answer, date: DB.today(), note: "", img: "" });
        DB.save();
      }
    }

    function endSession() {
      const sec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
      const mins = Math.max(1, Math.round(sec / 60));
      try {
        DB.addTimerMinutes(subject, mins);
        DB.addSubjectSession(subject, mins);
        const ac = DB.state.accuracyCumulative = DB.state.accuracyCumulative || {};
        ac[subject] = ac[subject] || { correct: 0, total: 0 };
        ac[subject].correct += correctN; ac[subject].total += totalN;
        DB.save();
      } catch (e) {}
      const cardEl = host.querySelector("#fcCard");
      const acc = totalN ? Math.round(correctN / totalN * 100) : 0;
      cardEl.innerHTML = `
        <div class="card center">
          <div style="font-size:22px">🎯 本次正确率 <b>${acc}%</b>（${correctN}/${totalN}）</div>
          <div class="muted small">用时 ${showTimer()} · 已记录到「${UI.esc(subject)}」学习时长与累计正确率${wrongIndices.length ? "，并将错题收入错题本" : ""}。</div>
          <div class="row" style="justify-content:center;margin-top:12px;gap:8px">
            <button class="btn primary" id="restart">再来一轮</button>
            <button class="btn ghost" id="exit">完成</button>
          </div>
        </div>`;
      renderStats();
      cardEl.querySelector("#restart").onclick = () => {
        queue = (shuffle ? shuffleArr(items) : items.slice())
          .map(x => ({ ...x, _streak: EB.getRecord(group, x.id)?.correctStreak || 0 }));
        cur = 0; correctN = 0; totalN = 0; wrongIndices.length = 0;
        Object.keys(seenStreaks).forEach(k => delete seenStreaks[k]);
        cardEl.outerHTML = `<div id="fcCard" class="fc-card"></div>`;
        setTimeout(next, 30);
      };
      cardEl.querySelector("#exit").onclick = () => { host.remove(); if (onExit) onExit(); };
    }

    function goHome() {
      document.querySelectorAll(".modal-mask").forEach(mm => mm.remove());
      if (location.hash !== "#/countdown") location.hash = "#/countdown";
    }

    next();
  }

  window.Flashcard = { start };
})();
