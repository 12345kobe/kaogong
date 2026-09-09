/* 范文积累模块：一次展示一篇（可切换上下篇），保留原标题加粗大字号、蓝色高亮、下划线排版；
   文末另起「好词好句」板块，摘录文中被高亮/画横线的精华句并顺序编号；支持下载原文排版稿与好词好句。 */
(function () {
  "use strict";
  const KEY_IDX = "kg_essay_idx";

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // 将正文里的 <mark>(蓝底高亮) / <u>(红线) 转成打印用内联样式，保证导出的 PDF 也保留标记
  function inlineMarks(html) {
    return html
      .replace(/<mark>/g, '<span style="background:#cfe3ff;color:#0b3d91;font-weight:700;padding:0 2px;border-radius:3px;text-decoration:underline;text-decoration-color:#1763c0;text-underline-offset:2px">')
      .replace(/<\/mark>/g, "</span>")
      .replace(/<u>/g, '<span style="border-bottom:2px solid #c0392b;padding-bottom:1px">')
      .replace(/<\/u>/g, "</span>")
      .replace(/<b class="essay-red">/g, '<b style="color:#e23b54;font-weight:700">')
      .replace(/<p>/g, '<p style="margin:0 0 12px;text-indent:2em;line-height:1.9">');
  }

  window.MODULES.essays = {
    title: "📝 范文积累",
    icon: "essays",
    render(body) {
      const UI = window.UI, DB = window.DB, list = (window.MODEL_ESSAYS || []);
      if (!list.length) { body.innerHTML = `<div class="card empty">暂无范文数据。请把范文 PDF 放入本地 essays_raw/ 后运行提取脚本，或在「账号/同步」中同步已有数据。</div>`; return; }

      let idx = 0;
      try { idx = Math.max(0, Math.min(list.length - 1, parseInt(localStorage.getItem(KEY_IDX) || "0", 10) || 0)); } catch (e) {}

      function go(i) {
        idx = (i % list.length + list.length) % list.length;
        try { localStorage.setItem(KEY_IDX, String(idx)); } catch (e) {}
        render();
      }

      function render() {
        const e = list[idx];
        body.innerHTML = `<div class="card essay-reader">
          <div class="row spread essay-meta">
            <span class="muted small">范文 ${idx + 1} / ${list.length} · 🏷 ${esc(e.category || "")}</span>
            <span class="muted small">来源：${esc(e.src || "袁东版人民日报范文")}</span>
          </div>
          <h1 class="essay-title">${esc(e.title)}</h1>
          <div class="essay-body">${e.html}</div>
          <div class="good-words">
            <h3>🌟 好词好句（按文中出现顺序）</h3>
            <ol class="gw-list">
              ${e.phrases.map(p => `<li>${esc(typeof p === "string" ? p : p.text)}</li>`).join("")}
            </ol>
            <div class="muted small gw-note">※ 以上为文中<mark class="lg-mark">蓝色高亮＋下划线</mark>与<b style="color:#e23b54">红色小标题</b>处摘录的精华句（本 PDF 以蓝色文字标注好词好句，红色为段落小标题）。</div>
          </div>
          <div class="row essay-nav">
            <button class="btn" id="prev">← 上一篇</button>
            <button class="btn primary" id="next">下一篇 →</button>
            <button class="btn ghost" id="dlOrig">⬇ 下载原文PDF</button>
            <button class="btn ghost" id="dlGw">⬇ 下载好词好句</button>
          </div>
        </div>`;

        body.querySelector("#prev").onclick = () => go(idx - 1);
        body.querySelector("#next").onclick = () => go(idx + 1);

        body.querySelector("#dlOrig").onclick = () => {
          const h = `<h1 style="text-align:center;font-size:22px;border-bottom:3px solid #34e7e4;padding-bottom:10px">${esc(e.title)}</h1>
            <div class="meta" style="color:#666;font-size:12px;margin:6px 0 14px">来源：${esc(e.src || "")}</div>
            ${inlineMarks(e.html)}`;
          window.PDF.exportHtml(e.title + "（原文排版稿）", h);
          UI.toast("已生成原文排版稿，请在打印窗口选择「另存为 PDF」");
        };

        body.querySelector("#dlGw").onclick = () => {
          let h = `<h2 style="text-align:center;border-bottom:2px solid #9b6cff;padding-bottom:6px">好词好句 · ${esc(e.title)}</h2>
            <div class="meta" style="color:#666;font-size:12px;margin:6px 0 12px">文中蓝色高亮＋下划线与红色小标题摘录</div><ol style="line-height:2;font-size:15px">`;
          e.phrases.forEach(p => { h += `<li>${esc(typeof p === "string" ? p : p.text)}</li>`; });
          h += `</ol>`;
          window.PDF.exportHtml("好词好句 · " + e.title, h);
          UI.toast("已生成好词好句，请在打印窗口选择「另存为 PDF」");
        };
      }

      render();
    }
  };
})();
