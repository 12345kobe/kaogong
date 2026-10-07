/* 全局生成进度条：时政生成 / 知识点查询等长任务共用。
   - 固定在页面顶部（避开左侧返回按钮），生成期间跨模块常驻，任务结束才消失；
   - 一行「思考中：…」实时展示 AI 流式输出；旁边有折叠按钮；
   - 折叠后缩成右上角小圆（显示百分比），小圆可拖动（位置记忆），点一下展开；
   - 同时提供通用拖动工具 KGDrag.make：专注悬浮球 / 手写悬浮球等也可拖动、位置记忆。 */
(function () {
  "use strict";

  /* ================= 通用拖动（供各悬浮球使用） ================= */
  function makeDraggable(el, key, enabled, onTap) {
    if (!el || el.dataset.kgDraggable) return;
    el.dataset.kgDraggable = "1";
    let sx = 0, sy = 0, ox = 0, oy = 0, moved = false, dragging = false;
    const saved = (() => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } })();
    const apply = (x, y) => {
      el.style.left = x + "px"; el.style.top = y + "px";
      el.style.right = "auto"; el.style.bottom = "auto";
    };
    if (saved && typeof saved.x === "number" && typeof saved.y === "number") apply(saved.x, saved.y);
    el.addEventListener("pointerdown", (e) => {
      if (e.button || (enabled && !enabled())) return;
      const r = el.getBoundingClientRect();
      ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY; moved = false; dragging = true;
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 8) return;
      moved = true;
      const w = el.offsetWidth, h = el.offsetHeight;
      const nx = Math.min(Math.max(0, ox + dx), window.innerWidth - w);
      const ny = Math.min(Math.max(0, oy + dy), window.innerHeight - h);
      apply(nx, ny);
      e.preventDefault();
    });
    el.addEventListener("pointerup", () => {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        const r = el.getBoundingClientRect();
        try { localStorage.setItem(key, JSON.stringify({ x: r.left, y: r.top })); } catch (err) {}
        /* 真拖动过：拦掉紧随其后的 click，避免误触发原有点击行为 */
        const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); el.removeEventListener("click", stop, true); };
        el.addEventListener("click", stop, { capture: true, once: true });
      } else if (typeof onTap === "function") {
        onTap();
      }
    });
    el.addEventListener("pointercancel", () => { dragging = false; });
    try { el.style.touchAction = "none"; } catch (e) {}
  }

  /* ================= 进度条本体 ================= */
  let el = null, hideT = null, collapsed = false, active = false;
  let lastTitle = "", lastPct = 50, lastThink = "";
  let miniPos = (() => { try { return JSON.parse(localStorage.getItem("kgGenProgMini") || "null") || null; } catch (e) { return null; } })();
  let headRow, thinkRow, titleEl, barEl, thinkEl, foldBtn, miniEl;

  function ensure() {
    if (el) return el;
    el = document.createElement("div");
    el.id = "kgGenProgress";
    el.style.cssText = "position:fixed;left:0;right:0;top:calc(env(safe-area-inset-top, 0px) + 54px);z-index:10060;display:none;" +
      "padding:8px 14px 9px;background:linear-gradient(135deg,rgba(13,36,56,.96),rgba(18,49,74,.96));" +
      "color:#dff6ff;box-shadow:0 2px 12px rgba(0,0,0,.3);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border-radius:0";
    el.innerHTML =
      '<div id="kgGenHead" style="display:flex;align-items:center;gap:10px">' +
        '<span id="kgGenTitle" style="flex:1;min-width:0;font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></span>' +
        '<div style="width:110px;height:8px;border-radius:6px;background:rgba(255,255,255,.18);overflow:hidden;flex:0 0 auto">' +
          '<div id="kgGenBar" style="height:100%;width:4%;background:linear-gradient(90deg,#34e7e4,#9b6cff);transition:width .4s"></div>' +
        '</div>' +
      '</div>' +
      '<div id="kgGenThinkRow" style="margin-top:5px;display:flex;align-items:center;gap:8px">' +
        '<span id="kgGenThink" style="flex:1;min-width:0;font-size:12px;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></span>' +
        '<span id="kgGenFold" title="折叠成小圆（可拖动）" style="flex:0 0 auto;font-size:11px;opacity:.85;border:1px solid rgba(255,255,255,.35);border-radius:8px;padding:1px 7px;cursor:pointer">折叠</span>' +
      '</div>' +
      '<div id="kgGenMini" style="display:none;font-size:12px;font-weight:800;line-height:1.1;text-align:center;margin-top:16px;letter-spacing:-.5px">…</div>';
    document.body.appendChild(el);
    headRow = el.querySelector("#kgGenHead");
    thinkRow = el.querySelector("#kgGenThinkRow");
    titleEl = el.querySelector("#kgGenTitle");
    barEl = el.querySelector("#kgGenBar");
    thinkEl = el.querySelector("#kgGenThink");
    foldBtn = el.querySelector("#kgGenFold");
    miniEl = el.querySelector("#kgGenMini");
    foldBtn.onclick = (e) => { e.stopPropagation(); setCollapsed(true); };
    return el;
  }

  function safeTopOffset() {
    /* 读取真实 safe-area：env() 无法从 getComputedStyle 拿到，用探针元素量一次 */
    try {
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;top:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none";
      document.body.appendChild(probe);
      const v = probe.getBoundingClientRect().top;
      probe.remove();
      if (v > 0) return v;
    } catch (e) {}
    return 0;
  }
  function miniDefaultPos() {
    return { x: Math.max(0, window.innerWidth - 46 - 10), y: safeTopOffset() + 54 };
  }
  function applyMode() {
    if (!el) return;
    if (collapsed) {
      const p = miniPos || miniDefaultPos();
      el.style.width = "46px"; el.style.height = "46px"; el.style.borderRadius = "50%";
      el.style.padding = "0"; el.style.left = p.x + "px"; el.style.top = p.y + "px"; el.style.right = "auto";
      headRow.style.display = "none"; thinkRow.style.display = "none";
      miniEl.style.display = "block";
      miniEl.textContent = lastPct != null ? (Math.round(lastPct) + "%") : "…";
    } else {
      el.style.width = "auto"; el.style.height = "auto"; el.style.borderRadius = "0";
      el.style.padding = "8px 14px 9px"; el.style.left = "0"; el.style.right = "0";
      el.style.top = "calc(env(safe-area-inset-top, 0px) + 54px)";
      headRow.style.display = "flex"; thinkRow.style.display = "flex";
      miniEl.style.display = "none";
    }
  }
  function setCollapsed(v) {
    collapsed = v;
    if (el) applyMode();
  }

  function show(title, pct) {
    const e = ensure();
    if (hideT) { clearTimeout(hideT); hideT = null; }
    if (!active) { active = true; collapsed = true; }   // 新任务默认折叠成小圆
    applyMode();   // 每次都校正展开/折叠布局，修复上一次拖动小圆残留的 left/top 导致整条偏移
    e.style.display = "block";
    e.style.opacity = "1";
    e.style.transition = "none";
    if (title != null) { lastTitle = title; titleEl.textContent = title; }
    if (pct != null) {
      lastPct = pct;
      barEl.style.width = Math.max(4, Math.min(100, pct)) + "%";
      if (collapsed) miniEl.textContent = Math.round(pct) + "%";
    }
  }

  function think(text) {
    if (!el || el.style.display === "none") return;
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return;
    const tail = t.length > 88 ? t.slice(-88) : t;
    lastThink = "思考中：" + tail;
    if (thinkEl) thinkEl.textContent = lastThink;
  }

  function hide() {
    if (!el || el.style.display === "none") return;
    el.style.transition = "opacity .5s";
    el.style.opacity = "0";
    hideT = setTimeout(() => {
      if (el) {
        el.style.display = "none";
        el.style.opacity = "1";
        if (thinkEl) thinkEl.textContent = "";
        lastThink = "";
        active = false;
        collapsed = false;
      }
    }, 600);
  }

  window.KGProgress = { show: show, think: think, hide: hide };

  /* 小圆：可拖动（位置记忆），轻点展开 */
  function wireMini() {
    ensure();
    makeDraggable(el, "kgGenProgMini", () => collapsed, () => {
      if (collapsed) { collapsed = false; applyMode(); if (titleEl) titleEl.textContent = lastTitle; if (thinkEl) thinkEl.textContent = lastThink; }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireMini);
  else wireMini();

  /* ================= 其它悬浮球也可拖动（专注球 / 手写标注球等） ================= */
  function enhanceFloaters() {
    document.querySelectorAll("#focusFab, .kg-anno-fab").forEach((n) => {
      const k = n.id ? "kgFabPos_" + n.id : "kgFabPos_" + String(n.className).split(" ")[0];
      makeDraggable(n, k, null, null);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enhanceFloaters);
  else enhanceFloaters();
  try {
    new MutationObserver(enhanceFloaters).observe(document.body || document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();
