/* PDF 导出：基于浏览器打印（中文零乱码，支持“另存为 PDF”） */
(function () {
  "use strict";
  const DB = window.DB;
  const A = i => String.fromCharCode(65 + i);
  const SUBJECT_ORDER = ["言语", "资料", "逻辑", "政治", "数量", "常识", "申论"];
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function nl2br(s) { return esc(s).replace(/\n/g, "<br>"); }

  function backHomeBtn(homeUrl) {
    return `<button class="noprint backhome" onclick="(function(){try{if(window.opener&&!window.opener.closed){window.opener.focus();window.close();return;}}catch(e){}try{window.close();}catch(e){}window.location.href='${homeUrl}';})()">← 返回主页面</button>`;
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
  body{font-family:${font};color:#111;margin:28px;line-height:1.7}
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
  .backhome{position:sticky;top:0;display:inline-block;margin:0 0 12px;padding:8px 16px;font-size:14px;font-weight:700;
    color:#fff;background:#9b6cff;border:none;border-radius:20px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.15);z-index:9}
  .foot{margin-top:24px;color:#999;font-size:12px;text-align:center}
  @media print{.noprint{display:none!important}}
</style></head><body>
${backHomeBtn(homeUrl)}
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
    exportWrong(subject) {
      const items = (DB.state.wrongbook[subject] || []).slice();
      printHtml(`${subject} · 错题本（${items.length}题）`, wrongBody(subject, items));
    },
    exportAllWrong() {
      const wb = DB.state.wrongbook;
      const blocks = SUBJECT_ORDER.filter(s => wb[s] && wb[s].length).map(s => ({ subject: s, items: wb[s].slice() }));
      if (!blocks.length) { printHtml("全部科目 · 错题本", `<div class="empty">暂无错题</div>`); return; }
      const { qHtml, aHtml, total } = buildExport(blocks);
      printHtml(`全部科目 · 错题本（${total}题）`, `<h2 class="sec">一、题目（共 ${total} 题，请先作答，答案见下方）</h2>
${qHtml}
<h2 class="sec">二、答案与解析</h2>
${aHtml}`);
    },
    /* 导出任意一组错题（用于按日期范围 / 自定义筛选后导出） */
    exportWrongList(title, items) {
      if (!items || !items.length) { printHtml(title, `<div class="empty">该范围内暂无错题</div>`); return; }
      const { qHtml, aHtml, total } = buildExport([{ subject: title, items }]);
      printHtml(`${title}（${total}题）`, `<h2 class="sec">一、题目（共 ${total} 题，请先作答，答案见下方）</h2>
${qHtml}
<h2 class="sec">二、答案与解析</h2>
${aHtml}`);
    },
    exportHtml(title, bodyHtml, opts) { printHtml(title, bodyHtml, opts); }
  };

  window.PDF = PDF;
})();
