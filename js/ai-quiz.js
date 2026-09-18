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
      const options = q.options.slice(0, 4).map(o => String(o == null ? "" : o).trim());
      while (options.length && !options[options.length - 1]) options.pop();
      if (options.length < 2) return;
      let a = q.a;
      if (typeof a === "string") {
        const letters = a.toUpperCase().replace(/[^A-D]/g, "");
        if (!letters) return;
        a = letters.length > 1 ? letters : (letters.charCodeAt(0) - 65);
      }
      if (typeof a !== "number" || a < 0 || a >= options.length) return;
      out.push({ q: String(q.q).trim(), options: options, a: a, e: String(q.e || "").trim() });
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
    const title = (m && m.title ? m.title : key) + "AI出题";
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

    function start(setId) {
      const set = st.sets.find(s => s.id === setId) || st.sets[0];
      if (!set) return;
      quizHost.innerHTML = "";
      const c = document.createElement("div");
      quizHost.appendChild(c);
      try {
        quizHost.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) {}
      window.Quiz.start(c, set.questions.map(q => Object.assign({}, q)), set.subject || (m && m.title) || "AI出题", {});
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
