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
      try { UI.floatingAnno("常识", "common_kp", kpCard); } catch (e) {}

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
          <div class="eb-stat" id="kpDueStat" style="cursor:pointer" title="点击：学习 / 测试"><span class="n">${st.due}</span><span class="l">待复习(到期) · 点此</span></div>
          <div class="eb-stat"><span class="n">${st.mastered}</span><span class="l">已掌握</span></div>
          <div class="eb-stat"><span class="n">${st.accuracy}%</span><span class="l">正确率</span></div>
          <div class="eb-stat"><span class="n">${kpState.round || 1}</span><span class="l">轮次</span></div>`;
        const dueEl = kpCard.querySelector("#kpDueStat");
        if (dueEl) dueEl.onclick = () => {
          const due = KP_ALL.filter(x => EBc.isDue(KP_GROUP, x.id));
          window.KGReview.open({
            title: "常识 · 常用知识点 · 待复习", subject: "常识", group: KP_GROUP,
            items: due.map(x => ({ id: x.id, prompt: x.prompt, answer: x.answer })),
            frontLabel: "知识点", backLabel: "答案",
            emptyMsg: "当前没有到期待复习的常识知识点",
            onExit: () => { renderKp(); }
          });
        };
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
        let html = kpItems.map((it, i) => `<div class="item"><b>${i + 1}. ${UI.esc(it.prompt)}</b><div class="muted small">答：${UI.esc(it.answer)}</div></div>`).join("");
        const notes = UI.Notes.get(SUBJECT, "common_main");
        if (notes && notes.strokes && notes.strokes.length) {
          const W = notes.vw || 720;
          html = `<div style="position:relative;width:${W}px">${html}${UI.Notes.overlayHtml(notes)}</div>`;
        }
        html += UI.Attachments.toHtml(SUBJECT, "common_main");
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
      /* ===== 常识口诀88条（学习 + 背口诀 + 实战练题；橙色标注→红色显示） ===== */
      try {
        const KJ = window.KJ88;
        if (KJ && KJ.chapters && KJ.chapters.length) {
          const entries = [];
          KJ.chapters.forEach(c => (c.entries || []).forEach(e => entries.push(Object.assign({ chapter: c.name }, e))));
          const KJ_GROUP = "common_kj88";   // 艾宾浩斯调度分组
          const EBc = window.Ebbinghaus;
          const kjCard = document.createElement("div");
          kjCard.className = "card";
          const chOpts = KJ.chapters.map((c, i) => `<option value="${i}">${UI.esc(c.name)}（${(c.entries || []).length}条）</option>`).join("");
          kjCard.innerHTML = `
            <h3>🧿 常识口诀88条</h3>
            <div class="muted small">口诀与释义按原书排版分级展示（橙色标注以红色呈现）；学习按每组 10 条推进，复习按艾宾浩斯遗忘曲线安排；可练实战题、写手写笔记（永久保存）。</div>
            <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap">
              <button class="btn primary" id="kjLearn">📖 学习</button>
              <button class="btn" id="kjBrowse">📑 通览全部</button>
              <select id="kjCh" style="max-width:220px">${chOpts}</select>
              <button class="btn" id="kjQuiz">✍ 练实战题（本章）</button>
            </div>
            <div id="kjBody" style="margin-top:10px"></div>`;
          body.appendChild(kjCard);
          const kjBody = kjCard.querySelector("#kjBody");

          /* 橙色区间 → 红色文本（注意先分段再转义，保证下标对齐） */
          function kjHtml(t, o) {
            t = String(t == null ? "" : t);
            if (!o || !o.length) return UI.esc(t);
            let out = "", prev = 0;
            o.forEach(r => {
              const s = Math.max(prev, r[0]), e2 = Math.min(t.length, r[1]);
              if (e2 <= s) return;
              out += UI.esc(t.slice(prev, s));
              out += '<i class="kj-o">' + UI.esc(t.slice(s, e2)) + "</i>";
              prev = e2;
            });
            out += UI.esc(t.slice(prev));
            return out;
          }
          /* 行内的「术语：」前导加粗 */
          function kjLine(t, o) {
            let html = kjHtml(t, o);
            return html.replace(/^([\u4e00-\u9fffA-Za-z0-9（）()]{2,12})([:：])/, "<b>$1$2</b>");
          }
          /* 一条口诀的完整渲染（withSz：是否显示实战题） */
          function entryHtml(e, withSz) {
            let itemN = 0;
            const defHtml = (d) => {
              let h = "";
              if (d.label) { h += `<div class="kj-l1">${UI.esc(d.label)}</div>`; itemN = 0; }
              if (d.t) {
                itemN += 1;
                const m = d.t.match(/^([\u4e00-\u9fffA-Za-z0-9（）()]{2,12})([:：])/);
                const lead = m ? "<b>" + kjHtml(m[1]) + "</b>" + m[2] : "";
                const rest = m ? kjLine(d.t.slice(m[0].length), (d.o || []).map(r => [Math.max(0, r[0] - m[0].length), r[1] - m[0].length])) : kjLine(d.t, d.o);
                h += `<div class="kj-l2"><span class="kj-lv lv2">${itemN}</span>${lead}${rest}</div>`;
              }
              (d.subs || []).forEach(s => { h += `<div class="kj-l3"><span class="kj-lv lv3">▸</span>${kjLine(s.t, s.o)}</div>`; });
              return h;
            };
            return `<div class="kj-item">
              <h4>✅ ${UI.esc(e.num)} ${UI.esc(e.title)} <span class="muted small">· ${UI.esc(e.chapter || "")}</span></h4>
              ${(e.koujue || []).length ? `<div class="kj-sec">📖 口诀速背</div>
              ${(e.koujue || []).map(k => `<div><span class="kj-koujue">${kjHtml(k.t, k.o)}</span></div>`).join("")}` : ""}
              ${(e.defs || []).length ? `<div class="kj-sec">📝 口诀释义</div>
              ${(e.defs || []).map(defHtml).join("")}` : ""}
              ${withSz && (e.shizhan || []).length ? `<div class="row" style="margin-top:8px"><button class="btn primary sm" data-doquiz="${e.num}">⚔️ 去做题（${e.shizhan.length} 题）</button></div>` : ""}
            </div>`;
          }
          /* 实战题：悬浮窗练题/背题（含解析、正确率、AI 咨询、计时） */
          function openKjQuiz(e) {
            const qs = (e.shizhan || []).map((sh, si) => ({ _id: "kjq" + e.num + "_" + si, q: sh.q, options: sh.options, a: sh.a, e: sh.e || "" }));
            if (!qs.length) { UI.toast("本条暂无实战题"); return; }
            const host = UI.el(`<div class="kp-quiz" style="max-height:72vh;overflow:auto"></div>`);
            UI.modal({
              title: "⚔️ 口诀实战 · " + e.num + " " + e.title, body: host, width: "760px",
              actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }]
            });
            function run() { host.innerHTML = ""; window.Quiz.start(host, qs.map(q => Object.assign({}, q)), SUBJECT, { onAgain: run }); }
            run();
          }
          kjBody.addEventListener("click", (ev) => {
            const b = ev.target.closest("[data-doquiz]");
            if (!b) return;
            const e = entries.find(x => x.num === b.dataset.doquiz);
            if (e) openKjQuiz(e);
          });

          /* ===== 学习模式：每组10条，学习/复习弹窗，艾宾浩斯调度，逐级返回 ===== */
          const learnState = () => {
            const st = DB.state.common = DB.state.common || {};
            return st.kjLearn = st.kjLearn || { pos: 0 };
          };
          const dueList = () => entries.filter(e => {
            const r = EBc.getRecord(KJ_GROUP, "kj" + e.num);
            return !!(r && EBc.isDue(KJ_GROUP, "kj" + e.num));
          });
          function learnPage(start, mode, total) {
            const PAGE = 10;
            const list = mode === "review" ? total : entries;
            const slice = list.slice(start, start + PAGE);
            if (!slice.length) { UI.toast("没有需要处理的内容"); return; }
            const isReview = mode === "review";
            kjBody.innerHTML = `
              <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
                <b>${isReview ? "🔁 复习（艾宾浩斯到期）" : "📖 学习新内容"}</b>
                <span class="muted small">${isReview ? "到期 " + total.length + " 条" : "已学 " + learnState().pos + " / " + entries.length + " 条"} · 本组 ${slice.length} 条</span>
                <button class="btn ghost sm" id="kjBack">← 返回上一级</button>
              </div>
              ${slice.map(e => entryHtml(e, false)).join("")}
              <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
                ${start > 0 ? `<button class="btn" id="kjPrev">← 上一组</button>` : ""}
                <button class="btn primary" id="kjDone">${start + PAGE < list.length ? "看完这组，继续 →" : (isReview ? "✓ 完成本组复习" : "✓ 学完本组")}</button>
              </div>
              <div id="kjNavMore"></div>`;
            kjBody.querySelectorAll("[data-hw]").forEach(() => {});
            kjBody.querySelector("#kjBack").onclick = () => { kjBody.innerHTML = ""; try { kjCard.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {} };
            const doneBtn = kjBody.querySelector("#kjDone");
            doneBtn.onclick = () => {
              slice.forEach(e => { try { EBc.updateAfterReview(KJ_GROUP, "kj" + e.num, true); } catch (err) {} });
              if (!isReview) { learnState().pos = Math.max(learnState().pos, start + slice.length); }
              DB.save();
              const nextStart = start + PAGE;
              if (nextStart < list.length) {
                UI.toast((isReview ? "本组复习完成 ✓" : "本组学习完成 ✓") + " 继续 " + (nextStart + 1) + "-" + Math.min(nextStart + PAGE, list.length) + " 条");
                learnPage(nextStart, mode, total);
              } else {
                kjBody.innerHTML = `<div class="card center"><div style="font-size:20px">🎉 ${isReview ? "本轮复习全部完成" : "全部口诀学完了"}！</div>
                  <div class="muted small" style="margin:6px 0">复习会按艾宾浩斯遗忘曲线安排，到期后点「学习」即可复习。</div>
                  <button class="btn ghost" id="kjBack2">← 返回上一级</button></div>`;
                const b2 = kjBody.querySelector("#kjBack2");
                if (b2) b2.onclick = () => { kjBody.innerHTML = ""; };
              }
            };
            const prevBtn = kjBody.querySelector("#kjPrev");
            if (prevBtn) prevBtn.onclick = () => learnPage(Math.max(0, start - PAGE), mode, total);
            try { kjBody.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
          }
          kjCard.querySelector("#kjLearn").onclick = () => {
            const pos = learnState().pos;
            const due = dueList();
            const learnedN = entries.filter(e => EBc.getRecord(KJ_GROUP, "kj" + e.num)).length;
            // 首次学习：直接开始
            if (pos === 0 && !due.length) { learnPage(0, "learn"); return; }
            const mask = UI.el(`<div class="modal-mask"><div class="modal" style="max-width:420px">
              <h3>📖 常识口诀 · 学习</h3>
              <div class="muted small">已学 ${learnedN} / ${entries.length} 条${due.length ? " · 到期待复习 " + due.length + " 条" : ""}</div>
              <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px">
                ${pos < entries.length ? `<button class="btn primary" id="kjGoLearn">📖 学习（从第 ${pos + 1} 条继续）</button>` : ""}
                ${due.length ? `<button class="btn" id="kjGoReview">🔁 复习（${due.length} 条到期）</button>` : ""}
                <button class="btn ghost" id="kjCancel">取消</button>
              </div>
            </div></div>`);
            document.body.appendChild(mask);
            const go = (fn) => { mask.remove(); fn(); };
            const gl = mask.querySelector("#kjGoLearn");
            if (gl) gl.onclick = () => go(() => learnPage(pos, "learn"));
            const gr = mask.querySelector("#kjGoReview");
            if (gr) gr.onclick = () => go(() => learnPage(0, "review", due));
            mask.querySelector("#kjCancel").onclick = () => mask.remove();
            mask.onclick = (e2) => { if (e2.target === mask) mask.remove(); };
          };

          /* ===== 通览全部（按章） ===== */
          kjCard.querySelector("#kjBrowse").onclick = () => {
            const ci = parseInt(kjCard.querySelector("#kjCh").value, 10);
            const es = (KJ.chapters[ci].entries || []);
            kjBody.innerHTML = `
              <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
                <b>📑 ${UI.esc(KJ.chapters[ci].name)}</b>
                <button class="btn ghost sm" id="kjBack">← 返回上一级</button>
              </div>
              ${es.map(e => entryHtml(e, true)).join("")}`;
            kjBody.querySelector("#kjBack").onclick = () => { kjBody.innerHTML = ""; };
            try { kjBody.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
          };

          kjCard.querySelector("#kjQuiz").onclick = () => {
            const ci = parseInt(kjCard.querySelector("#kjCh").value, 10);
            const es = (KJ.chapters[ci].entries || []);
            const qs = [];
            es.forEach(e => {
              (e.shizhan || []).forEach((sh, si) => {
                if (sh && sh.q && Array.isArray(sh.options)) {
                  qs.push({ _id: "kjq" + e.num + "_" + si, q: sh.q, options: sh.options, a: sh.a, e: sh.e || "" });
                }
              });
            });
            if (!qs.length) { UI.toast("本章暂无实战题"); return; }
            renderQuiz(kjCard, qs, SUBJECT, {});
          };
        }
      } catch (e) { console.error("口诀88条板块出错", e); }
      try { body.appendChild(UI.notebook(SUBJECT, "common_main", body)); } catch (e) {}
    }
  };
})();
