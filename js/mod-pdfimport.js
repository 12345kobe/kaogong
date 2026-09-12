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

  const SUBJECTS = window.KG_SUBJECTS || ["言语理解", "资料分析", "数量关系", "逻辑判断", "常识判断", "政治理论", "申论"];
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
  function parseAnswers(text) {
    const ansMap = {};
    const lines = plainLines(text).filter(s => s && s.trim());
    // 第一遍：严格只匹配字母答案（单选/多选），避免把题干当文本答案
    const pairRe = /(\d{1,4})\s*[\.．、，,)）]?\s*[：:]?\s*([A-Ea-e]{1,6}(?:\s*[，,、]\s*[A-Ea-e]){0,5})(?=[\s,，.。;；]|$)/g;

    lines.forEach(raw => {
      // 1-5 ABCDE 连续题号答案
      let m = /^\s*(\d{1,4})\s*[-~—－]\s*(\d{1,4})\s*[：:．.、]?\s*(.{2,80})\s*$/.exec(raw);
      if (m) {
        const from = parseInt(m[1], 10), to = parseInt(m[2], 10);
        const letters = String(m[3]).replace(/[\s\u3000,，、；;．.。]/g, "").toUpperCase();
        let pos = 0;
        for (let n = from; n <= to && pos < letters.length; n++, pos++) {
          const L = letters[pos];
          if (/^[A-E]$/.test(L)) applyAns(n, L, "");
        }
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
      if (!wholeOne && pairs.length < 2) return; // 单行只有一个且不是整行 → 可能是题干里的"1. xxx"
      pairs.forEach(([n, val]) => applyAns(n, val, ""));
    });

    // 第二遍：按行识别「1. B」/「1. 普惠、创新、协同」这种独立答案行
    let curNum = null;
    lines.forEach(raw => {
      const m = /^\s*(\d{1,4})\s*[\.．、，,)）]\s*(.*)$/.exec(raw);
      if (m) {
        curNum = parseInt(m[1], 10);
        const rest = String(m[2] || "").trim();
        // 字母答案：B / AB / B,C
        const am = /^\s*([A-Ea-e]{1,6}(?:\s*[，,、]\s*[A-Ea-e]){0,5})\s*[】\]）)]?\s*(.*)$/.exec(rest);
        if (am) { applyAns(curNum, am[1], ""); collectTail(curNum, am[2]); return; }
        // 文本答案：很短、不含题干标志、不以选项字母开头
        if (/^[^A-Za-z0-9\s]/.test(rest) || (rest.length <= 30 && !/[A-Ea-e]\s*[\.．、]/.test(rest) && /[\u4e00-\u9fa5]/.test(rest))) {
          // 排除明显的题干
          if (!/^下列|^正确|^错误|^符合|^属于|^的是|^关于|^根据|^以下|^哪项|^哪一|^这题|^此题/.test(rest)) {
            applyAns(curNum, rest, ""); return;
          }
        }
        curNum = null; return;
      }
      if (curNum != null && ansMap[curNum] && raw.length > 4) collectTail(curNum, raw);
    });

    function applyAns(n, val, tail) {
      if (!n || !val) return;
      val = String(val).trim().replace(/^[【\[（(]/, "").replace(/[】\]）)]$/, "").trim();
      if (!val) return;
      const upper = val.toUpperCase().replace(/\s*[，,、]\s*/g, "").replace(/\s+/g, "");
      if (/^[A-E]{1,6}$/.test(upper)) {
        const obj = ansMap[n] || (ansMap[n] = { a: upper.charCodeAt(0) - 65, e: "" });
        obj.a = upper.charCodeAt(0) - 65;
        if (upper.length > 1) obj.multi = upper;
        return;
      }
      // 文本型答案（填空题）
      const obj = ansMap[n] || (ansMap[n] = { a: -1, e: "" });
      obj.textAns = (obj.textAns ? obj.textAns + "；" : "") + val;
      obj.a = -1;
    }
    function collectTail(n, tail) {
      tail = String(tail || "").replace(/^[：:．.、，。]\s*/, "").replace(/^(?:解析|答案解析|【解析】|答案)\s*[：:]?\s*/, "").trim();
      if (/^\d{1,4}\s*[\.．、，,)）]/.test(tail)) return;
      if (!tail) return;
      const obj = ansMap[n]; if (!obj) return;
      obj.e = obj.e ? smartJoin(obj.e, tail) : tail;
    }
    return ansMap;
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
  function splitChapters(pages, outline) {
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
    const uniq = [];
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i], last = uniq[uniq.length - 1];
      if (!last) { uniq.push(m); continue; }
      if (last.name === m.name) { last.page = Math.max(last.page, m.page); continue; }
      if (last.page === m.page) {
        if (STRONG_HEAD.test(m.name) && !STRONG_HEAD.test(last.name)) last.name = m.name;
        continue;
      }
      uniq.push(m);
    }
    const chapters = [];
    if (!uniq.length) {
      chapters.push({ name: "全部题目", text: pages.join("\n") });
    } else {
      uniq.forEach((m, i) => {
        const end = (i + 1 < uniq.length) ? uniq[i + 1].page : pages.length;
        const text = pages.slice(m.page, Math.max(end, m.page + 1)).join("\n");
        if (String(text).replace(/\s/g, "").length < 20) return;
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

  /* 节（供其它模块直接渲染）：{ name, theory(HTML), questions:[{q,options,a,e,kp}] } */
  function buildSections(pages, outline, extraAns) {
    const secs = [];
    const docAns = {};           // 纯答案附录章收集到的答案（全局 fallback）
    let totalQ = 0;

    splitChapters(pages, outline).forEach(ch => {
      try {
        const lines = plainLines(ch.text);
        if (!lines.length) return;
        let body = lines;
        if (isHeading(lines[0], {})) body = lines.slice(1);   // 去掉章标题本身

        // ① 本章自带的答案附录（1.A / 1-5 ABCDE / 参考答案段）
        const chAns = parseAnswers(body.join("\n"));
        // parseQuestions 已能识别同题号重复出现的答案/解析行，故不再预剥离；
        // 若某章纯为答案速查（无题干），splitKpBlocks 会把它归到 qtext，parseQuestions 因无选项而自然过滤掉。
        const kpInfo = splitKpBlocks(body);
        const hasQ = kpInfo.blocks.some(b => b.qtext.length);
        if (!hasQ && Object.keys(chAns).length >= 3) {
          for (const k in chAns) docAns[k] = chAns[k];
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
        // 本章答案没用完的，留作全局 fallback
        const usedNums = new Set();
        chapterSecs.forEach(s => (s.questions || []).forEach(q => { if (q.a >= 0) usedNums.add(q.num); }));
        for (const k in chAns) if (!usedNums.has(+k) && docAns[k] == null) docAns[k] = chAns[k];

        secs.push(...chapterSecs);
      } catch (e) {
        // 单章失败不影响整本
      }
    });

    // ⑤ 全局 fallback：纯答案附录章 + 额外的答案文件 → 回填仍未识别的题
    const fallback = Object.assign({}, docAns, extraAns || {});
    if (Object.keys(fallback).length) applyAnswerMap(secs, fallback);

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
  window.__pdfTheoryToHtml = theoryToHtml;
  window.__pdfBuildSections = buildSections;
  window.__sanitizeText = sanitizeText;

  /* ================= 八、界面 ================= */

  window.MODULES.pdfimport = {
    title: "PDF 题库", icon: "pdf",
    render(body) {
      const DB = db(), UI = window.UI;
      body.innerHTML = "";
      const root = UI.el(`<div class="pdf-import"></div>`);
      body.appendChild(root);

      let draft = null;
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
      root.appendChild(card);

      const bookCard = UI.el(`<div class="card" style="margin-top:12px">
        <h3>📚 我的题册（可在各模块「我导入的题册」使用）</h3>
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
          let answerMap = {};
          const af = aIn.files && aIn.files[0];
          if (af) {
            try {
              const ar = await fileToPages(af);
              answerMap = parseAnswers(sanitizeText((ar.pages || []).join("\n")));
              aNote = `，从答案文件解析出 ${Object.keys(answerMap).length} 条答案`;
            } catch (e) { aNote = `，答案文件解析失败：${esc(e.message)}`; }
          }
          if (String(qText).replace(/\s/g, "").length < 40) {
            setStatus(`<span style="color:var(--red)">⚠️ 提取到的文字极少，这份文件很可能是<b>扫描件/图片型</b>。请改用文字版。</span>`);
            goBtn.disabled = false;
            return;
          }
          buildDraft(pages, r.outline, answerMap);
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
          buildDraft([sanitizeText(rawTa.value || "")], null, {});
          const stat = countStat(draft);
          setStatus(`识别到 <b>${draft.sections.length}</b> 个考点块 / <b>${stat.q}</b> 道题${stat.bad ? `（<b style="color:var(--red)">${stat.bad}</b> 题答案待校对）` : ""}，请核对后保存。`);
        } catch (e) { setStatus(`<span style="color:var(--red)">识别失败：${esc(e.message)}</span>`); }
      };

      function countStat(d) {
        let q = 0, bad = 0;
        ((d && d.sections) || []).forEach(s => (s.questions || []).forEach(x => {
          q++;
          if (!(x.a >= 0 && x.a < x.options.length)) bad++;
        }));
        return { q: q, bad: bad };
      }

      function buildDraft(pages, outline, answerMap) {
        let secs = buildSections(pages && pages.length ? pages : [""], outline, answerMap);
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
                sections: draft.sections.map(s => ({ name: s.name, theory: s.theory || "", questions: (s.questions || []).slice() }))
              });
              let n = 0;
              if (head.querySelector("#dToCustom").checked) {
                n = saveToCustom(draft.subject, draft.sections.reduce((a, s) => a.concat(s.questions || []), []));
              }
              UI.toast(`已保存题册「${name}」${n ? "，并存入自定义题库 " + n + " 题" : ""}`);
              draft = null; host.innerHTML = "";
              renderBooks(); renderCustom();
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
            const ans = (q.a >= 0 && q.a < q.options.length)
              ? `<b style="color:var(--green)">${A(q.a)}</b>`
              : `<b style="color:var(--red)">待校对</b>`;
            return `<div class="pdf-q" style="margin-bottom:8px">
              <div><b>${n}.</b> ${esc(q.q)}${q.kp ? `<span class="tag" style="margin-left:6px">${esc(q.kp)}</span>` : ""}</div>
              ${opts}
              <div class="muted small" style="margin-top:4px">答案：${ans}${q.e ? " · " + esc(String(q.e).slice(0, 60)) : ""}</div>
            </div>`;
          }).join("");
          box.appendChild(UI.el(`<div style="margin-top:8px">${listHtml}</div>`));

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

      /* ===== 我的题册 ===== */
      function renderBooks() {
        const host = bookCard.querySelector("#bookHost");
        if (!host) return;
        try {
          host.innerHTML = "";
          const books = window.KGPdfBooks.all();
          if (!books.length) { host.innerHTML = `<div class="empty">还没有题册，导入一份文件试试。</div>`; return; }
          books.forEach(bk => {
            const tq = (bk.sections || []).reduce((a, s) => a + ((s.questions || []).length), 0);
            const det = UI.section(`📚 ${bk.name} · ${subjectLabel(bk.subject)} · ${(bk.sections || []).length} 块 / ${tq} 题`);
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
            bar.querySelector('[data-a="tocustom"]').onclick = () => {
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
                const sub = UI.section(`§ ${s.name || ("第" + (si + 1) + "块")} · ${(s.questions || []).length} 题${(s.theory && String(s.theory).trim()) ? " · 有考点" : ""}`);
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
