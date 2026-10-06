/* 全局生成进度条：时政生成 / 知识点查询等长任务共用。
   - 固定在页面顶部（避开左侧返回按钮：top 从顶栏下方开始）；
   - 生成期间常驻，用户可切换到其它模块浏览，任务结束才消失；
   - 附一行「思考中：…」展示 AI 流式输出的最新内容（淡色、单行省略）。 */
(function () {
  "use strict";
  let el = null, hideT = null;

  function ensure() {
    if (el) return el;
    el = document.createElement("div");
    el.id = "kgGenProgress";
    el.style.cssText = "position:fixed;left:0;right:0;top:calc(env(safe-area-inset-top, 0px) + 54px);z-index:10060;display:none;" +
      "padding:8px 14px 9px;background:linear-gradient(135deg,rgba(13,36,56,.96),rgba(18,49,74,.96));" +
      "color:#dff6ff;box-shadow:0 2px 12px rgba(0,0,0,.3);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)";
    el.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<span id="kgGenTitle" style="flex:1;min-width:0;font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></span>' +
        '<div style="width:110px;height:8px;border-radius:6px;background:rgba(255,255,255,.18);overflow:hidden;flex:0 0 auto">' +
          '<div id="kgGenBar" style="height:100%;width:4%;background:linear-gradient(90deg,#34e7e4,#9b6cff);transition:width .4s"></div>' +
        '</div>' +
      '</div>' +
      '<div id="kgGenThink" style="margin-top:5px;font-size:12px;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>';
    document.body.appendChild(el);
    return el;
  }

  /* 显示/更新：show(标题, 百分比)；两个参数都可只传一个 */
  function show(title, pct) {
    const e = ensure();
    if (hideT) { clearTimeout(hideT); hideT = null; }
    e.style.display = "block";
    e.style.opacity = "1";
    e.style.transition = "none";
    if (title != null) e.querySelector("#kgGenTitle").textContent = title;
    if (pct != null) e.querySelector("#kgGenBar").style.width = Math.max(4, Math.min(100, pct)) + "%";
  }

  /* 「思考中」一行：喂入 AI 流式全文，展示尾部一段（最像"正在写的部分"） */
  function think(text) {
    if (!el || el.style.display === "none") return;
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return;
    const tail = t.length > 88 ? t.slice(-88) : t;
    const thinkEl = el.querySelector("#kgGenThink");
    if (thinkEl) thinkEl.textContent = "思考中：" + tail;
  }

  function hide() {
    if (!el || el.style.display === "none") return;
    el.style.transition = "opacity .5s";
    el.style.opacity = "0";
    hideT = setTimeout(() => {
      if (el) {
        el.style.display = "none";
        el.style.opacity = "1";
        const thinkEl = el.querySelector("#kgGenThink");
        if (thinkEl) thinkEl.textContent = "";
      }
    }, 600);
  }

  window.KGProgress = { show: show, think: think, hide: hide };
})();
