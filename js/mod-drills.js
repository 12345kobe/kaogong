/* 模块：刷题中心（粉笔式，v20261018a）
   - 左侧栏「上岸计时器」正下方入口，标签「刷题」。
   - 一级科目（言语理解/判断推理/数量关系/资料分析/常识判断/政治理论/我的题册）：
       点科目名 = 该科全部题混合随机刷；点左侧箭头展开二/三级目录，点具体目录刷对应题。
   - 所有出题均为随机打乱（Fisher-Yates），绝不按原顺序。
   - 每级展示 题量 / 正确率 / 月亮掌握度（5星=100%，3星=60%，3.5星=70%，即 acc*5 四舍五入到 0.5）。
   - 每次刷完：正确率进步/退步弹 Q 弹（duangduang）可爱弹窗鼓励/提醒；科举等级变化也弹庆祝窗。
   - 掌握度存 DB.state.drillStat = { "<leafId>": {done, right} }（按叶子目录累计）。
   - 科举等级：阈值=总题量百分比动态计算（补题后自动缩放）：
       秀才0% → 举人5% → 贡士12% → 进士22% → 探花35% → 榜眼50% → 状元100%（刷完全部=状元）。
       左上角 brand 图标换成对应等级「读书人」AI 图 + 等级名 + 进度条 + 距下一级差 N 题。 */
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};

  /* ================= 工具 ================= */
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
  function stripPrefix(o) { return String(o == null ? "" : o).replace(/^\s*[A-D][．.、]\s*/, ""); }
  function cleanName(n) { return String(n || "").replace(/\s+/g, " ").replace(/\.pdf$/i, "").trim(); }

  /* ================= 题目归一化 ================= */
  function normQs(raw, leafId) {
    return (raw || []).filter(q => q && q.q && Array.isArray(q.options) && q.options.length >= 2).map(q => ({
      q: q.q, options: q.options.map(stripPrefix), a: q.a, e: q.e || "", img: q.img || "",
      multi: q.multi || (typeof q.a === "string" && q.a.length > 1 ? q.a : ""), __leaf: leafId
    }));
  }
  function firstArr(o) { return Array.isArray(o) ? o : ((o && (o.items || o.questions || o.qs)) || []); }

  /* ================= 树构建（所有题册聚合） ================= */
  /* 节点：{id, name, qs?(叶子题组), children?}；中间节点由 children 聚合题量/掌握度 */
  function buildTree() {
    const W = window;
    const subs = [];

    /* ---- 言语理解：5000题按自身目录 拆二/三级 ---- */
    try {
      if (W.VERBAL_5000 && Array.isArray(W.VERBAL_5000.chapters)) {
        const chs = [];
        W.VERBAL_5000.chapters.forEach((c, ci) => {
          const secs = [];
          (c.sections || []).forEach((s, si) => {
            const qs = normQs(s.questions, `verbal.${ci}.${si}`);
            if (qs.length) secs.push({ id: `verbal.${ci}.${si}`, name: cleanName(s.name) || `第${si + 1}节`, qs });
          });
          if (secs.length) chs.push({ id: `verbal.c${ci}`, name: cleanName(c.name) || `第${ci + 1}章`, children: secs });
        });
        if (chs.length) subs.push({ id: "verbal", name: "言语理解", icon: "📘", children: chs });
      }
    } catch (e) { console.error("drills verbal", e); }

    /* ---- 判断推理：3200题册 14 sections + OCR 新题册(KG_JUDGMENT_EXTRA) ---- */
    try {
      const J = W.KG_JUDGMENT;
      if (J && Array.isArray(J.sections)) {
        const grp = { "图形推理": [], "逻辑判断": [] };
        const singles = [];
        J.sections.forEach((s, si) => {
          const nm = cleanName(s.name);
          const qs = normQs(s.items, `judg.${si}`);
          if (!qs.length) return;
          if (nm.indexOf("图形推理") === 0) {
            const sub = nm.replace(/^图形推理[·•・]?\s*/, "");
            grp["图形推理"].push({ id: `judg.${si}`, name: sub ? sub : "平面图推", qs });
          } else if (/论证|翻译|分析推理|真假|结构|原因|归纳/.test(nm)) {
            grp["逻辑判断"].push({ id: `judg.${si}`, name: nm, qs });
          } else singles.push({ id: `judg.${si}`, name: nm, qs });
        });
        const kids = [];
        if (grp["图形推理"].length) kids.push({ id: "judg.graph", name: "图形推理", children: grp["图形推理"] });
        if (grp["逻辑判断"].length) kids.push({ id: "judg.logic", name: "逻辑判断", children: grp["逻辑判断"] });
        singles.forEach(s => kids.push(s));
        /* OCR 新题册：KG_JUDGMENT_EXTRA = { groups:[{name, sections:[{name, questions|items}]}] } */
        const EX = W.KG_JUDGMENT_EXTRA;
        if (EX && Array.isArray(EX.groups)) {
          EX.groups.forEach((g, gi) => {
            const secs = [];
            (g.sections || []).forEach((s, si) => {
              const qs = normQs(s.questions || s.items, `judgx.${gi}.${si}`);
              if (qs.length) secs.push({ id: `judgx.${gi}.${si}`, name: cleanName(s.name) || `第${si + 1}节`, qs });
            });
            if (secs.length === 1) kids.push(secs[0]);
            else if (secs.length) kids.push({ id: `judgx.g${gi}`, name: cleanName(g.name), children: secs });
          });
        }
        if (kids.length) subs.push({ id: "judgment", name: "判断推理", icon: "🧩", children: kids });
      }
    } catch (e) { console.error("drills judgment", e); }

    /* ---- 数量关系：现有 PDF 录入题册 + 扩展位 ---- */
    try {
      const kids = collectPdfBooks("数量");
      const EX = W.KG_QUANTITY_EXTRA;
      if (EX && Array.isArray(EX.groups)) EX.groups.forEach((g, gi) => {
        const secs = [];
        (g.sections || []).forEach((s, si) => { const qs = normQs(s.questions || s.items, `qtyx.${gi}.${si}`); if (qs.length) secs.push({ id: `qtyx.${gi}.${si}`, name: cleanName(s.name), qs }); });
        if (secs.length) kids.push({ id: `qtyx.g${gi}`, name: cleanName(g.name), children: secs });
      });
      subs.push({ id: "quantity", name: "数量关系", icon: "🔢", children: kids });
    } catch (e) { console.error("drills quantity", e); }

    /* ---- 资料分析：PDF 题册 + 扩展位 ---- */
    try {
      const kids = collectPdfBooks("资料");
      const EX = W.KG_DATA_EXTRA;
      if (EX && Array.isArray(EX.groups)) EX.groups.forEach((g, gi) => {
        const secs = [];
        (g.sections || []).forEach((s, si) => { const qs = normQs(s.questions || s.items, `datax.${gi}.${si}`); if (qs.length) secs.push({ id: `datax.${gi}.${si}`, name: cleanName(s.name), qs }); });
        if (secs.length) kids.push({ id: `datax.g${gi}`, name: cleanName(g.name), children: secs });
      });
      subs.push({ id: "data", name: "资料分析", icon: "📊", children: kids });
    } catch (e) { console.error("drills data", e); }

    /* ---- 常识判断：COMMON_BANK 五大块 + 口诀88(有题则收) ---- */
    try {
      const CB = W.COMMON_BANK;
      const kids = [];
      const names = { geo: "地理常识", law: "法律常识", eco: "经济常识", tech: "科技常识", pol: "政治常识" };
      if (CB) Object.keys(names).forEach(k => {
        const qs = normQs(firstArr(CB[k]), `common.${k}`);
        if (qs.length) kids.push({ id: `common.${k}`, name: names[k], qs });
      });
      const EX = W.KG_COMMON_EXTRA;
      if (EX && Array.isArray(EX.groups)) EX.groups.forEach((g, gi) => {
        const secs = [];
        (g.sections || []).forEach((s, si) => { const qs = normQs(s.questions || s.items, `commonx.${gi}.${si}`); if (qs.length) secs.push({ id: `commonx.${gi}.${si}`, name: cleanName(s.name), qs }); });
        if (secs.length === 1) kids.push(secs[0]);
        else if (secs.length) kids.push({ id: `commonx.g${gi}`, name: cleanName(g.name), children: secs });
      });
      if (kids.length) subs.push({ id: "common", name: "常识判断", icon: "🛡️", children: kids });
    } catch (e) { console.error("drills common", e); }

    /* ---- 政治理论：二级=各刷题册（必刷题集/单选/多选/判断/母题200/预测300） ---- */
    try {
      const M = W.MUTI;
      if (M && Array.isArray(M.chapters)) {
        const kids = [];
        M.chapters.forEach((c, ci) => {
          const qs = normQs(c.questions, `muti.${ci}`);
          if (qs.length) kids.push({ id: `muti.${ci}`, name: cleanName(c.name) || `题册${ci + 1}`, qs });
        });
        if (kids.length) subs.push({ id: "politics", name: "政治理论", icon: "⭐", children: kids });
      }
    } catch (e) { console.error("drills politics", e); }

    /* ---- 我的题册：PDF 录入的其余学科 ---- */
    try {
      const kids = collectPdfBooks("");
      if (kids.length) subs.push({ id: "mybooks", name: "我的题册", icon: "📂", children: kids });
    } catch (e) { console.error("drills mybooks", e); }

    return subs;
  }

  /* PDF 录入题册按学科收集（subjectKey 为空=全部未被上面科目收走的） */
  function collectPdfBooks(subjectKey) {
    const DB = window.DB;
    const out = [];
    try {
      const books = (DB && DB.state && Array.isArray(DB.state.pdfBooks)) ? DB.state.pdfBooks : [];
      books.forEach((b, bi) => {
        const subj = String(b.subject || "");
        if (subjectKey) { if (subj.indexOf(subjectKey) < 0) return; }
        else if (/数量|资料|言语|判断|常识|政治/.test(subj)) return; // 已被专属科目收录
        const secs = [];
        (b.sections || []).forEach((s, si) => {
          const qs = normQs(s.questions, `pdf.${bi}.${si}`);
          if (qs.length) secs.push({ id: `pdf.${bi}.${si}`, name: cleanName(s.name) || `第${si + 1}节`, qs });
        });
        if (!secs.length) return;
        const node = { id: `pdf.b${bi}`, name: cleanName(b.named || b.name) || `题册${bi + 1}`, children: secs };
        out.push(node);
      });
    } catch (e) { console.error("collectPdfBooks", e); }
    return out;
  }

  /* ================= 掌握度统计 ================= */
  function statMap() {
    const DB = window.DB;
    if (!DB.state.drillStat || typeof DB.state.drillStat !== "object") DB.state.drillStat = {};
    return DB.state.drillStat;
  }
  function leafStat(id) { const m = statMap(); return m[id] || (m[id] = { done: 0, right: 0 }); }
  function recordAnswer(leafId, right) {
    const st = leafStat(leafId);
    st.done++; if (right) st.right++;
  }
  function aggStat(node) {
    // 聚合 node 及其子树所有叶子的 done/right
    let done = 0, right = 0;
    (function walk(n) {
      if (n.qs) { const s = statMap()[n.id]; if (s) { done += s.done; right += s.right; } }
      (n.children || []).forEach(walk);
    })(node);
    return { done, right };
  }
  function pctOf(node) { const s = aggStat(node); return s.done ? s.right / s.done : null; }
  /* 月亮掌握度：acc(0~1) → 0~5 星，0.5 步进。5星=100%，3星=60%，3.5星=70% */
  function moons(node) {
    const p = pctOf(node);
    if (p == null) return '<span class="kk-moons kk-moon-none">☆☆☆☆☆</span>';
    const half = Math.round(p * 10) / 2; // 0,0.5..5
    const full = Math.floor(half), isHalf = (half - full) >= 0.5;
    const parts = [];
    for (let i = 0; i < full; i++) parts.push("🌕");
    if (isHalf) parts.push("🌗");
    while (parts.length < 5) parts.push("🌑");
    return `<span class="kk-moons">${parts.join("")}</span>`;
  }

  /* ================= 科举等级 ================= */
  const LEVELS = [
    { name: "秀才", p: 0, img: "assets/img/scholar_1.png" },
    { name: "举人", p: 0.05, img: "assets/img/scholar_2.png" },
    { name: "贡士", p: 0.12, img: "assets/img/scholar_3.png" },
    { name: "进士", p: 0.22, img: "assets/img/scholar_4.png" },
    { name: "探花", p: 0.35, img: "assets/img/scholar_5.png" },
    { name: "榜眼", p: 0.50, img: "assets/img/scholar_6.png" },
    { name: "状元", p: 1.00, img: "assets/img/scholar_7.png" }
  ];
  function treeTotal() {
    let n = 0;
    (buildTree() || []).forEach(s => (function walk(x) { if (x.qs) n += x.qs.length; (x.children || []).forEach(walk); })(s));
    return n;
  }
  function doneCount() {
    let n = 0;
    const m = statMap();
    Object.keys(m).forEach(k => { n += (m[k] && m[k].done) || 0; });
    return n;
  }
  function levelIndex() {
    const total = treeTotal() || 1, done = doneCount();
    let idx = 0;
    LEVELS.forEach((L, i) => { if (done >= total * L.p) idx = i; });
    return idx;
  }
  /* 左上角 brand：读书人图 + 等级名 + 进度条 + 距下一级差 N 题 */
  function renderBrand() {
    try {
      const idx = levelIndex();
      const L = LEVELS[idx];
      const total = treeTotal() || 1, done = doneCount();
      const img = document.getElementById("kingkeImg");
      if (img) {
        const want = L.img;
        if (img.getAttribute("src") !== want) img.src = want;
        img.parentNode && img.parentNode.classList.add("has-img");
      }
      const t = document.getElementById("kingkeTitle");
      if (t) t.textContent = L.name;
      const bar = document.getElementById("kingkeBar");
      if (bar) {
        let from = LEVELS[idx].p * 100, to = idx < LEVELS.length - 1 ? LEVELS[idx + 1].p * 100 : 100;
        const w2 = Math.max(0, Math.min(100, (done / total * 100 - from) / Math.max(1e-6, to - from) * 100));
        bar.style.width = (idx === LEVELS.length - 1 ? 100 : w2) + "%";
      }
      const sub = document.getElementById("kingkeSub");
      if (sub) {
        if (idx === LEVELS.length - 1) sub.textContent = `状元及第 · 累计刷题 ${done}`;
        else {
          const need = Math.max(0, Math.ceil(total * LEVELS[idx + 1].p - done));
          sub.textContent = `距「${LEVELS[idx + 1].name}」还差 ${need} 题`;
        }
      }
    } catch (e) {}
  }
  /* 升级/降级 Q 弹庆祝窗 */
  let lastLevel = null;
  function checkLevelPopup() {
    try {
      const idx = levelIndex();
      if (lastLevel == null) { lastLevel = idx; return; }
      if (idx !== lastLevel) {
        const up = idx > lastLevel;
        const from = LEVELS[lastLevel].name, to = LEVELS[idx].name;
        lastLevel = idx;
        celebrate(up, from, to);
      }
    } catch (e) {}
  }
  function celebrate(up, fromName, toName) {
    const old = document.getElementById("kkCelebrate");
    if (old) old.remove();
    const mask = document.createElement("div");
    mask.id = "kkCelebrate";
    mask.className = "kk-celebrate-mask";
    const emojis = up ? "🎉🎊🏆✨" : "🌱💪📚";
    const title = up ? `恭喜晋升「${toName}」！` : `暂时回到「${toName}」`;
    const words = up
      ? ["十年寒窗，一朝题名！", "笔墨生辉，再接再厉！", "这位同学，未来的状元就是你！", "金榜题名时，刷题莫停息～"]
      : ["胜败乃常事，重整旗鼓再战！", "状元也是从秀才刷上来的，加油！", "错题都是垫脚石，继续冲！", "别灰心，下一题就是转机～"];
    const word = words[Math.floor(Math.random() * words.length)];
    mask.innerHTML = `<div class="kk-celebrate-card ${up ? "up" : "down"}">
      <div class="kk-c-emo">${emojis}</div>
      <div class="kk-c-title">${esc(title)}</div>
      <div class="kk-c-word">${esc(word)}</div>
      <div class="kk-c-sub">${up ? `${esc(fromName)} → ${esc(toName)}` : "正确率有所回落，温故而知新"}</div>
      <button class="btn primary" id="kkCeleOk">继续加油！</button>
    </div>`;
    document.body.appendChild(mask);
    const close = () => { try { mask.classList.add("out"); setTimeout(() => mask.remove(), 260); } catch (e) {} };
    mask.querySelector("#kkCeleOk").onclick = close;
    mask.onclick = (e) => { if (e.target === mask) close(); };
  }
  /* 正确率进步/退步 Q 弹弹窗（每次刷完弹出） */
  function accuracyPopup(nodeName, beforePct, afterPct) {
    const old = document.getElementById("kkAccPopup");
    if (old) old.remove();
    if (beforePct == null && afterPct == null) return;
    const up = (beforePct == null) || (afterPct >= beforePct);
    const f = (v) => v == null ? "—" : Math.round(v * 100) + "%";
    const mask = document.createElement("div");
    mask.id = "kkAccPopup";
    mask.className = "kk-celebrate-mask";
    const ups = ["正确率蹭蹭涨，稳！📈", "这波进步太秀了，保持！✨", "刷题小能手就是你！🎊", "月亮又圆了一点，棒！🌕"];
    const downs = ["错题是最好的老师，整理一下再战💪", "小滑坡而已，把错题吃透就回来了🌱", "稳住，我们能赢！下次肯定更好📚"];
    const word = (up ? ups : downs)[Math.floor(Math.random() * (up ? ups.length : downs.length))];
    mask.innerHTML = `<div class="kk-celebrate-card ${up ? "up" : "down"} small">
      <div class="kk-c-emo">${up ? "🎉" : "💪"}</div>
      <div class="kk-c-title">${esc(up ? "进步啦！" : "别灰心！")}</div>
      <div class="kk-c-word">${esc(word)}</div>
      <div class="kk-c-sub">${esc(nodeName)}：正确率 ${f(beforePct)} → <b>${f(afterPct)}</b></div>
      <button class="btn primary" id="kkAccOk">收到！</button>
    </div>`;
    document.body.appendChild(mask);
    const close = () => { try { mask.classList.add("out"); setTimeout(() => mask.remove(), 260); } catch (e) {} };
    mask.querySelector("#kkAccOk").onclick = close;
    mask.onclick = (e) => { if (e.target === mask) close(); };
  }
  window.KGKingke = { LEVELS, renderBrand, checkLevelPopup, levelIndex, doneCount, treeTotal, celebrate };

  /* ================= 渲染（粉笔式目录） ================= */
  let TREE = null;
  function getTree() { if (!TREE) TREE = buildTree(); return TREE; }

  function nodeCount(node) {
    if (node.qs) return node.qs.length;
    return (node.children || []).reduce((s, c) => s + nodeCount(c), 0);
  }
  function collectQs(node) {
    const out = [];
    (function walk(n) { if (n.qs) out.push(...n.qs); (n.children || []).forEach(walk); })(node);
    return out;
  }

  function nodeRow(node, depth, body, ctx) {
    const kids = node.children || [];
    const total = nodeCount(node);
    const p = pctOf(node);
    const s = aggStat(node);
    const hasKids = kids.length > 0;
    const row = document.createElement("div");
    row.className = "db-row" + (hasKids ? " has-kids" : "");
    row.style.paddingLeft = (8 + depth * 18) + "px";
    row.innerHTML = `
      <span class="db-arrow">${hasKids ? "▸" : "•"}</span>
      <span class="db-name">${esc(node.name)}</span>
      <span class="db-meta">
        <span class="db-cnt">${s.done}/${total} 题</span>
        ${p != null ? `<span class="db-acc">${Math.round(p * 100)}%</span>` : ""}
        ${moons(node)}
      </span>`;
    if (hasKids) {
      const childBox = document.createElement("div");
      childBox.className = "db-kids";
      childBox.style.display = "none";
      row.querySelector(".db-arrow").onclick = (e) => {
        e.stopPropagation();
        const open = childBox.style.display !== "none";
        childBox.style.display = open ? "none" : "";
        row.querySelector(".db-arrow").textContent = open ? "▸" : "▾";
        row.classList.toggle("open", !open);
      };
      kids.forEach(k => childBox.appendChild(nodeRow(k, depth + 1, body, ctx)));
      const box = document.createElement("div");
      box.appendChild(row);
      box.appendChild(childBox);
      row.onclick = () => startQuiz(node, ctx);
      return box;
    }
    row.onclick = () => startQuiz(node, ctx);
    return row;
  }

  function startQuiz(node, ctx) {
    const DB = window.DB, UI = window.UI;
    let qs = collectQs(node).slice();
    shuffle(qs);
    const per = ctx.per() || 20;
    if (qs.length > per) qs = qs.slice(0, per);
    if (!qs.length) { UI.toast("该目录暂无题目"); return; }
    const body = ctx.body;
    body.innerHTML = "";
    const wrap = UI.el(`<div class="quiz-host"></div>`);
    body.appendChild(wrap);
    const back = UI.el(`<div class="card" style="margin-bottom:6px;display:flex;align-items:center;gap:10px">
      <button class="btn xs ghost" id="dbBack">‹ 返回刷题中心</button>
      <span class="muted small">「${esc(node.name)}」随机 ${qs.length} 题</span></div>`);
    body.insertBefore(back, wrap);
    back.querySelector("#dbBack").onclick = () => { try { location.hash = "#/drills"; } catch (e) { ctx.render(); } };
    /* 记录每个 leaf 的刷前正确率（进步/退步弹窗用） */
    const beforeMap = {};
    qs.forEach(q => { if (!(q.__leaf in beforeMap)) { const st = statMap()[q.__leaf]; beforeMap[q.__leaf] = st && st.done ? st.right / st.done : null; } });
    window.Quiz.start(wrap, qs, "刷题中心", {
      returnLabel: "‹ 返回刷题中心",
      returnAction: () => { try { location.hash = "#/drills"; } catch (e) {} },
      onAgain: () => startQuiz(node, ctx),
      onAnswer: (qq, right) => { try { recordAnswer(qq.__leaf, right); } catch (e) {} },
      onDone: () => {
        try {
          DB.save();
          /* ①正确率进步/退步弹窗：取本组题目涉及 leaf 的「刷前正确率」vs「当前正确率」聚合对比 */
          let hasBefore = false, sumB = 0, nB = 0, sumA = 0, nA = 0;
          Object.keys(beforeMap).forEach(id => {
            const st = statMap()[id] || { done: 0, right: 0 };
            const b = beforeMap[id];
            if (b != null && st.done) { sumB += b * st.done; nB += st.done; hasBefore = true; }
            if (st.done) { sumA += st.right / st.done * st.done; nA += st.done; }
          });
          if (hasBefore && nB && nA) {
            const bp = sumB / nB, ap = sumA / nA;
            if (Math.abs(ap - bp) > 0.001) accuracyPopup(node.name, bp, ap);
          }
          /* ②科举等级变化弹窗 */
          checkLevelPopup();
          renderBrand();
        } catch (e) { console.error(e); }
      }
    });
    window.scrollTo(0, 0);
  }

  window.MODULES.drills = {
    title: "刷题", icon: "stats",
    render(body) {
      const DB = window.DB, UI = window.UI;
      TREE = null; // 每次进入重建（题册可能新增）
      const tree = getTree();
      const root = UI.el(`<div>
        <div class="card" style="border-top:3px solid #34e7e4">
          <div class="spread"><b style="font-size:17px">📚 刷题中心</b>
            <span class="muted small" id="dbTotal"></span></div>
          <div class="muted small" style="margin-top:6px">点<b>科目名</b>整科混合随机刷；点左侧 <b>▸</b> 展开二/三级目录刷对应题。月亮＝掌握度（5🌕＝正确率100%，3🌕＝60%）。</div>
          <div class="row" style="margin-top:10px;gap:8px;align-items:center">
            <span class="muted small">每组题量</span>
            <select id="dbPer" style="max-width:90px">
              <option value="10">10 题</option>
              <option value="20" selected>20 题</option>
              <option value="30">30 题</option>
              <option value="50">50 题</option>
              <option value="100">100 题</option>
            </select>
          </div>
        </div>
        <div id="dbList" style="margin-top:10px"></div>
      </div>`);
      body.appendChild(root);
      const ctx = { body, per: () => parseInt((root.querySelector("#dbPer") || {}).value || "20", 10), render: () => this.render(body) };
      try {
        const total = treeTotal();
        const done = doneCount();
        root.querySelector("#dbTotal").textContent = `共 ${total} 题 · 已刷 ${done} 题`;
      } catch (e) {}
      const list = root.querySelector("#dbList");
      const card = UI.el(`<div class="card"></div>`);
      tree.forEach(s => card.appendChild(nodeRow(s, 0, body, ctx)));
      list.appendChild(card);
      /* 空科目提示 */
      tree.forEach(s => { if (!nodeCount(s)) {
        const tip = UI.el(`<div class="muted small" style="margin:4px 0 10px 26px">「${esc(s.name)}」暂无题源，可在「设置 → PDF 题库导入」录入。</div>`);
        list.appendChild(tip);
      } });
      renderBrand();
      checkLevelPopup(); // 离开答题后再进入刷题中心时补检等级变化
    }
  };
})();
