/* AI 举一反三 · 出题板块
   - KGAIQuiz.moduleForSubject(subject)：科目名 → 模块 key（verbal/common/politics/logic/data/quantity/essay）
   - KGAIQuiz.addSet(modKey, subject, questions)：把 AI 生成的题目存入对应模块（累加）
   - KGAIQuiz.mount(body, key)：模块页渲染「xxAI出题」板块（无题目时不显示）；支持自动打开最新一组
   训练走通用 Quiz 引擎：练题/背题、问AI、收藏、错题、手写一应俱全。 */
(function () {
  "use strict";

  const MAP = [
    { re: /言语/, key: "verbal" },
    { re: /常识/, key: "common" },
    { re: /政治|毛中特|马原|党/, key: "politics" },
    { re: /逻辑|判断/, key: "logic" },
    { re: /资料/, key: "data" },
    { re: /数量|数学|运算/, key: "quantity" },
    { re: /申论/, key: "essay" }
  ];
  function moduleForSubject(subject) {
    const s = String(subject || "");
    for (let i = 0; i < MAP.length; i++) { if (MAP[i].re.test(s)) return MAP[i].key; }
    return null;
  }

  function store(modKey) {
    const DB = window.DB;
    DB.state.aiQuiz = DB.state.aiQuiz || {};
    const st = DB.state.aiQuiz[modKey] = DB.state.aiQuiz[modKey] || { sets: [], total: 0 };
    if (!st.sets) st.sets = [];
    if (st.total == null) st.total = st.sets.reduce((n, s) => n + (s.questions || []).length, 0);
    return st;
  }

  /* 归一化 AI 出的题：字母答案 → 引擎格式（单选 0 基数字 / 多选保留字母串） */
  function normalize(qs) {
    const out = [];
    (qs || []).forEach(q => {
      if (!q || !q.q || !Array.isArray(q.options) || q.options.length < 2) return;
      const options = q.options.slice(0, 4).map(o => String(o == null ? "" : o).trim().replace(/^\s*[A-Ja-j]\s*[\.、．:：]\s*/, ""));
      while (options.length && !options[options.length - 1]) options.pop();
      if (options.length < 2) return;
      let a = q.a;
      if (typeof a === "string") {
        const letters = a.toUpperCase().replace(/[^A-D]/g, "");
        if (!letters) return;
        a = letters.length > 1 ? letters : (letters.charCodeAt(0) - 65);
      }
      if (typeof a !== "number" || a < 0 || a >= options.length) return;
      out.push({ q: String(q.q).trim(), options: options, a: a, e: String(q.e || "").trim(), img: (q.img || null), bg: String(q.bg || "").trim() });
    });
    return out;
  }

  function addSet(modKey, subject, questions, opts) {
    const st = store(modKey);
    const qs = normalize(questions);
    if (!qs.length) return null;
    const set = {
      id: (window.DB && DB.uid) ? DB.uid() : ("ai" + Date.now()),
      ts: Date.now(),
      date: (window.DB && DB.today) ? DB.today() : "",
      subject: subject || "",
      n: qs.length,
      questions: qs
    };
    // 知识点查询写入的结构化考点讲解：学习页「先看考点 → 再刷题」
    if (opts && opts.point) set.point = opts.point;
    st.sets.unshift(set);
    st.total += qs.length;
    try { DB.save(); } catch (e) {}
    return set;
  }

  /* ===== 科目纠正（v20261006e）：AI 把知识点判错科目时，用户可手动改到正确模块 ===== */
  const MODULES_LIST = [
    { key: "verbal", label: "言语理解" },
    { key: "common", label: "常识" },
    { key: "politics", label: "政治理论" },
    { key: "logic", label: "逻辑判断" },
    { key: "data", label: "资料分析" },
    { key: "quantity", label: "数量关系" },
    { key: "essay", label: "申论" }
  ];
  function findSetAll(setId) {
    const DB = window.DB;
    const ai = DB.state.aiQuiz || {};
    for (const k in ai) {
      const st = ai[k];
      if (st && st.sets) {
        const idx = st.sets.findIndex(s => s.id === setId);
        if (idx >= 0) return { mod: k, st: st, idx: idx, set: st.sets[idx] };
      }
    }
    return null;
  }
  function currentModOf(setId) { const f = findSetAll(setId); return f ? f.mod : null; }
  function moveSet(setId, newMod) {
    const DB = window.DB;
    const found = findSetAll(setId);
    if (!found) return false;
    if (found.mod === newMod) return true;
    const set = found.set;
    found.st.sets.splice(found.idx, 1);
    const nst = store(newMod);
    nst.sets.unshift(set);
    const recompute = (m) => { const s = (DB.state.aiQuiz || {})[m]; if (s) s.total = s.sets.reduce((n, x) => n + (x.questions || []).length, 0); };
    recompute(found.mod); recompute(newMod);
    try { DB.save(); } catch (e) {}
    return true;
  }
  function reassign(set, newMod) {
    const label = (MODULES_LIST.find(m => m.key === newMod) || {}).label || newMod;
    set.subject = label;       // 修正科目标签（与路由模块一致）
    moveSet(set.id, newMod);
  }
  function bindLongPress(el, cb) {
    if (!el) return;
    let t = 0;
    const cancel = () => { if (t) { clearTimeout(t); t = 0; } };
    el.addEventListener("pointerdown", () => { t = setTimeout(() => { t = 0; cb(); }, 500); }, { passive: true });
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("contextmenu", e => { e.preventDefault(); cancel(); cb(); });
  }
  function openSubjectPicker(set, onPicked) {
    const UI = window.UI;
    const cur = currentModOf(set.id) || "";
    const btns = MODULES_LIST.map(m =>
      `<button class="btn sm ${m.key === cur ? "primary" : "ghost"}" data-mod="${m.key}">${m.label}</button>`
    ).join("");
    const box = UI.el(`<div>
      <div style="font-weight:700;margin-bottom:8px">✎ 纠正科目</div>
      <div class="muted small" style="margin-bottom:10px">AI 可能把「${UI.esc((set.point && set.point.title) || set.subject || "该知识点")}」判错了科目。请选择它真正所属的模块，提交后会移动到对应模块并修正科目标签。</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${btns}</div>
    </div>`);
    const mask = UI.el(`<div class="modal-mask"><div class="modal" style="max-width:460px"></div></div>`);
    mask.querySelector(".modal").appendChild(box);
    document.body.appendChild(mask);
    mask.addEventListener("click", e => { if (e.target === mask) mask.remove(); });
    box.querySelectorAll("[data-mod]").forEach(b => {
      b.onclick = () => { const mod = b.dataset.mod; mask.remove(); if (onPicked) onPicked(mod); };
    });
  }
  /* 在学习页顶部插入「当前科目 + 纠正」一行，并支持长按知识点标题纠正 */
  function injectSubjectControl(host, set) {
    if (!host) return;
    const UI = window.UI;
    const cur = currentModOf(set.id) || "";
    const lab = (MODULES_LIST.find(m => m.key === cur) || {}).label || (set.subject || "未分类");
    const row = UI.el(`<div class="aiq-subject-row">
      <span class="aiq-modtag">📂 当前科目：<b>${UI.esc(lab)}</b></span>
      <button class="btn sm ghost aiq-fix">✎ 科目不对？纠正</button>
    </div>`);
    host.insertBefore(row, host.firstChild);
    row.querySelector(".aiq-fix").onclick = () => openSubjectPicker(set, (newMod) => {
      reassign(set, newMod);
      const nl = (MODULES_LIST.find(m => m.key === newMod) || {}).label || newMod;
      row.querySelector(".aiq-modtag").innerHTML = "📂 当前科目：<b>" + UI.esc(nl) + "</b>";
      UI.toast("已移动到【" + nl + "】模块，下次在该模块可见");
    });
    bindLongPress(host.querySelector("h3"), () => row.querySelector(".aiq-fix").click());
  }

  /* 考点卡（v20261006a）：把 AI 拆解的知识点渲染成「先看考点」的学习区 */
  function pointHtml(p) {
    if (!p) return "";
    const esc = (s) => (window.UI && UI.esc) ? UI.esc(s) : String(s == null ? "" : s);
    let h = `<div class="card"><h3>📚 ${esc(p.title || "知识点")}${p.subject ? `　<span class="muted small">${esc(p.subject)}</span>` : ""}</h3>`;
    if (p.brief) h += `<div><b>一句话：</b>${esc(p.brief)}</div>`;
    if ((p.correct || []).length) {
      h += `<h4 style="margin:12px 0 6px">✅ 正确表述（先记）</h4><ul>`;
      (p.correct || []).forEach(x => { h += `<li>${esc(x)}</li>`; });
      h += `</ul>`;
    }
    if ((p.keywords || []).length) h += `<div><b>核心关键词：</b>${esc((p.keywords || []).join("、"))}</div>`;
    if ((p.examples || []).length) {
      h += `<h4 style="margin:12px 0 6px">📌 经典例子</h4><ol>`;
      (p.examples || []).forEach(x => { h += `<li><b>${esc(x.name || "")}</b>${x.text ? "：" + esc(x.text) : ""}</li>`; });
      h += `</ol>`;
    }
    if ((p.compare || []).length) {
      h += `<h4 style="margin:12px 0 6px">❗ 易混对比（必考挖坑）</h4>`;
      (p.compare || []).forEach(c => { h += `<div style="margin:4px 0"><b>${esc(c.a || "")}</b> VS <b>${esc(c.b || "")}</b>：${esc(c.diff || "")}</div>`; });
    }
    if ((p.traps || []).length) {
      h += `<h4 style="margin:12px 0 6px">⚠️ 命题陷阱（正 → 误）</h4>`;
      (p.traps || []).forEach(t => { h += `<div style="margin:4px 0">✅ ${esc(t.right || "")}<br>❌ ${esc(t.wrong || "")}</div>`; });
    }
    if ((p.essay || []).length) {
      h += `<h4 style="margin:12px 0 6px">✍ 申论可用搭配</h4><ul>`;
      (p.essay || []).forEach(x => { h += `<li>${esc(x)}</li>`; });
      h += `</ul>`;
    }
    if ((p.words || []).length) {
      h += `<h4 style="margin:12px 0 6px">🔤 词语释义与易混辨析</h4>`;
      (p.words || []).forEach(w => {
        h += `<div style="margin:6px 0"><b>${esc(w.term || "")}</b>：${esc(w.def || "")}`;
        (w.similar || []).forEach(s => { h += `<div class="muted small">· ${esc(s.w || "")}：${esc(s.diff || "")}</div>`; });
        h += `</div>`;
      });
    }
    h += `</div>`;
    return h;
  }

  /* 模块页挂板块：标题如「言语理解AI出题」；列表显示每组的题量/日期 + 开始训练 */
  function mount(body, key) {
    const UI = window.UI, DB = window.DB, MOD = window.MODULES || {};
    const st = (DB.state.aiQuiz || {})[key];
    if (!st || !st.sets || !st.sets.length) return;
    const m = MOD[key];
    const title = (key === "ai") ? "综合AI出题" : ((m && m.title ? m.title : key) + "AI出题");
    const sec = UI.section("🤖 " + title + "（累计 " + st.total + " 题 · " + st.sets.length + " 组）");
    body.appendChild(sec);
    const box = sec.querySelector(".kg-det-b");
    const host = document.createElement("div");
    host.innerHTML = `<div class="muted small" style="margin-bottom:6px">由 AI 根据你的错题/提问仿出，题目仅供巩固练习；点击「开始训练」进入练题（可切换背题模式）。</div>
      <div class="aiq-list"></div><div class="aiq-host"></div>`;
    box.appendChild(host);
    const list = host.querySelector(".aiq-list");
    const quizHost = host.querySelector(".aiq-host");

    function renderList() {
      list.innerHTML = st.sets.map((s, i) => {
        const title = (s.point && s.point.title) ? s.point.title : (s.subject || "AI 出题");
        const meta = `第 ${st.sets.length - i} 组 · ${s.n} 题${i === 0 ? ' <span class="tag">最新</span>' : ""}`;
        return `<div class="aiq-item">
          <div class="aiq-main">
            <div class="aiq-title">${UI.esc(title)}</div>
            <div class="muted small">${meta}</div>
          </div>
          <span class="aiq-date">${UI.esc(s.date || "")}</span>
          <button class="btn sm primary" data-open="${s.id}">✍ 开始训练</button>
        </div>`;
      }).join("");
      list.querySelectorAll("[data-open]").forEach(b => {
        b.onclick = () => start(b.dataset.open);
      });
    }

    /* 交卷后「再来一组」：默认让 AI 再出一组新题并直接进入训练（不再刷新页面） */
    function again(set) {
      if (!(window.KGAI && KGAI.jyfsAuto)) { UI.toast("自动生成新题暂不可用，请到 AI 咨询页出题"); return; }
      const ref = (set.questions && set.questions[0]) || null;
      let ctx = "";
      if (ref) {
        ctx = "【参考题（同考点，出新题）】\n" + String(ref.q || "") + "\n"
          + (ref.options || []).map((x, i) => "ABCD"[i] + ". " + x).join("\n")
          + (ref.e ? "\n【解析】" + ref.e : "");
      } else if (set.subject) ctx = "【科目】" + set.subject;
      KGAI.jyfsAuto(set.n || 5, { modKey: key, subject: set.subject || "", ctxText: ctx });
    }

    function start(setId) {
      const set = st.sets.find(s => s.id === setId) || st.sets[0];
      if (!set) return;
      // 综合AI出题：AI 聊天页不放内嵌答题（避免题目「在页面底部出来」），改为弹窗全屏训练
      if (key === "ai") {
        const mask = UI.el(`<div class="modal-mask"><div class="modal" style="max-width:820px;max-height:90vh;overflow:auto">
          ${set.point ? pointHtml(set.point) : ""}
          <h3>🤖 综合AI出题 · ${esc(set.subject || "综合")} · ${set.n} 题</h3>
          <div class="aiq-modal-quiz"></div>
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost aiq-close">收起</button></div>
        </div></div>`);
        document.body.appendChild(mask);
        injectSubjectControl(mask.querySelector(".modal"), set);
        mask.querySelector(".aiq-close").onclick = () => mask.remove();
        try {
          window.Quiz.start(mask.querySelector(".aiq-modal-quiz"), set.questions.map(q => Object.assign({}, q)), set.subject || "综合AI出题",
            { onAgain: () => { mask.remove(); again(set); } });
        } catch (e) { console.error(e); mask.remove(); UI.toast("训练启动失败：" + e.message); }
        return;
      }
      quizHost.innerHTML = "";
      // 有考点讲解：学习页 = 考点卡 + 「练题」按钮；点按钮才进入答题（先学后练）
      if (set.point) {
        const ph = document.createElement("div");
        ph.innerHTML = pointHtml(set.point);
        quizHost.appendChild(ph);
        injectSubjectControl(quizHost, set);
        const go = UI.el(`<div class="center" style="margin:12px 0">
          <button class="btn primary" style="min-width:200px">✍ 看完考点，开始练题（${set.n} 题 · 可切背题）</button>
          <div class="muted small" style="margin-top:4px">练题/背题可切换，支持收藏、勾画与每题用时统计</div>
        </div>`);
        quizHost.appendChild(go);
        go.querySelector("button").onclick = () => { go.remove(); launchQuiz(set); };
        try { quizHost.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
        try { window.scrollTo(0, 0); } catch (e) {}
        return;
      }
      launchQuiz(set);
    }

    function launchQuiz(set) {
      const c = document.createElement("div");
      quizHost.appendChild(c);
      try {
        quizHost.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) {}
      window.Quiz.start(c, set.questions.map(q => Object.assign({}, q)), set.subject || (m && m.title) || "AI出题",
        { onAgain: () => again(set) });
    }

    /* 自动打开学习页：全屏弹层承载「考点卡 + 练题」，避免被 Pager 吸收成方格后内容不可见 */
    function openStudyModal(set) {
      const mask = UI.el(`<div class="modal-mask"><div class="modal" style="max-width:880px;max-height:92vh;overflow:auto">
        ${set.point ? pointHtml(set.point) : ""}
        <h3>📚 考点学习 · ${UI.esc(set.subject || "")} · ${set.n} 题</h3>
        <div class="aiq-modal-quiz"></div>
        <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost aiq-close">收起</button></div>
      </div></div>`);
      document.body.appendChild(mask);
      injectSubjectControl(mask.querySelector(".modal"), set);
      mask.querySelector(".aiq-close").onclick = () => mask.remove();
      const qh = mask.querySelector(".aiq-modal-quiz");
      const launch = () => {
        try { window.Quiz.start(qh, set.questions.map(q => Object.assign({}, q)), set.subject || (m && m.title) || "AI出题", { onAgain: () => { mask.remove(); again(set); } }); }
        catch (e) { console.error(e); mask.remove(); UI.toast("训练启动失败：" + e.message); }
      };
      if (set.point) {
        const go = UI.el(`<div class="center" style="margin:14px 0">
          <button class="btn primary" style="min-width:220px">✍ 看完考点，开始练题（${set.n} 题 · 可切背题）</button>
          <div class="muted small" style="margin-top:4px">练题/背题可切换，支持收藏、勾画与每题用时统计</div>
        </div>`);
        qh.parentNode.insertBefore(go, qh);
        go.querySelector("button").onclick = () => { go.remove(); launch(); };
      } else {
        launch();
      }
    }

    renderList();

    // 自动打开（AI 出完题跳转过来时）：直接弹出考点学习页，无需用户手动点
    try {
      const auto = window.__aiQuizAuto;
      if (auto && auto.mod === key) {
        window.__aiQuizAuto = null;
        setTimeout(() => {
          const set = st.sets.find(s => s.id === auto.setId);
          if (set) openStudyModal(set);
          else start(auto.setId);
        }, 250);
      }
    } catch (e) {}
  }

  window.KGAIQuiz = { moduleForSubject: moduleForSubject, addSet: addSet, mount: mount, normalize: normalize };
})();
