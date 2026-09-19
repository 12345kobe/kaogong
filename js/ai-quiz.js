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
      out.push({ q: String(q.q).trim(), options: options, a: a, e: String(q.e || "").trim(), img: (q.img || null) });
    });
    return out;
  }

  function addSet(modKey, subject, questions) {
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
    st.sets.unshift(set);
    st.total += qs.length;
    try { DB.save(); } catch (e) {}
    return set;
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
      list.innerHTML = st.sets.map((s, i) => `
        <div class="spread" style="padding:6px 0;border-bottom:1px dashed var(--line)">
          <span>第 ${st.sets.length - i} 组 · ${UI.esc(s.date || "")} · ${s.n} 题${i === 0 ? ' <span class="tag">最新</span>' : ""}</span>
          <button class="btn sm primary" data-open="${s.id}">✍ 开始训练</button>
        </div>`).join("");
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
      KGAI.jyfsAuto(set.n || 5, { modKey: key, subject: set.subject || "", ctxText: ctx, useImg: false });
    }

    function start(setId) {
      const set = st.sets.find(s => s.id === setId) || st.sets[0];
      if (!set) return;
      // 综合AI出题：AI 聊天页不放内嵌答题（避免题目「在页面底部出来」），改为弹窗全屏训练
      if (key === "ai") {
        const mask = UI.el(`<div class="modal-mask"><div class="modal" style="max-width:820px;max-height:90vh;overflow:auto">
          <h3>🤖 综合AI出题 · ${esc(set.subject || "综合")} · ${set.n} 题</h3>
          <div class="aiq-modal-quiz"></div>
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost aiq-close">收起</button></div>
        </div></div>`);
        document.body.appendChild(mask);
        mask.querySelector(".aiq-close").onclick = () => mask.remove();
        try {
          window.Quiz.start(mask.querySelector(".aiq-modal-quiz"), set.questions.map(q => Object.assign({}, q)), set.subject || "综合AI出题",
            { onAgain: () => { mask.remove(); again(set); } });
        } catch (e) { console.error(e); mask.remove(); UI.toast("训练启动失败：" + e.message); }
        return;
      }
      quizHost.innerHTML = "";
      const c = document.createElement("div");
      quizHost.appendChild(c);
      try {
        quizHost.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) {}
      window.Quiz.start(c, set.questions.map(q => Object.assign({}, q)), set.subject || (m && m.title) || "AI出题",
        { onAgain: () => again(set) });
    }

    renderList();

    // 自动打开（AI 出完题跳转过来时）
    try {
      const auto = window.__aiQuizAuto;
      if (auto && auto.mod === key) {
        window.__aiQuizAuto = null;
        setTimeout(() => start(auto.setId), 120);
      }
    } catch (e) {}
  }

  window.KGAIQuiz = { moduleForSubject: moduleForSubject, addSet: addSet, mount: mount, normalize: normalize };
})();
