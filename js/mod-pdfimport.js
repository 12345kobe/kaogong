/* 模块：PDF 题库导入（分章节 / 分题型刷题 + 理论「学考点」）
   - 前端用 pdf.js 提取 PDF 文字（按文字 Y 坐标重建行 + 按 X 坐标还原段落缩进）；
   - 支持「题目 PDF」+「答案 PDF（可选，题目与答案分离的题库）」；
   - 按【PDF 目录书签 / 章节标题 / 题型关键词】把整本切分成多个章节：
       有理论的部分：整段展示（只在句意完整处断句、<p> 分段保留缩进）+「📖 学考点」；
       没有理论的部分：按每页 5~20 题（默认 10）分页刷题，带上/下页；
   - 题册可自命名，未命名默认「模块+刷题册（N）」；题册存 DB.state.pdfBooks，
     并通过 window.KGPdfBooks 暴露给各模块的「自行刷题」入口取用；
   - 练习时记录每题用时与正确率（DB.state.pdfBookPractice），正确率与学习时长由
     Quiz 引擎统一走 DB.recordAccuracy / addSubjectSession 计入当天该模块；
     学考点 / 刷题都会写入 learnedLog（stateKey = pdfBook）。
   仅支持文字型 PDF；扫描件（图片型）需先 OCR。
*/
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};

  const SUBJECTS = window.KG_SUBJECTS || ["言语理解", "资料分析", "数量关系", "逻辑判断", "常识判断", "政治理论", "申论"];
  const SUBJECT_SHORT = window.KG_SUBJECT_SHORT || {};
  const CDNS = [
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
    "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
  ];
  const WORKERS = {
    "cdn.jsdelivr.net": "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
    "unpkg.com": "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
    "cdnjs.cloudflare.com": "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
  };

  const PAGE_SIZES = [5, 10, 15, 20];      // 每页题数可选范围
  const DEFAULT_PAGE_SIZE = 10;            // 默认每页 10 题
  const LEARN_KEY = "pdfBook";             // learnedLog 里本模块用的 stateKey

  // 章节 / 题型关键词（用于内容识别分组）
  const TYPE_WORDS = [
    "言语理解", "判断推理", "数量关系", "资料分析", "常识判断", "政治理论",
    "逻辑判断", "图形推理", "类比推理", "定义判断", "逻辑填空", "片段阅读",
    "语句表达", "语句排序", "文章阅读", "数字推理", "数学运算",
    "法律常识", "经济常识", "科技常识", "人文常识", "地理常识", "历史常识",
    "归纳概括", "综合分析", "提出对策", "贯彻执行", "文章写作",
    "考点直击", "知识梳理", "名师点拨", "应试技巧", "例题精讲", "真题演练",
    "强化练习", "专项训练", "模拟测试", "本章小结", "易错辨析", "解题步骤",
    "参考答案", "答案及解析", "答案与解析"
  ];

  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function db() { return window.DB; }
  function A(i) { return String.fromCharCode(65 + i); }

  /* ================= 一、PDF 文字提取 ================= */

  /* 依次尝试多个 CDN 加载 pdf.js */
  async function loadPdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    let lastErr = null;
    for (const url of CDNS) {
      try {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = url; s.onload = resolve; s.onerror = () => reject(new Error("加载失败"));
          document.head.appendChild(s);
          setTimeout(() => reject(new Error("超时")), 15000);
        });
        if (!window.pdfjsLib) throw new Error("未挂载 pdfjsLib");
        const host = url.split("/")[2];
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKERS[host] || CDNS[0].replace("pdf.min.js", "pdf.worker.min.js");
        return window.pdfjsLib;
      } catch (e) { lastErr = e; }
    }
    throw new Error("加载 pdf.js 失败（已尝试 jsdelivr / unpkg / cdnjs），请检查网络后重试");
  }

  /* 读取 PDF 书签目录（优先用它分章节）→ [{title, page(0基), depth}] */
  async function readOutline(doc) {
    let ol = null;
    try { ol = await doc.getOutline(); } catch (e) { return null; }
    if (!ol || !ol.length) return null;
    const out = [];
    async function walk(items, depth) {
      for (const it of items || []) {
        let idx = -1;
        try {
          const dest = (typeof it.dest === "string") ? await doc.getDestination(it.dest) : it.dest;
          if (dest) idx = await doc.getPageIndex(dest);
        } catch (e) { idx = -1; }
        if (idx >= 0 && it.title) out.push({ title: String(it.title).trim(), page: idx, depth: depth });
        if (it.items && it.items.length) await walk(it.items, depth + 1);
      }
    }
    await walk(ol, 0);
    return out.length ? out : null;
  }

  /* 按 Y 坐标把零散 text item 还原成「行」；按 X 坐标还原段落缩进（行首缩进 2 全角空格）
     这是能正确识别题目 / 还原段落的关键（旧版"整页挤成一行"的修复点） */
  async function extractPages(file) {
    const pdfjsLib = await loadPdfJs();
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const rows = [];
      for (const it of content.items) {
        const y = (it.transform && it.transform[5] != null) ? it.transform[5] : null;
        const x = (it.transform && it.transform[4] != null) ? it.transform[4] : 0;
        const str = it.str || "";
        const last = rows[rows.length - 1];
        // 空串（排版空格）不单独成行，只可能标记换行，避免把一个段落拆碎
        if (!str) { if (it.hasEOL && last) last.eol = true; continue; }
        const sameLine = last && !last.eol && last.y !== null && y !== null && Math.abs(y - last.y) <= 3;
        if (sameLine) {
          last.s += str; last.x = Math.min(last.x, x);
        } else {
          rows.push({ y: y, x: x, s: str, eol: false });
        }
        if (it.hasEOL && rows.length) rows[rows.length - 1].eol = true;
      }
      // 该页左边界（取 10% 分位，避开页码等离群值）→ 缩进判定基准
      const xs = rows.filter(r => (r.s || "").trim().length > 3).map(r => r.x).sort((a, b) => a - b);
      const margin = xs.length ? xs[Math.floor(xs.length * 0.1)] : 0;
      const lines = rows.map(r => {
        let s = String(r.s || "").replace(/\s+$/, "");
        if (s.trim() && r.x > margin + 6) s = "　　" + s.replace(/^[ \u3000]+/, ""); // 缩进 = 新段落
        return s;
      });
      pages.push(lines.join("\n"));
    }
    let outline = null;
    try { outline = await readOutline(doc); } catch (e) { outline = null; }
    if (doc.destroy) await doc.destroy();
    return { pages: pages, outline: outline };
  }

  /* 兼容旧调用：返回整本纯文本 */
  async function extractText(file) {
    const r = await extractPages(file);
    return (r.pages || []).join("\n");
  }

  /* ================= 二、文本工具 ================= */

  /* 中文之间直接拼接、中英之间补空格 */
  function smartJoin(a, b) {
    if (!a) return b || "";
    if (!b) return a;
    const l = a.slice(-1), f = b.slice(0, 1);
    return (/[A-Za-z0-9]/.test(l) && /[A-Za-z0-9]/.test(f)) ? a + " " + b : a + b;
  }
  function cleanStem(s) {
    return String(s || "")
      .replace(/^(单选题|多选题|判断题|单项选择|多项选择|不定项选择|单项选择题|多项选择题|单选题型)\s*/g, "")
      .trim();
  }
  const NOISE_LINE = /^(第?\s*\d+\s*[页頁]|共\s*\d+\s*[页頁]|答案[见在]|解析[见在]|扫码|关注公众号|微信号|微信公众号)/;

  const STRONG_HEAD = /^(?:第\s*[一二三四五六七八九十百零〇\d]{1,4}\s*[章讲篇编部节]|专题\s*[一二三四五六七八九十\d]{1,3}|题型\s*[一二三四五六七八九十\d]{1,3})/;
  const HEAD_PATTERNS = [
    /^第\s*[一二三四五六七八九十百零〇\d]{1,4}\s*[章讲篇编部]\s*[\.、:：]?\s*\S*/,
    /^第\s*[一二三四五六七八九十百零〇\d]{1,4}\s*[节]\s*[\.、:：]?\s*\S*/,
    /^专题\s*[一二三四五六七八九十\d]{1,3}\s*[\.、:：]?\s*\S*/,
    /^题型\s*[一二三四五六七八九十\d]{1,3}\s*[\.、:：]?\s*\S*/,
    /^[一二三四五六七八九十]{1,3}\s*[、]\s*\S+/,
    /^[（(]\s*[一二三四五六七八九十\d]{1,3}\s*[)）]\s*\S*/,
    /^\d{1,2}\s*[、]\s*[^\d\s]\S*/,
    /^【[^】]{2,24}】$/
  ];

  /* 是否是章节标题行（用于分章节分组） */
  function isHeading(ln, ctx) {
    const s = String(ln || "").trim();
    if (!s || s.length > 34) return false;
    if (/[。；;，,！？!?]/.test(s)) return false;          // 带句中标点 → 不是标题
    if (/^[\d\s\.\-—·]+$/.test(s)) return false;          // 纯数字 / 符号
    if (STRONG_HEAD.test(s)) return true;
    for (let i = 0; i < HEAD_PATTERNS.length; i++) if (HEAD_PATTERNS[i].test(s)) return true;
    if (s.length <= 16 && TYPE_WORDS.some(w => s === w || s.indexOf(w) === 0)) return true;
    // 页首短行：上一句已结束、本行又短又无标点 → 多半是章节标题
    if (ctx && ctx.atPageStart && s.length <= 16 && ctx.prevEnd) return true;
    return false;
  }

  /* 是否是理论里的二级小标题 */
  function isSubHeading(ln) {
    const s = String(ln || "").trim();
    if (!s || s.length > 26) return false;
    if (/[。！？；，]/.test(s)) return false;
    if (/^(?:[（(]\s*[一二三四五六七八九十\d]{1,3}\s*[)）]|[一二三四五六七八九十]{1,3}\s*[、\.]|\d{1,2}\s*[、\.]\s*[^\d]|[①②③④⑤⑥⑦⑧⑨⑩]|[【\[][^】\]]{2,20}[】\]]\s*$|第\s*[一二三四五六七八九十\d]{1,3}\s*[节章])/.test(s)) return true;
    if (s.length <= 16 && TYPE_WORDS.some(w => s === w || s.indexOf(w) === 0)) return true;
    return false;
  }

  function cleanTitle(s) {
    let t = String(s || "").trim()
      .replace(/[\.\s·]{3,}\s*\d*$/, "")     // 目录里的 "逻辑判断 ...... 12"
      .replace(/\s+\d{1,4}$/, "")            // 行尾页码
      .trim();
    // 去掉包裹型括号（"（一）图形推理" → "图形推理"），仅在去掉后仍有内容时生效
    const m = t.match(/^[（(【\[]\s*.{1,24}?\s*[）)】\]]\s*(\S.*)$/);
    if (m) t = m[1].trim();
    else t = t.replace(/^[【\[（(]+/, "").replace(/[】\]）)]+$/, "").trim();
    return t.slice(0, 30);
  }

  /* ===== 理论文本 → 分段 HTML（只在句意完整处断句，用 <p> 保留段落结构与缩进） ===== */
  const SENT_END = "。！？!?…";
  const CLOSERS = "'\"”’』」）)]】]";
  function hardEnd(st) {
    const t = String(st || "").replace(/["'”’』」）)\]】]+$/, "");
    return t.length > 0 && SENT_END.indexOf(t[t.length - 1]) >= 0;
  }
  /* 先切成「句」：只在句号/问号/叹号（或足够长的分号）处断开 */
  function splitSentences(s) {
    const out = []; let cur = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      cur += ch;
      if (SENT_END.indexOf(ch) >= 0) {
        while (i + 1 < s.length && CLOSERS.indexOf(s[i + 1]) >= 0) { i++; cur += s[i]; }
        out.push(cur); cur = "";
      } else if ("；;".indexOf(ch) >= 0 && cur.length >= 30) {
        out.push(cur); cur = "";
      }
    }
    if (cur.trim()) out.push(cur);
    return out.map(x => x.trim()).filter(Boolean);
  }
  const PARA_START = /^(?:[（(【\[]\s*(?:[一二三四五六七八九十]{1,3}|\d{1,2})\s*[、\.．)）]|[①②③④⑤⑥⑦⑧⑨⑩◆●■▶·]|(?:首先|其次|再次|然后|最后|另外|此外|同时|注意|例如|比如|综上|相反|换言之|具体来说|具体来看|小贴士|提示|总结))/;
  /* 再按「句」合并成段落：只在完整句之后、且遇到并列/序数标志或够长时才另起一段 */
  function groupParagraphs(sents, maxLen) {
    maxLen = maxLen || 180;
    const paras = []; let cur = "", curHard = false;
    sents.forEach(st => {
      const hard = hardEnd(st);
      if (!cur) { cur = st; curHard = hard; return; }
      if (PARA_START.test(st) || (curHard && cur.length >= maxLen)) { paras.push(cur); cur = st; }
      else cur = smartJoin(cur, st);
      curHard = hard;
    });
    if (cur) paras.push(cur);
    return paras;
  }
  function theoryToHtml(raw) {
    try {
      const lines = String(raw || "").split(/\r?\n/);
      const blocks = [];
      let buf = "";
      const flush = () => { if (buf.trim()) blocks.push({ t: "p", x: buf.trim() }); buf = ""; };
      lines.forEach(ln0 => {
        const indented = /^[ \u3000]{1,}/.test(ln0);
        const ln = ln0.replace(/^[ \u3000]+/, "").trim();
        if (!ln) { flush(); return; }
        if (NOISE_LINE.test(ln)) return;
        if (isSubHeading(ln)) { flush(); blocks.push({ t: "h", x: ln }); return; }
        if (indented && buf.trim() && hardEnd(buf)) flush();   // 原排版缩进 → 新段落
        buf = buf ? smartJoin(buf, ln) : ln;
      });
      flush();
      return blocks.map(b => b.t === "h"
        ? `<div class="al-sub">🔹 ${esc(b.x)}</div>`
        : groupParagraphs(splitSentences(b.x)).map(p => `<p class="al-p">${esc(p)}</p>`).join("")
      ).join("");
    } catch (e) {
      return `<p class="al-p">${esc(raw || "")}</p>`;
    }
  }

  /* ================= 三、题目 / 答案解析 ================= */

  /* 一行内出现 2 个以上选项标记时拆开：A.甲 B.乙 C.丙 D.丁 */
  function splitInlineOptions(line) {
    const re = /(?:^|[\s\u3000])([A-Ea-e])\s*[\.．、,，)）]\s*/g;
    const marks = [];
    let m;
    while ((m = re.exec(line)) !== null) marks.push({ letter: m[1], start: m.index, end: re.lastIndex });
    if (marks.length < 2) return null;
    return marks.map((mk, i) => ({
      letter: mk.letter,
      text: line.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : line.length)
    }));
  }

  /* ===== 题目解析 ===== */
  function parseQuestions(text) {
    const lines = String(text || "").split(/\r?\n/).map(l => l.trim()).filter(l => l && !NOISE_LINE.test(l));
    const qRe = /^\s*(\d{1,4})\s*[\.．、,，)）]\s*(.*)$/;
    const optRe = /^\s*([A-Ea-e])\s*[\.．、,，)）]\s*(.*)$/;
    const ansInline = /(?:答案|正确答案|参考答案)\s*[：:是为]?\s*([A-Ea-e])|【\s*([A-Ea-e])\s*】|\(\s*([A-Ea-e])\s*\)$/;
    const expRe = /(?:解析|答案解析|【解析】)\s*[：:]?\s*(.*)/;

    const out = [];
    let cur = null, inOpts = false;
    function setAns(letter) {
      if (!cur) return;
      const idx = letter.toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < 10) { cur.a = idx; cur.aSet = true; }
    }
    function flush() {
      if (cur && cur.q) {
        cur.q = cleanStem(cur.q.replace(/\s+/g, " ")).replace(/\s+([，。；：、])/g, "$1");
        cur.options = cur.options.map(o => String(o || "").replace(/\s+/g, " ").trim()).filter(o => o !== "");
        cur.e = String(cur.e || "").trim();
        if (cur.options.length >= 2) out.push(cur);
      }
      cur = null; inOpts = false;
    }

    for (const raw of lines) {
      const qm = qRe.exec(raw);
      if (qm && !/^\d{1,4}\s*分/.test(raw)) {
        flush();
        cur = { num: parseInt(qm[1], 10), q: qm[2] || "", options: [], a: 0, e: "", aSet: false };
        inOpts = false;
        continue;
      }
      if (!cur) continue;

      const inline = splitInlineOptions(raw);
      if (inline && inline.length >= 2) {
        inline.forEach(({ letter, text }) => {
          const idx = letter.toUpperCase().charCodeAt(0) - 65;
          if (idx >= 0 && idx < 10) {
            while (cur.options.length <= idx) cur.options.push("");
            cur.options[idx] = text.trim();
          }
        });
        inOpts = true;
        continue;
      }

      const om = optRe.exec(raw);
      if (om && !/^[A-Ea-e]$/.test(raw)) {
        const idx = om[1].toUpperCase().charCodeAt(0) - 65;
        const txt = (om[2] || "").trim();
        if (idx === cur.options.length || (idx <= cur.options.length + 1)) {
          while (cur.options.length < idx) cur.options.push("");
          cur.options[idx] = txt;
          inOpts = true;
          continue;
        }
      }

      const em = expRe.exec(raw);
      if (em && (inOpts || cur.options.length)) {
        const rest = (em[1] || "").trim();
        const am = rest.match(/^([A-Ea-e])\b/);
        if (am) setAns(am[1]);
        cur.e = smartJoin(cur.e, rest || raw);
        continue;
      }
      const amLine = raw.match(/^(?:参考答案|正确答案|答案)\s*[：:是为]?\s*([A-Ea-e])/);
      if (amLine) { setAns(amLine[1]); continue; }

      const am2 = raw.match(ansInline);
      if (am2 && !cur.aSet) {
        const letter = am2[1] || am2[2] || am2[3];
        if (letter) setAns(letter);
      }

      if (inOpts && cur.options.length) cur.options[cur.options.length - 1] = smartJoin(cur.options[cur.options.length - 1], raw);
      else cur.q = smartJoin(cur.q, raw);
    }
    flush();
    return out;
  }

  /* ===== 答案解析（题目与答案分离的题库 / 文末答案附录）===== */
  function parseAnswers(text) {
    const lines = String(text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const ansMap = {};
    let curNum = null;
    const numRe = /^(\d{1,4})\s*[\.．、,，)）]?\s*(.*)$/;
    for (const raw of lines) {
      const m = numRe.exec(raw);
      if (m) {
        curNum = parseInt(m[1], 10);
        const rest = m[2] || "";
        const am = rest.match(/[【\[（(]\s*([A-Ea-e]+)\s*[\]】）)]/) || rest.match(/^([A-Ea-e]+)[\.．、]?/);
        if (am) {
          const letters = am[1].toUpperCase();
          const entry = ansMap[curNum] = ansMap[curNum] || { a: 0, e: "" };
          if (letters.length === 1) entry.a = letters.charCodeAt(0) - 65;
          const after = rest.slice(am.index + am[0].length).replace(/^(?:解析|答案解析)?[：:]\s*/, "").trim();
          entry.e = after;
        }
        continue;
      }
      if (curNum != null && ansMap[curNum]) {
        ansMap[curNum].e = smartJoin(ansMap[curNum].e, raw.replace(/^(?:答案解析|解析|答案)\s*[：:]\s*/, ""));
      }
    }
    return ansMap;
  }

  /* ================= 四、分章节 / 分题型 ================= */

  /* 章节内：理论部分（首题之前）与题目部分分开 */
  function splitTheoryQuestions(text) {
    const lines = String(text || "").split(/\r?\n/).map(l => l.trim()).filter(l => l && !NOISE_LINE.test(l));
    if (lines.length && isHeading(lines[0], {})) lines.shift();   // 去掉标题行本身
    const qRe = /^\s*(\d{1,4})\s*[\.．、,，)）]\s*(.*)$/;
    let cut = -1;
    for (let i = 0; i < lines.length; i++) {
      if (qRe.test(lines[i]) && !/^\d{1,4}\s*分/.test(lines[i])) { cut = i; break; }
    }
    if (cut < 0) return { theory: lines.join("\n"), qtext: "" };
    return {
      theory: lines.slice(0, cut).join("\n"),
      qtext: lines.slice(cut).filter(l => !STRONG_HEAD.test(l)).join("\n")
    };
  }

  /* 把整本 pages 切成章节：优先 PDF 目录书签，其次内容识别 */
  function buildSections(pages, outline) {
    pages = pages || [];
    const marks = [];
    if (outline && outline.length >= 2) {
      outline.forEach(o => {
        const t = cleanTitle(o.title);
        if (t && o.page >= 0 && o.page < pages.length) marks.push({ name: t, page: o.page });
      });
    }
    if (marks.length < 2) {
      pages.forEach((ptxt, pi) => {
        const lines = String(ptxt || "").split("\n");
        let prev = "";
        for (let li = 0; li < lines.length; li++) {
          const s = String(lines[li] || "").trim();
          if (!s) continue;
          if (isHeading(s, { atPageStart: li <= 1, prevEnd: /[。！？”」…]$/.test(prev) })) {
            marks.push({ name: cleanTitle(s), page: pi });
          }
          prev = s;
        }
      });
    }
    // 去重：页眉重复标题 / 同页多个标题
    const uniq = [];
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i], last = uniq[uniq.length - 1];
      if (!last) { uniq.push(m); continue; }
      if (last.name === m.name) { last.page = Math.max(last.page, m.page); continue; }  // 页眉重复
      if (last.page === m.page) {                                                       // 同页多个标题：保留更高一级
        if (STRONG_HEAD.test(m.name) && !STRONG_HEAD.test(last.name)) last.name = m.name;
        continue;
      }
      uniq.push(m);
    }

    const secs = [];
    if (!uniq.length) {
      secs.push({ name: "全部题目", text: pages.join("\n") });
    } else {
      uniq.forEach((m, i) => {
        const end = (i + 1 < uniq.length) ? uniq[i + 1].page : pages.length;
        const text = pages.slice(m.page, Math.max(end, m.page + 1)).join("\n");
        if (String(text).replace(/\s/g, "").length < 20) return;
        secs.push({ name: m.name || ("第" + (i + 1) + "章"), text: text });
      });
    }
    return secs.map(s => {
      const parts = splitTheoryQuestions(s.text);
      return {
        name: s.name,
        theory: parts.theory || "",
        questions: parseQuestions(parts.qtext)
      };
    });
  }

  /* 文末「答案附录」章节：没有题目、但满屏 "1.A" → 解析后回填到各章题目，并丢弃该章 */
  function absorbAnswerSections(sections) {
    const ans = {};
    const keep = [];
    (sections || []).forEach(s => {
      if (s.questions && s.questions.length) { keep.push(s); return; }
      const lines = String(s.theory || "").split("\n").map(x => x.trim()).filter(Boolean);
      const hit = lines.filter(l => /^\d{1,4}\s*[\.．、)）]?\s*[A-Ea-e]/.test(l)).length;
      if (lines.length && hit >= Math.max(2, Math.ceil(lines.length * 0.5))) {
        const m = parseAnswers(lines.join("\n"));
        for (const k in m) ans[k] = m[k];
        return; // 丢弃附录章
      }
      keep.push(s);
    });
    if (Object.keys(ans).length) {
      keep.forEach(s => (s.questions || []).forEach(q => {
        const a = ans[q.num];
        if (a) { if (a.a >= 0) q.a = a.a; if (a.e && !q.e) q.e = a.e; }
      }));
    }
    return keep;
  }

  /* ================= 五、题册存储：DB.state.pdfBooks + window.KGPdfBooks ================= */

  function rawBooks() {
    const DB = db();
    if (!DB.state.pdfBooks || !Array.isArray(DB.state.pdfBooks)) DB.state.pdfBooks = [];
    return DB.state.pdfBooks;
  }
  function clone(o) { try { return JSON.parse(JSON.stringify(o || null)); } catch (e) { return null; } }

  /* 全局查询 API：供其它模块的「自行刷题」入口取用 */
  window.KGPdfBooks = {
    /** 题册列表；传学科（短名或全名）则只返回该模块的题册 */
    list(subject) {
      const DB = db();
      let arr = rawBooks().slice();
      if (subject) {
        const s = DB.subjectShort ? DB.subjectShort(subject) : subject;
        arr = arr.filter(b => b.subject === s || b.subject === subject);
      }
      return arr.map(clone);
    },
    /** 按 id 取题册（返回副本，改动请用 add / remove） */
    get(id) {
      const b = rawBooks().find(x => x.id === id);
      return b ? clone(b) : null;
    },
    /** 新增题册（缺 id / 名称时自动补全），返回保存后的题册 */
    add(book) {
      const DB = db();
      book = book || {};
      book.id = book.id || DB.uid();
      if (!book.name) book.name = suggestName(book.subject);
      book.subject = book.subject || "常识";
      book.sections = Array.isArray(book.sections) ? book.sections : [];
      book.createdAt = book.createdAt || Date.now();
      book.date = book.date || DB.today();
      rawBooks().push(book);
      DB.save();
      return clone(book);
    },
    /** 删除题册，返回是否删除成功 */
    remove(id) {
      const DB = db();
      const arr = rawBooks();
      const i = arr.findIndex(x => x.id === id);
      if (i < 0) return false;
      arr.splice(i, 1);
      DB.save();
      return true;
    },
    /** 全部题册 */
    all() { return rawBooks().map(clone); },
    /** 某题册的全部题目（扁平） */
    questionsOf(id, si) {
      const b = rawBooks().find(x => x.id === id);
      if (!b) return [];
      const secs = (si == null) ? b.sections : [b.sections[si]].filter(Boolean);
      const out = [];
      secs.forEach(s => (s.questions || []).forEach(q => out.push(clone(q))));
      return out;
    }
  };

  /* 默认名：模块 + 刷题册（N）；N = 该模块已有「未自命名」题册的第几套（从 1 开始） */
  function suggestName(subject) {
    const s = subject || "综合";
    const taken = {};
    rawBooks().forEach(b => { if (b.subject === subject) taken[b.name] = 1; });
    let n = 1;
    while (taken[s + "刷题册（" + n + "）"]) n++;
    return s + "刷题册（" + n + "）";
  }

  function subjectLabel(short) {
    if (!short) return "未分科";
    for (const k in SUBJECT_SHORT) if (SUBJECT_SHORT[k] === short) return k;
    return short;
  }

  /* 自定义题库（保留旧能力） */
  function getCustomQuestions() {
    const DB = db();
    DB.state.customQuestions = DB.state.customQuestions || {};
    return DB.state.customQuestions;
  }
  function saveToCustom(subject, items) {
    const DB = db();
    const store = getCustomQuestions();
    store[subject] = store[subject] || [];
    let n = 0;
    items.forEach(it => {
      if (!it || !it.q || !it.options || it.options.length < 2) return;
      store[subject].push({
        id: DB.uid(), q: it.q, options: it.options.slice(), a: it.a | 0,
        e: it.e || "", date: DB.today(), source: "PDF导入"
      });
      n++;
    });
    DB.save();
    return n;
  }

  /* 练习记录：每题用时 + 正确率（正确率/时长由 Quiz 引擎统一计入当天该模块，避免重复计数） */
  function recordPractice(book, si, r, label) {
    try {
      const DB = db();
      const log = DB.state.pdfBookPractice = DB.state.pdfBookPractice || [];
      log.push({
        id: DB.uid(), date: DB.today(), time: DB.fmtTime(new Date()),
        bookId: (book && book.id) || "", bookName: (book && book.name) || label || "",
        section: (book && book.sections[si] && book.sections[si].name) || label || "",
        subject: (book && book.subject) || "",
        total: r.total, correct: r.correct, pct: r.pct, totalSec: r.totalSec,
        items: (r.qTimes || []).map((ms, i) => ({
          qi: i + 1, sec: Math.round((ms || 0) / 1000),
          right: !!(r.answers && r.answers[i] && r.answers[i].right)
        }))
      });
      if (log.length > 400) DB.state.pdfBookPractice = log.slice(-400);
      if (window.LearnedHistory) window.LearnedHistory.record(LEARN_KEY, [((book && book.id) || "draft") + "::" + si]);
      DB.save();
    } catch (e) {}
  }

  // 供测试 / 向后兼容
  window.__parsePdfQuestions = parseQuestions;
  window.__parsePdfAnswers = parseAnswers;
  window.__pdfExtractText = extractText;
  window.__pdfTheoryToHtml = theoryToHtml;
  window.__pdfBuildSections = buildSections;

  /* ================= 六、界面 ================= */

  window.MODULES.pdfimport = {
    title: "PDF 题库", icon: "pdf",
    render(body) {
      const DB = db(), UI = window.UI;
      body.innerHTML = "";
      const root = UI.el(`<div class="pdf-import"></div>`);
      body.appendChild(root);

      let draft = null;                          // 当前识别结果：{ subject, name, sections:[...] }
      const pageState = Object.create(null);     // "题册id#章节号" → { page, size }

      /* ---------- 导入卡片 ---------- */
      const card = UI.el(`<div class="card">
        <h3>📄 PDF 题库导入</h3>
        <div class="muted small">
          ① 选「题目 PDF」→ 点「提取并识别」；答案与题目分离时再选「答案 PDF」。<br>
          ② 自动按 <b>目录 / 章节标题 / 题型</b> 分组：有理论的章节可「📖 学考点」；题目按每页 5~20 题分页刷。<br>
          ③ 给题册起个名字（留空则自动命名）→ 保存后即可在对应模块的「自行刷题」中使用。<br>
          <b>仅支持文字型 PDF</b>（能用鼠标选中文字的那种）；扫描件请先用 OCR 转文字版。
        </div>
        <div class="row" style="margin-top:12px;gap:10px;flex-wrap:wrap;align-items:center">
          <label class="muted small">题目 PDF</label>
          <input type="file" id="pdfQ" accept="application/pdf" />
        </div>
        <div class="row" style="margin-top:8px;gap:10px;flex-wrap:wrap;align-items:center">
          <label class="muted small">答案 PDF（可选）</label>
          <input type="file" id="pdfA" accept="application/pdf" />
          <select id="pdfSubj">${SUBJECTS.map(s => `<option value="${esc(SUBJECT_SHORT[s] || s)}">${esc(s)}</option>`).join("")}</select>
          <button class="btn primary" id="pdfGo">🔍 提取并识别</button>
          <button class="btn ghost" id="pdfManual">✍️ 手动粘贴文本</button>
        </div>
        <div class="muted small" id="pdfStatus" style="margin-top:10px"></div>
        <textarea id="pdfRaw" style="width:100%;height:130px;margin-top:10px;display:none" placeholder="这里显示从 PDF 提取的文字，可手动修正后再点「重新识别」"></textarea>
        <div class="row" id="reparseRow" style="margin-top:8px;display:none">
          <button class="btn" id="pdfReparse">🔁 用上方文字重新识别</button>
        </div>
        <div id="draftHost"></div>
      </div>`);
      root.appendChild(card);

      /* ---------- 我的题册 ---------- */
      const bookCard = UI.el(`<div class="card" style="margin-top:12px">
        <h3>📚 我的题册（可在各模块「自行刷题」使用）</h3>
        <div class="muted small">点开题册 → 展开章节：有理论的先看考点，再分页刷题；练习会记录每题用时与正确率。</div>
        <div id="bookHost" style="margin-top:8px"></div>
      </div>`);
      root.appendChild(bookCard);

      /* ---------- 自定义题库（旧能力保留） ---------- */
      const customCard = UI.el(`<div class="card" style="margin-top:12px">
        <h3>📋 已保存的自定义题库</h3>
        <div id="customList"></div>
      </div>`);
      root.appendChild(customCard);

      const qIn = card.querySelector("#pdfQ");
      const aIn = card.querySelector("#pdfA");
      const goBtn = card.querySelector("#pdfGo");
      const status = card.querySelector("#pdfStatus");
      const rawTa = card.querySelector("#pdfRaw");
      const reparseRow = card.querySelector("#reparseRow");
      const setStatus = html => { status.innerHTML = html; };

      /* ===== 提取并识别 ===== */
      goBtn.onclick = async () => {
        const qf = qIn.files && qIn.files[0];
        if (!qf) { UI.toast("请先选择题目 PDF"); return; }
        setStatus("正在加载 pdf.js 并提取文字，请稍候…");
        goBtn.disabled = true;
        try {
          const r = await extractPages(qf);
          const qText = (r.pages || []).join("\n");
          rawTa.value = qText;
          rawTa.style.display = "block";
          reparseRow.style.display = "flex";
          let aNote = "";
          let answerMap = {};
          const af = aIn.files && aIn.files[0];
          if (af) {
            const aText = await extractText(af);
            answerMap = parseAnswers(aText);
            aNote = `，从答案 PDF 解析出 ${Object.keys(answerMap).length} 条答案`;
          }
          if (String(qText).replace(/\s/g, "").length < 40) {
            setStatus(`<span style="color:var(--red)">⚠️ 提取到的文字极少，这份 PDF 很可能是<b>扫描件/图片型</b>。请改用文字版 PDF。</span>`);
            goBtn.disabled = false;
            return;
          }
          buildDraft(r.pages || [qText], r.outline, answerMap);
          const tq = countQuestions(draft);
          setStatus(`✓ 提取 ${qText.length} 字符${r.outline ? "（按 PDF 目录分组）" : "（按内容标题分组）"}，共 <b>${draft.sections.length}</b> 个章节 / <b>${tq}</b> 道题${aNote}。请核对后保存。`);
        } catch (e) {
          setStatus(`<span style="color:var(--red)">提取失败：${esc(e.message)}</span>`);
        } finally {
          goBtn.disabled = false;
        }
      };

      card.querySelector("#pdfManual").onclick = () => {
        rawTa.style.display = "block";
        reparseRow.style.display = "flex";
        setStatus("已切换到手动模式：把题目文字粘贴到下方，再点「用上方文字重新识别」。");
      };
      card.querySelector("#pdfReparse").onclick = () => {
        try {
          buildDraft([rawTa.value || ""], null, {});
          setStatus(`识别到 <b>${draft.sections.length}</b> 个章节 / <b>${countQuestions(draft)}</b> 道题，请核对后保存。`);
        } catch (e) { setStatus(`<span style="color:var(--red)">识别失败：${esc(e.message)}</span>`); }
      };

      /* ===== 组装识别结果 ===== */
      function buildDraft(pages, outline, answerMap) {
        // pages：按页切分的文本数组（有目录书签时按其分组，否则按内容标题分组）
        let secs = buildSections(pages && pages.length ? pages : [""], outline);
        secs = absorbAnswerSections(secs);
        if (answerMap && Object.keys(answerMap).length) {
          secs.forEach(s => (s.questions || []).forEach(q => {
            const a = answerMap[q.num != null ? q.num : -1];
            if (a) { if (a.a >= 0) q.a = a.a; if (a.e && !q.e) q.e = a.e; }
          }));
        }
        secs = secs.filter(s => (s.theory && s.theory.trim()) || (s.questions && s.questions.length));
        if (!secs.length) secs = [{ name: "全部题目", theory: "", questions: [] }];
        draft = {
          subject: card.querySelector("#pdfSubj").value || "常识",
          name: "",
          sections: secs
        };
        renderDraft();
      }
      function countQuestions(d) {
        return d ? (d.sections || []).reduce((a, s) => a + ((s.questions || []).length), 0) : 0;
      }
      function allQuestions(d) {
        const out = [];
        (d && d.sections || []).forEach(s => (s.questions || []).forEach(q => out.push(q)));
        return out;
      }

      /* ===== 识别结果（命名 + 分章节预览） ===== */
      function renderDraft() {
        const host = card.querySelector("#draftHost");
        if (!host) return;
        host.innerHTML = "";
        if (!draft) return;
        try {
          const tq = countQuestions(draft);
          const defName = suggestName(draft.subject);
          const head = UI.el(`<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px">
            <b>识别结果：${draft.sections.length} 个章节 / ${tq} 道题</b>
            <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center">
              <label class="muted small">题册名称</label>
              <input id="dName" style="flex:1;min-width:160px" placeholder="${esc(defName)}" value="${esc(draft.name || "")}"/>
            </div>
            <div class="muted small" style="margin-top:6px">留空则自动命名为「${esc(defName)}」（${esc(subjectLabel(draft.subject))} 的第几套）。</div>
            <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center">
              <button class="btn primary" id="dSave">💾 保存为我的题册</button>
              <button class="btn ghost" id="dCancel">取消</button>
              <label class="muted small" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="dToCustom" checked/> 同时存入「自定义题库」</label>
            </div>
          </div>`);
          host.appendChild(head);
          head.querySelector("#dName").oninput = e => { draft.name = e.target.value.trim(); };
          head.querySelector("#dSave").onclick = () => {
            try {
              const name = (head.querySelector("#dName").value || "").trim() || suggestName(draft.subject);
              const book = window.KGPdfBooks.add({
                subject: draft.subject, name: name, named: !!(head.querySelector("#dName").value || "").trim(),
                sections: draft.sections.map(s => ({
                  name: s.name, theory: s.theory || "",
                  questions: (s.questions || []).map(q => ({ q: q.q, options: (q.options || []).slice(), a: q.a | 0, e: q.e || "" }))
                }))
              });
              let n = 0;
              if (head.querySelector("#dToCustom").checked) n = saveToCustom(draft.subject, allQuestions(draft));
              UI.toast(`已保存题册「${name}」${n ? "，并存入自定义题库 " + n + " 题" : ""}`);
              draft = null; host.innerHTML = "";
              renderBooks(); renderCustom();
            } catch (e) { UI.toast("保存失败：" + e.message); }
          };
          head.querySelector("#dCancel").onclick = () => { draft = null; host.innerHTML = ""; setStatus("已取消。"); };

          (draft.sections || []).forEach((s, si) => {
            try {
              const det = UI.section(`§ ${s.name || ("第" + (si + 1) + "节")} · ${(s.questions || []).length} 题${(s.theory && s.theory.trim()) ? " · 有理论" : ""}`);
              host.appendChild(det);
              renderSectionBody(det.querySelector(".kg-det-b"), draft, si, true);
            } catch (e) {
              const b = UI.el(`<div class="muted small">章节渲染失败：${esc(e.message)}</div>`);
              host.appendChild(b);
            }
          });
        } catch (e) {
          host.innerHTML = `<div class="card empty">识别结果渲染失败：${esc(e.message)}</div>`;
        }
      }

      /* ===== 章节内容：理论 + 分页题目 ===== */
      function renderSectionBody(box, book, si, isDraft) {
        try {
          box.innerHTML = "";
          const s = book.sections[si];
          const key = ((book.id || "draft") + "#" + si);
          const st = pageState[key] || (pageState[key] = { page: 0, size: DEFAULT_PAGE_SIZE });
          const qs = s.questions || [];
          const learnedKey = (book.id || "draft") + "::" + si;
          const learned = !!(window.LearnedHistory && window.LearnedHistory.isLearned(LEARN_KEY, learnedKey));

          // ① 理论：整段展示（分段 / 保留缩进）
          if (s.theory && s.theory.trim()) {
            box.appendChild(UI.el(`<div class="allu-sec" style="margin-top:6px">${theoryToHtml(s.theory)}</div>`));
          }

          // ② 操作条
          const bar = UI.el(`<div class="row" style="gap:8px;flex-wrap:wrap;margin:8px 0">
            ${(s.theory && s.theory.trim())
              ? `<button class="btn xs" data-a="study">📖 学考点</button>${learned ? `<span class="tag ok">已学</span>` : ""}`
              : `<span class="muted small">（本章无理论，直接刷题）</span>`}
            ${qs.length ? `<button class="btn xs primary" data-a="doPage">🎯 练习本页</button>
              <button class="btn xs" data-a="doAll">🎯 练习本章全部(${qs.length})</button>` : ""}
          </div>`);
          box.appendChild(bar);
          const studyBtn = bar.querySelector('[data-a="study"]');
          if (studyBtn) studyBtn.onclick = () => openStudy(book, si, isDraft);
          if (!qs.length) return;

          // ③ 分页（每页 5~20 题，默认 10）
          const sizeOpts = PAGE_SIZES.map(n => `<option value="${n}" ${n === st.size ? "selected" : ""}>${n}</option>`).join("");
          const totalPages = Math.max(1, Math.ceil(qs.length / (st.size || DEFAULT_PAGE_SIZE)));
          if (st.page >= totalPages) st.page = totalPages - 1;
          if (st.page < 0) st.page = 0;
          const slice = qs.slice(st.page * st.size, st.page * st.size + st.size);
          const pager = UI.el(`<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
            <span class="muted small">每页</span>
            <select data-a="size" style="width:auto">${sizeOpts}</select>
            <span class="muted small">题</span>
            <button class="btn xs" data-a="prev" ${st.page <= 0 ? "disabled" : ""}>‹ 上页</button>
            <span class="muted small">第 ${st.page + 1} / ${totalPages} 页（共 ${qs.length} 题）</span>
            <button class="btn xs" data-a="next" ${st.page >= totalPages - 1 ? "disabled" : ""}>下页 ›</button>
          </div>`);
          box.appendChild(pager);
          const sizeSel = pager.querySelector('[data-a="size"]');
          sizeSel.onchange = () => {
            st.size = Math.min(20, Math.max(5, +sizeSel.value || DEFAULT_PAGE_SIZE)); st.page = 0;
            renderSectionBody(box, book, si, isDraft);
          };
          pager.querySelector('[data-a="prev"]').onclick = () => { st.page = Math.max(0, st.page - 1); renderSectionBody(box, book, si, isDraft); };
          pager.querySelector('[data-a="next"]').onclick = () => { st.page = st.page + 1; renderSectionBody(box, book, si, isDraft); };

          // ④ 本页题目
          const listHtml = slice.map((q, i) => {
            const n = st.page * st.size + i + 1;
            const opts = (q.options || []).map((o, oi) => `<div class="muted small" style="margin-left:14px">${A(oi)}. ${esc(o)}</div>`).join("");
            return `<div class="pdf-q" style="margin-bottom:8px">
              <div><b>${n}.</b> ${esc(q.q)}</div>
              ${opts}
              <div class="muted small" style="margin-top:4px">答案：<b style="color:var(--green)">${A(q.a | 0)}</b>${q.e ? " · " + esc(String(q.e).slice(0, 60)) : ""}</div>
            </div>`;
          }).join("");
          box.appendChild(UI.el(`<div style="margin-top:8px">${listHtml}</div>`));

          const p1 = bar.querySelector('[data-a="doPage"]');
          if (p1) p1.onclick = () => startQuiz(book, si, slice, (book.name || "题册") + " · " + (s.name || "") + " 第" + (st.page + 1) + "页");
          const p2 = bar.querySelector('[data-a="doAll"]');
          if (p2) p2.onclick = () => startQuiz(book, si, qs, (book.name || "题册") + " · " + (s.name || "") + " 全章");
        } catch (e) {
          box.innerHTML = `<div class="muted small">章节渲染失败：${esc(e.message)}</div>`;
        }
      }

      /* ===== 学考点 ===== */
      function openStudy(book, si, isDraft) {
        try {
          const s = book.sections[si];
          const key = (book.id || "draft") + "::" + si;
          const box = UI.el(`<div class="allu-sec" style="max-height:62vh;overflow:auto">${theoryToHtml(s.theory || "")}</div>`);
          const m = UI.modal({
            title: "📖 " + (s.name || "考点"), body: box, width: "760px",
            actions: [
              {
                label: "✓ 标记为已学", cls: "primary", keepOpen: true, onClick: () => {
                  try { if (window.LearnedHistory) window.LearnedHistory.record(LEARN_KEY, [key]); } catch (e) {}
                  UI.toast("✓ 已记入今日学习");
                  m.close();
                  if (!isDraft) renderBooks(); else renderDraft();
                }
              },
              { label: "关闭", cls: "ghost", onClick: (mm, c) => c() }
            ]
          });
        } catch (e) { UI.toast("打开考点失败：" + e.message); }
      }

      /* ===== 刷题（弹窗内走通用答题引擎） ===== */
      function startQuiz(book, si, list, label) {
        try {
          if (!window.Quiz) { UI.toast("答题引擎未就绪"); return; }
          const src = (list || []).filter(q => q && q.q && q.options && q.options.length >= 2);
          if (!src.length) { UI.toast("没有可练习的题目"); return; }
          const qs = src.map(q => ({ q: q.q, options: (q.options || []).slice(), a: q.a | 0, e: q.e || "", tag: (book && book.name) || "PDF导入" }));
          const host = UI.el(`<div style="max-height:64vh;overflow:auto;padding-top:8px"></div>`);
          UI.modal({
            title: "🎯 " + label, body: host, width: "760px",
            actions: [{ label: "关闭", cls: "ghost", onClick: (mm, c) => c() }]
          });
          window.Quiz.start(host, qs, (book && book.subject) || "常识", {
            onDone(r) {
              try {
                recordPractice(book, si, r, label);
                UI.toast(`完成：${r.correct}/${r.total} · 正确率 ${r.pct}%（每题用时已记录）`);
                if (book && book.id) renderBooks();
              } catch (e) {}
            }
          });
        } catch (e) { UI.toast("启动练习失败：" + e.message); }
      }

      /* ===== 我的题册列表 ===== */
      function renderBooks() {
        const host = bookCard.querySelector("#bookHost");
        if (!host) return;
        try {
          host.innerHTML = "";
          const books = window.KGPdfBooks.all();
          if (!books.length) { host.innerHTML = `<div class="empty">还没有题册，导入一份 PDF 试试。</div>`; return; }
          books.forEach(bk => {
            const tq = (bk.sections || []).reduce((a, s) => a + ((s.questions || []).length), 0);
            const det = UI.section(`📚 ${bk.name} · ${subjectLabel(bk.subject)} · ${(bk.sections || []).length} 章 / ${tq} 题`);
            host.appendChild(det);
            const box = det.querySelector(".kg-det-b");
            const bar = UI.el(`<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">
              <button class="btn xs" data-a="rename">✏️ 重命名</button>
              <button class="btn xs" data-a="tocustom">📦 存入自定义题库</button>
              <button class="btn xs ghost" data-a="del">🗑 删除题册</button>
              <span class="muted small">${esc(bk.date || "")}</span>
            </div>`);
            box.appendChild(bar);
            bar.querySelector('[data-a="rename"]').onclick = () => openRename(bk);
            bar.querySelector('[data-a="tocustom"]').onclick = async () => {
              const n = saveToCustom(bk.subject, (bk.sections || []).reduce((a, s) => a.concat(s.questions || []), []));
              UI.toast(n ? `已存入「${subjectLabel(bk.subject)}」自定义题库 ${n} 题` : "没有可存入的题目");
              renderCustom();
            };
            bar.querySelector('[data-a="del"]').onclick = async () => {
              if (await UI.confirm(`确定删除题册「${bk.name}」？`)) {
                window.KGPdfBooks.remove(bk.id);
                UI.toast("已删除题册");
                renderBooks();
              }
            };
            (bk.sections || []).forEach((s, si) => {
              try {
                const sub = UI.section(`§ ${s.name || ("第" + (si + 1) + "节")} · ${(s.questions || []).length} 题${(s.theory && s.theory.trim()) ? " · 有理论" : ""}`);
                box.appendChild(sub);
                renderSectionBody(sub.querySelector(".kg-det-b"), bk, si, false);
              } catch (e) {
                box.appendChild(UI.el(`<div class="muted small">章节渲染失败：${esc(e.message)}</div>`));
              }
            });
          });
        } catch (e) {
          host.innerHTML = `<div class="empty">题册列表加载失败：${esc(e.message)}</div>`;
        }
      }

      function openRename(bk) {
        try {
          const box = UI.el(`<div>
            <label class="fld">题册名称</label>
            <input id="rnName" class="full" value="${esc(bk.name || "")}" placeholder="${esc(suggestName(bk.subject))}"/>
            <div class="muted small" style="margin-top:6px">留空则自动命名为「${esc(suggestName(bk.subject))}」。</div>
          </div>`);
          UI.modal({
            title: "✏️ 题册重命名", body: box, width: "460px",
            actions: [
              { label: "取消", cls: "ghost", onClick: (m, c) => c() },
              {
                label: "保存", cls: "primary", onClick: (m, c) => {
                  const v = (box.querySelector("#rnName").value || "").trim();
                  const raw = rawBooks().find(x => x.id === bk.id);
                  if (raw) {
                    raw.name = v || suggestName(bk.subject);
                    raw.named = !!v;
                    db().save();
                  }
                  c(); UI.toast("已重命名为：" + (raw ? raw.name : "")); renderBooks();
                }
              }
            ]
          });
        } catch (e) { UI.toast("重命名失败：" + e.message); }
      }

      /* ===== 自定义题库（旧能力保留） ===== */
      function renderCustom() {
        const list = customCard.querySelector("#customList");
        if (!list) return;
        try {
          const store = getCustomQuestions();
          const keys = Object.keys(store).filter(k => store[k] && store[k].length);
          if (!keys.length) { list.innerHTML = `<div class="empty">暂无自定义题目，先上传 PDF 导入。</div>`; return; }
          let html = "";
          keys.forEach(k => {
            html += `<div class="card" style="margin-top:10px">
              <div class="row spread"><b>${esc(subjectLabel(k))} · 自定义题库</b><span class="muted small">${store[k].length} 题</span></div>
              <div class="row" style="margin-top:8px;gap:8px">
                <button class="btn primary pdf-practice" data-sub="${esc(k)}">开始练习</button>
                <button class="btn ghost pdf-clear" data-sub="${esc(k)}">清空本科目</button>
              </div>
            </div>`;
          });
          list.innerHTML = html;
          list.querySelectorAll(".pdf-practice").forEach(b => b.onclick = () => startCustom(b.dataset.sub));
          list.querySelectorAll(".pdf-clear").forEach(b => b.onclick = async () => {
            if (await UI.confirm(`确定清空「${subjectLabel(b.dataset.sub)}」自定义题库？`)) {
              delete store[b.dataset.sub]; DB.save(); renderCustom();
            }
          });
        } catch (e) {
          list.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
        }
      }
      function startCustom(subject) {
        try {
          const items = (getCustomQuestions()[subject] || []).slice();
          if (!items.length) { UI.toast("本科目暂无题目"); return; }
          const qs = items.map(it => ({ q: it.q, options: (it.options || []).slice(), a: it.a | 0, e: it.e || "", tag: "PDF导入" }));
          const host = UI.el(`<div style="max-height:64vh;overflow:auto;padding-top:8px"></div>`);
          UI.modal({
            title: "🎯 " + subjectLabel(subject) + " · 自定义题库", body: host, width: "760px",
            actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }]
          });
          window.Quiz.start(host, qs, subject, {
            onDone: r => UI.toast(`完成：${r.correct}/${r.total} · 正确率 ${r.pct}%`)
          });
        } catch (e) { UI.toast("启动练习失败：" + e.message); }
      }

      try { renderBooks(); } catch (e) {}
      try { renderCustom(); } catch (e) {}
    }
  };
})();
