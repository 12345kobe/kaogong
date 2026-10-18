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

    /* ---- 判断推理：3200题册 + OCR 新题册(KG_JUDGMENT_BOOKS) + 逻辑判断600(KG_LOGIC600) ----
       一级=判断推理；二级=图形推理/逻辑判断/类比推理/定义判断/科学推理（科学推理独立）；
       三级=各题型小节（位置类规律、假言命题…）。所有来源按二级归类后合并。 */
    try {
      const CATS = ["图形推理", "逻辑判断", "类比推理", "定义判断", "科学推理"];
      const CID = { "图形推理": "graph", "逻辑判断": "logic", "类比推理": "analogy", "定义判断": "define", "科学推理": "science" };
      const catOf = function (nm) {
        nm = String(nm || "");
        if (nm.indexOf("图形") >= 0) return "图形推理";
        if (nm.indexOf("类比") >= 0) return "类比推理";
        if (nm.indexOf("定义") >= 0) return "定义判断";
        if (nm.indexOf("科学") >= 0) return "科学推理";
        return "逻辑判断";
      };
      const bucket = {};
      const put = function (cat, sec, qs) {
        if (!qs || !qs.length) return;
        bucket[cat] = bucket[cat] || {};
        const k = cleanName(sec) || "综合";
        if (!bucket[cat][k]) bucket[cat][k] = [];
        bucket[cat][k] = bucket[cat][k].concat(qs);
      };
      const okA = function (arr) { return arr.filter(q => q && (typeof q.a === "number" ? q.a >= 0 : !!q.a)); };
      /* 旧 3200 题册 */
      const J = W.KG_JUDGMENT;
      if (J && Array.isArray(J.sections)) J.sections.forEach((s, si) => {
        const nm = cleanName(s.name);
        const sub = nm.replace(/^(图形推理|逻辑判断|类比推理|定义判断|科学推理)[·•・\-\s]*/, "");
        put(catOf(nm), sub, okA(normQs(s.items, `judg.${si}`)));
      });
      /* OCR 新题册（判断一/判断二，按目录拆三级） */
      const BK = W.KG_JUDGMENT_BOOKS;
      if (BK && Array.isArray(BK.sections)) BK.sections.forEach((s, si) => {
        const cat = catOf(s.name);
        const bySec = {};
        (s.items || []).forEach(it => { const k = it.sec || "综合"; (bySec[k] = bySec[k] || []).push(it); });
        Object.keys(bySec).forEach((k, ki) => put(cat, k, okA(normQs(bySec[k], `jdb.${si}.${ki}`))));
      });
      /* 逻辑判断 600 题（题本篇+分析篇） */
      if (Array.isArray(W.KG_LOGIC600) && W.KG_LOGIC600.length) {
        put("逻辑判断", "逻辑判断600题", okA(normQs(W.KG_LOGIC600, "judg.logic600")));
      }
      /* 预留扩展位（旧格式 groups） */
      const EX = W.KG_JUDGMENT_EXTRA;
      if (EX && Array.isArray(EX.groups)) EX.groups.forEach((g, gi) => {
        (g.sections || []).forEach((s, si) => {
          put(catOf(g.name + s.name), s.name, okA(normQs(s.questions || s.items, `judgx.${gi}.${si}`)));
        });
      });
      const kids = [];
      CATS.forEach(cat => {
        const b = bucket[cat];
        if (!b) return;
        const secs = Object.keys(b).map((k, i) => ({ id: `jud.${CID[cat]}.${i}`, name: k, qs: b[k] }));
        secs.sort((x, y) => y.qs.length - x.qs.length);
        if (!secs.length) return;
        const total = secs.reduce((n, s) => n + s.qs.length, 0);
        if (secs.length === 1) kids.push({ id: `jud.${CID[cat]}`, name: cat, qs: secs[0].qs });
        else kids.push({ id: `jud.${CID[cat]}`, name: cat + "（" + total + "）", children: secs });
      });
      if (kids.length) subs.push({ id: "judgment", name: "判断推理", icon: "🧩", children: kids });
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
  /* 调试/测试用：暴露刷题树 */
  window.KGDrills = { getTree, buildTree };

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

  /* ===== 刷题进度记忆（v20261018c 用户要求） =====
     按「模块/目录」为单位记住上次刷到第几题：drillProgress[nodeId] = {ids:[题指纹...], at:下一题下标, ts}
     ids 保存的是本次随机后的题目顺序，下次进入按同一顺序还原，才能真正「从上次那道题继续」。 */
  function qSig(q) { const s = String((q && q.q) || "").slice(0, 60); let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return h.toString(36); }
  function progGet() { try { return (window.DB.state.drillProgress = window.DB.state.drillProgress || {}); } catch (e) { return {}; } }
  function progRead(node) { const m = progGet(); return m[node.id] || null; }
  function progSave(node, ids, at) {
    try {
      const m = progGet();
      m[node.id] = { ids: ids, at: Math.max(0, Math.min(at, ids.length)), ts: Date.now() };
      window.DB.save();
    } catch (e) {}
  }
  /* 用上次保存的顺序还原题目列表（缺失的题自动跳过，新增的题补在后面） */
  function orderBySaved(qs, ids) {
    if (!ids || !ids.length) return qs;
    const map = {};
    qs.forEach(q => { const k = qSig(q); (map[k] = map[k] || []).push(q); });
    const out = [];
    ids.forEach(k => { if (map[k] && map[k].length) out.push(map[k].shift()); });
    qs.forEach(q => { if (out.indexOf(q) < 0) out.push(q); });
    return out;
  }
  /* 继续/重来 询问弹窗：返回 Promise<boolean>（true=从上次继续） */
  function askResume(node, at, total) {
    return new Promise(resolve => {
      const mask = UI.el(`<div class="modal-mask"><div class="modal" style="max-width:380px;text-align:center">
        <h3 style="margin:0 0 6px">继续上次刷题？</h3>
        <div class="muted small">「${esc(node.name)}」上次刷到第 <b>${at}</b> 题（共 ${total} 题）</div>
        <div class="row" style="justify-content:center;gap:10px;margin-top:16px">
          <button class="btn ghost" id="rsNew">从头开始</button>
          <button class="btn primary" id="rsGo">从第 ${at + 1} 题继续</button>
        </div>
      </div></div>`);
      document.body.appendChild(mask);
      const close = v => { mask.remove(); resolve(v); };
      mask.querySelector("#rsGo").onclick = () => close(true);
      mask.querySelector("#rsNew").onclick = () => close(false);
      mask.onclick = e => { if (e.target === mask) close(false); };
    });
  }

  /* 全屏刷题（v20261018c 用户要求）：进入答题隐藏侧栏/顶栏铺满屏，点返回即退出并回到刷题中心 */
  function enterFull() { document.body.classList.add("kg-dq-full"); window.scrollTo(0, 0); }
  function exitFull() { document.body.classList.remove("kg-dq-full"); }
  /* ★返回刷题中心：路由本来就是 #/drills（答题是原地重画 body），
     直接赋同样的 hash 不会触发 hashchange → 老版本按钮「点了没反应」。
     这里判定：hash 已是 #/drills 就原地重渲染，否则走路由跳转。 */
  function backToDrills(ctx) {
    exitFull();
    if (String(location.hash || "").replace("#/", "") === "drills") { try { ctx.render(); } catch (e) { location.reload(); } }
    else { try { location.hash = "#/drills"; } catch (e) {} }
  }

  /* 材料组收集：资料分析/数量关系等「一篇材料配 5 题」的节点整组取出，不切断材料 */
  function collectGroups(node) {
    const out = [];
    (function walk(n) {
      if (n.qs && n.qs.length && n.mat && (n.mat.img || n.mat.t)) { out.push({ mat: n.mat, qs: n.qs.slice() }); return; }
      (n.children || []).forEach(walk);
    })(node);
    return out;
  }

  async function startQuiz(node, ctx) {
    const DB = window.DB, UI = window.UI;
    let qs = collectQs(node).slice();
    shuffle(qs);
    let per = ctx.per();
    if (per !== 0) { per = per || 10; if (qs.length > per) qs = qs.slice(0, per); } // per=0 表示不限题量
    if (!qs.length) { UI.toast("该目录暂无题目"); return; }

    /* ---- 上次进度：顺序还原 + 询问是否继续 ---- */
    const saved = progRead(node);
    if (saved && saved.ids && saved.ids.length) qs = orderBySaved(qs, saved.ids);
    let startAt = 0;
    if (saved && saved.at > 0 && saved.at < qs.length) {
      try { const go = await askResume(node, saved.at, qs.length); startAt = go ? saved.at : 0; } catch (e) { startAt = 0; }
    }
    const ids = qs.map(qSig);
    const list = qs.slice(startAt);
    if (!list.length) { UI.toast("本组题目已刷完，已从头开始"); progSave(node, ids, 0); }

    const body = ctx.body;
    body.innerHTML = "";
    const wrap = UI.el(`<div class="quiz-host"></div>`);
    body.appendChild(wrap);
    const back = UI.el(`<div class="dq-topbar">
      <button class="btn xs ghost" id="dbBack">‹ 返回刷题中心</button>
      <span class="muted small">「${esc(node.name)}」随机 ${list.length} 题${startAt ? " · 从第 " + (startAt + 1) + " 题继续" : ""}</span></div>`);
    body.insertBefore(back, wrap);
    back.querySelector("#dbBack").onclick = () => backToDrills(ctx);
    enterFull();
    /* 答题进度：每答一题把「下一题下标」写回（+起始偏移），保证中途退出也能续上 */
    let answered = 0;
    /* 记录每个 leaf 的刷前正确率（进步/退步弹窗用） */
    const beforeMap = {};
    list.forEach(q => { if (!(q.__leaf in beforeMap)) { const st = statMap()[q.__leaf]; beforeMap[q.__leaf] = st && st.done ? st.right / st.done : null; } });

    /* ★材料类题目（资料分析/数量关系）：按「整篇材料」分组，分栏刷题（上材料/下题目，横屏左右）
       题量 N 决定取材篇数：累加到 ≥N 篇为止（选 10 题＝2 篇材料，每组 5 题）。 */
    const groups = collectGroups(node);
    if (groups.length && window.SplitQuiz) {
      shuffle(groups);
      let sel = [], n = 0;
      for (let i = 0; i < groups.length; i++) {
        sel.push(groups[i]); n += groups[i].qs.length;
        if (per !== 0 && n >= (per || 10)) break;
      }
      window.SplitQuiz.startGroups(wrap, sel, "刷题中心", {
        returnLabel: "‹ 返回刷题中心",
        returnAction: () => backToDrills(ctx),
        onAnswer: (qq, right) => { try { recordAnswer(qq.__leaf, right); } catch (e) {} },
        onDone: () => { try { DB.save(); checkLevelPopup(); renderBrand(); } catch (e) {} }
      });
      window.scrollTo(0, 0);
      return;
    }

    window.Quiz.start(wrap, list, "刷题中心", {
      returnLabel: "‹ 返回刷题中心",
      returnAction: () => backToDrills(ctx),
      onAgain: () => startQuiz(node, ctx),
      onAnswer: (qq, right) => {
        try { recordAnswer(qq.__leaf, right); } catch (e) {}
        answered++;
        try { progSave(node, ids, startAt + answered); } catch (e) {}
      },
      onDone: () => {
        try {
          progSave(node, ids, startAt + answered >= ids.length ? 0 : startAt + answered);
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
      exitFull(); // 从全屏答题返回时清掉全屏标记，避免侧栏/顶栏一直不显示
      TREE = null; // 每次进入重建（题册可能新增）
      const tree = getTree();
      const root = UI.el(`<div>
        <div class="card" style="border-top:3px solid #34e7e4">
          <div class="spread"><b style="font-size:17px">📚 刷题中心</b>
            <span class="muted small" id="dbTotal"></span></div>
          <div class="muted small" style="margin-top:6px">点<b>科目名</b>整科混合随机刷；点左侧 <b>▸</b> 展开二/三级目录刷对应题。月亮＝掌握度（5🌕＝正确率100%，3🌕＝60%）。</div>
          <div class="row" style="margin-top:10px;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="muted small">每组题量</span>
            <select id="dbPer" style="max-width:110px">
              <option value="5">5 题</option>
              <option value="10" selected>10 题</option>
              <option value="20">20 题</option>
              <option value="30">30 题</option>
              <option value="50">50 题</option>
              <option value="100">100 题</option>
              <option value="0">不限（全部）</option>
            </select>
            <span class="muted small">默认 10 题 · 全屏刷题，点顶部「返回刷题中心」直接退出</span>
          </div>
        </div>
        <div id="dbList" style="margin-top:10px"></div>
      </div>`);
      body.appendChild(root);
      const ctx = {
        body,
        per: () => { const v = parseInt((root.querySelector("#dbPer") || {}).value, 10); return isNaN(v) ? 10 : v; }, // 0=不限
        render: () => this.render(body)
      };
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
