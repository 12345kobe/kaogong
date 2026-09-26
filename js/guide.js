/* 新手引导：逐步高亮功能模块 —— 只有被指引的功能可点，其余全部变暗；全程可「跳过」 */
(function () {
  "use strict";
  const DONE_KEY = "kg_guide_done";

  /* 引导覆盖的模块（顺序即引导顺序）：key=导航 key，t=名称，d=进入后的说明 */
  const MODS = [
    { key: "countdown", t: "上岸倒计时", d: "主页就是这里：显示距离考试还有多少天。点右上角齿轮可设置考试日期，之后每次打开都会帮你倒计时。" },
    { key: "timer", t: "上岸计时器", d: "用来记录真实学习时长。点「开始」计时，结束会自动计入当日学习数据，可在统计里看曲线。" },
    { key: "current", t: "时政热点", d: "每天更新的时政要闻与金句。金句会自动同步到申论素材库，写申论时可直接调用。" },
    { key: "verbal", t: "言语理解", d: "选词填空、片段阅读的专项练习。做错的词会自动进错词本，可针对性复习。" },
    { key: "data", t: "资料分析", d: "资料分析专项刷题。答题时可以手写标注、记笔记，笔记会跟着题目保存。" },
    { key: "logic", t: "判断推理", d: "图形推理、逻辑判断、定义判断等题型的练习模块。" },
    { key: "politics", t: "常识判断", d: "常识与政治理论刷题，碎片时间随手刷几道。" },
    { key: "quantity", t: "数量关系", d: "数学运算、数字推理练习，附带解题步骤。" },
    { key: "essay", t: "申论", d: "申论写作与素材积累，支持 AI 批改并给出修改建议。" },
    { key: "wrongbook", t: "错题本", d: "所有做错的题自动汇总在这里，可以重做、也可以直接 AI 咨询搞懂它。" },
    { key: "stats", t: "学习统计", d: "正确率、学习时长、刷题量等数据一目了然，用来复盘复习节奏。" },
    { key: "ai", t: "AI 咨询", d: "不懂的题直接问 AI，支持举一反三，相当于随身答疑老师。" },
    { key: "settings", t: "设置", d: "主题、字体、iOS 玻璃质感、云端同步都在这里。引导结束后可随时回来调整。" }
  ];

  let steps = [], idx = 0, active = false, E = null;

  function buildSteps() {
    const arr = [];
    MODS.forEach(m => {
      arr.push({ type: "nav", key: m.key, t: m.t, d: "点左边菜单里的「" + m.t + "」进入这个模块。" });
      arr.push({ type: "intro", key: m.key, t: m.t, d: m.d });
    });
    return arr;
  }

  function build() {
    if (document.getElementById("kgGuide")) return document.getElementById("kgGuide");
    const w = document.createElement("div");
    w.id = "kgGuide";
    w.innerHTML =
      '<div id="kgGuideMask"></div>' +
      '<div id="kgSpot"></div>' +
      '<div id="kgBubble">' +
      '<div class="kgb-step" id="kgbStep"></div>' +
      '<div class="kgb-title" id="kgbTitle"></div>' +
      '<div class="kgb-text" id="kgbText"></div>' +
      '<div class="kgb-actions">' +
      '<button class="btn sm primary" id="kgbNext">下一步</button>' +
      '<button class="btn sm ghost" id="kgbSkip">跳过引导</button>' +
      '</div></div>';
    document.body.appendChild(w);
    E = {
      root: w, mask: w.querySelector("#kgGuideMask"), spot: w.querySelector("#kgSpot"),
      bubble: w.querySelector("#kgBubble"), step: w.querySelector("#kgbStep"),
      title: w.querySelector("#kgbTitle"), text: w.querySelector("#kgbText"),
      next: w.querySelector("#kgbNext"), skip: w.querySelector("#kgbSkip")
    };
    E.next.onclick = () => next(true);
    E.skip.onclick = skip;
    E.mask.onclick = onMaskClick;
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.addEventListener("hashchange", onHash);
    return w;
  }

  function targetEl() {
    const s = steps[idx]; if (!s) return null;
    if (s.type === "nav") return document.querySelector('#nav .nav-item[data-key="' + s.key + '"]');
    // 进入模块后：整个模块正文就是被指引的区域（可自由体验），侧栏/顶栏保持变暗
    return document.getElementById("pageBody") || document.getElementById("pageTitle");
  }

  function openMenu() {
    const sb = document.getElementById("sidebar"); if (sb) sb.classList.add("open");
  }

  function position() {
    if (!active || !E) return;
    const t = targetEl();
    if (!t) { E.spot.style.display = "none"; return; }
    E.spot.style.display = "block";
    const r = t.getBoundingClientRect(), pad = 6;
    if (r.width === 0 && r.height === 0) { E.spot.style.display = "none"; }
    E.spot.style.left = (r.left - pad) + "px";
    E.spot.style.top = (r.top - pad) + "px";
    E.spot.style.width = (r.width + pad * 2) + "px";
    E.spot.style.height = (r.height + pad * 2) + "px";
    const bw = Math.min(300, window.innerWidth - 24);
    let left = Math.max(12, Math.min(r.left, window.innerWidth - bw - 12));
    let top = r.bottom + 14;
    const bh = E.bubble.offsetHeight || 150;
    if (top + bh > window.innerHeight - 8) top = Math.max(10, r.top - bh - 14);
    E.bubble.style.left = left + "px";
    E.bubble.style.top = top + "px";
    E.bubble.style.width = bw + "px";
  }

  function render() {
    if (!active || !E) return;
    const s = steps[idx];
    if (!s) return finish();
    if (s.type === "nav") openMenu();
    E.step.textContent = "第 " + (idx + 1) + " / " + steps.length + " 步";
    E.title.textContent = (s.type === "nav" ? "👉 " : "✅ ") + s.t;
    E.text.textContent = s.d;
    E.next.textContent = (s.type === "nav") ? "跳过这一步" : "下一步";
    position();
    setTimeout(position, 260);
  }

  /* 只允许点击被高亮的那个区域：其余点击全部拦截 */
  function onMaskClick(e) {
    if (!active || !E) return;
    const t = targetEl();
    if (!t) return;
    const r = t.getBoundingClientRect();
    const inside = e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6;
    if (!inside) { flash(); return; }
    // 命中高亮区域：把点击转交给下面的真实元素（导航项 / 模块内容都能正常用）
    let under = null;
    try {
      E.mask.style.pointerEvents = "none";
      under = document.elementFromPoint(e.clientX, e.clientY);
      E.mask.style.pointerEvents = "auto";
    } catch (err) {}
    if (under && (under === t || t.contains(under))) { try { under.click(); } catch (err) {} }
    // 导航步骤：点到对应导航项就直接推进（含「已经在该模块、哈希不变」的情况）
    const s = steps[idx];
    if (s && s.type === "nav" && under && (under === t || t.contains(under))) { idx++; render(); }
  }

  function flash() {
    if (!E) return;
    E.bubble.classList.remove("shake");
    void E.bubble.offsetWidth;
    E.bubble.classList.add("shake");
    if (window.UI && UI.toast) UI.toast("请点击高亮的那个功能 👆");
  }

  /* 点中了导航项 → 进入模块后自动推进到该模块的说明步骤 */
  function onHash() {
    if (!active) return;
    const cur = (location.hash || "").replace("#/", "") || "countdown";
    const keys = MODS.map(m => m.key);
    // 引导进行中用户跳到了覆盖范围外的模块（如点开「PDF 录入」）：自动结束引导并释放遮罩，不阻断操作
    if (keys.indexOf(cur) === -1) {
      active = false;
      try { localStorage.setItem(DONE_KEY, "1"); } catch (e) {}
      try { const g = document.getElementById("kgGuide"); if (g) g.remove(); } catch (e) {}
      return;
    }
    const s = steps[idx];
    if (!s) return;
    if (s.type === "nav" && cur === s.key) { idx++; render(); }
  }

  function next(manual) {
    if (!active) return;
    const s = steps[idx]; if (!s) return finish();
    if (s.type === "intro") {
      // 回到主页，继续下一个模块
      idx++;
      if (idx >= steps.length) return finish();
      try { location.hash = "#/countdown"; } catch (e) {}
      render();
    } else {
      // 导航步骤：手动点「跳过这一步」则直接进入该模块说明
      idx++;
      if (idx >= steps.length) return finish();
      try { location.hash = "#/" + s.key; } catch (e) {}
      render();
    }
  }

  function teardown() {
    active = false;
    if (E && E.root && E.root.parentNode) E.root.parentNode.removeChild(E.root);
    E = null;
  }

  function finish() {
    teardown();
    try { localStorage.setItem(DONE_KEY, "1"); } catch (e) {}
    if (window.UI && UI.toast) UI.toast("引导完成，开始你的复习吧 💪");
  }
  function skip() {
    teardown();
    try { localStorage.setItem(DONE_KEY, "1"); } catch (e) {}
    if (window.UI && UI.toast) UI.toast("已跳过引导，可随时在「设置」里重看");
  }

  function start(force) {
    try { if (!force && localStorage.getItem(DONE_KEY) === "1") return false; } catch (e) {}
    steps = buildSteps(); idx = 0; active = true;
    build();
    // 引导开始前先清掉可能挡住导航的弹层（更新日志、各种 modal 及它们的遮罩）
    try {
      const mr = document.getElementById("modalRoot"); if (mr) { mr.innerHTML = ""; mr.style.display = "none"; }
      document.querySelectorAll(".modal-mask,.modal-backdrop,.modal").forEach(n => { try { n.remove(); } catch (e) {} });
    } catch (e) {}
    // 新手引导只覆盖 NAV 内的模块；若用户当前已在引导覆盖范围外的页面（如「PDF 录入」），
    // 不打断、不强制跳回，直接结束引导，避免遮罩拦截点击。
    var _gcur = (location.hash || "").replace("#/", "") || "countdown";
    if (MODS.map(function (m) { return m.key; }).indexOf(_gcur) === -1) {
      active = false;
      try { var _g = document.getElementById("kgGuide"); if (_g) _g.remove(); } catch (e) {}
      return false;
    }
    render();
    return true;
  }

  function isDone() { try { return localStorage.getItem(DONE_KEY) === "1"; } catch (e) { return false; } }
  function restart() { try { localStorage.removeItem(DONE_KEY); } catch (e) {} return start(true); }

  window.Guide = { start: start, restart: restart, skip: skip, finish: finish, isDone: isDone };
})();
