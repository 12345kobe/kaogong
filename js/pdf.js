/* PDF 导出：基于浏览器打印（中文零乱码，支持“另存为 PDF”） */
(function () {
  "use strict";
  const DB = window.DB;
  const A = i => String.fromCharCode(65 + i);
  const SUBJECT_ORDER = ["言语", "资料", "逻辑", "政治", "数量", "常识", "申论"];
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function nl2br(s) { return esc(s).replace(/\n/g, "<br>"); }

  function homeOnclick(homeUrl) {
    return `(function(){try{if(window.opener&&!window.opener.closed){window.opener.focus();window.close();return;}}catch(e){}try{window.close();}catch(e){}window.location.href='${homeUrl}';})()`;
  }

  function backHomeBtn(homeUrl) {
    return `<button class="noprint backhome" onclick="${homeOnclick(homeUrl)}">← 返回主页面</button>`;
  }

  /* 顶部工具条：常驻「导出 PDF / 打印」按钮（自动打印被关闭/拦截后可手动再触发） */
  function printToolbar(homeUrl) {
    return `<div class="ptoolbar noprint">
  <button class="pbtn print" onclick="if(window.print){window.print();}else{alert('当前浏览器不支持打印，请在浏览器菜单里选择「打印 / 另存为 PDF」');}">⬇ 导出 PDF / 打印</button>
  <button class="pbtn home" onclick="${homeOnclick(homeUrl)}">← 返回主页面</button>
</div>`;
  }

  /* ===== 真·PDF 生成：html2canvas 渲染 + jsPDF 合成 → 直接下载 .pdf 文件 =====
     手机上 window.print() 弹不出打印窗口、也拿不到文件，故改用本地内置库生成 PDF。
     库文件在 assets/vendor/（离线可用），加载失败才回退到打印页。 */
  const VENDOR_BASE = (function () {
    try {
      const u = new URL(document.baseURI || location.href);
      return u.origin + u.pathname.replace(/[^/]*$/, "");
    } catch (e) { return ""; }
  })();

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.async = false;
      s.onload = () => res();
      s.onerror = () => rej(new Error("加载失败：" + src));
      document.head.appendChild(s);
    });
  }

  async function ensurePdfLibs() {
    if (window.html2canvas && window.jspdf && window.jspdf.jsPDF) return true;
    if (!window.html2canvas) await loadScript(VENDOR_BASE + "assets/vendor/html2canvas.min.js");
    if (!(window.jspdf && window.jspdf.jsPDF)) await loadScript(VENDOR_BASE + "assets/vendor/jspdf.umd.min.js");
    return !!(window.html2canvas && window.jspdf && window.jspdf.jsPDF);
  }

  const PDF_CSS = `
#kgPdfHost{color:#111;background:#fff;line-height:1.7;padding:28px;box-sizing:border-box}
#kgPdfHost h1{font-size:20px;border-bottom:3px solid #34e7e4;padding-bottom:8px;margin:0 0 6px}
#kgPdfHost h2{font-size:17px;margin:18px 0 8px}
#kgPdfHost h3{font-size:15px;margin:12px 0 4px}
#kgPdfHost .meta{color:#666;font-size:12px;margin-bottom:8px}
#kgPdfHost .sec{font-size:17px;font-weight:800;margin:22px 0 10px;border-bottom:2px solid #9b6cff;padding-bottom:4px}
#kgPdfHost .subhead{font-weight:800;font-size:15px;background:#f0f6ff;padding:6px 10px;border-left:4px solid #9b6cff;margin:14px 0 8px}
#kgPdfHost .item{border:1px solid #ddd;border-radius:8px;padding:10px 12px;margin-bottom:10px}
#kgPdfHost .aitem{border:1px dashed #c9b6ff;border-radius:8px;padding:8px 12px;margin-bottom:8px}
#kgPdfHost table{width:100%;border-collapse:collapse;margin:6px 0 16px;font-size:13px}
#kgPdfHost th,#kgPdfHost td{border:1px solid #b9b9b9;padding:6px 9px;text-align:left;vertical-align:top;line-height:1.6}
#kgPdfHost thead th{background:#eaf1ff;font-weight:800}
#kgPdfHost td.idx{width:44px;text-align:center;color:#666}
#kgPdfHost td.term{font-weight:800;color:#0f7a4c}
#kgPdfHost .q{font-weight:700;margin-bottom:6px}
#kgPdfHost .qnum{color:#9b6cff;font-weight:800;margin-right:4px}
#kgPdfHost .kw{color:#c0392b;font-weight:800}
#kgPdfHost .opt{margin:2px 0}
#kgPdfHost .anum{display:inline-block;color:#1f8a4c;font-weight:800;margin-right:6px}
#kgPdfHost .ans{color:#1f8a4c;font-weight:700;font-size:14px;margin-bottom:4px}
#kgPdfHost .exp{background:#fafafa;border-left:3px solid #9b6cff;padding:6px 10px;margin-top:4px;font-size:13px}
#kgPdfHost .note{color:#555;font-size:13px;margin-top:4px}
#kgPdfHost .note.your{color:#c0392b}
#kgPdfHost .date{float:right;color:#999;font-size:12px}
#kgPdfHost .empty{color:#888;padding:20px;text-align:center}
#kgPdfHost img{max-width:240px;max-height:240px;border:1px solid #ccc;border-radius:6px;margin-top:6px}
#kgPdfHost .foot{margin-top:24px;color:#999;font-size:12px;text-align:center}
#kgPdfHost .essay-p-i{text-indent:2em;margin:0 0 10px;line-height:1.9}
#kgPdfHost .essay-hl-i{background:#ffe680;padding:0 2px;border-radius:2px}
#kgPdfHost .essay-blue-i{color:#0b3d91;font-weight:700}
#kgPdfHost .essay-red-i{color:#e23b54;font-weight:700}
#kgPdfHost .user-hl-i{font-weight:700}`;

  function stampNow() {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /* 交付 PDF：桌面/安卓直接下载；iOS 与主屏 PWA 下载会静默失败，
     改为弹出可见面板：分享（可存到「文件」）/ 打开 PDF / 尝试下载 */
  function deliverPdf(pdf, name, pages) {
    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);
    const file = (window.File ? new File([blob], name, { type: "application/pdf" }) : null);
    const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
    const a0 = document.createElement("a");
    const canDownload = ("download" in a0);
    const tryDownload = function () {
      try {
        const a = document.createElement("a");
        a.href = url; a.download = name; a.rel = "noopener"; a.style.display = "none";
        document.body.appendChild(a); a.click();
        setTimeout(() => { try { a.remove(); } catch (e) {} }, 1500);
        return true;
      } catch (e) { return false; }
    };
    if (canDownload && !isIOS && !standalone) {
      tryDownload();
      return { pages: pages, filename: name, mode: "download" };
    }
    const ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;z-index:10040;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px";
    ov.innerHTML = `<div style="background:#fff;color:#111;border-radius:14px;width:min(420px,100%);padding:18px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.45)">
      <div style="font-size:38px">📄</div>
      <div style="font-weight:800;font-size:16px;margin:6px 0">PDF 已生成（${pages} 页）</div>
      <div style="color:#666;font-size:13px;margin-bottom:14px;word-break:break-all">${name}</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button id="kgPdfShare" style="padding:12px;border:none;border-radius:10px;background:#1f8a4c;color:#fff;font-weight:800;font-size:15px">📤 分享 / 存储到「文件」</button>
        <button id="kgPdfOpen" style="padding:12px;border:none;border-radius:10px;background:#9b6cff;color:#fff;font-weight:800;font-size:15px">📄 打开 PDF</button>
        <button id="kgPdfDl" style="padding:12px;border:1px solid #ccc;border-radius:10px;background:#f6f6f6;color:#333;font-weight:700;font-size:15px">⬇️ 尝试直接下载</button>
        <button id="kgPdfClose" style="padding:10px;border:none;background:transparent;color:#888;font-size:14px">关闭</button>
      </div></div>`;
    document.body.appendChild(ov);
    const close = function () {
      try { ov.remove(); } catch (e) {}
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 120000);
    };
    ov.querySelector("#kgPdfClose").onclick = close;
    ov.querySelector("#kgPdfDl").onclick = function () { if (!tryDownload() && window.UI) UI.toast("该浏览器不支持直接下载，请用上方「分享」或「打开 PDF」"); };
    ov.querySelector("#kgPdfOpen").onclick = function () {
      try { const w = window.open(url, "_blank"); if (!w) location.href = url; }
      catch (e) { try { location.href = url; } catch (e2) {} }
    };
    const shareBtn = ov.querySelector("#kgPdfShare");
    const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
    if (!canShare) shareBtn.style.display = "none";
    else shareBtn.onclick = function () {
      navigator.share({ files: [file], title: name }).then(close).catch(() => {});
    };
    if (window.UI && UI.toast) UI.toast("PDF 已生成，请在弹出面板中保存");
    return { pages: pages, filename: name, mode: "panel" };
  }

  /* 生成一个真正的 PDF 文件并下载（A4，图片排版，中文零乱码） */
  async function htmlToPdf(title, bodyHtml, opts) {
    opts = opts || {};
    const ok = await ensurePdfLibs();
    if (!ok) throw new Error("PDF 库未加载");
    const jsPDF = window.jspdf.jsPDF;

    const A4W = 794, A4H = 1123;              // A4 @96dpi
    const font = opts.font || '"Microsoft YaHei","PingFang SC","Heiti SC",sans-serif';
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-12000px;top:0;width:" + A4W + "px;background:#fff;z-index:1;pointer-events:none;overflow:hidden";
    host.id = "kgPdfHostWrap";
    const wrap = document.createElement("div");   // 每页可视窗口（裁切用）
    wrap.style.cssText = "position:relative;width:" + A4W + "px;height:" + A4H + "px;overflow:hidden;background:#fff";
    const inner = document.createElement("div");
    inner.id = "kgPdfHost";
    inner.style.cssText = "position:absolute;left:0;top:0;width:" + A4W + "px;background:#fff";
    inner.innerHTML = `<style>${PDF_CSS.replace("#kgPdfHost{color:#111", "#kgPdfHost{font-family:" + font + ";color:#111")}</style>
      <h1>${title}</h1>
      <div class="meta">导出来源：考公工作台 · 生成时间：${stampNow()}${opts.fontLabel ? " · 字体：" + opts.fontLabel : ""}</div>
      ${bodyHtml}
      <div class="foot">考公工作台 · 个人备考助手</div>`;
    wrap.appendChild(inner);
    host.appendChild(wrap);
    document.body.appendChild(host);
    await new Promise(r => setTimeout(r, 120));

    const total = Math.max(1, Math.ceil(inner.scrollHeight / A4H));
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    for (let i = 0; i < total; i++) {
      inner.style.top = (-i * A4H) + "px";
      if (window.UI && UI.toast && i > 0 && i % 5 === 0) UI.toast(`正在生成 PDF… ${i + 1}/${total} 页`);
      const canvas = await window.html2canvas(wrap, {
        backgroundColor: "#fff", scale: 2, width: A4W, height: A4H,
        windowWidth: A4W, windowHeight: A4H, useCORS: true, logging: false
      });
      const img = canvas.toDataURL("image/jpeg", 0.92);
      if (i > 0) pdf.addPage();
      const h = A4H / A4W * pw;
      pdf.addImage(img, "JPEG", 0, 0, pw, Math.min(ph, h));
    }
    host.remove();
    pdf.setProperties({ title: title });
    const name = (opts.filename || title).replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) + ".pdf";
    return deliverPdf(pdf, name, total);
  }

  /* ===== 手机端：同文档拉起系统打印页（纯文字排版，iOS/安卓打印页里可直接「存储为 PDF」）=====
     图片式 PDF 会把内容按固定高度切割（文字被拦腰截断）；系统打印页是原文字自动分页，无此问题。 */
  function printCss() {
    return `
@media screen{ #kgPrintRoot{ display:none !important; } }
@media print{
  body > *:not(#kgPrintRoot){ display:none !important; }
  html,body{ background:#fff !important; margin:0 !important; padding:0 !important; }
  #kgPrintRoot{ display:block !important; }
  @page{ size:A4; margin:12mm; }
  ${PDF_CSS.replace(/#kgPdfHost/g, "#kgPrintRoot")}
}`;
  }

  function printInPlace(title, bodyHtml, opts) {
    opts = opts || {};
    const old = document.getElementById("kgPrintRoot");
    if (old) old.remove();
    const root = document.createElement("div");
    root.id = "kgPrintRoot";
    root.innerHTML = `<style>${printCss().replace("#kgPrintRoot{color:#111", "#kgPrintRoot{font-family:" + (opts.font || '"Microsoft YaHei","PingFang SC",sans-serif') + ";color:#111")}</style>
      <h1>${title}</h1>
      <div class="meta">导出来源：考公工作台 · 生成时间：${stampNow()}${opts.fontLabel ? " · 字体：" + opts.fontLabel : ""}</div>
      ${bodyHtml}
      <div class="foot">考公工作台 · 个人备考助手</div>`;
    document.body.appendChild(root);
    const done = function () {
      const r = document.getElementById("kgPrintRoot");
      if (r) r.remove();
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done, { once: true });
    setTimeout(function () {
      try { window.print(); } catch (e) { console.warn("print 失败", e); }
      setTimeout(done, 90000); // 兜底清理（部分浏览器不触发 afterprint）
    }, 150);
  }

  function isMobileLike() {
    return /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  /* 导出路由：手机 → 拉起系统打印页（纯文字，可另存 PDF）；桌面 → 生成 PDF 文件下载 */
  async function exportPdfOrPrint(title, bodyHtml, opts) {
    if (isMobileLike()) {
      printInPlace(title, bodyHtml, opts);
      if (window.UI && UI.toast) UI.toast("已拉起打印页：点「分享」→「存储到文件」即可导出 PDF");
      return;
    }
    try {
      if (window.UI && UI.toast) UI.toast("正在生成 PDF，请稍候…");
      // 超时保护：渲染慢/卡住时不至于永远停在「正在生成」
      const r = await Promise.race([
        htmlToPdf(title, bodyHtml, opts),
        new Promise((_, rej) => setTimeout(() => rej(new Error("生成超时")), 120000))
      ]);
      if (window.UI && UI.toast && r.mode !== "panel") UI.toast(`已导出 PDF（${r.pages} 页）：${r.filename}`);
      return r;
    } catch (e) {
      console.warn("PDF 生成失败，回退打印：", e);
      if (window.UI && UI.toast) UI.toast("PDF 生成失败，已改用打印窗口");
      printHtml(title, bodyHtml, opts);
    }
  }

  function printHtml(title, bodyHtml, opts) {
    const w = window.open("", "_blank");
    if (!w) { alert("浏览器拦截了弹窗，请允许弹窗后重试"); return; }
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const homeUrl = window.location.href;
    const font = (opts && opts.font) || '"Microsoft YaHei","PingFang SC",sans-serif';
    w.document.write(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<title>${title}</title>
<style>
  /* 关键：不加这两行，打印/另存 PDF 时背景色（高亮）会被浏览器丢掉 */
  body{font-family:${font};color:#111;margin:28px;line-height:1.7;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  /* 范文导出用 */
  .essay-p-i{text-indent:2em;margin:0 0 10px;line-height:1.9}
  .essay-hl-i{background:#ffe680;padding:0 2px;border-radius:2px}
  .essay-blue-i{color:#0b3d91;font-weight:700;text-decoration:underline;text-decoration-color:#1763c0;text-decoration-thickness:2px}
  .essay-line-i,.essay-u-i{text-decoration:underline;text-decoration-color:#e23b54;text-decoration-thickness:2.5px}
  .essay-red-i{color:#e23b54;font-weight:700}
  .user-hl-i{font-weight:700}
  h1{font-size:20px;border-bottom:3px solid #34e7e4;padding-bottom:8px}
  .meta{color:#666;font-size:12px;margin-bottom:8px}
  .sec{font-size:17px;font-weight:800;margin:22px 0 10px;border-bottom:2px solid #9b6cff;padding-bottom:4px;page-break-after:avoid}
  .subhead{font-weight:800;font-size:15px;background:#f0f6ff;padding:6px 10px;border-left:4px solid #9b6cff;margin:14px 0 8px;page-break-after:avoid}
  .item{border:1px solid #ddd;border-radius:8px;padding:10px 12px;margin-bottom:10px;page-break-inside:avoid}
  .aitem{border:1px dashed #c9b6ff;border-radius:8px;padding:8px 12px;margin-bottom:8px;page-break-inside:avoid}
  /* 表格（用于规范词等对照表导出） */
  table{width:100%;border-collapse:collapse;margin:6px 0 16px;font-size:13px}
  th,td{border:1px solid #b9b9b9;padding:6px 9px;text-align:left;vertical-align:top;line-height:1.6}
  thead th{background:#eaf1ff;font-weight:800}
  td.idx{width:44px;text-align:center;color:#666}
  td.term{font-weight:800;color:#0f7a4c}
  tbody tr{page-break-inside:avoid}
  .q{font-weight:700;margin-bottom:6px}
  .qnum{color:#9b6cff;font-weight:800;margin-right:4px}
  .kw{color:#c0392b;font-weight:800}
  .opt{margin:2px 0}
  .anum{display:inline-block;color:#1f8a4c;font-weight:800;margin-right:6px}
  .ans{color:#1f8a4c;font-weight:700;font-size:14px;margin-bottom:4px}
  .exp{background:#fafafa;border-left:3px solid #9b6cff;padding:6px 10px;margin-top:4px;font-size:13px}
  .note{color:#555;font-size:13px;margin-top:4px}
  .note.your{color:#c0392b}
  .date{float:right;color:#999;font-size:12px}
  img{max-width:240px;max-height:240px;border:1px solid #ccc;border-radius:6px;margin-top:6px;page-break-inside:avoid}
  .ptoolbar{position:sticky;top:0;display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px;z-index:9}
  .pbtn{padding:8px 16px;font-size:14px;font-weight:700;color:#fff;border:none;border-radius:20px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.15)}
  .pbtn.print{background:#1f8a4c}
  .pbtn.home{background:#9b6cff}
  .backhome{position:sticky;top:0;display:inline-block;margin:0 0 12px;padding:8px 16px;font-size:14px;font-weight:700;
    color:#fff;background:#9b6cff;border:none;border-radius:20px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.15);z-index:9}
  .foot{margin-top:24px;color:#999;font-size:12px;text-align:center}
  @media print{.noprint{display:none!important}}
</style></head><body>
${printToolbar(homeUrl)}
<h1>${title}</h1>
<div class="meta">导出来源：考公工作台 · 生成时间：${stamp}${opts && opts.fontLabel ? " · 字体：" + opts.fontLabel : ""}</div>
${bodyHtml}
<div class="foot">考公工作台 · 个人备考助手</div>
${backHomeBtn(homeUrl)}
<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script>
</body></html>`);
    w.document.close();
  }

  /* 构建导出结构：题目与答案分离
     返回 { qHtml(纯题目), aHtml(统一答案), total } */
  function buildExport(blocks) {
    let qHtml = "", aHtml = "", counter = 0;
    const multi = blocks.length > 1;
    blocks.forEach(b => {
      if (!b.items || !b.items.length) return;
      if (multi) {
        qHtml += `<div class="subhead">${b.subject} · 题目（${b.items.length} 题）</div>`;
        aHtml += `<div class="subhead">${b.subject} · 答案与解析</div>`;
      }
      b.items.forEach(it => {
        counter++;
        const n = counter;
        // ---- 题目区（纯题目，选项不标正确项，不显示解析）----
        qHtml += `<div class="item">
          <div class="q"><span class="qnum">${n}.</span> ${nl2br(it.q).replace(/____/g, '<span class="kw">____</span>')}</div>`;
        if (it.options) it.options.forEach((o, i) => {
          qHtml += `<div class="opt">${A(i)}. ${nl2br(o)}</div>`;
        });
        if (it.img) qHtml += `<img src="${it.img}"/>`;
        qHtml += `</div>`;
        // ---- 答案区（统一：正确答案 / 你的作答 / 解析 / 笔记）----
        let ansLine = "";
        if (it.options && it.a != null) ansLine = `正确答案：<b>${A(it.a)}</b>`;
        else if (it.e) ansLine = `参考答案：${it.e}`;
        else ansLine = `（无答案记录）`;
        aHtml += `<div class="aitem"><span class="anum">${n}.</span>${ansLine}`;
        if (it.options && it.a != null && it.ua != null) aHtml += `<div class="note your">你的作答：${A(it.ua)}</div>`;
        else if (!it.options && it.ua != null) aHtml += `<div class="note your">你的作答：${A(it.ua)}</div>`;
        if (it.options && it.a != null && it.e && !it.optInfo) aHtml += `<div class="exp">解析：${nl2br(it.e)}</div>`;
        if (it.optInfo && it.optInfo.length) {
          aHtml += `<div class="exp">选项释义：<br>` + it.optInfo.map((oi, k) => {
            const isC = (k === it.a);
            return `<div style="margin:3px 0">${A(k)}. <b>${nl2br(oi.word)}</b>${isC ? "（正确答案）" : ""}：${nl2br(oi.def)}${oi.ex ? " 例：" + nl2br(oi.ex) : ""}</div>`;
          }).join("") + `</div>`;
        }
        if (it.note) aHtml += `<div class="note">笔记：${it.note}</div>`;
        aHtml += `</div>`;
      });
    });
    return { qHtml, aHtml, total: counter };
  }

  function wrongBody(subject, items) {
    const { qHtml, aHtml, total } = buildExport([{ subject, items }]);
    return `<h2 class="sec">一、题目（共 ${total} 题，请先作答，答案见下方）</h2>
${qHtml}
<h2 class="sec">二、答案与解析</h2>
${aHtml}`;
  }

  function wrongItemsHtml(subject, items) {
    // 保留旧签名兼容（如外部直接调用）
    if (!items || !items.length) return `<div class="empty">该科目暂无错题</div>`;
    return wrongBody(subject, items);
  }

  const PDF = {
    printHtml,
    htmlToPdf,
    exportPdf: exportPdfOrPrint,
    exportWrong(subject) {
      const items = (DB.state.wrongbook[subject] || []).slice();
      exportPdfOrPrint(`${subject} · 错题本（${items.length}题）`, wrongBody(subject, items));
    },
    exportAllWrong() {
      const wb = DB.state.wrongbook;
      const blocks = SUBJECT_ORDER.filter(s => wb[s] && wb[s].length).map(s => ({ subject: s, items: wb[s].slice() }));
      if (!blocks.length) { exportPdfOrPrint("全部科目 · 错题本", `<div class="empty">暂无错题</div>`); return; }
      const { qHtml, aHtml, total } = buildExport(blocks);
      exportPdfOrPrint(`全部科目 · 错题本（${total}题）`, `<h2 class="sec">一、题目（共 ${total} 题，请先作答，答案见下方）</h2>
${qHtml}
<h2 class="sec">二、答案与解析</h2>
${aHtml}`);
    },
    /* 导出任意一组错题（用于按日期范围 / 自定义筛选后导出） */
    exportWrongList(title, items) {
      if (!items || !items.length) { exportPdfOrPrint(title, `<div class="empty">该范围内暂无错题</div>`); return; }
      const { qHtml, aHtml, total } = buildExport([{ subject: title, items }]);
      exportPdfOrPrint(`${title}（${total}题）`, `<h2 class="sec">一、题目（共 ${total} 题，请先作答，答案见下方）</h2>
${qHtml}
<h2 class="sec">二、答案与解析</h2>
${aHtml}`);
    },
    exportHtml(title, bodyHtml, opts) { exportPdfOrPrint(title, bodyHtml, opts); }
  };

  window.PDF = PDF;
})();
