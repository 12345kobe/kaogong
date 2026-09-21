/* 模块：题库导入（PDF / Word / 纯文本）→ 分章节刷题 + 考点「学考点」
   - 取文字：PDF 用 pdf.js（按 Y 重建行 + 按 X 还原段落缩进）；Word 用 mammoth（退路 JSZip 剥
     word/document.xml）；txt/md 直接读（UTF-8，乱码自动退到 GBK）；老 .doc 提示另存为。
   - 清洗：统一走 sanitizeText() 去掉水印 / 二维码 / 机构宣传 / 页眉页脚 / 私有区乱码 /
     控制字符 / 重复行，并修复被错误断开的中文行。
   - 组织：按「目录书签 / 章节标题」切章 → 章内再按「考点小标题」切成 考点 → 讲解 → 该考点的题，
     保证知识点与题目一一对应；每题对象带 kp（所属考点）。
   - 答案：同一份文档里就能识别（1.A / 【答案】A / 参考答案：A / （A）/ 【解析】… / 文末答案速查），
     不再要求分别传题目文件和答案文件；答案文件仍可作为补充。
   - 存储：DB.state.pdfBooks = [{id, subject, name, named, date, createdAt, sections:[...]}]，
     经 window.KGPdfBooks 暴露给各模块「自行刷题」；模块自身也能直接练。
   - 题目形状（Quiz 引擎要求）：{ q, options:[..], a, e, kp }；options 长度 ≥2 且 a 为合法下标，
     无法识别答案时 a = -1 并置 needCheck（前端提示「需人工校对」）。
   仅支持文字型 PDF；扫描件（图片型）需先 OCR。 */
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};

  const SUBJECTS = window.KG_SUBJECTS || ["言语理解", "资料分析", "数量关系", "判断推理", "常识判断", "政治理论", "申论"];
  const SUBJECT_SHORT = window.KG_SUBJECT_SHORT || {};
  const PDF_CDNS = [
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
    "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
  ];
  const PDF_WORKERS = {
    "cdn.jsdelivr.net": "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
    "unpkg.com": "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
    "cdnjs.cloudflare.com": "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
  };
  const MAMMOTH_CDNS = [
    "https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js",
    "https://unpkg.com/mammoth@1.6.0/mammoth.browser.min.js"
  ];
  const JSZIP_CDNS = [
    "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
    "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"
  ];

  const PAGE_SIZES = [5, 10, 15, 20];
  const DEFAULT_PAGE_SIZE = 10;
  const LEARN_KEY = "pdfBook";
  const IND = "\u0001";                       // 内部标记：原文该行有缩进（= 新段落）
  const IND_RE = /\u0001/g;

  const TYPE_WORDS = [
    "言语理解", "判断推理", "数量关系", "资料分析", "常识判断", "政治理论",
    "判断推理", "图形推理", "类比推理", "定义判断", "逻辑填空", "片段阅读",
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
  function clampLen(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n) : s; }

  /* ================= 一、清洗：sanitizeText（所有入库文本的唯一入口） ================= */

  const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;   // 控制字符
  const ZERO_RE = /[\uFEFF\u200B-\u200F\u202A-\u202E\u2060-\u2064\u00AD]/g;  // 零宽 / BOM
  const PUA_RE = /[\uE000-\uF8FF\uFFFD\uFFFC\u3013\u25A1\u2610\u2B1B\u2B1C]/g; // 私有区 + 乱码方框

  // 行内杂质（就地删除，不整行丢）
  const SCRUB_RES = [
    /@image\/[^\s，。；）)]*/gi,
    /@?image[（(]?\d+[）)]?/gi,
    /!\[[^\]]{0,40}\]\([^)]{0,300}\)/g,
    /<img\b[^>]*>/gi,
    /https?:\/\/[^\s，。）)"'」』]*/gi,
    /【(?:图片|插图|图\d*)】|\[图片\]|（图片）|\(图片\)/g,
    /\uFFFC/g
  ];

  // 整行丢弃：二维码 / 机构宣传 / 页眉页脚 / 页码 / 目录点线
  const DROP_RES = [
    /^[@＠]?image\//i,
    /(扫码|扫一扫|长按识别|长按关注|识别二维码|二维码|群里|进群)/,
    /(关注公众号|关注「[^」]{0,20}」|微信公众号|公众号[:：]|微信[:：]|微信号|加微信|加V[:：]|QQ群|QQ[:：]|备考群|交流群|学习群)/,
    /(小红书|微博@|抖音号|抖音搜索|B站[:：]|bilibili|哔哩哔哩)/i,
    /(遇见不一样的自己|课后答疑|答疑渠道|答疑微信|答疑QQ|内部资料|禁止外传|盗版必究|侵权必究|翻印必究|严禁转载|请勿外传|仅供内部|内部交流|侵权必删|联系删除|免费领取|领取资料|资料获取|一手资料|全网最低)/,
    /(参考答案见|答案见|解析见|详解见|见第\s*\d+\s*页|见\s*P\s*\d+)/,
    /^第\s*[〇零一二三四五六七八九十百千\d]{1,6}\s*[页頁]/,
    /^共\s*[〇零一二三四五六七八九十百千\d]{1,6}\s*[页頁]/,
    /^[-—–_·・•．.\s]{0,4}\d{1,4}[-—–_·・•．.\s]{0,4}$/,
    /^\d{1,4}\s*[\/／|｜]\s*\d{1,4}$/,
    /^[\.。·・•．]{3,}\s*\d{0,4}$/,
    /^(目录|目\s*录|contents)$/i,
    /^(本试卷|本套题|本册|本页).{0,12}第\s*\d+\s*页/
  ];

  /* 行尾是否句意结束（用于判断是否该与上/下一行合并） */
  const SENT_END = "。！？!?…";
  const CLOSERS = "'\"”’』」）)]】]";
  function hardEnd(st) {
    const t = String(st || "").replace(/["'”’』」）)\]】]+$/, "");
    return t.length > 0 && SENT_END.indexOf(t[t.length - 1]) >= 0;
  }
  /* 行首是「新条目」标志 → 不能并入上一行 */
  const MARK_START = /^(?:【|\[|（|\(|[①②③④⑤⑥⑦⑧⑨⑩◆●■▶·]|[一二三四五六七八九十]{1,3}\s*[、\.．]|第\s*[〇零一二三四五六七八九十百\d]{1,5}\s*[章节讲篇编部]|\d{1,4}\s*[\.．、,，)）]|[A-Ea-e]\s*[\.．、,，)）]|考点\s*[〇零一二三四五六七八九十\d]{1,3}|解析|答案)/;

  function smartJoin(a, b) {
    if (!a) return b || "";
    if (!b) return a;
    const l = a.slice(-1), f = b.slice(0, 1);
    return (/[A-Za-z0-9]/.test(l) && /[A-Za-z0-9]/.test(f)) ? a + " " + b : a + b;
  }
  /* 两行能否合并（修复 PDF / 排版造成的错误断行） */
  function canMerge(a, b) {
    if (!a || !b) return false;
    if (b.indexOf(IND) === 0) return false;          // 原排版新段落
    if (hardEnd(a) || /[；;：:，,]$/.test(a)) return false;
    if (MARK_START.test(b)) return false;
    if (isKpHeading(b) || isSubHeading(b)) return false;
    const la = a.slice(-1), fb = b.slice(0, 1);
    const ca = /[\u4e00-\u9fa5]/.test(la), cb = /[\u4e00-\u9fa5]/.test(fb);
    const na = /[A-Za-z0-9]/.test(la), nb = /[A-Za-z0-9]/.test(fb);
    return (ca || na) && (cb || nb);
  }
  function mergeBrokenLines(lines) {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const cur = lines[i];
      if (!cur) { if (out.length && out[out.length - 1] !== "") out.push(""); continue; }
      const prev = out.length ? out[out.length - 1] : "";
      if (prev && canMerge(prev, cur)) out[out.length - 1] = smartJoin(prev, cur);
      else out.push(cur);
    }
    return out;
  }

  /* 核心清洗：文本 → 干净的行数组（"" 表示段落分隔；行首 \u0001 表示原缩进新段落） */
  function sanitizeLines(raw) {
    let t = String(raw == null ? "" : raw);
    try {
      t = t.replace(/\r\n?/g, "\n");
      t = t.replace(CTRL_RE, "").replace(ZERO_RE, "").replace(PUA_RE, "");
      for (let i = 0; i < SCRUB_RES.length; i++) t = t.replace(SCRUB_RES[i], "");
      t = t.replace(/\t/g, " ").replace(/ {2,}/g, " ");
    } catch (e) { t = String(raw == null ? "" : raw); }

    let lines = t.split("\n").map(function (ln) {
      let s = ln.replace(/\s+$/, "");
      const ind = /^[ \u3000]+/.test(s);
      s = s.replace(/^[ \u3000]+/, "");
      s = s.replace(/[\u3000]+/g, " ").replace(/[ ]{2,}/g, " ").trim();
      if (!/[\u4e00-\u9fa5A-Za-z0-9]/.test(s)) return "";   // 纯符号行
      for (let i = 0; i < DROP_RES.length; i++) if (DROP_RES[i].test(s)) return "";
      return ind ? (IND + s) : s;
    });

    // 连续重复行只留一条
    const dedup = [];
    let prev = null;
    lines.forEach(function (s) {
      if (s && prev && s === prev) return;
      dedup.push(s); prev = s;
    });
    lines = dedup;

    // 全文高频短行（页眉 / 页脚 / 水印）：出现 ≥5 次且不像题目 → 丢弃
    try {
      const cnt = Object.create(null);
      lines.forEach(function (s) { if (s) cnt[s] = (cnt[s] || 0) + 1; });
      lines = lines.map(function (s) {
        if (!s) return s;
        const plain = s.replace(IND_RE, "");
        if (plain.length <= 24 && cnt[s] >= 5 && !/^[\dA-Ea-e]/.test(plain) && !/[。？！]/.test(plain)) return "";
        return s;
      });
    } catch (e) {}

    return mergeBrokenLines(lines);
  }

  /* 对外：清洗后的纯文本（无内部标记） */
  function sanitizeText(raw) {
    try { return sanitizeLines(raw).map(l => l.replace(IND_RE, "")).join("\n"); }
    catch (e) { return String(raw == null ? "" : raw); }
  }

  /* 清洗后用于「解析」的行：去标记、去空行 */
  function plainLines(raw) {
    return sanitizeLines(raw).map(l => l.replace(IND_RE, "")).filter(Boolean);
  }

  /* ================= 二、文件 → 文本 ================= */

  function loadScript(url, ms) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      const timer = setTimeout(() => reject(new Error("加载超时")), ms || 15000);
      s.src = url;
      s.onload = () => { clearTimeout(timer); resolve(); };
      s.onerror = () => { clearTimeout(timer); reject(new Error("加载失败")); };
      document.head.appendChild(s);
    });
  }
  async function loadFirst(cdns, check, name) {
    if (check()) return true;
    let last = null;
    for (const u of cdns) {
      try { await loadScript(u); if (check()) return true; } catch (e) { last = e; }
    }
    throw new Error("加载 " + name + " 失败（已尝试多个 CDN），请检查网络后重试");
  }

  async function loadPdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    let lastErr = null;
    for (const url of PDF_CDNS) {
      try {
        await loadScript(url);
        if (!window.pdfjsLib) throw new Error("未挂载 pdfjsLib");
        const host = url.split("/")[2];
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKERS[host] || PDF_CDNS[0].replace("pdf.min.js", "pdf.worker.min.js");
        return window.pdfjsLib;
      } catch (e) { lastErr = e; }
    }
    throw new Error("加载 pdf.js 失败（已尝试 jsdelivr / unpkg / cdnjs），请检查网络后重试");
  }

  /* PDF 书签目录 → [{title, page(0基), depth}] */
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

  /* 按 Y 坐标把零散 text item 还原成「行」；按 X 坐标还原段落缩进（行首缩进 = 新段落）
     —— 这是能正确识别题目 / 还原段落的关键（旧版「整页挤成一行」的修复点），不要丢 */
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
        if (!str) { if (it.hasEOL && last) last.eol = true; continue; }
        const sameLine = last && !last.eol && last.y !== null && y !== null && Math.abs(y - last.y) <= 3;
        if (sameLine) { last.s += str; last.x = Math.min(last.x, x); }
        else rows.push({ y: y, x: x, s: str, eol: false });
        if (it.hasEOL && rows.length) rows[rows.length - 1].eol = true;
      }
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
  async function extractText(file) {
    const r = await extractPages(file);
    return (r.pages || []).join("\n");
  }

  /* 读纯文本：先 UTF-8，乱码率过高再退 GBK（常见于 Windows 导出的 txt） */
  async function readTextFile(file) {
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    let s = "";
    try { s = new TextDecoder("utf-8").decode(u8); } catch (e) { s = ""; }
    const bad = (s.match(/\uFFFD/g) || []).length;
    if ((!s && u8.length) || (s.length && bad / s.length > 0.01)) {
      try { const g = new TextDecoder("gbk").decode(u8); if (g) s = g; } catch (e) {}
    }
    if (!s) s = new TextDecoder("utf-8", { fatal: false }).decode(u8);
    return s;
  }

  /* docx：mammoth 抽纯文字；失败退到 JSZip 直接剥 word/document.xml */
  async function readDocx(file) {
    try {
      await loadFirst(MAMMOTH_CDNS, () => !!window.mammoth, "mammoth");
      const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      if (r && r.value && r.value.trim()) return r.value;
    } catch (e) {}
    try {
      await loadFirst(JSZIP_CDNS, () => !!window.JSZip, "JSZip");
      const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
      const f = zip.file("word/document.xml");
      if (!f) throw new Error("不是有效的 .docx");
      let xml = await f.async("string");
      xml = xml.replace(/<\/w:p>/g, "\n").replace(/<w:br\s*\/>/g, "\n").replace(/<w:tab\s*\/>/g, "  ")
        .replace(/<[^>]+>/g, "");
      return xml.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    } catch (e) {
      throw new Error("Word 解析失败：" + e.message + "（可另存为 .txt 再导入）");
    }
  }

  /* 统一入口：文件 → { pages:[每页文本], outline } */
  async function fileToPages(file) {
    const name = String((file && file.name) || "").toLowerCase();
    if (/\.docx$/.test(name)) {
      const t = await readDocx(file);
      return { pages: [t], outline: null };
    }
    if (/\.doc$/.test(name)) {
      throw new Error("老版 .doc 是二进制格式，无法直接解析，请在 Word 里「另存为 .docx 或 .txt」后再导入。");
    }
    if (/\.(txt|md|markdown|csv|text)$/.test(name)) {
      const t = await readTextFile(file);
      return { pages: [t], outline: null };
    }
    if (/\.pdf$/.test(name) || (file && file.type === "application/pdf")) return extractPages(file);
    // 兜底：按内容猜
    if (file && /text|word|officedocument/.test(file.type || "")) {
      const t = /officedocument/.test(file.type || "") ? await readDocx(file) : await readTextFile(file);
      return { pages: [t], outline: null };
    }
    return extractPages(file);
  }

  /* ================= 三、标题 / 考点识别 ================= */

  const STRONG_HEAD = /^(?:第\s*[〇零一二三四五六七八九十百\d]{1,4}\s*[章讲篇编部节]|专题\s*[〇零一二三四五六七八九十\d]{1,3}|题型\s*[〇零一二三四五六七八九十\d]{1,3})/;
  const HEAD_PATTERNS = [
    /^第\s*[〇零一二三四五六七八九十百\d]{1,4}\s*[章讲篇编部]\s*[\.、:：]?\s*\S*/,
    /^第\s*[〇零一二三四五六七八九十百\d]{1,4}\s*[节]\s*[\.、:：]?\s*\S*/,
    /^专题\s*[〇零一二三四五六七八九十\d]{1,3}\s*[\.、:：]?\s*\S*/,
    /^题型\s*[〇零一二三四五六七八九十\d]{1,3}\s*[\.、:：]?\s*\S*/,
    /^[一二三四五六七八九十]{1,3}\s*[、]\s*\S+/,
    /^[（(]\s*[〇零一二三四五六七八九十\d]{1,3}\s*[)）]\s*\S*/,
    /^\d{1,2}\s*[、]\s*[^\d\s]\S*/,
    /^【[^】]{2,24}】/
  ];
  /* 答案/解析行：绝不能当标题或考点（否则章节名会变成 "B" 这种字母） */
  function isAnswerLine(s) {
    s = String(s || "").trim();
    if (!s) return false;
    // 【答案】B / 【解析】… ——「答案」在【】里面，必须先拆括号判断
    var bm = s.match(/^[【\[]\s*([^】\]]{0,10})\s*[】\]]\s*(.*)$/);
    if (bm) {
      if (/答案|解析/.test(bm[1])) return true;                     // 【答案】B
      if (/^[A-Ea-e]{1,6}(?:[\s,，、]+[A-Ea-e]){0,5}$/.test(String(bm[2] || "").trim())) return true;
    }
    if (/^(?:参考答案|答案|正确答案|标准答案|解析|答案解析|试题解析)\s*[:：]?/.test(s)) return true;
    if (/^[A-Ea-e]{1,6}(?:[\s,，、]+[A-Ea-e]){0,5}$/.test(s)) return true;   // 纯 "B" / "A C"
    if (/^\d{1,4}\s*[\.．、)）]?\s*[A-Ea-e]\s*$/.test(s)) return true;       // "1.B"
    return false;
  }

  function isHeading(ln, ctx) {
    const s = String(ln || "").trim();
    if (!s || s.length > 34) return false;
    if (isAnswerLine(s)) return false;
    if (/[。；;，,！？!?]/.test(s)) return false;
    if (/^(?:考点|知识点|核心考点|考查重点|考情)/.test(s)) return true;   // 「考点一：…」也算章/节标题
    if (/^[\d\s\.\-—·]+$/.test(s)) return false;
    if (STRONG_HEAD.test(s)) return true;
    for (let i = 0; i < HEAD_PATTERNS.length; i++) if (HEAD_PATTERNS[i].test(s)) return true;
    if (s.length <= 16 && TYPE_WORDS.some(w => s === w || s.indexOf(w) === 0)) return true;
    if (ctx && ctx.atPageStart && s.length <= 16 && ctx.prevEnd) return true;
    return false;
  }
  function isSubHeading(ln) {
    const s = String(ln || "").trim();
    if (!s || s.length > 26) return false;
    if (isAnswerLine(s)) return false;
    if (/[。！？；，]/.test(s)) return false;
    if (/^(?:[（(]\s*[〇零一二三四五六七八九十\d]{1,3}\s*[)）]|[一二三四五六七八九十]{1,3}\s*[、\.]|\d{1,2}\s*[、\.]\s*[^\d]|[①②③④⑤⑥⑦⑧⑨⑩]|[【\[][^】\]]{2,20}[】\]]\s*$|第\s*[〇零一二三四五六七八九十\d]{1,3}\s*[节章])/.test(s)) return true;
    if (s.length <= 16 && TYPE_WORDS.some(w => s === w || s.indexOf(w) === 0)) return true;
    return false;
  }
  /* 考点小标题：能抓「考点一 逻辑填空」「（二）片段阅读」「【常识判断】」
     inQ = 当前已在某道题的题干/选项区 —— 此时只认明确的考点标题，
     否则「④提出全面推进依法治国」这类排序题选项会被误当成小标题 */
  function isKpHeading(ln, inQ) {
    const s = String(ln || "").trim();
    if (!s || s.length > 30) return false;
    if (isAnswerLine(s)) return false;
    if (/[。！？；，]/.test(s)) return false;
    if (/^(?:考点|知识点|核心考点|考查重点|考情)\s*[〇零一二三四五六七八九十\d]{0,3}[\.、:：]?/.test(s)) return true;
    if (/^第\s*[〇零一二三四五六七八九十\d]{1,3}\s*[节讲]/.test(s)) return true;
    if (/^[（(]\s*[〇零一二三四五六七八九十\d]{1,3}\s*[)）]/.test(s)) return true;
    if (/^【[^】]{2,20}】/.test(s)) return true;
    if (inQ) return false;                                   // 题目区只认上面那几种
    if (/^[一二三四五六七八九十]{1,3}\s*[、\.]\s*\S/.test(s)) return true;
    if (/^[【\[][^】\]]{2,20}[】\]]/.test(s)) return true;
    if (s.length <= 18 && !/^[\d\s]+$/.test(s) && TYPE_WORDS.some(w => s.indexOf(w) >= 0)) return true;
    return false;
  }
  function cleanTitle(s) {
    let t = String(s || "").trim()
      .replace(/[\.\s·]{3,}\s*\d*$/, "")
      .replace(/\s+\d{1,4}$/, "")
      .trim();
    const m = t.match(/^[（(【\[]\s*.{1,24}?\s*[）)】\]]\s*(\S.*)$/);
    if (m) t = m[1].trim();
    else t = t.replace(/^[【\[（(]+/, "").replace(/[】\]）)]+$/, "").trim();
    return t.slice(0, 30);
  }

  /* ================= 四、理论 → 干净排版的 HTML ================= */

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
  const PARA_START = /^(?:[（(【\[]\s*(?:[一二三四五六七八九十]{1,3}|\d{1,2})\s*[、\.．)）]|[①②③④⑤⑥⑦⑧⑨⑩◆●■▶·]|(?:首先|其次|再次|然后|最后|另外|此外|同时|注意|例如|比如|综上|相反|换言之|具体来说|具体来看|小贴士|提示|总结|解析|答案))/;
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
  /* 理论文本 → <p class="al-p"> 段落 + <div class="al-sub"> 小标题 */
  function theoryToHtml(raw) {
    try {
      const lines = Array.isArray(raw) ? raw : sanitizeLines(raw);
      const blocks = [];
      let buf = "";
      const flush = () => { if (buf.trim()) blocks.push({ t: "p", x: buf.trim() }); buf = ""; };
      lines.forEach(ln0 => {
        const ind = ln0.indexOf(IND) === 0;
        const ln = ln0.replace(IND_RE, "").trim();
        if (!ln) { flush(); return; }
        if (isKpHeading(ln) || isSubHeading(ln)) { flush(); blocks.push({ t: "h", x: ln }); return; }
        if (ind && buf.trim() && hardEnd(buf)) flush();
        buf = buf ? smartJoin(buf, ln) : ln;
      });
      flush();
      const html = blocks.map(b => b.t === "h"
        ? `<div class="al-sub">🔹 ${esc(b.x)}</div>`
        : groupParagraphs(splitSentences(b.x)).map(p => `<p class="al-p">${esc(p)}</p>`).join("")
      ).join("");
      return html || "";
    } catch (e) {
      return `<p class="al-p">${esc(String(raw || "").slice(0, 4000))}</p>`;
    }
  }
  /* 已经是 HTML 就直接用（章节 theory 入库时就存 HTML） */
  function toTheoryHtml(s) {
    const t = String(s || "");
    if (!t.trim()) return "";
    if (/<(p|div)\s+class="al-/.test(t)) return t;
    return theoryToHtml(t);
  }

  /* ================= 五、题目 / 答案解析 ================= */

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
  function cleanStem(s) {
    return String(s || "")
      .replace(/^(单选题|多选题|判断题|单项选择|多项选择|不定项选择|单项选择题|多项选择题|单选题型)\s*/g, "")
      .trim();
  }

  /* 同文档里的答案标记：1.A / 答案：A / 【答案】A / 参考答案：AB / （A）/ 【解析】… */
  const ANS_INLINE_RES = [
    /(?:参考答案|正确答案|答案)\s*[：:是为]?\s*【?\s*([A-Ea-e]{1,6})\s*】?/,
    /【\s*(?:答案|正确答案|参考答案)\s*】\s*[：:]?\s*([A-Ea-e]{1,6})/,
    /【\s*([A-Ea-e]{1,6})\s*】/,
    /[（(]\s*答案\s*[：:]?\s*([A-Ea-e]{1,6})\s*[)）]/,
    /^\s*[（(]\s*([A-Ea-e])\s*[)）]\s*$/
  ];
  function pickAnswer(str) {
    for (let i = 0; i < ANS_INLINE_RES.length; i++) {
      const m = ANS_INLINE_RES[i].exec(str);
      if (m && m[1]) return String(m[1]).toUpperCase();
    }
    return "";
  }

  /* 题目解析：text → 题目数组；kp 为本章/本考点名，会写到每题的 kp 字段 */
  function parseQuestions(text, kp) {
    const qRe = /^\s*(\d{1,4})\s*[\.．、,，)）]\s*(.*)$/;
    const optRe = /^\s*([A-Ea-e])\s*[\.．、,，)）]\s*(.*)$/;
    const expRe = /(?:解析|答案解析|【解析】|【答案】|【详解】)\s*[：:]?\s*(.*)/;
    const out = [];
    let cur = null, inOpts = false;

    function setAns(letters) {
      if (!cur || !letters) return;
      const idx = String(letters).toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < 10) { cur.a = idx; cur.aSet = true; }
      if (String(letters).length > 1) cur.multi = String(letters).toUpperCase();
    }
    function flush() {
      if (cur) {
        cur.q = cleanStem(cur.q.replace(/\s+/g, " ")).replace(/\s+([，。；：、）)])/g, "$1");
        cur.options = cur.options.map(o => String(o || "").replace(/\s+/g, " ").trim()).filter(o => o !== "");
        cur.e = String(cur.e || "").trim();
        cur.kp = cur.kp || kp || "";
        const q = normQuestion(cur);
        if (q) out.push(q);
      }
      cur = null; inOpts = false;
    }

    function looksLikeAnswer(s) {
      s = String(s || "").trim();
      if (!s) return false;
      if (/[【\[]\s*(?:答案|解析)/.test(s)) return true;
      if (/^(?:答案|解析)[：:]/.test(s)) return true;
      if (/^[A-Ea-e]{1,6}(?:[\s,，、]+[A-Ea-e]){0,5}\s*$/.test(s)) return true;
      // 文本答案：短、不含题干标志、不含下划线
      if (s.length <= 24 && !/[____…？]/g.test(s) && !/^下列|^正确|^错误|^符合|^属于|^的是|^关于|^根据|^以下|^哪项|^哪一|^这题|^此题/.test(s) && /[\u4e00-\u9fa5]/.test(s)) return true;
      return false;
    }
    function consumeAsAnswer(rest) {
      if (!cur) return;
      // 字母答案
      const am = /^\s*([A-Ea-e]{1,6}(?:\s*[，,、]\s*[A-Ea-e]){0,5})\s*[】\]）)]?\s*(.*)$/.exec(rest);
      if (am) {
        setAns(am[1]);
        if (am[2]) cur.e = smartJoin(cur.e, String(am[2]).replace(/^(?:解析|答案解析|【解析】|答案)\s*[：:]?\s*/, "").trim());
        return;
      }
      // 文本答案：直接当 textAns（不要同时写 cur.e，避免 normQuestion 后重复）
      cur.textAns = cur.textAns ? cur.textAns + "；" + rest : rest;
    }

    plainLines(text).forEach(raw => {
      const qm = qRe.exec(raw);
      if (qm && !/^\d{1,4}\s*分/.test(raw) && !/^\d{1,4}\s*[．.]\s*$/.test(raw)) {
        const num = parseInt(qm[1], 10);
        const rest = String(qm[2] || "").trim();
        // 同一题号再次出现且当前题已有选项 → 这行是答案/解析，不要开新题
        if (cur && cur.num === num && cur.options.length >= 2 && looksLikeAnswer(rest)) {
          consumeAsAnswer(rest);
          return;
        }
        flush();
        cur = { num: num, q: rest, options: [], a: -1, e: "", aSet: false, kp: kp || "" };
        inOpts = false;
        const onlyLetters = /^([A-Ea-e]{1,6})[\s．.。]*$/.exec(rest);
        if (onlyLetters) { setAns(onlyLetters[1]); return; }   // 「1.A」式答案速查
        return;
      }
      if (!cur) return;

      const inline = splitInlineOptions(raw);
      if (inline && inline.length >= 2) {
        inline.forEach(({ letter, text: tx }) => {
          const idx = letter.toUpperCase().charCodeAt(0) - 65;
          if (idx >= 0 && idx < 10) {
            while (cur.options.length <= idx) cur.options.push("");
            cur.options[idx] = tx.trim();
          }
        });
        inOpts = true;
        const ia = pickAnswer(raw);
        if (ia && !cur.aSet) setAns(ia);
        return;
      }

      const om = optRe.exec(raw);
      if (om && !/^[A-Ea-e]$/.test(raw)) {
        const idx = om[1].toUpperCase().charCodeAt(0) - 65;
        const txt = (om[2] || "").trim();
        if (idx <= cur.options.length + 1) {
          while (cur.options.length < idx) cur.options.push("");
          cur.options[idx] = txt;
          inOpts = true;
          return;
        }
      }

      // 答案标记（【答案】A / 答案：A / （A）…）优先级高于解析，先取
      const ia2 = pickAnswer(raw);
      if (ia2 && !cur.aSet) setAns(ia2);

      const em = expRe.exec(raw);
      if (em && (inOpts || cur.options.length)) {
        let rest = (em[1] || "").trim();
        const only = /^([A-Ea-e]{1,6})[\s。．.、,，]*$/.exec(rest);   // 「【答案】A」这种，字母本身就是答案
        if (only) { if (!cur.aSet) setAns(only[1]); rest = ""; }
        if (rest) cur.e = smartJoin(cur.e, rest);
        return;
      }

      if (inOpts && cur.options.length) cur.options[cur.options.length - 1] = smartJoin(cur.options[cur.options.length - 1], raw);
      else cur.q = smartJoin(cur.q, raw);
    });
    flush();
    return out;
  }

  /* 入库前最后一道校验：options ≥2；a 必须是合法下标，否则 a=-1 并标记需人工校对 */
  function normQuestion(q) {
    if (!q) return null;
    const opts = (q.options || []).map(o => sanitizeText(o).replace(/\s+/g, " ").trim()).filter(o => o !== "");
    if (opts.length < 2) return null;
    const stem = sanitizeText(q.q).replace(/\s+/g, " ").trim();
    if (!stem) return null;
    let a = (typeof q.a === "number" && isFinite(q.a)) ? Math.trunc(q.a) : -1;
    let needCheck = false;
    if (!(a >= 0 && a < opts.length)) { a = -1; needCheck = true; }
    let e = sanitizeText(q.e);
    if (q.multi) e = "【答案】" + q.multi + "（多选/双空）" + (e ? "　" + e : "");
    // 文本型答案（填空题）：尝试 fuzzy 匹配选项；若命中则 a 修正，否则当解析展示
    if (q.textAns && !e.includes("【答案】")) {
      const idx = fuzzyMatchOption(opts, q.textAns);
      if (idx >= 0) {
        a = idx; needCheck = false;
        e = "【答案】" + q.textAns + (e ? "　" + e : "");
      } else {
        e = "【答案】" + q.textAns + "（未匹配到选项，请核对）" + (e ? "　" + e : "");
      }
    }
    if (needCheck) e = "⚠️ 答案未能自动识别，需人工校对。" + (e ? "　" + e : "");
    const o = {
      q: stem, options: opts, a: a, e: e,
      kp: sanitizeText(q.kp || "").replace(/\s+/g, " ").trim()
    };
    if (q.num != null) o.num = q.num;
    if (needCheck) o.needCheck = true;
    if (q.multi) o.multi = q.multi;
    return o;
  }
  /* 文本答案（如填空题）fuzzy 匹配到选项：统计答案关键词在选项中出现的覆盖率 */
  function fuzzyMatchOption(opts, ans) {
    if (!ans || !opts.length) return -1;
    const clean = s => String(s || "").replace(/[\s,，、;；.。]/g, "");
    const a = clean(ans);
    if (!a) return -1;
    let best = -1, bestScore = 0;
    for (let i = 0; i < opts.length; i++) {
      const o = clean(opts[i]);
      if (!o) continue;
      if (o === a || o.indexOf(a) >= 0 || a.indexOf(o) >= 0) return i;
      const setA = new Set(a.split(""));
      let hit = 0;
      for (const ch of o) if (setA.has(ch)) hit++;
      const score = hit / Math.max(setA.size, o.length);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return bestScore >= 0.5 ? best : -1;
  }

  /* 文末「答案速查 / 参考答案」附录：1.A、1-5 ABCDE、1.A 2.B 3.C、1.普惠/创新/协同 */

  function parseAnswersCore(text) {
    const ansMap = {};
    const ordered = [];
    const orderedRaw = [];
    const lines = plainLines(text).filter(x => x && x.trim());
    const pairRe = /(\d{1,4})\s*[\.．、，,)）]?\s*[：:]?\s*([A-Ea-e]{1,6}(?:\s*[，,、]\s*[A-Ea-e]){0,5})(?=[\s,，.。;；]|$)/g;
    function applyAns(n, val) {
      if (!n || !val) return;
      val = String(val).trim().replace(/^[【\[（(]/, "").replace(/[】\]）)]$/, "").trim();
      if (!val) return;
      const upper = val.toUpperCase().replace(/\s*[，,、]\s*/g, "").replace(/\s+/g, "");
      if (/^[A-E]{1,6}$/.test(upper)) {
        const obj = ansMap[n] || (ansMap[n] = { a: upper.charCodeAt(0) - 65, e: "" });
        obj.a = upper.charCodeAt(0) - 65;
        if (upper.length > 1) obj.multi = upper;
        if (!obj.__o) { ordered.push(obj); obj.__o = true; }
        orderedRaw.push({ n: n, a: obj.a, multi: obj.multi });
        return;
      }
      const obj = ansMap[n] || (ansMap[n] = { a: -1, e: "" });
      obj.textAns = (obj.textAns ? obj.textAns + "；" : "") + val;
      obj.a = -1;
      if (!obj.__o) { ordered.push(obj); obj.__o = true; }
      orderedRaw.push({ n: n, a: -1, textAns: obj.textAns });
    }
    function collectTail(n, tail) {
      tail = String(tail || "").replace(/^[：:．.、，。]\s*/, "").replace(/^(?:解析|答案解析|【解析】|答案)\s*[：:]?\s*/, "").trim();
      if (/^\d{1,4}\s*[\.．、，,)）]/.test(tail)) return;
      if (!tail) return;
      const obj = ansMap[n]; if (!obj) return;
      obj.e = obj.e ? smartJoin(obj.e, tail) : tail;
    }
    const handled = new Set();
    lines.forEach((raw, li) => {
      const m = /^\s*(\d{1,4})\s*[-~—－]\s*(\d{1,4})\s*[：:．.、]?\s*(.{2,80})\s*$/.exec(raw);
      if (m) {
        const from = parseInt(m[1], 10), to = parseInt(m[2], 10);
        const letters = String(m[3]).replace(/[\s\u3000,，、；;．.。]/g, "").toUpperCase();
        let pos = 0;
        for (let n = from; n <= to && pos < letters.length; n++, pos++) {
          const L = letters[pos];
          if (/^[A-E]$/.test(L)) applyAns(n, L);
        }
        handled.add(li);
        return;
      }
      const pairs = []; let p;
      pairRe.lastIndex = 0;
      while ((p = pairRe.exec(raw)) !== null) {
        const n = parseInt(p[1], 10), val = p[2].toUpperCase();
        if (!val) continue;
        pairs.push([n, val]);
      }
      if (!pairs.length) return;
      const wholeOne = /^\s*\d{1,4}\s*[\.．、，,)）]?\s*[：:]?\s*[A-Ea-e]{1,6}\s*$/.test(raw);
      if (!wholeOne && pairs.length < 2) return;
      pairs.forEach(([n, val]) => applyAns(n, val));
      handled.add(li);
    });
    let curNum = null;
    lines.forEach((raw, li) => {
      if (handled.has(li)) return;
      const m = /^\s*(\d{1,4})\s*[\.．、，,)）]\s*(.*)$/.exec(raw);
      if (m) {
        curNum = parseInt(m[1], 10);
        const rest = String(m[2] || "").trim();
        const am = /^\s*([A-Ea-e]{1,6}(?:\s*[，,、]\s*[A-Ea-e]){0,5})\s*[】\]）)]?\s*(.*)$/.exec(rest);
        if (am) { applyAns(curNum, am[1]); collectTail(curNum, am[2]); return; }
        if (/^[^A-Za-z0-9\s]/.test(rest) || (rest.length <= 30 && !/[A-Ea-e]\s*[\.．、]/.test(rest) && /[\u4e00-\u9fa5]/.test(rest))) {
          // 排除题干：含问号、或以"是/包括/有哪些/指的是/为什么/如何/怎样/什么/哪些/吗"等提示词结尾
          if (!/[？?]/.test(rest) && !/(是|包括|有哪些|指的是|为什么|如何|怎样|什么|哪些|吗)$/.test(rest) && !/^下列|^正确|^错误|^符合|^属于|^的是|^关于|^根据|^以下|^哪项|^哪一|^这题|^此题/.test(rest)) {
            applyAns(curNum, rest); return;
          }
        }
        curNum = null; return;
      }
      if (curNum != null && ansMap[curNum] && raw.length > 4) collectTail(curNum, raw);
    });
    return { map: ansMap, ordered: ordered, orderedRaw: orderedRaw };
  }
  function parseAnswers(text) { return parseAnswersCore(text).map; }
  function parseAnswersOrdered(text) { return parseAnswersCore(text).orderedRaw; }

  function buildAnswerBook(pages, outline) {
    if (!pages || !pages.length) return null;
    const chs = splitChapters(pages, outline, 4);
    const chapters = chs.map(ch => {
      const core = parseAnswersCore(ch.text);
      const nm = normChapterName(ch.name);
      return { name: ch.name, norm: nm.norm, ord: nm.ord, map: core.map, ordered: core.orderedRaw };
    }).filter(c => Object.keys(c.map).length);
    if (!chapters.length) return null;
    return { chapters: chapters, isStructured: chapters.length >= 2 };
  }

  function cnToNum(s) {
    const map = { "一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10,"百":100,"千":1000 };
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    let total = 0, cur = 0;
    for (const ch of String(s)) {
      if (map[ch] == null) return total || cur;
      if (map[ch] >= 100) { total += (cur || 1) * map[ch]; cur = 0; }
      else if (map[ch] === 10) { total += (cur || 1) * 10; cur = 0; }
      else cur += map[ch];
    }
    return total + cur;
  }
  function normChapterName(name) {
    let s = String(name || "").replace(/\s+/g, "").toLowerCase();
    let ord = null;
    const om = /第\s*([0-9]+|[一二三四五六七八九十百千]+)\s*[章篇节部分]/.exec(s);
    if (om) { ord = cnToNum(om[1]); s = s.replace(om[0], ""); }
    s = s.replace(/^[一二三四五六七八九十百千]+\s*[、.．]\s*/, "")
         .replace(/^[（(][一二三四五六七八九十]+[)）]\s*/, "")
         .replace(/^(考点|知识点|章节|部分)[:：]?/, "")
         .replace(/[:：]/g, "").replace(/^[·•\-—]/, "")
         .replace(/[\(（].*?[\)）]/g, "");
    return { norm: s, ord: ord };
  }

  function isAnswerApplicable(ans, q) {
    if (!ans) return false;
    if (ans.a >= 0 && ans.a < q.options.length) return true;
    if (ans.multi) return true;
    if (ans.textAns) return true;
    return false;
  }
  function applyAnswerSequentially(questions, ordered) {
    if (!ordered || !ordered.length) return;
    let ai = 0;
    for (let i = 0; i < questions.length && ai < ordered.length; i++) {
      const q = questions[i];
      if (q.a >= 0 && q.a < q.options.length) continue;
      // 跳过明显不适合当前题的噪声条目（如选项只有 A-D 却出现 E），避免整体错位
      let skipped = 0;
      while (ai < ordered.length && skipped < 8 && !isAnswerApplicable(ordered[ai], q)) { ai++; skipped++; }
      if (ai >= ordered.length) break;
      const ans = ordered[ai];
      if (ans.a >= 0 && ans.a < q.options.length) {
        q.a = ans.a; delete q.needCheck;
        q.e = String(q.e || "").replace(/^⚠️\s*答案未能自动识别，需人工校对。\s*/, "");
      }
      if (ans.multi) q.multi = ans.multi;
      if (ans.textAns) q.textAns = ans.textAns;
      if (ans.e && !q.e) q.e = ans.e;
      ai++;
    }
  }

  /* ================= 六、切章 + 切考点 ================= */

  /* 章内按考点小标题分组：{ kp, theory:[行], qtext:[行] }，pre = 章首（第一个考点前）理论 */
  function splitKpBlocks(lines) {
    const pre = [];
    const blocks = [];
    const qRe = /^\s*(\d{1,4})\s*[\.．、,，)）]\s*(.*)$/;
    let cur = null;
    lines.forEach(ln => {
      const s = String(ln || "").replace(IND_RE, "").trim();
      if (!s) return;
      const isQ = qRe.test(s) && !/^\d{1,4}\s*分/.test(s);
      if (isQ) {
        if (!cur) { cur = { kp: "", theory: [], qtext: [], started: false }; blocks.push(cur); }
        cur.qtext.push(s); cur.started = true;
        return;
      }
      const kp = isKpHeading(s, !!(cur && cur.started)) ? cleanTitle(s) : "";
      if (kp && kp.length >= 2 && kp.length <= 30) {
        cur = { kp: kp, theory: [], qtext: [], started: false };
        blocks.push(cur);
        return;
      }
      if (cur) { (cur.started ? cur.qtext : cur.theory).push(s); }
      else pre.push(s);
    });
    return { pre: pre, blocks: blocks };
  }

  /* pages(按页文本数组) + 书签 → 章 [{name, text}] */
  function splitChapters(pages, outline, minLen) {
    pages = pages || [];
    const marks = [];
    if (outline && outline.length >= 2) {
      outline.forEach(o => {
        const t = cleanTitle(o.title);
        if (t && o.page >= 0 && o.page < pages.length) marks.push({ name: t, page: o.page, line: 0 });
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
            marks.push({ name: cleanTitle(s), page: pi, line: li });
          }
          prev = s;
        }
      });
    }
    const uniq = [];
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i], last = uniq[uniq.length - 1];
      if (!last) { uniq.push(m); continue; }
      // 同一页同一行（重复/兜底）才合并或升级，避免把同页里不同章标题吞掉
      if (last.page === m.page && last.line === m.line) {
        if (last.name === m.name) { last.page = Math.max(last.page, m.page); continue; }
        if (STRONG_HEAD.test(m.name) && !STRONG_HEAD.test(last.name)) { last.name = m.name; continue; }
      }
      uniq.push(m);
    }
    const chapters = [];
    if (!uniq.length) {
      chapters.push({ name: "全部题目", text: pages.join("\n") });
    } else {
      uniq.forEach((m, i) => {
        const end = (i + 1 < uniq.length) ? uniq[i + 1] : null;
        let text;
        if (!end) {
          text = String(pages[m.page] || "").split("\n").slice(m.line).join("\n") || pages.slice(m.page).join("\n");
        } else if (end.page === m.page && end.line > m.line) {
          // 同页多章：按行切分（单页答案速查/单页多章书籍的关键修复）
          text = String(pages[m.page] || "").split("\n").slice(m.line, end.line).join("\n");
        } else {
          // 跨页：按页切分
          text = pages.slice(m.page, Math.max(end.page, m.page + 1)).join("\n");
        }
        if (String(text).replace(/\s/g, "").length < (minLen || 20)) {
          // 太短（常见于文末「参考答案 1.A 2.B…」附录被误判成新章）：
          // 不能直接丢弃，否则答案行会整段消失；并入上一章保留内容。
          if (chapters.length) chapters[chapters.length - 1].text += "\n" + text;
          else chapters.push({ name: m.name || ("第" + (i + 1) + "章"), text: text });
          return;
        }
        chapters.push({ name: m.name || ("第" + (i + 1) + "章"), text: text });
      });
    }
    return chapters;
  }

  /* 把混在正文里的答案行剥离，避免 parseQuestions 把它们当成新题 */
  function stripAnswerLines(bodyLines, ansMap) {
    if (!ansMap || !Object.keys(ansMap).length) return bodyLines;
    const body = Array.isArray(bodyLines) ? bodyLines : plainLines(bodyLines);
    const used = new Set();
    return body.filter(ln => {
      const s = String(ln || "").trim();
      if (!s) return true;
      const m = /^\s*(\d{1,4})\s*[\.．、,，)）]\s*(.*)$/.exec(s);
      if (!m) return true;
      const num = parseInt(m[1], 10);
      const hit = ansMap[num];
      if (!hit || used.has(num)) return true;
      const rest = String(m[2] || "").trim();
      if (rest.length > 80) return true;                 // 太长不像答案行
      if (/^(?:下列|正确|错误|符合|属于|的是|关于|根据|以下|哪项|哪一|这题)/.test(rest)) return true; // 明显题干
      // 字母答案：rest 仅字母（可带解析尾巴）
      if (/^[A-Ea-e]{1,6}\b/.test(rest) && !/[\u4e00-\u9fa5]/.test(rest.split(/\s/)[0])) {
        used.add(num); return false;
      }
      // 文本答案：和已识别的 textAns 高度相似，或内容很短且不含选项标志
      const short = rest.replace(/\s/g, "");
      const textAns = String(hit.textAns || "").replace(/\s/g, "");
      if (textAns && (short.indexOf(textAns) >= 0 || textAns.indexOf(short) >= 0 || similarity(short, textAns) > 0.6)) {
        used.add(num); return false;
      }
      if (!textAns && short.length <= 24 && !/[A-Ea-e]\s*[\.．、]/.test(rest) && /[\u4e00-\u9fa5]/.test(rest)) {
        used.add(num); return false;
      }
      return true;
    });
  }
  function similarity(a, b) {
    if (!a || !b) return 0;
    const setA = new Set(a.split("")), setB = new Set(b.split(""));
    let inter = 0;
    for (const ch of setA) if (setB.has(ch)) inter++;
    return inter / Math.max(setA.size, setB.size);
  }

  /* 从章节行里抽出「参考答案」附录：返回去掉附录后的正文行，附录行 push 进 sink */
  function extractAppendix(lines, sink) {
    for (let i = 0; i < lines.length; i++) {
      const s0 = String(lines[i] || "").trim();
      const m = /^(.*?)(参考答案|正确答案|答案与解析|参考答案及解析|答案速查)\s*$/.exec(s0);
      if (m) {
        const pre = (m[1] || "").trim();
        if (pre) {
          lines[i] = pre;
          for (let k = i + 1; k < lines.length; k++) sink.push(lines[k]);
          return lines.slice(0, i + 1);
        }
        for (let k = i; k < lines.length; k++) sink.push(lines[k]);
        return lines.slice(0, i);
      }
      if (/^答\s*案\s*[:：]?\s*$/.test(s0)) {
        for (let k = i + 1; k < lines.length; k++) sink.push(lines[k]);
        return lines.slice(0, i);
      }
    }
    return lines;
  }

  /* 节（供其它模块直接渲染）：{ name, theory(HTML), questions:[{q,options,a,e,kp}] } */
  function buildSections(pages, outline, extraAnsBook) {
    const secs = [];
    const docAnsOrdered = [];     // 纯答案附录章的答案，按文档顺序兜底
    const appendixLines = [];     // 题本自带「参考答案」段的原始行（跨章节收集）
    const extUsed = (extraAnsBook && extraAnsBook.chapters) ? extraAnsBook.chapters.map(() => false) : [];
    let totalQ = 0;

    splitChapters(pages, outline).forEach((ch, qi) => {
      try {
        const lines = plainLines(ch.text);
        if (!lines.length) return;
        let body = lines;
        if (isHeading(lines[0], {})) body = lines.slice(1);   // 去掉章标题本身
        body = extractAppendix(body, appendixLines);          // 先剥离文末「参考答案」段
        if (!body.length) return;

        // ① 本章自带的答案附录（1.A / 1-5 ABCDE / 参考答案段）
        const chAnsCore = parseAnswersCore(body.join("\n"));
        const chAns = chAnsCore.map;
        // parseQuestions 已能识别同题号重复出现的答案/解析行，故不再预剥离；
        // 若某章纯为答案速查（无题干），splitKpBlocks 会把它归到 qtext，parseQuestions 因无选项而自然过滤掉。
        const kpInfo = splitKpBlocks(body);
        const hasQ = kpInfo.blocks.some(b => b.qtext.length);
        // 「没有选项行」且答案 ≥3 条 → 纯答案速查/附录章（可能有题号开头但无 A. B. 选项）
        const optLike = body.filter(l => /^[A-Ea-e]\s*[\.．、,，)）]/.test(String(l))).length;
        if ((!hasQ || !optLike) && Object.keys(chAns).length >= 3) {
          // 纯答案附录章：保留顺序，后续按题序兜底回填
          docAnsOrdered.push(...chAnsCore.orderedRaw);
          return;
        }

        const chapterName = clampLen(sanitizeText(ch.name) || "全部题目", 30);
        const preHtml = toTheoryHtml(kpInfo.pre.join("\n"));
        const withQ = kpInfo.blocks.filter(b => b.qtext.length);
        const chapterSecs = [];   // 本章产生的 section，先回填本章答案再并入全局

        // ③ 章首总述：单独成节（只有「学考点」）
        if (preHtml && withQ.length) {
          chapterSecs.push({ name: chapterName, theory: preHtml, questions: [] });
        }

        let carry = preHtml ? [] : kpInfo.pre.slice();
        kpInfo.blocks.forEach(b => {
          const theoryLines = carry.concat(b.theory);
          if (!b.qtext.length) { carry = theoryLines; return; }
          const qs = parseQuestions(b.qtext.join("\n"), b.kp || chapterName);
          if (!qs.length) { carry = theoryLines; return; }
          let theoryHtml = toTheoryHtml(theoryLines.join("\n"));
          if (!theoryHtml && b.kp) theoryHtml = `<div class="al-sub">🔹 ${esc(b.kp)}</div>`;
          const nm = b.kp
            ? ((chapterName && chapterName !== "全部题目") ? chapterName + " · " + b.kp : b.kp)
            : chapterName;
          // 题太多时按 60 题一块切开，便于翻页与定位（kp 不变）
          const CHUNK = 60;
          if (qs.length > CHUNK) {
            for (let i = 0; i < qs.length; i += CHUNK) {
              chapterSecs.push({
                name: clampLen(nm, 36) + "（" + (Math.floor(i / CHUNK) + 1) + "）",
                theory: i === 0 ? theoryHtml : "",
                questions: qs.slice(i, i + CHUNK)
              });
            }
          } else {
            chapterSecs.push({ name: clampLen(nm, 40), theory: theoryHtml, questions: qs });
          }
          carry = [];
        });
        if (carry.length) {
          const html = toTheoryHtml(carry.join("\n"));
          if (html) chapterSecs.push({ name: chapterName + "（考点）", theory: html, questions: [] });
        }

        // ④ 先按「本章答案 + 同题号」回填，避免不同章节的同号题互相污染
        applyAnswerMap(chapterSecs, chAns);
        // ④b 外部答案文件（与题本分开）按章节名/序号/位置匹配后，按同号回填本章
        if (extraAnsBook && extraAnsBook.isStructured) {
          const qn = normChapterName(chapterName);
          let pick = -1;
          if (qn.norm) extraAnsBook.chapters.forEach((c, i) => { if (!extUsed[i] && c.norm && c.norm === qn.norm) pick = (pick < 0 ? i : pick); });
          if (pick < 0 && qn.ord != null) extraAnsBook.chapters.forEach((c, i) => { if (!extUsed[i] && c.ord != null && c.ord === qn.ord) pick = (pick < 0 ? i : pick); });
          if (pick < 0) for (let i = 0; i < extraAnsBook.chapters.length; i++) { if (!extUsed[i]) { pick = i; break; } }
          if (pick >= 0) { extUsed[pick] = true; applyAnswerMap(chapterSecs, extraAnsBook.chapters[pick].map); }
        }
        // 本章答案没用完的，不再按全局题号兜底，避免跨章污染；
        // 统一走最后的「按题序顺序兜底」。

        secs.push(...chapterSecs);
      } catch (e) {
        // 单章失败不影响整本
      }
    });

    const allQ = [];
    secs.forEach(s => (s.questions || []).forEach(q => allQ.push(q)));

    // ④c 题本自带的「参考答案」附录：先按章节名/序号匹配 → 同号回填，再按题序兜底
    if (appendixLines.length) {
      const apBook = buildAnswerBook([appendixLines.join("\n")], null);
      if (apBook && apBook.chapters && apBook.chapters.length) {
        const used = apBook.chapters.map(() => false);
        secs.forEach(sec => {
          const chName = String(sec.name || "").split(" · ")[0].replace(/[（(](考点|\d+)[）)]$/, "");
          const qn = normChapterName(chName);
          let pick = -1;
          if (qn.norm) apBook.chapters.forEach((c, i) => { if (!used[i] && c.norm && c.norm === qn.norm) pick = (pick < 0 ? i : pick); });
          if (pick < 0 && qn.ord != null) apBook.chapters.forEach((c, i) => { if (!used[i] && c.ord != null && c.ord === qn.ord) pick = (pick < 0 ? i : pick); });
          if (pick < 0) { for (let i = 0; i < apBook.chapters.length; i++) { if (!used[i]) { pick = i; break; } } }
          if (pick >= 0) { used[pick] = true; applyAnswerMap([sec], apBook.chapters[pick].map); }
        });
        const apOrd = [];
        apBook.chapters.forEach(c => c.ordered.forEach(o => apOrd.push(o)));
        applyAnswerSequentially(allQ, apOrd);
      }
    }

    // ④d 外部答案文件（与题本分开）：按「文档出现顺序」兜底
    if (extraAnsBook && extraAnsBook.chapters && extraAnsBook.chapters.length) {
      const extOrd = [];
      extraAnsBook.chapters.forEach(c => c.ordered.forEach(o => extOrd.push(o)));
      applyAnswerSequentially(allQ, extOrd);
    }

    if (docAnsOrdered.length) applyAnswerSequentially(allQ, docAnsOrdered);

    // ⑥ 兜底：整本一个考点都没切出来时，整体当一章解析
    secs.forEach(s => { totalQ += (s.questions || []).length; });
    if (!secs.length) {
      const all = (pages || []).join("\n");
      const qs = parseQuestions(all, "综合");
      secs.push({ name: "全部题目", theory: qs.length ? "" : toTheoryHtml(all), questions: qs });
    }
    return secs.filter(s => (s.theory && String(s.theory).trim()) || (s.questions && s.questions.length));
  }

  function applyAnswerMap(secs, ansMap) {
    if (!ansMap || !Object.keys(ansMap).length) return;
    secs.forEach(s => (s.questions || []).forEach(q => {
      if (q.a >= 0 && q.a < q.options.length) return;
      const hit = ansMap[q.num];
      if (!hit) return;
      if (hit.a >= 0 && hit.a < q.options.length) {
        q.a = hit.a; delete q.needCheck;
        q.e = String(q.e || "").replace(/^⚠️\s*答案未能自动识别，需人工校对。\s*/, "");
      }
      if (hit.multi) q.multi = hit.multi;
      if (hit.textAns) q.textAns = hit.textAns;
      if (hit.e && !q.e) q.e = hit.e;
    }));
  }

  /* 兼容旧调用：整本成章后吸收答案附录 */
  function absorbAnswerSections(sections) {
    const keep = [];
    (sections || []).forEach(s => {
      if (s.questions && s.questions.length) { keep.push(s); return; }
      const lines = plainLines(String(s.theory || "").replace(/<[^>]+>/g, "\n"));
      const hit = lines.filter(l => /^\d{1,4}\s*[\.．、)）]?\s*[A-Ea-e]/i.test(l)).length;
      if (lines.length && hit >= Math.max(2, Math.ceil(lines.length * 0.5))) return; // 丢弃附录章
      keep.push(s);
    });
    return keep;
  }

  /* ================= 七、题册存储：DB.state.pdfBooks + window.KGPdfBooks ================= */

  function rawBooks() {
    const DB = db();
    if (!DB.state.pdfBooks || !Array.isArray(DB.state.pdfBooks)) DB.state.pdfBooks = [];
    return DB.state.pdfBooks;
  }
  function clone(o) { try { return JSON.parse(JSON.stringify(o || null)); } catch (e) { return null; } }

  /* 入库前统一规整：保证每个 section 有 theory 或 questions；每题通过 normQuestion */
  function normalizeSections(sections) {
    const out = [];
    (sections || []).forEach(s => {
      if (!s) return;
      const theory = String(s.theory || "").trim();
      const qs = [];
      (s.questions || []).forEach(q => { const n = normQuestion(q); if (n) qs.push(n); });
      if (!theory && !qs.length) return;
      out.push({ name: clampLen(String(s.name || "考点"), 40), theory: theory, questions: qs });
    });
    return out;
  }

  window.KGPdfBooks = {
    list(subject) {
      const DB = db();
      let arr = rawBooks().slice();
      if (subject) {
        const s = DB.subjectShort ? DB.subjectShort(subject) : subject;
        arr = arr.filter(b => b.subject === s || b.subject === subject);
      }
      return arr.map(clone);
    },
    get(id) {
      const b = rawBooks().find(x => x.id === id);
      return b ? clone(b) : null;
    },
    add(book) {
      const DB = db();
      book = book || {};
      book.id = book.id || DB.uid();
      book.subject = book.subject || "常识";
      if (!book.folderId) book.folderId = (window.KGFolders && window.KGFolders.rootId(subjShortName(book.subject))) || "";
      book.sections = normalizeSections(book.sections);
      if (!book.name) book.name = suggestName(book.subject);
      book.createdAt = book.createdAt || Date.now();
      book.date = book.date || DB.today();
      rawBooks().push(book);
      DB.save();
      return clone(book);
    },
    remove(id) {
      const DB = db();
      const arr = rawBooks();
      const i = arr.findIndex(x => x.id === id);
      if (i < 0) return false;
      arr.splice(i, 1);
      DB.save();
      return true;
    },
    all() { return rawBooks().map(clone); },
    questionsOf(id, si) {
      const b = rawBooks().find(x => x.id === id);
      if (!b) return [];
      const secs = (si == null) ? b.sections : [b.sections[si]].filter(Boolean);
      const out = [];
      secs.forEach(s => (s.questions || []).forEach(q => out.push(clone(q))));
      return out;
    }
  };

  /* ================= 七·五、文件夹树（按学科组织 题册 + 时政材料；跟电脑整理文件一样） ================= */
  function subjShortName(s) { return (window.KG_SUBJECT_SHORT && window.KG_SUBJECT_SHORT[s]) || (s === "时政" ? "时政" : s); }
  window.KGFolders = {
    list(subject) {
      const DB = db();
      DB.state.pdfBookFolders = DB.state.pdfBookFolders || [];
      const arr = subject ? DB.state.pdfBookFolders.filter(f => f.subject === subjShortName(subject)) : DB.state.pdfBookFolders;
      return arr.map(clone);
    },
    rootId(subject) {
      const DB = db();
      const sh = subjShortName(subject);
      DB.state.pdfBookFolders = DB.state.pdfBookFolders || [];
      let r = DB.state.pdfBookFolders.find(f => f.subject === sh && f.root);
      if (!r) { r = { id: DB.uid(), subject: sh, name: "默认文件夹", parentId: null, root: true, createdAt: Date.now() }; DB.state.pdfBookFolders.push(r); DB.save(); }
      return r.id;
    },
    ensureRoot(subject) { return this.rootId(subject); },
    add(opts) {
      const DB = db();
      DB.state.pdfBookFolders = DB.state.pdfBookFolders || [];
      const f = { id: DB.uid(), subject: subjShortName(opts.subject), name: String(opts.name || "新建文件夹").slice(0, 30), parentId: (opts.parentId == null ? null : opts.parentId), createdAt: Date.now() };
      DB.state.pdfBookFolders.push(f); DB.save();
      return clone(f);
    },
    rename(id, name) {
      const DB = db();
      const f = (DB.state.pdfBookFolders || []).find(x => x.id === id);
      if (f) { f.name = String(name || f.name).slice(0, 30); DB.save(); }
      return !!f;
    },
    // 删除文件夹：子文件夹上移一级，文件夹内题目/材料归到父级（或学科根）
    remove(id) {
      const DB = db();
      const arr = DB.state.pdfBookFolders || [];
      const f = arr.find(x => x.id === id);
      if (!f || f.root) return false;
      const parent = f.parentId || this.rootId(f.subject);
      arr.forEach(x => { if (x.parentId === id) x.parentId = parent; });
      const tgt = parent || this.rootId(f.subject);
      (DB.state.pdfBooks || []).forEach(b => { if (b.folderId === id) b.folderId = tgt; });
      (DB.state.currentAffairs || []).forEach(a => { if (a.folderId === id) a.folderId = tgt; });
      const i = arr.findIndex(x => x.id === id);
      if (i >= 0) arr.splice(i, 1);
      DB.save();
      return true;
    },
    // 迁移：给尚无 folderId 的题册 / 时政材料 归入学科根文件夹（兼容老数据）
    migrate() {
      const DB = db();
      (DB.state.pdfBooks || []).forEach(b => { if (!b.folderId) b.folderId = this.rootId(subjShortName(b.subject)); });
      (DB.state.currentAffairs || []).forEach(a => { if (!a.folderId) a.folderId = this.rootId("时政"); });
      DB.save();
    }
  };

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
  window.__pdfExtractPages = extractPages;
  window.__pdfTheoryToHtml = theoryToHtml;
  window.__pdfBuildSections = buildSections;
  window.__buildAnswerBook = buildAnswerBook;
  window.__parseAnswersOrdered = parseAnswersOrdered;

  /* ================= 八、界面 ================= */

  window.MODULES.pdfimport = {
    title: "AI录入题目", icon: "pdf",
    render(body) {
      const DB = db(), UI = window.UI;
      body.innerHTML = "";
      const root = UI.el(`<div class="pdf-import"></div>`);
      body.appendChild(root);

      // 录入方式折叠区（默认收起，满足「默认关闭不展开」；识别完成后自动展开）
      const inputWrap = UI.el(`<details class="kg-det"><summary class="kg-det-s"><span class="kg-det-t">📥 录入方式（文件 / 文字 / AI 识图，点开）</span><span class="kg-det-arrow">▸</span></summary><div class="kg-det-b"></div></details>`);
      root.appendChild(inputWrap);
      const inputBox = inputWrap.querySelector(".kg-det-b");

      // 文件夹下拉：列出该学科 根 + 子文件夹，支持「新建文件夹」
      function populateFolderSelect(sel, subject, selectedId) {
        if (!sel) return;
        const sh = subjShortName(subject);
        const folders = window.KGFolders.list(sh);
        const rootId = window.KGFolders.rootId(sh);
        let html = folders.map(f => `<option value="${esc(f.id)}">${esc((f.parentId ? "　" : "") + f.name)}</option>`).join("");
        html += `<option value="__new__">➕ 新建文件夹…</option>`;
        sel.innerHTML = html;
        sel.value = (selectedId && folders.some(f => f.id === selectedId)) ? selectedId : rootId;
        sel.onchange = () => {
          if (sel.value === "__new__") {
            const nm = window.prompt ? prompt("新建文件夹名称：", "新建文件夹") : "";
            if (nm) { const f = window.KGFolders.add({ subject: sh, name: nm }); sel.value = f.id; }
            else sel.value = rootId;
          }
        };
      }

      let draft = null;
      let ftsSubject = (window.KG_SUBJECTS && window.KG_SUBJECTS[0]) || "言语理解";
      const pageState = Object.create(null);

      /* ---------- 导入卡片 ---------- */
      const card = UI.el(`<div class="card">
        <h3>📄 题库导入（PDF / Word / 文本）</h3>
        <div class="muted small">
          ① 选「题目文件」→ 点「提取并识别」。支持 <b>.pdf</b>（文字型）、<b>.docx</b>、<b>.txt/.md</b>；老版 <b>.doc</b> 请先另存为 docx/txt。<br>
          ② 题目与答案在同一份文档也能识别（<code>1.A</code>、<code>【答案】A</code>、<code>参考答案：A</code>、<code>（A）</code>、<code>【解析】…</code>、文末答案速查）；答案单独成册时再选「答案文件（可选）」。<br>
          ③ 自动按 <b>目录 / 章节标题</b> 分章，章内再按 <b>考点</b> 切块：每个考点 = 讲解 + 它对应的题，保证一一对应。<br>
          ④ 给题册起个名字（留空自动命名）→ 保存后即可在对应模块的「我导入的题册」中使用。<br>
          <b>仅支持文字型 PDF</b>（能用鼠标选中文字的那种）；扫描件请先用 OCR 转文字版。
        </div>
        <div class="row" style="margin-top:12px;gap:10px;flex-wrap:wrap;align-items:center">
          <label class="muted small">题目文件</label>
          <input type="file" id="pdfQ" accept=".pdf,.docx,.txt,.md,.markdown,.csv,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
        </div>
        <div class="row" style="margin-top:8px;gap:10px;flex-wrap:wrap;align-items:center">
          <label class="muted small">答案文件（可选）</label>
          <input type="file" id="pdfA" accept=".pdf,.docx,.txt,.md,.markdown,.csv,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
          <select id="pdfSubj">${SUBJECTS.map(s => `<option value="${esc(SUBJECT_SHORT[s] || s)}">${esc(s)}</option>`).join("")}</select>
          <button class="btn primary" id="pdfGo">🔍 提取并识别</button>
          <button class="btn ghost" id="pdfManual">✍️ 手动粘贴文本</button>
        </div>
        <div class="muted small" id="pdfStatus" style="margin-top:10px"></div>
        <textarea id="pdfRaw" style="width:100%;height:130px;margin-top:10px;display:none" placeholder="这里显示从文件提取的文字，可手动修正后再点「重新识别」"></textarea>
        <div class="row" id="reparseRow" style="margin-top:8px;display:none">
          <button class="btn" id="pdfReparse">🔁 用上方文字重新识别</button>
        </div>
        <div id="draftHost"></div>
      </div>`);
      inputBox.appendChild(card);

      /* ---------- AI 识图/PDF 录入（图片视觉识别直出；PDF 先浏览器抽字再 AI 结构化） ---------- */
      const aiCard = UI.el(`<div class="card" style="margin-top:12px">
        <h3>📷 AI 录入题目（支持照片/截图 与 PDF，准确率高）</h3>
        <div class="muted small">
          ① 选<b>题目照片/截图</b>或 <b>PDF</b>（支持多选，一次多个）→ 点「AI 识别」。<br>
          · 图片：调用「AI 咨询」里已配置的<b>可识图模型</b>（如 Gemini 2.0 Flash / GLM-4V-Flash）直接读出题干/选项/答案；<br>
          · PDF：先在本机浏览器抽文字（不传服务器），再交给 AI 按结构拆题、补答案，比纯正则更稳。<br>
          ② 识别结果进入下方「识别结果」预览；答案没把握的标「待校对」，点每题的 <b>✏️ 校对</b> 手动补全（可从识别原文复制），核对后保存。<br>
          若未配置 AI：去「设置 → AI 令牌」填一个支持识图/对话的令牌，或选「共享 AI」。
        </div>
        <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:center">
          <input type="file" id="aiImg" accept="image/*,application/pdf" multiple />
          <select id="aiSubj">${SUBJECTS.map(s => `<option value="${esc(SUBJECT_SHORT[s] || s)}">${esc(s)}</option>`).join("")}</select>
          <button class="btn primary" id="aiGo">🤖 AI 识别</button>
        </div>
        <div class="muted small" id="aiStatus" style="margin-top:10px"></div>
      </div>`);
      inputBox.appendChild(aiCard);

      /* ---------- 时政 / 申论材料：纯文字直接识别 → 存到「时政」模块 ---------- */
      const curCard = UI.el(`<div class="card" style="margin-top:12px">
        <h3>📝 时政 / 申论材料（直接粘贴文字）</h3>
        <div class="muted small">
          把每天整理的「时政汇总（⭐条目）· 申论时评+金句 · 时政词语 · 原创言语真题 · 原创时政单选」整段粘进来，自动分栏识别，
          保存后<b>自动跳到左侧「时政」模块</b>，可查看资料、直接练题、导出 PDF（全部 / 错题）。
        </div>
        <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap;align-items:center">
          <label class="muted small">日期</label>
          <input type="date" id="curDate" value="${DB.today()}" style="width:160px"/>
          <button class="btn ghost" id="curSample">填入示例格式</button>
        </div>
        <textarea id="curText" rows="8" style="width:100%;margin-top:8px" placeholder="第一部分：XXXX年X月X日公考标准时政汇总（星级重难点）&#10;国内时政&#10;⭐1. …"></textarea>
        <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap;align-items:center">
          <label class="muted small">归类文件夹</label>
          <select id="curFolder"></select>
          <button class="btn primary" id="curGo">🔍 识别为时政资料</button>
          <span class="muted small">识别后归入所选文件夹（可在下方拖动整理）</span>
        </div>
      </div>`);
      inputBox.appendChild(curCard);

      const CUR_SAMPLE = [
        "第一部分：2026年9月12日公考标准时政汇总（星级重难点）",
        "国内时政",
        "⭐1. 第十六次APEC能源部长会议在北京闭幕",
        "会议正式确立普惠、创新、协同三大合作理念，倡议亚太各国深化清洁能源合作。",
        "国际时政",
        "⭐1. 习近平主席出席印度新德里金砖国家领导人第十八次会晤（9.12-9.13）",
        "本次峰会聚焦大金砖合作提质升级，坚定立足全球南方阵营。",
        "第二部分：申论标准时评+必背金句",
        "申论时评主题：秉持多边协同理念 共筑绿色发展未来",
        "当前世界变局加速演进，能源安全、生态治理、发展失衡成为全球性共性难题。",
        "今日必背申论金句",
        "1. 协同聚合力，绿色启新程，开放赢未来。",
        "第三部分：时政专属词语释义 + 8道原创言语真题",
        "1. 普惠（两字）：惠及全体、兼顾公平，多用于政策、国际合作、公共服务。",
        "1. APEC能源会议倡导____、创新、协同的发展理念，破除区域合作____。（双空）",
        "A.普惠 壁垒  B.公平 隔阂  C.共享 屏障  D.包容 鸿沟",
        "【答案】A",
        "【解析】官方固定表述“普惠、创新、协同”。",
        "第四部分：8道原创时政单选（强迷惑性｜公考真题难度）",
        "1. 2026年9月闭幕的第十六次APEC能源部长会议，确立的三大核心理念是（）",
        "A.绿色、低碳、高效",
        "B.普惠、创新、协同",
        "C.开放、包容、共赢",
        "D.创新、协调、绿色",
        "【答案】B"
      ].join("\n");
      curCard.querySelector("#curSample").onclick = () => { curCard.querySelector("#curText").value = CUR_SAMPLE; };
      try { populateFolderSelect(curCard.querySelector("#curFolder"), "时政", null); } catch (e) {}
      curCard.querySelector("#curGo").onclick = () => {
        const txt = curCard.querySelector("#curText").value.trim();
        if (!txt) { UI.toast("请先粘贴文字"); return; }
        if (!window.KGCurrent) { UI.toast("时政模块未加载，请刷新后重试"); return; }
        try {
          const rec = window.KGCurrent.importText(txt, curCard.querySelector("#curDate").value || DB.today());
          if (rec && rec.id) {
            const fsel = curCard.querySelector("#curFolder");
            const fid = (fsel && fsel.value && fsel.value !== "__new__") ? fsel.value : window.KGFolders.rootId("时政");
            const live = (db().state.currentAffairs || []).find(x => x.id === rec.id);
            if (live) { live.folderId = fid; db().save(); }
          }
          UI.toast("已识别并保存到「时政」：" + (rec && rec.title || ""));
          renderBooks();
        } catch (e) { UI.toast("识别失败：" + e.message); }
      };

      const bookCard = UI.el(`<div class="card" style="margin-top:12px">
        <h3>📚 我的题册与文件夹（长按拖动整理，跟电脑整理文件一样）</h3>
        <div class="muted small">点开题册 → 展开章节：有考点的先看考点，再分页刷题；练习会记录每题用时与正确率。</div>
        <div id="bookHost" style="margin-top:8px"></div>
      </div>`);
      root.appendChild(bookCard);

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
        if (!qf) { UI.toast("请先选择题目文件"); return; }
        setStatus("正在解析文件并提取文字，请稍候…");
        goBtn.disabled = true;
        try {
          const r = await fileToPages(qf);
          const pages = (r.pages || []).map(sanitizeText);
          const qText = pages.join("\n");
          rawTa.value = qText;
          rawTa.style.display = "block";
          reparseRow.style.display = "flex";

          let aNote = "";
          let ansBook = null;
          const af = aIn.files && aIn.files[0];
          if (af) {
            try {
              const ar = await fileToPages(af);
              const ap = (ar.pages || []).map(sanitizeText);
              ansBook = buildAnswerBook(ap, ar.outline);
              if (ansBook) {
                const cnt = ansBook.chapters.reduce((s, c) => s + Object.keys(c.map).length, 0);
                aNote = `，从答案文件解析出 ${cnt} 条答案（${ansBook.isStructured ? "章节+题序兜底" : "按题序匹配"}）`;
              } else {
                aNote = `，答案文件未解析到可用答案`;
              }
            } catch (e) { aNote = `，答案文件解析失败：${esc(e.message)}`; }
          }
          if (String(qText).replace(/\s/g, "").length < 40) {
            setStatus(`<span style="color:var(--red)">⚠️ 提取到的文字极少，这份文件很可能是<b>扫描件/图片型</b>。请改用文字版。</span>`);
            goBtn.disabled = false;
            return;
          }
          buildDraft(pages, r.outline, ansBook);
          inputWrap.open = true;
          const stat = countStat(draft);
          setStatus(`✓ 提取 ${qText.length} 字符${r.outline ? "（按 PDF 目录分组）" : "（按内容标题分组）"}，共 <b>${draft.sections.length}</b> 个考点块 / <b>${stat.q}</b> 道题${stat.bad ? `（其中 <b style="color:var(--red)">${stat.bad}</b> 题答案待校对）` : ""}${aNote}。请核对后保存。`);
        } catch (e) {
          setStatus(`<span style="color:var(--red)">提取失败：${esc(e.message || e)}</span>`);
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
          buildDraft([sanitizeText(rawTa.value || "")], null, null);
          inputWrap.open = true;
          const stat = countStat(draft);
          setStatus(`识别到 <b>${draft.sections.length}</b> 个考点块 / <b>${stat.q}</b> 道题${stat.bad ? `（<b style="color:var(--red)">${stat.bad}</b> 题答案待校对）` : ""}，请核对后保存。`);
        } catch (e) { setStatus(`<span style="color:var(--red)">识别失败：${esc(e.message)}</span>`); }
      };

      /* ===== AI 识图：图片 → 结构化题目（复用 KGAI 视觉模型） ===== */
      const aiImg = aiCard.querySelector("#aiImg");
      const aiGo = aiCard.querySelector("#aiGo");
      const aiStatus = aiCard.querySelector("#aiStatus");
      aiGo.onclick = async () => {
        const files = Array.from(aiImg.files || []);
        if (!files.length) { UI.toast("请先选题目图片或 PDF"); return; }
        if (!window.KGAI) { UI.toast("AI 模块未加载，请刷新重试"); return; }
        const _prov0 = window.KGAI.providerById(window.KGAI.getProvider());
        if (!_prov0.noKey && !window.KGAI.getToken && !window.KGAI.hasCustom()) { UI.toast("未配置 AI 令牌，请到「设置 → AI 令牌」填写，或选「共享 AI」"); return; }
        aiGo.disabled = true;
        try {
          let all = [], done = 0;
          for (const f of files) {
            const isPdf = /\.pdf$/i.test(f.name) || f.type === "application/pdf";
            if (isPdf) {
              aiStatus.innerHTML = `正在读取 PDF 第 <b>${done + 1}</b>/<b>${files.length}</b> 个（本机抽字，不上传服务器）…`;
              const qs = await aiPdfQuestions(f, aiCard.querySelector("#aiSubj").value || "常识", (p, t) => {
                aiStatus.innerHTML = `正在用 AI 解析 PDF「${esc(truncate(f.name, 14))}」第 <b>${p}</b>/<b>${t}</b> 页…`;
              });
              if (qs && qs.length) all = all.concat(qs);
            } else {
              aiStatus.innerHTML = `正在用 AI 识别第 <b>${done + 1}</b>/<b>${files.length}</b> 张…`;
              const qs = await aiVisionQuestions(f, aiCard.querySelector("#aiSubj").value || "常识");
              if (qs && qs.length) all = all.concat(qs);
            }
            done++;
          }
          if (!all.length) {
            aiStatus.innerHTML = '<span style="color:var(--red)">AI 未识别出题目：请确认图片清晰 / PDF 含文字，且「AI 咨询」已配置可用模型（图片用可识图模型，PDF 用对话模型，如 Gemini 2.0 Flash / GLM-4V-Flash）。</span>';
            return;
          }
          buildAiDraft(all, aiCard.querySelector("#aiSubj").value || "常识");
          inputWrap.open = true;
          const stat = countStat(draft);
          aiStatus.innerHTML = `✓ AI 识别到 <b>${all.length}</b> 道题${stat.bad ? `（<b style="color:var(--red)">${stat.bad}</b> 题答案待校对）` : ""}，已加入下方「识别结果」，请核对后保存。`;
        } catch (e) {
          aiStatus.innerHTML = `<span style="color:var(--red)">❌ AI 识别失败：${esc(e.message || e)}</span><br><span class="muted small">不影响录入：你也可以改用上方「文件 / 文字」方式（不依赖 AI 的正则识别）来完成识别，重点是识别完能练题。</span>`;
          UI.toast("❌ AI 识别失败，可改用「文件 / 文字」方式识别");
        } finally {
          aiGo.disabled = false;
        }
      };

      function fileToDataUrl(file) {
        return new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = () => rej(new Error("读取图片失败"));
          r.readAsDataURL(file);
        });
      }

      async function aiVisionQuestions(file, subject) {
        const provId = window.KGAI.getProvider();
        const prov = window.KGAI.providerById(provId);
        let model = window.KGAI.getModel();
        if (!window.KGAI.canVision(provId, model)) {
          const v = (prov.models || []).filter(m => m.vision)[0];
          if (v) model = v.id;
          else throw new Error("当前 AI 模型不支持识图，请在「设置 → AI」选一个可识图模型（如 Gemini 2.0 Flash）");
        }
        const key = window.KGAI.getKey(provId);
        if (!key && !prov.noKey && !window.KGAI.hasCustom()) throw new Error("未配置 AI 令牌，请到「设置 → AI 令牌」填写，或选「共享 AI」");
        const dataUrl = await fileToDataUrl(file);
        const sys = "你是公考题库录入助手。用户会发一张题目图片。请严格只输出一个 JSON 数组（不要任何解释、不要 markdown 代码块、不要 ```），数组每个元素是 {\"q\":\"题干\",\"options\":[\"A选项\",\"B选项\",\"C选项\",\"D选项\"],\"a\":\"A\"或\"B\"或\"C\"或\"D\"（不确定填 null），\"e\":\"解析，可空\"}。选项必须 2-4 个，顺序与图片一致；若一题含多选，a 用数组。";
        const user = "请识别这张公考题目图片，按要求只输出 JSON 数组。";
        const content = [
          { type: "text", text: user },
          { type: "image_url", image_url: { url: dataUrl } }
        ];
        const text = await window.KGAI.chat([
          { role: "system", content: sys },
          { role: "user", content: content }
        ], { providerId: provId, model: model, key: key });
        return parseAiQuestions(text, subject);
      }

      function truncate(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n) + "…" : s; }

      /* PDF：本机浏览器抽文字（不上传服务器）→ 按页交给 AI 文本模型拆题为结构化数组 */
      async function aiPdfQuestions(file, subject, onPage) {
        const provId = window.KGAI.getProvider();
        const prov = window.KGAI.providerById(provId);
        let model = window.KGAI.getModel();
        const key = window.KGAI.getKey(provId);
        if (!key && !prov.noKey && !window.KGAI.hasCustom()) throw new Error("未配置 AI 令牌，请到「设置 → AI 令牌」填写，或选「共享 AI」");
        if (!window.__pdfExtractPages) throw new Error("PDF 解析组件未就绪，请刷新重试");
        const out = [];
        const r = await window.__pdfExtractPages(file);
        const pages = (r && r.pages) || [];
        const total = pages.length || 1;
        for (let pi = 0; pi < pages.length; pi++) {
          const txt = sanitizeText(pages[pi] || "").replace(/\s+/g, " ").trim();
          if (onPage) onPage(pi + 1, total);
          if (!txt) continue;
          const sys = "你是公考题库录入助手。下面是一页公考题目的纯文字（已按版式抽取）。请严格只输出一个 JSON 数组（不要任何解释、不要 markdown 代码块、不要 ```），数组每个元素是 {\"q\":\"题干\",\"options\":[\"A选项\",\"B选项\",\"C选项\",\"D选项\"],\"a\":\"A\"或\"B\"或\"C\"或\"D\"（不确定填 null），\"e\":\"解析，可空\"}。选项必须 2-4 个，顺序与文字一致；若一题含多选，a 用数组。忽略页眉页脚、页码、非题目文字。";
          const user = "请识别这一页公考题目，按要求只输出 JSON 数组：\n" + txt.slice(0, 6000);
          let text;
          try {
            text = await window.KGAI.chat([
              { role: "system", content: sys },
              { role: "user", content: user }
            ], { providerId: provId, model: model, key: key });
          } catch (e) { throw new Error("第 " + (pi + 1) + " 页解析失败：" + (e.message || e)); }
          const qs = parseAiQuestions(text, subject);
          if (qs && qs.length) out.push.apply(out, qs);
        }
        return out;
      }

      function parseAiQuestions(text, subject) {
        if (!text) return [];
        let s = String(text).trim();
        s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
        let i = s.indexOf("["), j = s.lastIndexOf("]");
        if (i >= 0 && j > i) s = s.slice(i, j + 1);
        else {
          const k = s.indexOf("{"); const l = s.lastIndexOf("}");
          if (k >= 0 && l > k) {
            try { const o = JSON.parse(s.slice(k, l + 1)); if (Array.isArray(o.questions)) s = JSON.stringify(o.questions); } catch (e) {}
          }
        }
        let arr;
        try { arr = JSON.parse(s); } catch (e) { throw new Error("AI 返回的不是有效 JSON，请重试或换模型"); }
        if (!Array.isArray(arr)) arr = [arr];
        return arr.map((x, idx) => {
          const q = sanitizeText(x.q || "").replace(/\s+/g, " ").trim();
          let opts = Array.isArray(x.options) ? x.options.map(o => sanitizeText(o).replace(/\s+/g, " ").trim()).filter(Boolean) : [];
          if (!opts.length && x.options && typeof x.options === "object") {
            ["A", "B", "C", "D", "E"].forEach(k => { if (x.options[k]) opts.push(sanitizeText(x.options[k]).trim()); });
          }
          let a = -1;
          if (x.a != null) {
            if (Array.isArray(x.a)) { a = -1; }
            else {
              const letter = String(x.a).trim().toUpperCase();
              const li = "ABCDE".indexOf(letter);
              if (li >= 0 && li < opts.length) a = li;
              else if (/^\d+$/.test(String(x.a).trim())) { const n = +x.a - 1; if (n >= 0 && n < opts.length) a = n; }
            }
          }
          const e = sanitizeText(x.e || "").trim();
          const needCheck = !(a >= 0 && a < opts.length);
          return { q, options: opts, a, e, kp: "", num: idx + 1, needCheck: needCheck };
        }).filter(x => x.q && x.options.length >= 2);
      }

      function buildAiDraft(questions, subject) {
        draft = {
          subject: subject,
          name: "",
          sections: [{ name: "AI 识图导入", theory: "", questions: questions }]
        };
        renderDraft();
      }

      /* 人工校对：编辑单题（题干/选项/答案/解析），可从识别原文复制；校验入库 */
      function openProofread(book, si, qi, isDraft) {
        let q, persist;
        if (isDraft) {
          q = draft.sections[si].questions[qi];
          persist = () => { renderDraft(); };
        } else {
          const live = rawBooks().find(x => x.id === book.id);
          if (!live) return;
          q = live.sections[si].questions[qi];
          persist = () => { db().save(); renderBooks(); };
        }
        if (!q) return;
        const letters = ["A", "B", "C", "D"];
        const optSlots = [];
        for (let i = 0; i < 4; i++) optSlots.push((q.options && q.options[i]) || "");
        const ansOpts = letters.map((L, i) => `<option value="${i}" ${q.a === i ? "selected" : ""}>${L}</option>`).join("")
          + `<option value="-1" ${!(q.a >= 0) ? "selected" : ""}>未定（待校对）</option>`;
        const rawText = (card.querySelector("#pdfRaw") && card.querySelector("#pdfRaw").value) || "";
        const body = UI.el(`<div>
          <label class="fld">题干</label>
          <textarea id="pfQ" class="full" rows="3" style="width:100%">${esc(q.q || "")}</textarea>
          <label class="fld" style="margin-top:8px">选项（至少填 2 个，留空自动跳过）</label>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:stretch">
            ${optSlots.map((o, i) => `<div style="display:flex;gap:8px;align-items:center"><b style="width:18px">${letters[i]}</b><input id="pfO${i}" class="full" style="flex:1" value="${esc(o)}"/></div>`).join("")}
          </div>
          <div style="display:flex;gap:10px;margin-top:10px;align-items:center">
            <label class="fld" style="margin:0">正确答案</label>
            <select id="pfA">${ansOpts}</select>
          </div>
          <label class="fld" style="margin-top:10px">解析（可空）</label>
          <textarea id="pfE" class="full" rows="2" style="width:100%">${esc(q.e || "")}</textarea>
          ${rawText ? `<details style="margin-top:10px"><summary class="muted small" style="cursor:pointer">📋 识别原文（可复制）</summary><div class="muted small" style="white-space:pre-wrap;max-height:160px;overflow:auto;border:1px solid var(--line);padding:8px;margin-top:6px">${esc(rawText)}</div></details>` : ""}
          <div id="pfMsg" class="muted small" style="margin-top:8px"></div>
        </div>`);
        UI.modal({
          title: "✏️ 人工校对 · " + (q.q ? q.q.slice(0, 18) : ("第" + (qi + 1) + "题")),
          body: body, width: "560px",
          actions: [
            { label: "取消", cls: "ghost", onClick: (m, c) => c() },
            {
              label: "保存校对", cls: "primary", onClick: (m, c) => {
                const nq = body.querySelector("#pfQ").value.trim();
                const nopts = letters.map((L, i) => body.querySelector("#pfO" + i).value.trim()).filter(Boolean);
                const na = parseInt(body.querySelector("#pfA").value, 10);
                const ne = body.querySelector("#pfE").value.trim();
                const msg = body.querySelector("#pfMsg");
                if (!nq) { msg.innerHTML = '<span style="color:var(--red)">题干不能为空</span>'; return; }
                if (nopts.length < 2) { msg.innerHTML = '<span style="color:var(--red)">至少需要 2 个选项</span>'; return; }
                if (na >= 0 && na >= nopts.length) { msg.innerHTML = '<span style="color:var(--red)">答案超出了选项数量</span>'; return; }
                q.q = nq; q.options = nopts; q.a = na; q.e = ne;
                q.needCheck = !(na >= 0 && na < nopts.length);
                if (q.needCheck) q.e = "⚠️ 答案未能自动识别，需人工校对。" + (ne ? "　" + ne : "");
                else q.e = String(q.e).replace(/^⚠️\s*答案未能自动识别，需人工校对。\s*/, "");
                persist();
                c(); UI.toast(q.needCheck ? "已保存（仍待校对）" : "✓ 校对完成");
              }
            }
          ]
        });
      }

      function countStat(d) {
        let q = 0, bad = 0;
        ((d && d.sections) || []).forEach(s => (s.questions || []).forEach(x => {
          q++;
          if (!(x.a >= 0 && x.a < x.options.length)) bad++;
        }));
        return { q: q, bad: bad };
      }

      function buildDraft(pages, outline, ansBook) {
        let secs = buildSections(pages && pages.length ? pages : [""], outline, ansBook);
        secs = absorbAnswerSections(secs);
        if (!secs.length) secs = [{ name: "全部题目", theory: "", questions: [] }];
        draft = {
          subject: card.querySelector("#pdfSubj").value || "常识",
          name: "",
          sections: secs
        };
        renderDraft();
      }

      /* ===== 识别结果（命名 + 预览） ===== */
      function renderDraft() {
        const host = card.querySelector("#draftHost");
        if (!host) return;
        host.innerHTML = "";
        if (!draft) return;
        try {
          const stat = countStat(draft);
          const defName = suggestName(draft.subject);
          const head = UI.el(`<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px">
            <b>识别结果：${draft.sections.length} 个考点块 / ${stat.q} 道题${stat.bad ? `（${stat.bad} 题答案待校对）` : ""}</b>
            <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center">
              <label class="muted small">学科</label>
              <select id="dSubj">${SUBJECTS.concat(["时政"]).map(s => `<option value="${esc(s)}" ${s === subjectLabel(draft.subject) ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
              <label class="muted small">文件夹</label>
              <select id="dFolder"></select>
            </div>
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
          const dSubj = head.querySelector("#dSubj");
          const dFolder = head.querySelector("#dFolder");
          const refreshFolder = () => populateFolderSelect(dFolder, dSubj.value, null);
          dSubj.onchange = refreshFolder;
          refreshFolder();
          head.querySelector("#dSave").onclick = () => {
            try {
              const subject = subjShortName(dSubj.value);
              const folderId = (dFolder.value && dFolder.value !== "__new__") ? dFolder.value : window.KGFolders.rootId(subject);
              const name = (head.querySelector("#dName").value || "").trim() || suggestName(subject);
              const book = window.KGPdfBooks.add({
                subject: subject, name: name, named: !!(head.querySelector("#dName").value || "").trim(),
                folderId: folderId,
                sections: draft.sections.map(s => ({ name: s.name, theory: s.theory || "", questions: (s.questions || []).slice() }))
              });
              let n = 0;
              if (head.querySelector("#dToCustom").checked) {
                n = saveToCustom(subject, draft.sections.reduce((a, s) => a.concat(s.questions || []), []));
              }
              UI.toast(`已保存题册「${name}」${n ? "，并存入自定义题库 " + n + " 题" : ""}`);
              draft = null; host.innerHTML = "";
              ftsSubject = subjectLabel(subject); renderBooks(); renderCustom();
            } catch (e) { UI.toast("保存失败：" + e.message); }
          };
          head.querySelector("#dCancel").onclick = () => { draft = null; host.innerHTML = ""; setStatus("已取消。"); };

          (draft.sections || []).forEach((s, si) => {
            try {
              const det = UI.section(`§ ${s.name || ("第" + (si + 1) + "节")} · ${(s.questions || []).length} 题${(s.theory && String(s.theory).trim()) ? " · 有考点" : ""}`);
              host.appendChild(det);
              renderSectionBody(det.querySelector(".kg-det-b"), draft, si, true);
            } catch (e) {
              host.appendChild(UI.el(`<div class="muted small">章节渲染失败：${esc(e.message)}</div>`));
            }
          });
        } catch (e) {
          host.innerHTML = `<div class="card empty">识别结果渲染失败：${esc(e.message)}</div>`;
        }
      }

      /* ===== 章节内容：考点 + 分页题目 ===== */
      function renderSectionBody(box, book, si, isDraft) {
        try {
          box.innerHTML = "";
          const s = book.sections[si];
          const key = ((book.id || "draft") + "#" + si);
          const st = pageState[key] || (pageState[key] = { page: 0, size: DEFAULT_PAGE_SIZE });
          const qs = s.questions || [];
          const learnedKey = (book.id || "draft") + "::" + si;
          const learned = !!(window.LearnedHistory && window.LearnedHistory.isLearned(LEARN_KEY, learnedKey));
          const html = toTheoryHtml(s.theory || "");

          if (html) box.appendChild(UI.el(`<div class="allu-sec" style="margin-top:6px">${html}</div>`));

          const bar = UI.el(`<div class="row" style="gap:8px;flex-wrap:wrap;margin:8px 0">
            ${html ? `<button class="btn xs" data-a="study">📖 学考点</button>${learned ? `<span class="tag ok">已学</span>` : ""}` : ""}
            ${qs.length ? `<button class="btn xs primary" data-a="doPage">🎯 练习本页</button>
              <button class="btn xs" data-a="doAll">🎯 练习本块全部(${qs.length})</button>` : ""}
            ${(!html && !qs.length) ? `<span class="muted small">（本块无内容）</span>` : ""}
          </div>`);
          box.appendChild(bar);
          const studyBtn = bar.querySelector('[data-a="study"]');
          if (studyBtn) studyBtn.onclick = () => openStudy(book, si, isDraft);
          if (!qs.length) return;

          const sizeOpts = PAGE_SIZES.map(n => `<option value="${n}" ${n === st.size ? "selected" : ""}>${n}</option>`).join("");
          const totalPages = Math.max(1, Math.ceil(qs.length / (st.size || DEFAULT_PAGE_SIZE)));
          st.page = Math.min(Math.max(0, st.page), totalPages - 1);
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
          pager.querySelector('[data-a="size"]').onchange = e => {
            st.size = Math.min(20, Math.max(5, +e.target.value || DEFAULT_PAGE_SIZE)); st.page = 0;
            renderSectionBody(box, book, si, isDraft);
          };
          pager.querySelector('[data-a="prev"]').onclick = () => { st.page = Math.max(0, st.page - 1); renderSectionBody(box, book, si, isDraft); };
          pager.querySelector('[data-a="next"]').onclick = () => { st.page = st.page + 1; renderSectionBody(box, book, si, isDraft); };

          const listHtml = slice.map((q, i) => {
            const n = st.page * st.size + i + 1;
            const opts = (q.options || []).map((o, oi) => `<div class="muted small" style="margin-left:14px">${A(oi)}. ${esc(o)}</div>`).join("");
            const need = !(q.a >= 0 && q.a < q.options.length);
            const ans = !need
              ? `<b style="color:var(--green)">${A(q.a)}</b>`
              : `<b style="color:var(--red)">待校对</b>`;
            return `<div class="pdf-q" data-pf="${si}:${n - 1}" style="margin-bottom:8px;padding:8px;border:1px solid ${need ? 'var(--red)' : 'var(--line)'};border-radius:8px">
              <div><b>${n}.</b> ${esc(q.q)}${q.kp ? `<span class="tag" style="margin-left:6px">${esc(q.kp)}</span>` : ""}${need ? ` <span class="tag" style="background:var(--red);color:#fff;margin-left:6px">⚠️ 待校对</span>` : ""}</div>
              ${opts}
              <div class="row" style="gap:8px;align-items:center;margin-top:4px"><span class="muted small">答案：${ans}${q.e ? " · " + esc(String(q.e).slice(0, 60)) : ""}</span><button class="btn xs" data-act="pf" style="margin-left:auto">✏️ 校对</button></div>
            </div>`;
          }).join("");
          const listWrap = UI.el(`<div style="margin-top:8px">${listHtml}</div>`);
          box.appendChild(listWrap);
          listWrap.querySelectorAll("[data-pf]").forEach(el => {
            const parts = el.dataset.pf.split(":").map(Number);
            const btn = el.querySelector('[data-act="pf"]');
            if (btn) btn.onclick = () => openProofread(book, parts[0], parts[1], isDraft);
          });

          const p1 = bar.querySelector('[data-a="doPage"]');
          if (p1) p1.onclick = () => startQuiz(book, si, slice, (book.name || "题册") + " · " + (s.name || "") + " 第" + (st.page + 1) + "页");
          const p2 = bar.querySelector('[data-a="doAll"]');
          if (p2) p2.onclick = () => startQuiz(book, si, qs, (book.name || "题册") + " · " + (s.name || "") + " 全块");
        } catch (e) {
          box.innerHTML = `<div class="muted small">章节渲染失败：${esc(e.message)}</div>`;
        }
      }

      function openStudy(book, si, isDraft) {
        try {
          const s = book.sections[si];
          const key = (book.id || "draft") + "::" + si;
          const box = UI.el(`<div class="allu-sec" style="max-height:62vh;overflow:auto">${toTheoryHtml(s.theory || "")}</div>`);
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

      function startQuiz(book, si, list, label) {
        try {
          if (!window.Quiz) { UI.toast("答题引擎未就绪"); return; }
          const src = (list || []).filter(q => q && q.q && q.options && q.options.length >= 2);
          if (!src.length) { UI.toast("没有可练习的题目"); return; }
          const qs = src.map(q => ({
            q: q.q, options: (q.options || []).slice(),
            a: (q.a >= 0 && q.a < q.options.length) ? q.a : -1,
            e: q.e || "", tag: (book && book.name) || "文件导入"
          }));
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

      /* ===== 我的题册 + 文件夹（按学科整理，长按拖动，跟电脑整理文件一样） ===== */
      let _ftDrag = null; // 移动端长按拖动的临时状态
      function itemsInFolder(subj, folderId) {
        const DB = db();
        const books = (DB.state.pdfBooks || []).filter(b => subjShortName(b.subject) === subj && (b.folderId || null) === (folderId || null)).map(b => {
          const tq = (b.sections || []).reduce((a, s) => a + ((s.questions || []).length), 0);
          return { type: "book", id: b.id, title: b.name, sub: subjectLabel(b.subject) + " · " + ((b.sections || []).length) + " 块 / " + tq + " 题", date: b.date, ref: b };
        });
        const affairs = (DB.state.currentAffairs || []).filter(a => (a.folderId || null) === (folderId || null)).map(a => ({
          type: "affair", id: a.id, title: (a.title || a.date || "时政材料"), sub: "时政材料 · " + (a.date || ""), date: a.date, ref: a
        }));
        return books.concat(affairs);
      }
      function moveItem(type, id, folderId) {
        if (!type || !id || !folderId) return;
        const DB = db();
        if (type === "book") { const b = (DB.state.pdfBooks || []).find(x => x.id === id); if (b) { b.folderId = folderId; DB.save(); } }
        else if (type === "affair") { const a = (DB.state.currentAffairs || []).find(x => x.id === id); if (a) { a.folderId = folderId; DB.save(); } }
        UI.toast("已移动到文件夹");
        renderBooks();
      }
      function itemRow(it) {
        const row = UI.el(`<div class="ft-item" draggable="true" data-type="${esc(it.type)}" data-id="${esc(it.id)}">
          <span class="ft-ico">${it.type === "affair" ? "📰" : "📚"}</span>
          <span class="ft-name ft-open">${esc(it.title)}</span>
          <span class="ft-sub">${esc(it.sub || "")}</span>
          ${it.type === "book"
            ? `<button class="btn xs ft-act" data-act="ren">✏️</button><button class="btn xs ghost ft-act" data-act="del">🗑</button>`
            : `<button class="btn xs ft-act" data-act="open">查看</button>`}
          <div class="ft-sec" style="display:none"></div>
        </div>`);
        if (it.type === "book") {
          row.querySelector('[data-act="ren"]').onclick = (e) => { e.stopPropagation(); openRename(it.ref); };
          row.querySelector('[data-act="del"]').onclick = async (e) => {
            e.stopPropagation();
            if (await UI.confirm(`确定删除题册「${it.title}」？`)) { window.KGPdfBooks.remove(it.id); UI.toast("已删除题册"); renderBooks(); }
          };
          row.querySelector(".ft-open").onclick = () => toggleExpand(row, it);
        } else {
          row.querySelector('[data-act="open"]').onclick = (e) => { e.stopPropagation(); location.hash = "#/current"; };
        }
        wireDrag(row, it);
        return row;
      }
      function toggleExpand(row, it) {
        const sec = row.querySelector(".ft-sec");
        if (sec.style.display === "none") {
          sec.style.display = "block"; sec.innerHTML = "";
          (it.ref.sections || []).forEach((s, si) => {
            const det = UI.section(`§ ${s.name || ("第" + (si + 1) + "块")} · ${(s.questions || []).length} 题${(s.theory && String(s.theory).trim()) ? " · 有考点" : ""}`);
            sec.appendChild(det);
            renderSectionBody(det.querySelector(".kg-det-b"), it.ref, si, false);
          });
        } else { sec.style.display = "none"; sec.innerHTML = ""; }
      }
      function wireDrag(el, it) {
        el.draggable = true;
        el.addEventListener("dragstart", e => {
          e.dataTransfer.setData("text/plain", JSON.stringify({ type: it.type, id: it.id }));
          e.dataTransfer.effectAllowed = "move";
        });
        let timer = null, sx = 0, sy = 0;
        el.addEventListener("touchstart", e => {
          const t = e.touches[0]; sx = t.clientX; sy = t.clientY;
          timer = setTimeout(() => startTouchDrag(it, el, t), 450);
        }, { passive: true });
        el.addEventListener("touchmove", e => {
          const t = e.touches[0];
          if (Math.abs(t.clientX - sx) > 8 || Math.abs(t.clientY - sy) > 8) clearTimeout(timer);
          if (_ftDrag) { e.preventDefault(); moveTouchDrag(t.clientX, t.clientY); }
        }, { passive: false });
        el.addEventListener("touchend", () => { clearTimeout(timer); if (_ftDrag) endTouchDrag(); });
        el.addEventListener("touchcancel", () => { clearTimeout(timer); if (_ftDrag) endTouchDrag(); });
      }
      function startTouchDrag(it, el, t) {
        _ftDrag = { type: it.type, id: it.id };
        const g = el.cloneNode(true);
        g.style.position = "fixed"; g.style.zIndex = 9999; g.style.pointerEvents = "none";
        g.style.opacity = "0.9"; g.style.width = el.offsetWidth + "px"; g.style.boxShadow = "0 4px 12px rgba(0,0,0,.3)";
        g.id = "ftGhost"; document.body.appendChild(g);
        moveTouchDrag(t.clientX, t.clientY);
        UI.toast("拖动到目标文件夹松手即可归类");
      }
      function moveTouchDrag(x, y) {
        const g = document.getElementById("ftGhost");
        if (g) { g.style.left = (x - 20) + "px"; g.style.top = (y - 16) + "px"; }
        document.querySelectorAll(".ft-node").forEach(n => n.classList.remove("ft-drop"));
        const tgt = document.elementFromPoint(x, y);
        const node = tgt && tgt.closest && tgt.closest(".ft-node");
        if (node) node.classList.add("ft-drop");
      }
      function endTouchDrag() {
        const g = document.getElementById("ftGhost");
        const d = _ftDrag; let tgtFid = null;
        if (g) {
          const r = g.getBoundingClientRect();
          const elp = document.elementFromPoint(r.left + 20, r.top + 16);
          const node = elp && elp.closest && elp.closest(".ft-node");
          if (node) tgtFid = node.getAttribute("data-fid");
          g.remove();
        }
        document.querySelectorAll(".ft-node").forEach(n => n.classList.remove("ft-drop"));
        _ftDrag = null;
        if (d && tgtFid) moveItem(d.type, d.id, tgtFid);
      }
      function wireDrop(el, folderId) {
        el.addEventListener("dragover", e => { e.preventDefault(); e.stopPropagation(); el.classList.add("ft-drop"); });
        el.addEventListener("dragleave", () => el.classList.remove("ft-drop"));
        el.addEventListener("drop", e => {
          e.preventDefault(); e.stopPropagation(); el.classList.remove("ft-drop");
          try { const d = JSON.parse(e.dataTransfer.getData("text/plain")); moveItem(d.type, d.id, folderId); } catch (err) {}
        });
      }
      function renderFolderNode(subj, folderId, depth) {
        const allFolders = window.KGFolders.list(subj);
        const folders = allFolders.filter(f => (f.parentId || null) === (folderId || null));
        const items = itemsInFolder(subj, folderId);
        const f = (folderId != null) ? allFolders.find(x => x.id === folderId) : null;
        const node = UI.el(`<div class="ft-node" data-fid="${esc(folderId || "")}" style="margin-left:${depth * 14}px">
          <div class="ft-folder" data-fid="${esc(folderId || "")}">
            <span class="ft-ico">📁</span>
            <span class="ft-name">${esc(f ? f.name : "默认文件夹")}</span>
            <span class="ft-count">${items.length} 项</span>
            ${f && f.root ? `<button class="btn xs ft-act" data-act="add">➕ 子文件夹</button>` : (folderId ? `<button class="btn xs ft-act" data-act="add">➕</button><button class="btn xs ft-act" data-act="ren">✏️</button><button class="btn xs ghost ft-act" data-act="del">🗑</button>` : `<button class="btn xs ft-act" data-act="add">➕ 子文件夹</button>`)}
          </div>
          <div class="ft-items"></div>
        </div>`);
        const listWrap = node.querySelector(".ft-items");
        items.forEach(it => listWrap.appendChild(itemRow(it)));
        folders.forEach(ch => node.appendChild(renderFolderNode(subj, ch.id, depth + 1)));
        const fEl = node.querySelector(".ft-folder");
        fEl.querySelector('[data-act="add"]').onclick = () => {
          const nm = window.prompt ? prompt("新建子文件夹名称：", "新建文件夹") : "";
          if (nm) { window.KGFolders.add({ subject: subj, name: nm, parentId: folderId || null }); renderBooks(); }
        };
        if (folderId) {
          const renBtn = fEl.querySelector('[data-act="ren"]');
          const delBtn = fEl.querySelector('[data-act="del"]');
          if (renBtn) renBtn.onclick = () => {
            const nm = window.prompt ? prompt("重命名文件夹：", f ? f.name : "") : "";
            if (nm) { window.KGFolders.rename(folderId, nm); renderBooks(); }
          };
          if (delBtn) delBtn.onclick = async () => {
            if (await UI.confirm(`确定删除文件夹「${f ? f.name : ""}」？其内题目 / 材料会移回上一级。`)) { window.KGFolders.remove(folderId); renderBooks(); }
          };
          wireDrop(fEl, folderId);
        }
        return node;
      }
      function renderBooks() {
        const host = bookCard.querySelector("#bookHost");
        if (!host) return;
        try {
          host.innerHTML = "";
          window.KGFolders.migrate(); // 兼容老数据：归入学科根
          const FT_SUBJECTS = (window.KG_SUBJECTS || []).concat(["时政"]);
          const tabs = UI.el(`<div class="ft-tabs">${FT_SUBJECTS.map(s => `<button class="ft-tab${s === ftsSubject ? " active" : ""}" data-s="${esc(s)}">${esc(s)}</button>`).join("")}</div>`);
          host.appendChild(tabs);
          tabs.querySelectorAll(".ft-tab").forEach(b => b.onclick = () => { ftsSubject = b.dataset.s; renderBooks(); });
          const subj = subjShortName(ftsSubject);
          const rootId = window.KGFolders.rootId(subj);
          const tree = UI.el(`<div class="ft-tree"></div>`);
          host.appendChild(tree);
          tree.appendChild(renderFolderNode(subj, rootId, 0));
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
                  if (raw) { raw.name = v || suggestName(bk.subject); raw.named = !!v; db().save(); }
                  c(); UI.toast("已重命名为：" + (raw ? raw.name : "")); renderBooks();
                }
              }
            ]
          });
        } catch (e) { UI.toast("重命名失败：" + e.message); }
      }

      function renderCustom() {
        const list = customCard.querySelector("#customList");
        if (!list) return;
        try {
          const store = getCustomQuestions();
          const keys = Object.keys(store).filter(k => store[k] && store[k].length);
          if (!keys.length) { list.innerHTML = `<div class="empty">暂无自定义题目，先导入一份文件。</div>`; return; }
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
          const qs = items.map(it => ({ q: it.q, options: (it.options || []).slice(), a: it.a | 0, e: it.e || "", tag: "文件导入" }));
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
