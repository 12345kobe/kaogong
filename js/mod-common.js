/* 模块：常识判断（分模块题库 + 总体学习 + 预测题 + 错题导出）
   设计原则：题库内全部题目「常驻」，永不删除；用户每次自选题数练习。
   已练题目只用于记录进度/通关提示，并「新题优先」展示，但任何时候都可重新练习。 */
(function () {
  window.MODULES = window.MODULES || {};
  const SUBJECT = "常识";
  const ORDER = ["geo", "law", "eco", "tech", "pol"];
  const NAMES = { geo: "地理国情", law: "法律常识", eco: "经济常识", tech: "科技常识", pol: "政治常识" };
  const ICONS = { geo: "🌍", law: "⚖️", eco: "💰", tech: "🔬", pol: "🏛️" };
  let MOD_ROOT = null;

  function prep(it, shuffle) {
    let opts = (it.options || []).slice();
    let a = it.a;
    if (shuffle) {
      for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[opts[i], opts[j]] = [opts[j], opts[i]]; }
      a = opts.indexOf(it.options[it.a]);
    }
    return { _id: it.id, _mod: it.mod, q: it.q, options: opts, a: a, e: it.e, tag: it.tag };
  }
  function shuffleArr(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

  function allItems() {
    const B = window.COMMON_BANK || {};
    const arr = [];
    ORDER.forEach(k => (B[k] ? B[k].items : []).forEach(it => arr.push(Object.assign({ mod: k }, it))));
    return arr;
  }
  function doneSet(mod) {
    const s = window.DB.state.commonModules = window.DB.state.commonModules || {};
    s[mod] = s[mod] || [];
    return s[mod];
  }
  function isDone(mod, id) { return doneSet(mod).indexOf(id) >= 0; }
  function markDone(mod, id) { const d = doneSet(mod); if (d.indexOf(id) < 0) { d.push(id); window.DB.save(); } }
  function moduleTotal(mod) { const B = window.COMMON_BANK; return (B && B[mod] && B[mod].items) ? B[mod].items.length : 0; }
  function moduleDone(mod) {
    const ids = doneSet(mod);
    const items = (window.COMMON_BANK[mod] && window.COMMON_BANK[mod].items) || [];
    const have = new Set(items.map(x => x.id));
    return ids.filter(id => have.has(id)).length;
  }

  function buildQs(items, shuffle) { return items.map(it => prep(it, shuffle)); }

  // 全部题目常驻；新题优先（已练题排在后面），用户自选 count，绝不删题
  function pickModuleQuestions(mod, count, shuffle) {
    const items = (window.COMMON_BANK[mod] && window.COMMON_BANK[mod].items) || [];
    const done = new Set(doneSet(mod));
    const fresh = items.filter(it => !done.has(it.id)).map(it => Object.assign({ mod }, it));
    const review = items.filter(it => done.has(it.id)).map(it => Object.assign({ mod }, it));
    let pool = shuffle ? shuffleArr(fresh.slice()).concat(shuffleArr(review.slice())) : fresh.concat(review);
    return buildQs(pool.slice(0, count), shuffle);
  }
  function pickOverall(count, shuffle) {
    const all = allItems();
    const doneIds = new Set(ORDER.flatMap(m => doneSet(m)));
    const fresh = all.filter(it => !doneIds.has(it.id));
    const review = all.filter(it => doneIds.has(it.id));
    let pool = shuffle ? shuffleArr(fresh.slice()).concat(shuffleArr(review.slice())) : fresh.concat(review);
    return buildQs(pool.slice(0, count), shuffle);
  }

  /* ===== 完成提示 ===== */
  function completionSummary(justFinishedMod) {
    const doneMods = ORDER.filter(m => moduleDone(m) >= moduleTotal(m) && moduleTotal(m) > 0);
    const allDone = doneMods.length === ORDER.length;
    const remainingMods = ORDER.filter(m => moduleDone(m) < moduleTotal(m));
    const totalRemaining = remainingMods.reduce((s, m) => s + (moduleTotal(m) - moduleDone(m)), 0);
    if (allDone) {
      return { allDone: true, title: "🎉 全部完成", msg: "太棒了！你已经完成所有常识模块的学习！\n\n（地理国情 / 法律常识 / 经济常识 / 科技常识 / 政治常识 全部通关）" };
    }
    const names = remainingMods.map(m => NAMES[m]);
    const justName = justFinishedMod ? NAMES[justFinishedMod] : "";
    const msg = (justName ? `🎉 ${justName} 模块已完成！\n\n` : "") +
      `现在还差：${names.join("、")}\n累计还有 ${totalRemaining} 题没练过`;
    return { allDone: false, title: "模块完成 🎉", msg };
  }
  function showCompletion(justFinishedMod) {
    const s = completionSummary(justFinishedMod);
    window.UI.modal({
      title: s.title,
      body: `<p style="white-space:pre-line;line-height:1.9;font-size:15px">${window.UI.esc(s.msg)}</p>`,
      width: "420px",
      actions: [{ label: "好的", cls: "primary", onClick: (m, c) => c() }]
    });
  }

  function orderModal(modOrNull, onStart) {
    let shuffle = false;
    const total = modOrNull ? moduleTotal(modOrNull) : ORDER.reduce((a, m) => a + moduleTotal(m), 0);
    const done = modOrNull ? moduleDone(modOrNull) : ORDER.reduce((a, m) => a + moduleDone(m), 0);
    let count = Math.min(10, Math.max(5, total));
    const body = window.UI.el(`<div>
      <div class="row" style="gap:18px;margin:6px 0 14px">
        <label class="radio"><input type="radio" name="ord" value="0" checked> 按原有顺序</label>
        <label class="radio"><input type="radio" name="ord" value="1"> 打乱顺序</label>
      </div>
      <div class="row" style="gap:10px;align-items:center">
        <label class="fld" style="margin:0">本次题数</label>
        <input id="cnt" type="number" min="1" max="${total}" value="${count}" style="width:80px">
        <span class="muted small" id="cntHint"></span>
      </div>
    </div>`);
    const cntInput = body.querySelector("#cnt");
    const hint = body.querySelector("#cntHint");
    function upd() {
      let v = parseInt(cntInput.value, 10);
      if (isNaN(v) || v < 1) v = 1;
      if (v > total) { v = total; cntInput.value = v; }
      cntInput.value = v;
      hint.textContent = modOrNull
        ? `（本模块共 ${total} 题，已练 ${done} 题；新题优先，全部可反复练）`
        : `（全部模块共 ${total} 题，已练 ${done} 题）`;
    }
    cntInput.oninput = upd; upd();
    body.querySelectorAll('input[name="ord"]').forEach(r => r.onchange = () => { shuffle = r.value === "1"; });
    window.UI.modal({
      title: modOrNull ? `练习：${NAMES[modOrNull]}` : "总体学习（全部模块）",
      body, width: "440px",
      actions: [
        { label: "取消", cls: "ghost", onClick: (m, c) => c() },
        { label: "开始练习", cls: "primary", onClick: (m, c) => { c(); let v = parseInt(cntInput.value, 10) || 10; v = Math.max(1, Math.min(total, v)); onStart(shuffle, v); } }
      ]
    });
  }

  function recordCommonHistory(key, qs, r, shuffle) {
    DB.state.commonHistory = DB.state.commonHistory || {};
    const arr = DB.state.commonHistory[key] = DB.state.commonHistory[key] || [];
    arr.unshift({
      date: DB.today() + " " + DB.fmtTime(new Date()),
      count: qs.length, shuffle: !!shuffle,
      correct: r.correct, total: r.total,
      items: qs.map((q, i) => ({
        q: q.q, options: q.options.slice(), a: q.a, e: q.e || "", tag: q.tag,
        ua: (r.answers && r.answers[i]) ? r.answers[i].ua : null, _id: q._id, _mod: q._mod
      }))
    });
    if (arr.length > 60) arr.length = 60;
    DB.save();
  }
  function itemsToQs(hItems, onlyWrong, shuffle) {
    const out = [];
    hItems.forEach(h => {
      if (onlyWrong && h.ua != null && h.ua === h.a) return;
      const B = window.COMMON_BANK;
      const orig = (h._mod && B[h._mod]) ? (B[h._mod].items || []).find(x => x.id === h._id) : null;
      if (orig) out.push(prep(orig, shuffle));
      else out.push({ _id: h._id, _mod: h._mod, q: h.q, options: h.options.slice(), a: h.a, e: h.e, tag: h.tag });
    });
    return out;
  }
  function runCommonItems(host, items, shuffle, label) {
    if (!items.length) { window.UI.toast("没有可重做的题目"); return; }
    window.Quiz.start(host, items, SUBJECT, {
      onAnswer: (qq) => { if (qq._id) markDone(qq._mod, qq._id); },
      onDone: (r) => { window.UI.toast(label + "：正确 " + r.correct + "/" + r.total); },
      onAgain: () => runCommonItems(host, items, shuffle, label)
    });
  }
  function openCommonHistory(key, title) {
    const hist = (DB.state.commonHistory && DB.state.commonHistory[key]) || [];
    if (!hist.length) { window.UI.toast("该模块还没有做题记录"); return; }
    const box = window.UI.el(`<div style="display:flex;flex-direction:column;gap:8px;max-height:62vh;overflow:auto"></div>`);
    hist.forEach((h, hi) => {
      const row = window.UI.el(`<div class="todo" style="align-items:flex-start">
        <div style="flex:1">
          <b>${window.UI.esc(h.date)}</b> <span class="muted small">· 正确 ${h.correct}/${h.total} · ${h.count} 题${h.shuffle ? " · 打乱" : ""}</span>
        </div>
        <button class="btn sm" data-act="view">查看</button>
        <button class="btn sm" data-act="redo">重做</button>
        <button class="btn sm" data-act="wrong">重做错题</button>
        <button class="btn sm ghost" data-act="del">删除</button>
      </div>`);
      row.querySelector('[data-act="view"]').onclick = () => {
        const html = h.items.map((it, i) => `<div class="item"><b>${i + 1}. ${window.UI.esc(it.q)}</b>
          <div class="muted small">${it.options.map((o, k) => (k === it.a ? "✅ " : "") + String.fromCharCode(65 + k) + ". " + window.UI.esc(o)).join("　")}</div>
          ${it.e ? '<div class="exp">解析：' + window.UI.esc(it.e) + "</div>" : ""}</div>`).join("");
        window.UI.modal({ title: "做题记录 · " + h.date, body: `<div style="max-height:64vh;overflow:auto">${html}</div>`, width: "640px", actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }] });
      };
      row.querySelector('[data-act="redo"]').onclick = () => {
        const items = itemsToQs(h.items, false, true);
        const host = window.UI.el(`<div class="kp-quiz" style="max-height:68vh;overflow:auto"></div>`);
        window.UI.modal({ title: title + " · 重做", body: host, width: "720px", actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }] });
        runCommonItems(host, items, true, title + " 重做");
      };
      row.querySelector('[data-act="wrong"]').onclick = () => {
        const items = itemsToQs(h.items, true, true);
        if (!items.length) { window.UI.toast("本次没有错题可重做"); return; }
        const host = window.UI.el(`<div class="kp-quiz" style="max-height:68vh;overflow:auto"></div>`);
        window.UI.modal({ title: title + " · 重做错题", body: host, width: "720px", actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }] });
        runCommonItems(host, items, true, title + " 重做错题");
      };
      row.querySelector('[data-act="del"]').onclick = () => { DB.state.commonHistory[key] = (DB.state.commonHistory[key] || []).filter((_, i) => i !== hi); DB.save(); row.remove(); };
      box.appendChild(row);
    });
    window.UI.modal({ title: "📋 " + title + " · 做题记录（" + hist.length + " 次）", body: box, width: "660px", actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }] });
  }

  function startModuleQuiz(host, mod, shuffle, count) {
    const total = moduleTotal(mod);
    const qs = pickModuleQuestions(mod, count || 10, shuffle);
    if (!qs.length) { window.UI.toast("该模块暂无题目"); return; }
    renderQuiz(host, qs, SUBJECT, {
      onAnswer: (qq) => { if (qq._id) markDone(qq._mod, qq._id); },
      onDone: (r) => {
        recordCommonHistory(mod, qs, r, shuffle);
        if (moduleDone(mod) >= total) showCompletion(mod);
        else window.UI.toast(`已练 ${moduleDone(mod)} / ${total} 题 · 题目全部常驻，可随时再练`);
        if (MOD_ROOT) { setTimeout(() => { MOD_ROOT.innerHTML = ""; window.MODULES.common.render(MOD_ROOT); }, 50); }
      },
      onAgain: () => startModuleQuiz(host, mod, shuffle, count)
    });
  }

  function startOverallQuiz(host, shuffle, count) {
    const qs = pickOverall(count || 10, shuffle);
    if (!qs.length) { window.UI.toast("暂无题目"); return; }
    renderQuiz(host, qs, SUBJECT, {
      onAnswer: (qq) => { if (qq._id) markDone(qq._mod, qq._id); },
      onDone: (r) => {
        recordCommonHistory("overall", qs, r, shuffle);
        const s = completionSummary(null);
        if (s.allDone) showCompletion(null);
        else window.UI.toast(`总体学习完成 · 已累计练 ${ORDER.reduce((a, m) => a + moduleDone(m), 0)} / ${ORDER.reduce((a, m) => a + moduleTotal(m), 0)} 题`);
        if (MOD_ROOT) { setTimeout(() => { MOD_ROOT.innerHTML = ""; window.MODULES.common.render(MOD_ROOT); }, 50); }
      },
      onAgain: () => startOverallQuiz(host, shuffle, count)
    });
  }

  function renderQuiz(host, qs, subject, opts) {
    const UI = window.UI;
    const wrap = document.createElement("div");
    wrap.className = "kp-quiz";
    wrap.innerHTML = `
      <div class="row" style="margin-bottom:8px;flex-wrap:wrap;gap:6px">
        <button class="btn ghost" data-act="back">← 返回常识主页</button>
        <button class="btn ghost" data-act="home">← 返回主页面</button>
      </div>
      <div class="muted small" style="margin-bottom:10px">本次 ${qs.length} 题 · 答完记录进度（新题优先，全部题目可反复练习）</div>
      <div class="kp-quiz-host"></div>`;
    host.appendChild(wrap);
    const quizHost = wrap.querySelector(".kp-quiz-host");
    wrap.querySelector('[data-act="back"]').onclick = () => { wrap.remove(); };
    wrap.querySelector('[data-act="home"]').onclick = () => goHome();
    window.Quiz.start(quizHost, qs, subject, opts);
  }

  function goHome() {
    document.querySelectorAll(".modal-mask").forEach(m => m.remove());
    if (location.hash !== "#/countdown") location.hash = "#/countdown";
  }

  window.MODULES.common = {
    title: "常识判断", icon: "common",
    render(body) {
      const DB = window.DB, UI = window.UI;
      MOD_ROOT = body;
      body.innerHTML = "";
      UI.StudyPanel("common", body);

      // ========== 原有：常识预测题（全模块混合随机） ==========
      const predCard = UI.el(`<div class="card"><h3>💡 常识预测题</h3>
        <div class="muted small">从「地理/法律/经济/科技/政治」五大常识模块混合出题，作答后即时反馈并查看解析，错题自动收录。</div>
        <div class="row" style="margin-top:10px">
          <label class="fld" style="margin:0">题数</label>
          <select id="cnt" style="width:80px">${[5, 8, 10, 12, 15, 20].map(n => `<option ${n === 10 ? "selected" : ""}>${n}</option>`).join("")}</select>
          <button class="btn primary" id="start">开始练习</button>
          <button class="btn" id="exp">导出错题PDF</button>
        </div>
        <div id="quiz" style="margin-top:14px"></div></div>`);
      body.appendChild(predCard);
      predCard.querySelector("#start").onclick = () => {
        const cnt = +predCard.querySelector("#cnt").value || 10;
        const all = allItems();
        const qs = [];
        const used = new Set();
        while (qs.length < cnt && used.size < all.length) {
          const q = all[Math.floor(Math.random() * all.length)];
          const key = q.q; if (used.has(key)) continue; used.add(key);
          qs.push(prep(q, true));
        }
        window.Quiz.start(predCard.querySelector("#quiz"), qs, SUBJECT, { onAgain: () => predCard.querySelector("#start").click() });
      };
      predCard.querySelector("#exp").onclick = () => window.PDF.exportWrong(SUBJECT);

      // ========== 分模块刷题 + 总体学习（全部题目常驻） ==========
      const totalAll = ORDER.reduce((a, m) => a + moduleTotal(m), 0);
      const doneAll = ORDER.reduce((a, m) => a + moduleDone(m), 0);
      const doneMods = ORDER.filter(m => moduleTotal(m) > 0 && moduleDone(m) >= moduleTotal(m)).length;

      const card = UI.el(`<div class="card" style="margin-top:16px">
        <h3>📚 分模块刷题（全部题目常驻 · 新题优先 · 全完成有惊喜）</h3>
        <div class="muted small">五大模块题目全部保留，永不删除；你每次自定题数练习。已练过的题只用于进度统计，仍可反复重练。每模块逐一通关，完成会提示你还差哪些；五大模块全练完弹出通关贺词。</div>
        <div class="cm-overview">累计已练 <b>${doneAll} / ${totalAll}</b> 题 · 已完成模块 <b>${doneMods} / ${ORDER.length}</b>
          <button class="btn ghost sm" id="resetAll" style="margin-left:8px">重置全部进度</button></div>
        <div id="modList"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn primary" id="overall">🗂 总体学习（全部模块 · 自定题数）</button>
          <button class="btn ghost" id="overallHist" title="总体学习做题记录（重做/重做错题）">📋 做题记录</button>
        </div>
        <div id="quiz2" style="margin-top:14px"></div>
      </div>`);
      body.appendChild(card);

      const modList = card.querySelector("#modList");
      ORDER.forEach(mod => {
        const total = moduleTotal(mod);
        const done = moduleDone(mod);
        const pct = total ? Math.round(done / total * 100) : 0;
        const complete = total > 0 && done >= total;
        const row = UI.el(`<div class="cm-row">
          <span class="cm-ico">${ICONS[mod]}</span>
          <span class="cm-name">${NAMES[mod]}</span>
          <span class="cm-bar"><span class="cm-fill" style="width:${pct}%"></span></span>
          <span class="cm-num">共${total}题 · 已练${done}</span>
          <button class="btn ${complete ? "ghost" : "primary"} sm cm-practice">${complete ? "✅ 已完成" : "练习"}</button>
          <button class="btn ghost sm cm-hist" title="做题记录（重做/重做错题）">📋 记录</button>
          <button class="btn ghost sm cm-reset" title="重置本模块进度">重置</button>
        </div>`);
        row.querySelector(".cm-practice").onclick = () => {
          if (moduleDone(mod) >= moduleTotal(mod)) { showCompletion(mod); return; }
          orderModal(mod, (shuffle, count) => {
            card.querySelector("#quiz2").innerHTML = "";
            startModuleQuiz(card.querySelector("#quiz2"), mod, shuffle, count);
          });
        };
        row.querySelector(".cm-hist").onclick = () => openCommonHistory(mod, NAMES[mod]);
        row.querySelector(".cm-reset").onclick = () => {
          doneSet(mod).length = 0; DB.save(); UI.toast(`${NAMES[mod]} 进度已重置`); window.MODULES.common.render(body);
        };
        modList.appendChild(row);
      });

      card.querySelector("#overall").onclick = () => {
        orderModal(null, (shuffle, count) => {
          card.querySelector("#quiz2").innerHTML = "";
          startOverallQuiz(card.querySelector("#quiz2"), shuffle, count);
        });
      };
      card.querySelector("#overallHist").onclick = () => openCommonHistory("overall", "常识 · 总体学习");

      card.querySelector("#resetAll").onclick = () => {
        UI.confirm("确定重置全部常识模块的刷题进度？").then(ok => {
          if (!ok) return;
          ORDER.forEach(m => { doneSet(m).length = 0; });
          DB.save(); UI.toast("已重置全部常识进度"); window.MODULES.common.render(body);
        });
      };

      // ========== 常识常用知识点（随机 10 个 · 下一组 · 闪卡背诵 · 导出PDF） ==========
      const EBc = window.Ebbinghaus;
      const KP_ALL = window.COMMON_KP || [];
      const KP_GROUP = "common_kp";
      const KP_N = 10;

      // 固定种子的洗牌（可复现）：保证「下一组」不会重复出现同一批，且能一轮覆盖全部条目
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

      const kpState = DB.state.common.kpDeck = DB.state.common.kpDeck ||
        { seed: (Math.random() * 1e9) | 0, ptr: 0, round: 1 };

      function kpDeckOrder() { return seededShuffle(KP_ALL.map(x => x.id), kpState.seed); }

      function pickKpGroup() {
        if (!KP_ALL.length) return [];
        let ord = kpDeckOrder();
        if (kpState.ptr >= ord.length) {           // 一轮走完 → 重新洗牌进入下一轮
          kpState.seed = (Math.random() * 1e9) | 0;
          kpState.ptr = 0;
          kpState.round = (kpState.round || 1) + 1;
          ord = kpDeckOrder();
        }
        const ids = ord.slice(kpState.ptr, kpState.ptr + KP_N);
        if (ids.length < KP_N) ids.push(...ord.slice(0, KP_N - ids.length));
        kpState.ptr += KP_N;
        DB.save();
        const map = {}; KP_ALL.forEach(x => map[x.id] = x);
        return ids.map(id => map[id]).filter(Boolean);
      }

      function kpTag(it) {
        const rec = EBc.getRecord(KP_GROUP, it.id);
        if (!rec || !rec.seen) return '<span class="eb-tag eb-tag-new">未复习</span>';
        if (EBc.isDue(KP_GROUP, it.id)) return '<span class="eb-tag eb-tag-acc">待复习</span>';
        return '<span class="eb-tag eb-tag-seen">已复习</span>';
      }

      const kpCard = UI.el(`<div class="card" style="margin-top:16px">
        <h3>📖 常用知识点（随机 10 个 · 闪卡背诵）</h3>
        <div class="muted small">从《公考状元笔记》866 个常用知识点中<b>随机</b>抽取 10 个展示；点「下一组」换一批（按顺序轮换，不会重复出现同一批）。看完可用闪卡把这 10 个背完：普通模式（翻转）+ 困难模式（自填），忘记的进「常识」错题本并按艾宾浩斯复习。</div>
        <div id="kpStats" class="eb-stats" style="margin:10px 0"></div>
        <div id="kpList" style="display:flex;flex-direction:column;gap:8px;margin:8px 0"></div>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">
          <button class="btn primary" id="kpEasy">📇 普通模式（闪卡）</button>
          <button class="btn" id="pkHard">✍️ 困难模式（自填）</button>
          <button class="btn" id="kpNext">🔀 下一组</button>
          <button class="btn" id="kpExp">📄 导出本组PDF</button>
          <button class="btn" id="kpLearned">📅 已学习</button>
          <button class="btn ghost" id="kpReset">重置记忆进度</button>
        </div>
      </div>`);
      body.appendChild(kpCard);

      let kpItems = [];

      function renderKp() {
        kpItems = pickKpGroup();
        window.LearnedHistory.record("common_kp", kpItems.map(x => x.id));
        const kpList = kpCard.querySelector("#kpList");
        kpList.innerHTML = "";
        if (!kpItems.length) {
          kpList.innerHTML = `<div class="empty">暂无常用知识点数据</div>`;
        } else {
          kpItems.forEach((it, i) => {
            const row = UI.el(`<div class="todo" style="align-items:flex-start">
              <div style="flex:1"><b class="muted small">${i + 1}.</b> <span>${UI.esc(it.prompt)}</span> ${kpTag(it)}
              <div class="kp-a" style="display:none;margin-top:4px;color:#34e7e4">答：${UI.esc(it.answer)}</div></div>
              <button class="btn ghost sm" data-rev>看答案</button></div>`);
            row.querySelector("[data-rev]").onclick = (e) => {
              const a = row.querySelector(".kp-a");
              const show = a.style.display === "none";
              a.style.display = show ? "block" : "none";
              e.target.textContent = show ? "收起" : "看答案";
            };
            kpList.appendChild(row);
          });
        }

        const st = EBc.getStats(KP_GROUP);
        const unrev = Math.max(0, st.total - st.seen);
        kpCard.querySelector("#kpStats").innerHTML = `
          <div class="eb-stat"><span class="n">${st.seen}/${st.total}</span><span class="l">已复习 / 总数</span></div>
          <div class="eb-stat"><span class="n">${unrev}</span><span class="l">未复习</span></div>
          <div class="eb-stat"><span class="n">${st.due}</span><span class="l">待复习(到期)</span></div>
          <div class="eb-stat"><span class="n">${st.mastered}</span><span class="l">已掌握</span></div>
          <div class="eb-stat"><span class="n">${st.accuracy}%</span><span class="l">正确率</span></div>
          <div class="eb-stat"><span class="n">${kpState.round || 1}</span><span class="l">轮次</span></div>`;
      }

      renderKp();

      function fcItems() { return kpItems.map(x => ({ id: x.id, prompt: x.prompt, answer: x.answer })); }
      kpCard.querySelector("#kpEasy").onclick = () => {
        if (!kpItems.length) return;
        window.Flashcard.start({
          title: "常识 · 常用知识点", subtitle: "把本组 10 个全部背完",
          group: KP_GROUP, subject: "常识", items: fcItems(),
          mode: "easy", frontLabel: "知识点", backLabel: "答案", shuffle: false
        });
      };
      kpCard.querySelector("#pkHard").onclick = () => {
        if (!kpItems.length) return;
        window.Flashcard.start({
          title: "常识 · 常用知识点", subtitle: "把本组 10 个全部背完",
          group: KP_GROUP, subject: "常识", items: fcItems(),
          mode: "hard", frontLabel: "知识点", backLabel: "答案", shuffle: false
        });
      };
      kpCard.querySelector("#kpNext").onclick = () => { renderKp(); UI.toast("已换一组"); };
      kpCard.querySelector("#kpExp").onclick = () => {
        if (!kpItems.length) { UI.toast("暂无内容可导出"); return; }
        const html = kpItems.map((it, i) => `<div class="item"><b>${i + 1}. ${UI.esc(it.prompt)}</b><div class="muted small">答：${UI.esc(it.answer)}</div></div>`).join("");
        window.PDF.exportHtml("常识 · 常用知识点（第" + (kpState.round || 1) + "轮 · " + DB.today() + "）", html);
      };
      kpCard.querySelector("#kpReset").onclick = () => {
        EBc.resetGroup(KP_GROUP);
        DB.state.common.kpDeck = { seed: (Math.random() * 1e9) | 0, ptr: 0, round: 1 };
        DB.save();
        UI.toast("已重置常用知识点记忆进度"); window.MODULES.common.render(body);
      };
      const kpMap = {}; KP_ALL.forEach(x => kpMap[x.id] = x);
      kpCard.querySelector("#kpLearned").onclick = () => {
        window.LearnedHistory.open("common_kp", "常识 · 常用知识点", (id) => {
          const it = kpMap[id]; if (!it) return null;
          return { primary: it.prompt, secondary: "答：" + it.answer };
        });
      };
    }
  };
})();
