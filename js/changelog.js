/* 更新日志：新版本首次进入时弹出更新内容弹窗；关闭后在左侧导航对应模块上标气泡，
   点击气泡直达该模块；用户进入该模块后气泡消失。 */
(function () {
  "use strict";
  const SEEN_KEY = "kg_changelog_seen";

  function latest() {
    const L = window.CHANGELOG;
    return (L && L.logs && L.logs.length) ? L.logs[0] : null;
  }
  function visitedKey(v) { return "kg_changelog_visited_" + v; }
  function getVisited(v) {
    try { return JSON.parse(localStorage.getItem(visitedKey(v)) || "[]"); } catch (e) { return []; }
  }
  function markVisited(v, mod) {
    const arr = getVisited(v);
    if (arr.indexOf(mod) < 0) { arr.push(mod); try { localStorage.setItem(visitedKey(v), JSON.stringify(arr)); } catch (e) {} }
  }
  function modUpdates(log, mod) {
    return (log.items || []).filter(it => it.mod === mod).map(it => it.text);
  }

  /* 在左侧导航项上画气泡（有未读更新的模块） */
  function renderBubbles() {
    const log = latest();
    document.querySelectorAll(".cg-bubble").forEach(b => b.remove());
    if (!log) return;
    const visited = getVisited(log.version);
    (log.items || []).forEach(it => {
      if (!it.mod || visited.indexOf(it.mod) >= 0) return;
      const nav = document.querySelector('.nav-item[data-key="' + it.mod + '"]');
      if (!nav || nav.querySelector(".cg-bubble")) return;
      nav.style.position = "relative";
      const bubble = document.createElement("span");
      bubble.className = "cg-bubble";
      bubble.textContent = it.text.length > 14 ? it.text.slice(0, 14) + "…" : it.text;
      bubble.title = it.text + "（点击查看）";
      bubble.onclick = (e) => { e.stopPropagation(); location.hash = "#/" + it.mod; };
      nav.appendChild(bubble);
    });
  }

  /* 弹窗：点 × 或空白处关闭 */
  function showModal(log) {
    const UI = window.UI;
    const mask = UI.el(`<div class="modal-mask cg-mask">
      <div class="modal cg-modal" style="max-width:520px;max-height:84vh;overflow:auto">
        <div class="spread" style="align-items:center">
          <h3 style="margin:0">🎉 更新日志 · <span class="muted small">${UI.esc(log.version)} · ${UI.esc(log.date || "")}</span></h3>
          <button class="del cg-x" title="关闭" style="border:none;background:none;font-size:18px;color:var(--txt-dim)">✕</button>
        </div>
        <div class="cg-list">
          ${(log.items || []).map(it => `
            <div class="cg-item" data-mod="${it.mod || ""}">
              <div class="cg-item-t">${UI.esc(it.text)}</div>
              ${it.mod ? `<button class="btn ghost sm cg-go">前往 →</button>` : ""}
            </div>`).join("")}
        </div>
        <div class="muted small" style="margin-top:10px">关闭后可从左侧导航的气泡提示进入对应模块。</div>
      </div></div>`);
    document.body.appendChild(mask);
    function close() {
      try { localStorage.setItem(SEEN_KEY, log.version); } catch (e) {}
      mask.remove();
      renderBubbles();
    }
    mask.querySelector(".cg-x").onclick = close;
    mask.onclick = e => { if (e.target === mask) close(); };
    mask.querySelectorAll(".cg-item").forEach(item => {
      const mod = item.dataset.mod;
      const go = item.querySelector(".cg-go");
      if (go && mod) go.onclick = () => { close(); location.hash = "#/" + mod; };
    });
  }

  /* 应用启动后调用：新版本首次进入 → 弹窗；否则只渲染气泡 */
  function maybeShow() {
    const log = latest();
    if (!log) return;
    let seen = null;
    try { seen = localStorage.getItem(SEEN_KEY); } catch (e) {}
    if (seen !== log.version) showModal(log);
    else renderBubbles();
  }

  /* 路由切换时调用：进入某模块即视为已读，气泡消失 */
  function onRoute(key) {
    const log = latest();
    if (log && key) {
      if (modUpdates(log, key).length) markVisited(log.version, key);
    }
    renderBubbles();
  }

  window.Changelog = { maybeShow: maybeShow, renderBubbles: renderBubbles, onRoute: onRoute, latest: latest };
})();
