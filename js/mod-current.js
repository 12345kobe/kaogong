/* 模块：时政（每日时政 / 申论时评金句 / 时政词语 / 原创言语真题 / 原创时政单选）
   支持把「定制格式」的纯文字直接粘贴识别 → 存 DB.state.currentAffairs → 页面自动跳到本模块。
   资料可查看、可练题（做错的进「时政」错题本）、可导出 PDF（全部 / 错题）。 */
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};
  const DB = window.DB;
  const SUBJECT = "时政";

  // 公考「考点 / 重要表述」高亮词典（时事热点详情里重点词突出显示）
  const HOTSPOTS_KW = ["高质量发展", "新质生产力", "百县千镇万村", "百千万工程", "粤港澳大湾区", "中国式现代化",
    "全过程人民民主", "全面从严治党", "共同富裕", "乡村振兴", "科技创新", "营商环境", "双碳",
    "碳达峰", "碳中和", "供给侧结构性改革", "扩大内需", "区域协调发展", "制造强国", "教育强国",
    "人才强国", "文化强国", "美丽中国", "国家安全", "新发展格局", "高水平开放", "实体经济",
    "专精特新", "数字中国", "健康中国", "就业优先", "依法行政", "一国两制", "广东", "深圳",
    "广州", "珠海", "佛山", "东莞", "汕头", "省考", "国考", "宏观调控",
    // 高频政治术语（申论/行测常考重点表述）
    "关键一招", "国之大者", "两个确立", "两个维护", "四个意识", "四个自信", "四个全面", "五位一体",
    "新发展理念", "以人民为中心", "人民至上", "人类命运共同体", "一带一路", "全球发展倡议",
    "高水平科技自立自强", "现代化产业体系", "农业强国", "海洋强国", "交通强国", "网络强国",
    "体育强国", "贸易强国", "社会主义文化", "社会主义核心价值观",
    "全面深化改革", "全面依法治国", "自我革命", "改革开放精神", "脱贫攻坚",
    "民生福祉", "稳中求进", "强国建设", "民族复兴", "中国之治", "中国之问",
    "时代之问", "人民之问", "第二个百年", "中国精神", "中国力量", "中国方案",
    "人工智能+", "低空经济", "银发经济", "县域经济", "民营经济", "数字经济", "绿色低碳",
    "自由贸易试验区", "海南自由贸易港", "横琴", "前海", "南沙", "河套"];
  // 时政正文里要剔除的「页脚垃圾」行（政府网站模板尾巴）
  const FOOTER_RE = /(主办单位|运行维护单位|网站标识码|ICP备|京公网安备|版权所有|备案号|网站地图|承办单位|技术支持|访问统计|单位地址|邮政编码)/;
  function stripFooterLines(t) {
    return String(t || "").split("\n").filter(l => {
      const s = l.trim();
      if (!s) return true;
      // 页脚特征行且较短（长正文里偶尔出现这些词则保留）
      return !(FOOTER_RE.test(s) && s.length <= 80);
    }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function store() {
    if (!Array.isArray(DB.state.currentAffairs)) DB.state.currentAffairs = [];
    return DB.state.currentAffairs;
  }

  /* ================= 时政记录云端同步（社交后端，像聊天那样跨设备 / 多端一致） ================= */
  let _hsSyncTimer = null, _hsSyncing = false, _hsPulling = false;
  let refreshCurrentViews = function () {};
  function hsLoggedIn() { return !!(window.Social && Social.isConfigured && Social.isConfigured() && Social.isLoggedIn && Social.isLoggedIn()); }
  function setHsSyncStatus(kind, msg) {
    const el = document.getElementById("hsSyncStat");
    if (!el) return;
    if (kind === "ok") { el.textContent = "☁ 已同步"; el.className = "hs-sync ok"; }
    else if (kind === "err") { el.textContent = "☁ 同步失败"; el.className = "hs-sync err"; }
    else if (kind === "syncing") { el.textContent = "☁ 同步中…"; el.className = "hs-sync"; }
    else if (kind === "off") { el.textContent = msg || "未登录社交账号（仅本机）"; el.className = "hs-sync off"; }
  }
  // 把服务端数据合并进本地（id 并集，冲突取较新 createdAt）
  function mergeHotspotsFromServer(server) {
    if (!server) return false;
    let changed = false;
    const ca = Array.isArray(DB.state.currentAffairs) ? DB.state.currentAffairs : (DB.state.currentAffairs = []);
    const byId = {}; ca.forEach(r => { if (r && r.id) byId[r.id] = r; });
    (server.currentAffairs || []).forEach(r => {
      if (!r || !r.id) return;
      const ex = byId[r.id];
      if (!ex) { ca.push(r); byId[r.id] = r; changed = true; }
      else if ((r.createdAt || 0) > (ex.createdAt || 0)) { const i = ca.indexOf(ex); if (i >= 0) { ca[i] = r; changed = true; } }
    });
    const imp = Array.isArray(DB.state.hotspotsImports) ? DB.state.hotspotsImports : (DB.state.hotspotsImports = []);
    const ib = {}; imp.forEach(x => { if (x && x.id) ib[x.id] = x; });
    (server.hotspotsImports || []).forEach(x => {
      if (!x || !x.id || ib[x.id]) return;
      imp.push(x); ib[x.id] = x; changed = true;
    });
    return changed;
  }
  async function pushHotspots() {
    if (!hsLoggedIn() || _hsSyncing) return false;
    _hsSyncing = true; setHsSyncStatus("syncing");
    try {
      const j = await Social.saveHotspots({
        currentAffairs: DB.state.currentAffairs || [],
        hotspotsImports: DB.state.hotspotsImports || []
      });
      if (j && (Array.isArray(j.currentAffairs) || Array.isArray(j.hotspotsImports))) {
        if (mergeHotspotsFromServer(j)) DB.save();
      }
      setHsSyncStatus("ok");
      return true;
    } catch (e) { setHsSyncStatus("err"); return false; }
    finally { _hsSyncing = false; }
  }
  function scheduleSyncHotspots() {
    if (!hsLoggedIn()) { setHsSyncStatus("off"); return; }
    if (_hsSyncTimer) clearTimeout(_hsSyncTimer);
    _hsSyncTimer = setTimeout(() => { pushHotspots().then(() => { try { refreshCurrentViews(); } catch (e) {} }); }, 900);
  }
  async function pullHotspots() {
    if (!hsLoggedIn()) { setHsSyncStatus("off"); return false; }
    if (_hsPulling) return false;
    _hsPulling = true; setHsSyncStatus("syncing");
    try {
      const j = await Social.getHotspots();
      if (mergeHotspotsFromServer(j)) DB.save();
      setHsSyncStatus("ok");
      return true;
    } catch (e) { setHsSyncStatus("err"); return false; }
    finally { _hsPulling = false; }
  }
  window.syncHotspots = function () { return pullHotspots(); };

  /* ================= 一、解析「定制格式」的文字 ================= */

  const CN_NUM = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10 };

  function clean(s) {
    return String(s == null ? "" : s).replace(/\u2002|\u3000|\u0001/g, " ").replace(/\s+/g, " ").trim();
  }
  function stripStar(s) {
    return clean(s).replace(/^[⭐★✦✩\s]+/, "").trim();
  }
  /* 把一行里的多个选项（A.x  B.y  C.z  D.w）拆开 */
  function splitOptions(line) {
    const text = clean(line);
    const re = /([A-D])\s*[.．、]\s*/g;
    const idx = [];
    let m;
    while ((m = re.exec(text)) !== null) idx.push({ start: m.index, end: re.lastIndex });
    if (!idx.length) return [];
    const parts = [];
    idx.forEach((it, i) => {
      const end = i + 1 < idx.length ? idx[i + 1].start : text.length;
      parts.push(clean(text.slice(it.end, end)));
    });
    return parts.filter(Boolean);
  }

  /* ===== 答案尾巴扫描（v20261004a）=====
     从「答案标记」之后取选项字母序列 + 剩余解析：
     - 支持 ABC / A、B、C / A,B,C / A B C / 全角ＡＢＣ → 多选题；
     - 正确处理「【答案】 ABD C错误，严禁…」这种「答案 + 空格 + 以选项字母开头的解析」：
       答案到 ABD 为止，"C错误…" 归入解析（旧逻辑会把 C 误并进答案或整段当文字答案）。 */
  function scanAnsTail(t) {
    let s = String(t || "").trim();
    let letters = "", explain = "", i = 0, got = 0;
    const fw = c => String.fromCharCode(c.charCodeAt(0) - 65248);
    const norm = c => /[Ａ-Ｅ]/.test(c) ? fw(c) : c;
    while (i < s.length && got < 6) {
      const ch = norm(s[i]);
      if (/[A-E]/.test(ch)) {
        let j = i, run = "";
        while (j < s.length) {
          const c2 = norm(s[j]);
          if (/[A-E]/.test(c2)) { run += c2; j++; } else break;
        }
        const after = s[j] || "";
        // 已有答案、紧跟的字母后面直接是中文（如 "C错误"）→ 那是解析开头，不是答案
        if (got > 0 && /[\u4e00-\u9fa5]/.test(after)) { explain = s.slice(i); break; }
        letters += run; got += run.length; i = j;
        const m = /^\s*[，,、；;]?\s*/.exec(s.slice(i)); i += m[0].length;
        if (!s[i]) break;
        if (/[\u4e00-\u9fa5]/.test(s[i])) { explain = s.slice(i); break; }
        if (/[。．.]/.test(s[i])) { explain = s.slice(i).replace(/^[。．.\s]+/, ""); break; }
      } else if (/[\s\u3000，,、；;]/.test(ch)) { i++; }
      else if (/[（(【\[]/.test(ch)) { i++; }
      else if (/[）)】\]]/.test(ch)) { i++; }
      else if (/[。．.]/.test(ch)) { explain = s.slice(i).replace(/^[。．.\s]+/, ""); break; }
      else { explain = s.slice(i); break; }
    }
    explain = (explain || "").trim()
      .replace(/^[（(]\s*多选\s*[)）]\s*/, "")
      .replace(/^多选\s*[）)]?\s*[:：]?\s*/, "");
    return { letters: letters, explain: explain };
  }
  window.KGScanAnsTail = scanAnsTail;

  function parseQuestions(lines, kp) {
    /* lines：已按行切好；返回 [{q,options,a,e,type}] */
    const out = [];
    let i = 0;
    const qRe = /^(\d{1,4})\s*[.．、]\s*(.+)$/;
    while (i < lines.length) {
      const s = clean(lines[i]);
      const m = qRe.exec(s);
      if (!m) { i++; continue; }
      // 词语释义行（含「（两字）：」这种）不算题
      if (/^[^（(]{1,12}[（(][两四]字[）)]\s*[：:]/.test(s)) { i++; continue; }
      const num = parseInt(m[1], 10);
      let stem = m[2].trim();
      // 跳过「第一部分」等标题行
      if (/^部分|^时政汇总|^申论/.test(stem)) { i++; continue; }
      const opts = [];
      let a = -1, e = "", type = "";
      const ty = /[（(]\s*(双空|单空[^）)]*)\s*[）)]\s*$/.exec(stem);
      if (ty) { type = ty[1]; stem = stem.replace(ty[0], "").trim(); }
      // 题干可能续行（到选项行/答案行为止）
      i++;
      while (i < lines.length) {
        const t = clean(lines[i]);
        if (!t) { i++; continue; }
        if (/^[A-D][.．、]/.test(t)) break;
        if (/^【答案】|^【解析】|^(?:正确答案|答案|解析|【答案解析】)\s*[:：]/.test(t)) break;
        if (qRe.test(t) && opts.length === 0) {
          // 下一题开始了，说明本题没有选项（极少见）→ 结束
          break;
        }
        stem += t;
        i++;
      }
      // 选项行（可能 1 行或 4 行）
      while (i < lines.length) {
        const t = clean(lines[i]);
        if (!t) { i++; continue; }
        if (/^[A-D][.．、]/.test(t)) {
          const parsed = splitOptions(t);
          parsed.forEach(p => opts.push(p));
          i++;
          // 若这一行只解析出 1 个选项，说明选项分行了，继续读下一行
          if (parsed.length > 1) break;
          continue;
        }
        break;
      }
      // 答案 / 解析
      while (i < lines.length) {
        const t = clean(lines[i]);
        if (!t) { i++; continue; }
        // 答案支持多种写法：
        //   【答案】A / 【答案】：A / 答案：A / 正确答案：B / 正确选项：C
        //   【答案】ABD（多选）—— 字母序列（含 A、B、C / A B C 等分隔写法）→ 多选
        //   【答案】 ABD C错误，严禁… —— 答案 + 空格 + 以选项字母开头的解析
        //   也可用选项文字作答：如「【答案】普惠、创新、协同」
        //   兼容答案与解析同行：如「【答案】A【解析】官方表述」
        const ah = /^(?:【\s*答案\s*】|【?答案】?|正确答案|正确选项)\s*[:：]?\s*/.exec(t);
        if (ah) {
          const sc = scanAnsTail(t.slice(ah[0].length));
          if (sc.letters) {
            if (sc.letters.length > 1) { a = sc.letters; type = "multi"; }   // 多选：答案存字母串 "ABD"
            else a = sc.letters.charCodeAt(0) - 65;
            if (sc.explain) e = (e ? e + "　" : "") + sc.explain;
            i++; continue;
          }
          // 无字母 → 继续走下面的文字答案分支
          const am2 = /^(?:解析|【解析】|答案解析)\s*[:：]?\s*(.*)$/.exec(t.slice(ah[0].length));
          if (am2 && am2[1] && am2[1].trim()) { e = (e ? e + "　" : "") + am2[1].trim(); i++; continue; }
        }
        const tm = /^(?:【?答案】?|正确答案|正确选项)\s*[:：]?\s*(.+)$/.exec(t);
        // 判断题：答案写 √/×/对/错/正确/错误 且题目本身无选项 → 自动补「正确/错误」两项
        const jm = tm && !opts.length && /^(√|×|✓|✗|对|错|正确|错误)\s*$/.test(tm[1].trim());
        if (jm) {
          const v = tm[1].trim();
          opts.push("正确", "错误");
          a = /^(√|✓|对|正确)$/.test(v) ? 0 : 1;
          type = type || "判断";
          i++; continue;
        }
        if (tm) {
          const txt = tm[1].trim();
          const fi = opts.findIndex(o => o.replace(/\s+/g, "") === txt.replace(/\s+/g, ""));
          if (fi >= 0) a = fi;
          e = (e ? e + "　" : "") + "【答案】" + txt;
          i++; continue;
        }
        // 解析：支持「【解析】xxx」「解析：xxx」「【答案解析】xxx」等写法（豆包定稿格式为「解析：」无括号）
        const em = /^(?:【解析】|解析|【答案解析】|答案解析)\s*[:：]?\s*(.+)$/.exec(t);
        if (em) { e = (e ? e + "　" : "") + em[1]; i++; continue; }
        if (/^【.{1,10}】/.test(t)) { i++; continue; } // 【文段出处】等
        if (/^\d{1,4}\s*[.．、]/.test(t)) break;        // 下一题
        // 解析续行
        if (e && !/^[A-D][.．、]/.test(t)) { e += t; i++; continue; }
        break;
      }
      if (opts.length >= 2 && stem) {
        out.push({ q: stem, options: opts.slice(0, 6), a: a, e: e, type: type, num: num, kp: kp });
      }
      // 若上面 break 在“下一题”处，不 i++（让外层重新处理该行）
    }
    return out;
  }

  /* 主解析：把整段文字按「第X部分」切成四块 */
  function parseCurrentText(text) {
    const raw = String(text || "").replace(/\r\n?/g, "\n");
    const lines = raw.split("\n").map(l => clean(l));
    const res = { news: [], essay: { topic: "", paras: [], quotes: [] }, words: [], verbal: [], quiz: [], title: "", date: "" };

    // 找到各部分起止
    const idx = [];
    lines.forEach((l, i) => {
      const m = /^第\s*([一二三四五六七八九十\d]+)\s*部分/.exec(l);
      if (m) idx.push({ no: CN_NUM[m[1]] || parseInt(m[1], 10) || idx.length + 1, i: i, line: l });
    });
    function block(no, nextNo) {
      const a = idx.find(x => x.no === no);
      if (!a) return [];
      const b = idx.find(x => x.no === (nextNo || no + 1));
      const end = b ? b.i : lines.length;
      return lines.slice(a.i + 1, end);
    }

    // 标题 / 日期：从第一部分标题里抓「YYYY年M月D日」
    const headLine = (idx[0] && idx[0].line) || lines.find(l => /时政/.test(l)) || "";
    const dm = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(headLine) || /(\d{4})-(\d{2})-(\d{2})/.exec(headLine);
    if (dm) {
      const y = dm[1], mo = String(dm[2]).padStart(2, "0"), d = String(dm[3]).padStart(2, "0");
      res.date = y + "-" + mo + "-" + d;
    }

    /* ---- 第一部分：时政 ---- */
    let area = "国内时政";
    let cur = null;
    block(1).forEach(l => {
      if (!l) return;
      if (/^国内/.test(l) && l.length <= 8) { area = "国内时政"; return; }
      if (/^国际/.test(l) && l.length <= 8) { area = "国际时政"; return; }
      const star = (l.match(/[⭐★✦]/g) || []).length;
      const m = /^(\d{1,4})\s*[.．、]\s*(.+)$/.exec(stripStar(l));
      if (m) {
        if (cur) res.news.push(cur);
        cur = { area: area, star: star, title: stripStar(m[2]), body: "" };
        return;
      }
      if (cur) cur.body = cur.body ? cur.body + l : l;
    });
    if (cur) res.news.push(cur);

    /* ---- 第二部分：申论时评 + 金句 ---- */
    let mode = "";
    block(2).forEach(l => {
      if (!l) return;
      if (/主题/.test(l) && /时评|申论/.test(l)) {
        const m = /[：:]\s*(.+)$/.exec(l);
        if (m) res.essay.topic = clean(m[1]);
        mode = "topic";
        return;
      }
      if (/金句/.test(l)) { mode = "quote"; return; }
      if (/^申论时评|^申论标准时评/.test(l)) { mode = "topic"; return; }
      if (mode === "quote") {
        const m = /^(\d{1,3})\s*[.．、]\s*(.+)$/.exec(l);
        if (m) res.essay.quotes.push(clean(m[2]));
        else if (res.essay.quotes.length) res.essay.quotes[res.essay.quotes.length - 1] += l;
        return;
      }
      if (mode === "topic" && !res.essay.topic) { res.essay.topic = l; return; }
      // 正文段落
      if (!/^第[一二三四五六七八九十]+部分/.test(l)) res.essay.paras.push(l);
    });
    // 主题行若混在正文里
    if (!res.essay.topic) {
      const t = res.essay.paras.find(l => /主题/.test(l));
      if (t) { const m = /[：:]\s*(.+)$/.exec(t); if (m) res.essay.topic = clean(m[1]); }
    }

    /* ---- 第三部分：词语释义 + 言语真题 ---- */
    const b3 = block(3);
    let qStart3 = -1;
    b3.forEach((l, i) => {
      const m = /^(\d{1,3})\s*[.．、]\s*([^（(]{1,12})[（(]([两四]字)[）)]\s*[：:]\s*(.+)$/.exec(l);
      if (m) {
        res.words.push({ word: clean(m[2]), type: m[3], def: clean(m[4]) });
      } else if (qStart3 < 0 && /^(\d{1,3})\s*[.．、]/.test(l) && (/(双空|单空)/.test(l) || /_{2,}/.test(l) || /____/.test(l))) {
        qStart3 = i;
      }
    });
    if (qStart3 >= 0) res.verbal = parseQuestions(b3.slice(qStart3), "言语理解");

    /* ---- 第四部分：原创时政单选 ---- */
    const b4 = block(4);
    res.quiz = parseQuestions(b4, "时政单选");

    // 标题（默认「日期 + 时政」，保存后可在列表里改名）
    res.title = (res.date || DB.today()) + " 时政";
    return res;
  }

  /* ================= 二、存储 / 读写 ================= */
  function addRecord(data, date, title) {
    const rec = {
      id: DB.uid(), date: date || data.date || DB.today(),
      title: title || data.title || ((date || data.date || DB.today()) + " 时政"),
      createdAt: Date.now(), data: data
    };
    store().push(rec);
    DB.save();
    scheduleSyncHotspots();
    return rec;
  }
  function listRecords() {
    return store().slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));
  }
  function getRecord(id) { return store().find(r => r.id === id) || null; }
  function removeRecord(id) {
    const arr = store(); const i = arr.findIndex(r => r.id === id);
    if (i >= 0) {
      arr.splice(i, 1);
      // 清理申论素材中来自本条记录的金句
      DB.state.essay = DB.state.essay || {};
      DB.state.essay.userQuotes = (DB.state.essay.userQuotes || []).filter(q => q.source !== id);
      // 清理本条记录相关的笔记/附件
      try { delete (DB.state.notes["时政"] || {})["rec_" + id]; } catch (e) {}
      try { delete (DB.state.attachments["时政"] || {})["rec_" + id]; } catch (e) {}
      try { delete (DB.state.notes["申论"] || {})["essay_commentary_" + id]; } catch (e) {}
      try { delete (DB.state.attachments["申论"] || {})["essay_commentary_" + id]; } catch (e) {}
      DB.save(); scheduleSyncHotspots(); return true;
    }
    return false;
  }
  function setDate(id, date) { const r = getRecord(id); if (r) { r.date = date; r.createdAt = Date.now(); DB.save(); scheduleSyncHotspots(); } }
  function setTitle(id, title) {
    const r = getRecord(id); if (!r) return;
    const t = String(title == null ? "" : title).trim();
    r.title = t || (r.date || DB.today()) + " 时政";
    r.createdAt = Date.now(); DB.save(); scheduleSyncHotspots();
  }
  function allQuestions(rec) {
    if (!rec) return [];
    return []
      .concat((rec.data.verbal || []).map(q => Object.assign({}, q, { kp: q.kp || "言语理解" })))
      .concat((rec.data.quiz || []).map(q => Object.assign({}, q, { kp: q.kp || "时政单选" })))
      .filter(q => q.q && q.options && q.options.length >= 2);
  }

  /* ================= 三、富文本（导出 / 查看） ================= */
  function starHtml(n) { return "⭐".repeat(Math.max(1, n || 1)); }
  function esc(s) { return (window.UI && UI.esc) ? UI.esc(s) : String(s == null ? "" : s); }

  function recordHtml(rec, withAnswer) {
    const d = rec.data || {};
    let h = "";
    h += `<h2>${esc(rec.title || "时政复习")}　<span style="font-size:14px;color:#666">${esc(rec.date || "")}</span></h2>`;
    // 一、时政
    if ((d.news || []).length) {
      h += `<h3>一、时政汇总</h3>`;
      let area = "";
      d.news.forEach(n => {
        if (n.area && n.area !== area) { area = n.area; h += `<h4>${esc(area)}</h4>`; }
        h += `<p><b>${starHtml(n.star)}${esc(n.title)}</b><br/>${esc(n.body)}</p>`;
      });
    }
    // 二、申论时评 + 金句
    if ((d.essay && (d.essay.topic || (d.essay.paras || []).length || (d.essay.quotes || []).length))) {
      h += `<h3>二、申论时评 + 必背金句</h3>`;
      if (d.essay.topic) h += `<p><b>主题：${esc(d.essay.topic)}</b></p>`;
      (d.essay.paras || []).forEach(p => { h += `<p>${esc(p)}</p>`; });
      if ((d.essay.quotes || []).length) {
        h += `<p><b>必背金句</b></p><ol>`;
        d.essay.quotes.forEach(q => { h += `<li>${esc(q)}</li>`; });
        h += `</ol>`;
      }
    }
    // 三、词语释义
    if ((d.words || []).length) {
      h += `<h3>三、时政专属词语释义</h3><ol>`;
      d.words.forEach(w => { h += `<li><b>${esc(w.word)}</b>（${esc(w.type)}）：${esc(w.def)}</li>`; });
      h += `</ol>`;
    }
    // 四、言语真题 + 时政单选
    const qs = allQuestions(rec);
    if (qs.length) {
      h += `<h3>四、题目${withAnswer ? "（含答案·解析）" : ""}</h3>`;
      qs.forEach((q, i) => {
        h += `<p><b>${i + 1}. ${esc(q.q)}</b><br/>`;
        q.options.forEach((o, oi) => {
          const L = String.fromCharCode(65 + oi);
          const right = withAnswer && q.a === oi;
          h += `${right ? "<b><u>" : ""}${L}. ${esc(o)}${right ? "</u></b>" : ""}　`;
        });
        h += `</p>`;
        if (withAnswer) {
          const ans = (typeof q.a === "string" && q.a) ? q.a : ((q.a >= 0) ? String.fromCharCode(65 + q.a) : "—");
          h += `<p style="color:#0a7">【答案】${ans}${/^[A-E]{2,}$/.test(String(q.a)) ? "（多选）" : ""}${q.e ? "　" + esc(q.e) : ""}</p>`;
        }
      });
    }
    return h;
  }

  /* ================= 四、导入入口（供 PDF 导入模块调用） ================= */
  function importText(text, date, title) {
    const data = parseCurrentText(text);
    const hasAny = data.news.length || (data.essay.paras || []).length || data.words.length || data.verbal.length || data.quiz.length;
    if (!hasAny) throw new Error("没有识别到可用的时政内容（需要含「第X部分」或 ⭐ 时政条目）");
    const rec = addRecord(data, date || data.date, title);
    // 把「必背金句」追加到申论大作文素材，避免重复
    const eq = data.essay || {};
    if ((eq.quotes || []).length) {
      DB.state.essay = DB.state.essay || {};
      DB.state.essay.userQuotes = DB.state.essay.userQuotes || [];
      const existing = new Set(DB.state.essay.userQuotes.map(q => (q.date || "") + "|" + q.t));
      eq.quotes.forEach(q => {
        const key = (rec.date || "") + "|" + q;
        if (!existing.has(key)) {
          DB.state.essay.userQuotes.push({ t: q, theme: eq.topic || "时政", date: rec.date, source: rec.id });
          existing.add(key);
        }
      });
      DB.save();
    }
    return rec;
  }

  /* AI 结构化解析后直接入库：data 已符合 {news,essay,words,verbal,quiz} 结构，跳过容易失败的文本规则解析 */
  function importData(data, date, title) {
    data = data || {};
    data.news = Array.isArray(data.news) ? data.news : [];
    data.essay = Object.assign({ topic: "", paras: [], quotes: [] }, data.essay || {});
    data.words = Array.isArray(data.words) ? data.words : [];
    data.verbal = Array.isArray(data.verbal) ? data.verbal : [];
    data.quiz = Array.isArray(data.quiz) ? data.quiz : [];
    const hasAny = data.news.length || (data.essay.paras || []).length || data.words.length || data.verbal.length || data.quiz.length;
    if (!hasAny) throw new Error("AI 未解析出可用的时政内容");
    const rec = addRecord(data, date || data.date || DB.today(), title);
    const eq = data.essay || {};
    if ((eq.quotes || []).length) {
      DB.state.essay = DB.state.essay || {};
      DB.state.essay.userQuotes = DB.state.essay.userQuotes || [];
      const existing = new Set(DB.state.essay.userQuotes.map(q => (q.date || "") + "|" + q.t));
      eq.quotes.forEach(q => {
        const key = (rec.date || "") + "|" + q;
        if (!existing.has(key)) {
          DB.state.essay.userQuotes.push({ t: q, theme: eq.topic || "时政", date: rec.date, source: rec.id });
          existing.add(key);
        }
      });
      DB.save();
    }
    return rec;
  }

  /* ================= 五、模块 UI ================= */
  window.KGCurrent = {
    parse: parseCurrentText, importText, importData, list: listRecords, get: getRecord,
    remove: removeRecord, setDate: setDate, setTitle: setTitle, allQuestions: allQuestions,
    parseQuestions: parseQuestions,
    recordHtml: recordHtml, subject: SUBJECT
  };

  /* ================= 每日时政热点（每晚 20:00 自动生成并写入 DB.state.dailyHot） =================
     数据结构：dailyHot['YYYY-MM-DD'] = { date, title, news:[{area,star,title,body}],
                essay:{topic,paras,quotes}, verbal:[言语题 10], quiz:[时政题 20] }
     页面层级：时政模块 → 「每日时政热点」方格 → 日期方格 → 当天页（材料+金句）→ 言语/时政题目页。
     题目页走通用答题引擎（练题/背题、收藏、勾画、每题用时统计与其它模块完全一致）。 */
  function hotNewsHtml(news) {
    const byStar = {};
    (news || []).forEach(n => { const s = n.star || 3; (byStar[s] = byStar[s] || []).push(n); });
    const label = { 5: "★★★★★ 必考核心考点", 4: "★★★★ 高频常考考点", 3: "★★★ 常识积累考点", 2: "★★ 了解即可", 1: "★ 了解即可" };
    let h = "";
    [5, 4, 3, 2, 1].forEach(s => {
      const arr = byStar[s];
      if (!arr || !arr.length) return;
      h += `<h4 style="margin:12px 0 6px">${label[s] || "★".repeat(s)}</h4><ol>`;
      arr.forEach(n => { h += `<li><b>${esc(n.title || "")}</b>${n.body ? "：" + esc(n.body) : ""}</li>`; });
      h += `</ol>`;
    });
    return h || `<div class="muted small">暂无</div>`;
  }

  function startHotQuiz(box, list, subject, title) {
    const UI = window.UI;
    const qs = (list || []).map(q => ({
      q: q.q, options: (q.options || []).slice(), a: q.a, e: q.e || "",
      multi: q.multi || (typeof q.a === "string" && q.a.length > 1 ? q.a : ""),
      type: q.type || ""
    }));
    box.appendChild(UI.el(`<div class="card"><h3>✍ ${esc(title)}</h3>
      <div class="muted small">练题 / 背题切换、收藏、勾画、每题用时统计与其它模块完全一致。</div></div>`));
    const hostEl = document.createElement("div");
    box.appendChild(hostEl);
    try { window.Quiz.start(hostEl, qs, subject, {}); }
    catch (e) { hostEl.innerHTML = `<div class="card empty">练习启动失败：${esc(e.message)}</div>`; }
  }

  function buildHotDay(box, date, parentRoute) {
    const UI = window.UI, P = window.Pager;
    const map = (window.DB && DB.state && DB.state.dailyHot) || {};
    const d = map[date] || {};
    const es = d.essay || {};
    let h = `<div class="card"><h3>📅 ${esc(d.title || (date + " 时政"))}</h3>`;
    h += hotNewsHtml(d.news);
    if (es.topic || (es.paras || []).length || (es.quotes || []).length) {
      h += `<h4 style="margin:14px 0 6px">✍ 今日申论时评 + 金句</h4>`;
      if (es.topic) h += `<div><b>核心立意：</b>${esc(es.topic)}</div>`;
      (es.paras || []).forEach(t => { h += `<p style="text-indent:2em;margin:6px 0;line-height:1.9">${esc(t)}</p>`; });
      if ((es.quotes || []).length) {
        h += `<div style="margin-top:6px"><b>必背金句</b></div><ol>`;
        es.quotes.forEach(q => { h += `<li>${esc(q)}</li>`; });
        h += `</ol>`;
      }
    }
    h += `</div>`;
    box.appendChild(UI.el(h));
    if (!P) return;
    const g = P.grid();
    [["verbal", "🗣 言语理解 · " + (d.verbal || []).length + " 题", "言语理解"],
     ["quiz", "📰 时政 · " + (d.quiz || []).length + " 题", "时政"]].forEach(it => {
      const list = d[it[0]] || [];
      if (!list.length) return;
      const r = parentRoute + "/" + it[0];
      P.define(r, { parent: parentRoute, title: it[1], build: (b2) => startHotQuiz(b2, list, it[2], it[1]) });
      g.appendChild(P.tile(it[0] === "verbal" ? "🗣" : "📰", it[1], "#/" + r));
    });
    box.appendChild(g);
  }

  /* 合并每日热点：只补本地没有的日期；「今天」按 pickDailyHot 取舍
     （晚8点自动版会覆盖白天手动版；20点后用户手动重生成版则保留本人版本） */
  function mergeDailyHot(target, src) {
    let changed = false;
    const pick = (window.DB && DB.pickDailyHot) || null;
    Object.keys(src || {}).forEach(d => {
      const inc = src[d];
      if (!inc) return;
      if (!target[d]) { target[d] = inc; changed = true; return; }
      if (pick) {
        const win = pick(target[d], inc);
        if (win && win !== target[d]) { target[d] = win; changed = true; }
      }
    });
    if (changed) { try { window.DB && DB.save && DB.save(); } catch (e) {} }
    return changed;
  }
  let hotStaticTried = false;
  /* 兜底载入：即便云端还没同步下来，也直接读仓库里的静态数据源 assets/data/daily_hot.js */
  function ensureDailyHot(cb) {
    const DB = window.DB;
    DB.state.dailyHot = DB.state.dailyHot || {};
    if (window.KG_DAILY_HOT) { mergeDailyHot(DB.state.dailyHot, window.KG_DAILY_HOT); cb(); return; }
    if (hotStaticTried) { cb(); return; }
    hotStaticTried = true;
    fetch("assets/data/daily_hot.js?t=" + Date.now(), { cache: "no-store" })
      .then(r => (r.ok ? r.text() : ""))
      .then(txt => {
        try {
          const i = String(txt).indexOf("=");
          if (i > 0) {
            window.KG_DAILY_HOT = JSON.parse(String(txt).slice(i + 1).replace(/;\s*$/, ""));
            mergeDailyHot(DB.state.dailyHot, window.KG_DAILY_HOT);
          }
        } catch (e) {}
        cb();
      })
      .catch(() => cb());
  }

  function mountDailyHot(host) {
    host.innerHTML = `<div class="muted small">正在载入每日时政热点…</div>`;
    ensureDailyHot(() => renderDailyHot(host));
  }

  function renderDailyHot(host) {
    const UI = window.UI, P = window.Pager;
    const map = (window.DB && DB.state && DB.state.dailyHot) || {};
    const today = (window.DB && DB.today && DB.today()) || "";
    const days = Object.keys(map).sort().reverse();
    /* 今天还没生成 → 也要占一位，显示灰色按钮（点击可立即生成） */
    if (today && !map[today]) days.unshift(today);
    host.innerHTML = "";
    if (!days.length) {
      host.appendChild(UI.el(`<div class="muted small">每晚 20:00 后自动生成当天内容：时政考点（星级分级）+ 申论时评与金句 + 言语理解 10 题 + 时政 20 题（15 单选 + 5 多选）。生成后这里会按日期列出，点日期即可查看与练题。</div>`));
      return;
    }
    if (!P) { host.appendChild(UI.el(`<div class="muted small">已生成 ${days.length} 天，请刷新页面后查看。</div>`)); return; }
    const grid = P.grid();
    days.forEach((d, i) => {
      if (!map[d]) {
        /* 灰色占位按钮：今天的内容还没生成 */
        const g = document.createElement("div");
        g.className = "kg-tile";
        g.style.opacity = ".55";
        g.style.filter = "grayscale(.92)";
        g.innerHTML = '<span class="kg-tile-ico">⏳</span>' +
          '<span class="kg-tile-t">' + esc(d + " 时政") + '</span>' +
          '<span class="kg-tile-arrow">…</span>';
        g.title = "今天的内容还没生成，点一下立即生成";
        g.onclick = () => {
          try { UI.toast("正在生成今天（" + d + "）的时政…"); } catch (e) {}
          refreshToday(host, null);
        };
        grid.appendChild(g);
        return;
      }
      const route = "current/hot/" + i;
      P.define(route, { parent: "current", title: d + " 时政", build: (box) => buildHotDay(box, d, route) });
      grid.appendChild(P.tile("📅", d + " 时政", "#/" + route));
    });
    host.appendChild(grid);
    host.appendChild(hotRefreshBar(host));
  }

  /* ===== 刷新今日时政（v20261005a）=====
     只处理「今天」：有新版就覆盖今天；没有就用 AI 现场生成今天的（素材取本机已抓取的今日热点）。
     **历史日期一律不动**。 */
  function hotRefreshBar(host) {
    const UI = window.UI;
    const bar = UI.el(`<div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn sm primary" id="hotRefresh">🔄 刷新今日时政</button>
      <span class="muted small" id="hotRefreshTip">任意时间点击都会现场生成今天的内容（重生成只覆盖你自己的账号）；每晚 20:00 自动版会覆盖白天版本，历史日期不会被改动</span>
    </div>`);
    setTimeout(() => {
      const b = bar.querySelector("#hotRefresh");
      if (b) b.onclick = () => refreshToday(host, bar);
    }, 0);
    return bar;
  }

  function todayHotMaterial(date) {
    const out = [];
    const grab = (arr) => {
      (arr || []).forEach(x => {
        if (!x) return;
        const d = String(x.date || x.pubDate || x.day || "").slice(0, 10);
        const t = String(x.title || x.t || "").trim();
        const bd = String(x.body || x.summary || x.desc || "").trim().slice(0, 140);
        if (t) out.push({ d: d, s: t + (bd ? "：" + bd : "") });
      });
    };
    try { grab((window.DB && DB.state && DB.state.hotspotsImports) || []); } catch (e) {}
    try { grab(window.KG_HOTSPOTS || []); } catch (e) {}
    try { grab(((window.DB && DB.state && DB.state.dailyHot) || {})[date] && ((DB.state.dailyHot[date].news) || [])); } catch (e) {}
    /* 优先取今天及最近的素材（≤ 今天、按日期新→旧）；没有带日期的就用全部 */
    const recent = out.filter(x => x.d && x.d <= date).sort((a, b) => (a.d < b.d ? 1 : -1));
    const pool = recent.length ? recent : out.filter(x => !x.d);
    return {
      list: pool.slice(0, 16).map(x => x.s),
      latest: pool.length ? (pool[0].d || "") : ""
    };
  }

  /* 稳健 JSON 解析：剥 markdown 围栏 + 括号平衡救援（截断也能救回已完整部分） + 尾逗号清理 */
  function hotParseJSON(txt) {
    let t = String(txt || "").replace(/```[a-z]*\s*/g, "").replace(/```/g, "").trim();
    const a = t.indexOf("{"), ar = t.indexOf("[");
    const s0 = (ar >= 0 && (a < 0 || ar < a)) ? ar : a;
    if (s0 < 0) throw new Error("AI 未返回 JSON");
    const s = t.slice(s0);
    const tryParse = (x) => { try { return JSON.parse(x); } catch (e) { return null; } };
    let j = tryParse(s);
    if (j) return j;
    const open = s.charAt(0), close = (open === "{") ? "}" : "]";
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = 0; i < s.length; i++) {
      const c = s.charAt(i);
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end > 0) { j = tryParse(s.slice(0, end + 1)); if (j) return j; }
    j = tryParse(s.replace(/,\s*([}\]])/g, "$1"));
    if (j) return j;
    /* 数组被截断：裁到最后一个完整元素再闭合（少收几题好过全盘失败） */
    if (open === "[") {
      const lastObj = s.lastIndexOf("}");
      if (lastObj > 0) { j = tryParse(s.slice(0, lastObj + 1) + "]"); if (j) return j; }
    }
    throw new Error("AI 返回的 JSON 无法解析（已自动重试仍失败）");
  }

  /* 单段生成：带一次自动重试（追加输出纪律），进度与流式思考喂给全局进度条 */
  async function hotCall(prompt, label, pct, maxTok) {
    for (let att = 0; att < 2; att++) {
      try {
        const p = att > 0 ? prompt + "\n\n【输出纪律】只输出 JSON 本体，禁止任何解释文字或 markdown 围栏；字符串务必精炼。" : prompt;
        if (window.KGProgress) KGProgress.show(label + (att > 0 ? "（自动重试）" : ""), pct);
        const txt = await window.KGAI.chat([{ role: "user", content: p }], {
          maxTok: maxTok || 6000,
          onDelta: (full) => { if (window.KGProgress) KGProgress.think(full); }
        });
        return hotParseJSON(txt);
      } catch (e) {
        if (att === 1) throw e;
        console.warn("[时政] 分段生成失败，自动重试：", e);
      }
    }
  }

  /* ===== 言语理解·逻辑填空 硬性命题规则（铁律，公考标准，参照真题样例）===== */
  const VERBAL_RULES =
    "【言语理解·逻辑填空 硬性命题规则（铁律，必须100%遵守）】\n" +
    "1. 题型=逻辑填空（实词/成语填空），绝不许出成问答题、事实选择题、主旨概括题。考查核心=词汇匹配：近义辨析、语境适配、感情色彩、搭配陷阱。时政只是题干背景皮。\n" +
    "2. 题干：以中国时政/国家大政方针为背景写成一段完整长材料，100-150字（不足100字=不合格），语句通顺、逻辑完整，贴合国考省考真题篇幅；背景自然融入，严禁“背景：”“材料：”等标签；只写中国相关背景，国际新闻一律不作背景。\n" +
    "3. ★空与选项严格对应（错配=废题）：单空题=题干恰好 1 个 ____，每个选项恰好 1 个词；双空题=题干恰好 2 个 ____，每个选项恰好 2 个词、中间一个空格分隔。空数与词数绝不许错配。双空为主（约7题），单空为辅（约3题，单空只填四字成语）。\n" +
    "4. ★用词铁律：空处只允许【四字成语】和【两字实词】两类，严禁任何三字词（含政策名词也不许）；严禁动词+「了」（推动了、促进了、凸显了、加强了等一律禁止）；严禁把“体育交流/竞技提升”这类普通短语名词当填空词。\n" +
    "5. ★同空同字数：同一个空位在四个选项中字数完全一致（第一空四选项同为四字或同为两字，第二空同理；不同空之间可不同）。\n" +
    "6. 四个选项语义高度接近、强迷惑（近义辨析/语境适配/感情色彩/搭配陷阱），都要“看似可行”、对比择优；政务固定搭配（夯实责任、打通堵点、筑牢底线、化解风险、肃清风气）可入题。\n" +
    "7. 答案分布：10 题正确答案 A/B/C/D 尽量均匀（各 2-3 个）。\n" +
    "8. 解析逐空逐项（参照真题）：第一空，搭配“××”，侧重……；最优项指……适配语境；其余三项分别说明侧重点/搭配对象差异、为何不如最优项。第二空同理。最后点明择优结论。\n" +
    "9. 输出前逐题自检：题干≥100字？空数=选项词数？无「了」？无任何三字词（只许两字/四字）？任一不满足就重写该题。";

  /* ===== 时政客观题 硬性命题规则（铁律，公考标准）===== */
  const QUIZ_RULES =
    "【时政客观题·硬性命题规则（铁律）】\n" +
    "1. 范围红线：全部题目只考中国相关时政；纯国际新闻/外国事件一律禁止入题；素材中如有国际条目一律忽略。\n" +
    "2. ★命题结构（最重要）：15 道单选中至多 2 道是「常识直考题」（直接考今日时政的事实/数字）；其余全部按「时政引子 + 国家政策考点」命题——题干先用今日时政的事件/成就/部署作引子（60-120字自然成段），随后设问指向国家大政方针：十五五规划、中央经济工作会议、中央一号文件、党的二十大报告、习近平新时代中国特色社会主义思想、政府工作报告等中央文件的核心表述；正确答案必须来自这些文件/政策的原文表述。示例方向：今日海水淡化突破 → 考「海洋强国/创新驱动发展战略」；短视频专项整治 → 考「网络综合治理体系」；国庆消费旺 → 考「扩大内需战略」。\n" +
    "3. 选项设计：四个选项是同类政策名词/表述（同属一大类），错误项把政策名词替换成相近政策名词挖坑（如“枫桥经验”换“浦江经验”、“新质生产力”换“高质量生产力”）；句子通顺、迷惑性强，禁低级错项、禁消极否定唱衰表述。\n" +
    "4. 题干禁止“背景：”“材料：”“据报道”“中新网”等标签或媒体字样，材料自然前置。\n" +
    "5. 「数量辨析」新题型（必须出 2 道）：题干给 ①②③④ 四条关于今日时政的表述（正误混合，错误项只做名词或数字偷换），设问「下列表述正确的有几项」或「错误的有几项」，选项固定 A.1项 B.2项 C.3项 D.4项；解析逐条说明对错。\n" +
    "6. 答案分布：单选正确答案 A/B/C/D 尽量均匀；多选答案 2-4 个正确随机、字母组合不重复。\n" +
    "7. 解析模板：【答案】X\\n【解析】先引用政策文件/时政原文说明正确项为何对，再逐条指出每个错误项偷换了哪个名词/数字。禁止写“对应易错点第X条”。";

  /* 校验言语题（v20261007g）：
     ①题干≥50字；②空数=选项词数；③同一空位四选项字数一致；
     ④禁动词+「了」；⑤★禁三字词（只许两字/四字） */
  function validateVerbal(list) {
    const bad = [];
    (list || []).forEach((q, qi) => {
      if (!q || !Array.isArray(q.options)) return;
      const qtxt = String(q.q || "");
      if (Array.from(qtxt).length < 50) { bad.push(qi); return; }        // 题干太短
      const blanks = (qtxt.match(/____/g) || []).length;
      const perOpt = q.options.map(o =>
        String(o || "").split(/[／/；;、\s]+/).map(s => s.trim()).filter(Boolean));
      if (!perOpt.length || !perOpt[0].length) { bad.push(qi); return; }
      if (perOpt.some(w => w.length !== perOpt[0].length)) { bad.push(qi); return; }
      if (blanks && perOpt[0].length !== blanks) { bad.push(qi); return; } // 空数词数错配
      if (perOpt.some(w => w.some(x => /了|着|得$/.test(x)))) { bad.push(qi); return; } // 动词+了
      if (perOpt.some(w => w.some(x => { const n = Array.from(x).length; return n !== 2 && n !== 4; }))) { bad.push(qi); return; } // ★禁三字词/一字词
      for (let i = 0; i < perOpt[0].length; i++) {
        const lens = perOpt.map(w => Array.from(w[i] || "").length);
        if (new Set(lens).size > 1) { bad.push(qi); break; }               // 同空混字数
      }
    });
    return bad;
  }

  /* 校验时政题（v20261007g）：
     ①选项是字母组合（如 ABC/ABD，AI 把答案组合当选项输出=废题）；②题目重复；③多选无 multi 标记 */
  function validateQuiz(list) {
    const seen = {}, bad = [];
    (list || []).forEach((q, qi) => {
      if (!q || !Array.isArray(q.options) || q.options.length < 3) { bad.push(qi); return; }
      const letterOpt = q.options.filter(o => /^[ABCD]{2,4}$/.test(String(o || "").trim())).length;
      if (letterOpt >= 3) { bad.push(qi); return; }                        // 字母组合当选项
      if (q.type === "multi" && !q.multi) { bad.push(qi); return; }
      const key = String(q.q || "").replace(/\s+/g, "").slice(0, 20);
      if (key && seen[key] !== undefined) { bad.push(qi); return; }        // 重复题
      seen[key] = qi;
    });
    return bad;
  }

  async function genTodayByAI(date) {
    const mat = todayHotMaterial(date);
    const hasMat = mat.list.length > 0;
    if (!window.KGAI || !KGAI.chat) throw new Error("未配置 AI，请到「设置 → AI」填写密钥");
    /* 有素材 → 严格按素材；没素材（抓取失败等）→ AI 兜底，但禁止编造具体细节 */
    const head = hasMat
      ? "你是公务员考试时政命题专家。下面是最近的真实热点素材（最新日期 " + (mat.latest || date) + "，目标日期 " + date + "），请严格据此生成 " + date + " 的每日时政内容，禁止编造素材之外的事实。"
      : "你是公务员考试时政命题专家。热点抓取暂时不可用，没有素材可给。请基于你已掌握的、确定性高的近期全国时政要点（重大政策、会议、科技、民生等），生成 " + date + " 的每日时政内容。红线：只写你确信的事实，不得编造具体日期、数字、人名、职务；拿不准的细节一律用泛化表述（如「近日」「有关部门」）。";
    const matTxt = hasMat
      ? "【今日素材】\n" + mat.list.map((m, i) => (i + 1) + ". " + m).join("\n")
      : "【今日素材】（无，按上述红线自主生成）";
    const base = head + "\n" + matTxt +
      "\n【时政范围红线】全部内容只限中国相关时政（国内政策、会议、科技、民生、经济、重大工程等）；纯国际新闻、外国事件一律禁止收录和入题；素材中如有国际条目（外国事故、外国选举、国际组织动态等），一律忽略、不得据此写要点或出题。";
    const redline = "【选项用词红线】错误选项只做词汇/领域/数字/主体的同义替换，句子仍来自素材原意；不得出现消极、否定、负面评价或唱衰性表述。";

    /* 分 4 段小 JSON 生成：单段被截断的风险大幅降低，且每段独立救援+重试 */
    if (window.KGProgress) KGProgress.show("AI 正在生成今日时政（" + date + "）· 1/4 要点与申论…", 20);
    const p1 = base +
      "\n\n【输出要求】只输出一个 JSON 对象，不要任何说明文字、不要 markdown 代码块。结构：\n" +
      '{"news":[{"area":"领域","star":5,"title":"要点标题","body":"一句事实"} ×9（★★★★★3条、★★★★3条、★★★3条，用 star=5/4/3 表示）],\n' +
      '"essay":{"topic":"核心立意一句","paras":["申论段落1","申论段落2"],"quotes":["金句1","金句2","金句3","金句4"]}}';
    const d1 = await hotCall(p1, "AI 生成时政要点与申论金句…", 22);

    if (window.KGProgress) KGProgress.show("AI 生成言语理解 10 题 · 2/4…", 42);
    const p2 = base +
      "\n\n【输出要求】只输出一个 JSON 数组，恰好 10 道「言语理解·逻辑填空」题，不要任何说明文字、不要 markdown 代码块。" +
      "双空题格式：{\"q\":\"长背景材料…____…____（两个空位用 ____ 表示）\",\"options\":[\"一蹴而就 恪尽职守\",\"一帆风顺 废寝忘食\",\"轻而易举 呕心沥血\",\"一朝一夕 兢兢业业\"],\"a\":0,\"e\":\"第一空，…；第二空，…（逐空逐项对比）\"}；" +
      "单空题格式：{\"q\":\"长背景材料（100字以上）…____…\",\"options\":[\"一蹴而就\",\"一帆风顺\",\"轻而易举\",\"一朝一夕\"],\"a\":0,\"e\":\"…\"}。" +
      "空数必须与选项词数一致（1空对1词、2空对2词）。a 为正确选项 0 基数字。" +
      VERBAL_RULES;
    const d2 = await hotCall(p2, "AI 生成言语理解 10 题…", 45, 6000);

    if (window.KGProgress) KGProgress.show("AI 生成时政单选题 · 3/4…", 62);
    const quizSpec =
      QUIZ_RULES +
      "\n\n【JSON 格式】单选 {\"q\":\"（长材料自然前置，不写背景标签）…\\n设问句\",\"options\":[4项],\"a\":1,\"e\":\"【答案】B\\n【解析】…\"}，a 为 0 基数字；" +
      "数量辨析题也是单选：{\"q\":\"…材料…\\n下列表述正确的有几项？\\n①…\\n②…\\n③…\\n④…\",\"options\":[\"1项\",\"2项\",\"3项\",\"4项\"],\"a\":1,\"e\":\"【答案】B\\n【解析】①对…②错（把××偷换成××）…\"}；" +
      "多选 {\"q\":\"（长材料自然前置）…\\n（多选）下列表述符合今日时政原文的有\",\"options\":[4项内容表述],\"a\":\"ABC\",\"type\":\"multi\",\"multi\":\"ABC\",\"e\":\"【答案】ABC\\n【解析】…\"}，a 为 2-4 个字母、组合不重复。" +
      "★多选选项红线：每个选项必须是【一句独立的知识表述】（同属一个大类的政策/事实内容），ABCD 是选项编号；严禁把答案字母组合（如 ABC、ABD、ACD）当成选项内容，严禁选项只写字母。";
    const p3 = base + "\n\n【输出要求】生成时政题第 1 批，恰好 10 道，全部为单选：8 道「表述辨析」+ 2 道数字题（素材无可靠数字就改为表述辨析）。正确答案 A/B/C/D 尽量均匀分布。只输出一个 JSON 数组，不要任何说明文字、不要 markdown 代码块。" + quizSpec;
    const d3 = await hotCall(p3, "AI 生成时政单选题（1/2）…", 65);

    const avoid = (Array.isArray(d3) ? d3 : []).map(q => String(q.q || "").slice(0, 24)).filter(Boolean).slice(0, 10).join("；");
    if (window.KGProgress) KGProgress.show("AI 生成时政题（含数量辨析/多选） · 4/4…", 78);
    const p4 = base +
      "\n\n【输出要求】生成时政题第 2 批，恰好 10 道：5 道单选（其中必须包含 2 道「数量辨析」新题型，规则见上）+ 5 道多选（答案 2-4 个正确随机、组合不重复、不要每题相同）。不要与第 1 批重复：" + (avoid || "（无）") +
      "。只输出一个 JSON 数组，不要任何说明文字、不要 markdown 代码块。" + quizSpec;
    const d4 = await hotCall(p4, "AI 生成时政题（含数量辨析/多选） · 4/4…", 82);

    let verbal = Array.isArray(d2) ? d2 : [];
    /* 言语题「同题同字数」铁律校验：若 AI 仍混搭字数（如四字+两字），整批重生成一次 */
    const vbad = validateVerbal(verbal);
    if (vbad.length) {
      if (window.KGProgress) KGProgress.show("言语题字数校验未过，重新生成…", 50);
      try {
        const p2b = base +
          "\n\n【输出要求】只输出一个 JSON 数组，恰好 10 道「言语理解·逻辑填空」题，不要任何说明文字、不要 markdown 代码块。每题格式：{\"q\":\"长背景材料…____…（双空题含两个____）\",\"options\":[\"一蹴而就 恪尽职守\",\"一帆风顺 废寝忘食\",\"轻而易举 呕心沥血\",\"一朝一夕 兢兢业业\"],\"a\":0,\"e\":\"逐空逐项对比解析\"}，a 为 0 基数字。" +
          VERBAL_RULES +
          "\n\n【上一稿校验失败】第 " + vbad.map(i => i + 1).join("、") + " 题违规（任一：题干不足100字；空数与选项词数不匹配；选项含「了」类动词短语；出现三字词；同一空位四选项字数不一致）。必须保证：题干≥100字；单空题1个____对每选项1个词、双空题2个____对每选项2个词（空格分隔）；空处只填四字成语或两字实词，严禁任何三字词；每个空位四选项字数一致。重新输出完整 10 题 JSON。";
        const d2b = await hotCall(p2b, "重生成言语理解（修正字数）…", 52, 6000);
        if (Array.isArray(d2b) && d2b.length >= 8) verbal = d2b;
      } catch (e) { console.warn("[时政] 言语重生成失败，沿用上一稿", e); }
    }
    let quiz = (Array.isArray(d3) ? d3 : []).concat(Array.isArray(d4) ? d4 : []);
    /* 时政题校验：字母组合当选项（如 ABC/ABD）=废题、重复题 → 整批重生成一次，仍不过则剔除废题 */
    let qbad = validateQuiz(quiz);
    if (qbad.length) {
      if (window.KGProgress) KGProgress.show("时政题校验未过，重新生成…", 84);
      try {
        const p4b = base +
          "\n\n【输出要求】重新生成第 2 批时政题，恰好 10 道：5 道单选（含 2 道数量辨析，选项固定为 1项/2项/3项/4项）+ 5 道多选。不要与第 1 批重复：" + (avoid || "（无）") +
          "。只输出一个 JSON 数组，不要任何说明文字。" + quizSpec +
          "\n\n【上一稿校验失败】第 " + qbad.map(i => i + 1).join("、") + " 题违规（任一：把答案字母组合 ABC/ABD 等当成选项内容；题目与第 1 批重复）。多选每个选项必须是完整的一句知识表述，四题答案组合各不相同；全部题目不得与第 1 批重复。重新输出完整 10 题 JSON。";
        const d4b = await hotCall(p4b, "重生成时政题（修正格式）…", 88);
        if (Array.isArray(d4b) && d4b.length >= 8) {
          quiz = (Array.isArray(d3) ? d3 : []).concat(d4b);
          qbad = validateQuiz(quiz);
        }
      } catch (e) { console.warn("[时政] 时政题重生成失败", e); }
      if (qbad.length) {
        const badSet = new Set(qbad);
        quiz = quiz.filter((_, i) => !badSet.has(i));
      }
    }
    const news = (d1 && Array.isArray(d1.news)) ? d1.news : [];
    if (news.length < 6 || verbal.length < 8 || quiz.length < 13)
      throw new Error("AI 生成的部分内容不完整（要点 " + news.length + " / 言语 " + verbal.length + " / 时政 " + quiz.length + "），请再点一次刷新重试");
    return {
      date: date,
      title: date + " 时政",
      news: news,
      essay: (d1 && d1.essay) || {},
      verbal: verbal,
      quiz: quiz
    };
  }

  /* ===== 刷新今日时政（v20261006k）=====
     任意时间点击都触发运转：同步静态源/云端后，用 AI 现场生成「今天」。
     - 生成版带 manualAt（用户手动版），只写入本机 + 本账号云端（userdata），不影响全局静态通道。
     - 晚 20:00 自动化生成的版本会覆盖白天的手动版；20 点后用户再点刷新重生成，
       则自己的版本优先保留（pickDailyHot：20点后手动版最高优先）。
     - **历史日期一律不动**。 */
  let hotBusy = false;
  async function refreshToday(host, bar) {
    const UI = window.UI, DB = window.DB;
    const tip = bar ? bar.querySelector("#hotRefreshTip") : null;
    const setTip = (t) => { if (tip) tip.textContent = t; };
    if (hotBusy) { try { UI.toast("今天的时政正在生成中，请稍候…"); } catch (e) {} return; }
    hotBusy = true;
    const date = DB.today();
    try {
      if (window.KGProgress) KGProgress.show("正在准备生成今日时政（" + date + "）…", 6);
      setTip("正在同步最新数据…");
      // ① 拉热点素材（供现场生成用）
      try {
        const r = await fetch("assets/data/hotspots.js?t=" + Date.now(), { cache: "no-store" });
        const txt = r.ok ? await r.text() : "";
        const m = txt.indexOf("=");
        if (m > 0) window.KG_HOTSPOTS = JSON.parse(txt.slice(m + 1).replace(/;\s*$/, ""));
      } catch (e) {}
      // ② 重拉静态时政源 + 云端（历史新日期会自动并入；今天按手动版优先规则取舍）
      try {
        const r = await fetch("assets/data/daily_hot.js?t=" + Date.now(), { cache: "no-store" });
        const txt = r.ok ? await r.text() : "";
        const a = txt.indexOf("{"), b = txt.lastIndexOf("}");
        if (a >= 0 && b > a) window.KG_DAILY_HOT = JSON.parse(txt.slice(a, b + 1));
      } catch (e) {}
      try { if (DB.pull) await DB.pull(); } catch (e) {}
      DB.state.dailyHot = DB.state.dailyHot || {};
      if (window.KG_DAILY_HOT) mergeDailyHot(DB.state.dailyHot, window.KG_DAILY_HOT);
      renderDailyHot(host);
      if (window.KGProgress) KGProgress.show("AI 正在生成今日时政（" + date + "）…约 1-2 分钟", 18);
      // ③ 无论几点：现场生成今天（用户手动触发即运转）；进度条常驻顶部，可离开本页
      setTip("正在用 AI 生成今天（" + date + "）的时政…约需 2-4 分钟");
      let day = null;
      try {
        day = await genTodayByAI(date);
      } catch (e1) {
        console.warn("[时政] 第一次生成未成功，自动整跑重试一次", e1);
        setTip("第一次生成未成功，自动再试一次…");
        if (window.KGProgress) KGProgress.show("第一次未成功，自动整体重试一次…", 12);
        await new Promise(r => setTimeout(r, 3000));
        day = await genTodayByAI(date);
      }
      if (window.KGProgress) KGProgress.show("生成完成，正在写入…", 92);
      day.manualAt = Date.now();   // 标记为本人手动版：云同步时优先保留（仅本账号可见）
      DB.state.dailyHot[date] = day;
      DB.save();
      if (window.KGProgress) KGProgress.show("今日时政已生成 ✓", 100);
      setTimeout(() => { if (window.KGProgress) KGProgress.hide(); }, 1200);
      setTip("已生成今天（" + date + "），本机与你的账号云端已更新");
      renderDailyHot(host);
      try { UI.toast("今日时政已生成"); } catch (e) {}
    } catch (e) {
      if (window.KGProgress) KGProgress.hide();
      setTip("生成失败：" + ((e && e.message) || e) + "，可稍后再试；每晚 20:00 也会自动生成");
      try { UI.toast("今日时政生成失败：" + ((e && e.message) || e)); } catch (err) {}
      renderDailyHot(host);   // 恢复列表（今天回到灰色占位）
    } finally {
      hotBusy = false;
    }
  }

  window.MODULES.current = {
    title: "时政", icon: "current",
    render(body) {
      const UI = window.UI;
      if (UI.StudyBar) UI.StudyBar("current", body);   /* 精简专注条（补记录） */

      /* =========== 时事热点（每日 12:00 / 20:00 自动抓取） =========== */
      const hsSec = UI.section("🔥 时事热点（每日 12:00 / 20:00 自动抓取）", { open: false });
      body.appendChild(hsSec);
      const hsBody = hsSec.querySelector(".kg-det-b");
      hsBody.innerHTML = `
        <div class="muted small" style="margin-bottom:4px">热点来自中国政府网 / 大洋网（广州日报）等权威来源，每条保留<strong>原始发布日期</strong>，绝不把旧闻标成今天。<strong>全国</strong>在前、<strong>广东</strong>在后；按日期归档，可搜索关键词，并可<strong>标注重点 / 加笔迹 / 导出 PDF</strong>。</div>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <button class="btn sm primary" id="gotoHist">🗂 历史时政（全部归档·可搜索）</button>
          <button class="btn sm ghost" id="gotoRec">📅 我的时政记录</button>
        </div>
        <div class="hs-bar">
          <div class="hs-tabs">
            <button class="hs-tab active" data-r="全国">🌐 全国 <span class="hs-n" id="hsN1">0</span></button>
            <button class="hs-tab" data-r="广东">🏙 广东 <span class="hs-n" id="hsN2">0</span></button>
          </div>
          <div class="hs-tools">
            <input id="hsSearch" class="hs-search" type="search" placeholder="🔍 搜索关键词（标题/正文/来源）"/>
            <button class="hs-btn" id="hsSearchBtn">搜索</button>
            <button class="btn sm ghost" id="hsImport">➕ 导入网页</button>
            <button class="btn sm ghost" id="hsSync">☁ 同步</button>
            <span id="hsSyncStat" class="hs-sync off">未登录社交账号（仅本机）</span>
            <button class="btn sm primary" id="hsRefresh">🔄 刷新</button>
          </div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <span class="muted small" id="hsUpdated"></span>
          <span class="muted small" id="hsNote"></span>
        </div>
        <div id="hsList"></div>`;
      const hsList = hsBody.querySelector("#hsList");
      const hsUpdated = hsBody.querySelector("#hsUpdated");

      function hl(s) {
        s = esc(s || "");
        HOTSPOTS_KW.forEach(k => { if (k) s = s.split(k).join('<mark class="kw">' + k + '</mark>'); });
        return s;
      }

      function loadHotspots() {
        if (typeof fetch === "undefined") { hsList.innerHTML = `<div class="empty">当前环境不支持自动加载。</div>`; return; }
        hsList.innerHTML = `<div class="empty">加载中…</div>`;
        fetch("assets/data/hotspots.js?t=" + Date.now(), { cache: "no-store" })
          .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
          .then(txt => {
            const m = txt.indexOf("=");
            const j = JSON.parse(txt.slice(m + 1).replace(/;\s*$/, ""));
            window.KG_HOTSPOTS = j;
            renderHotspots(j);
          })
          .catch(e => {
            hsList.innerHTML = `<div class="empty">时事热点加载失败：${esc(e.message)}。<br>若已配置后端或部署了抓取工作流，请稍后重试。</div>`;
          });
      }

      /* ---- 视图状态：地区 / 搜索 / 日期展开 ---- */
      const HS = { region: "全国", q: "", dateOpen: {}, all: [] };
      function regionOf(it) { return it.region === "广东" ? "广东" : "全国"; }
      // 抓取数据 + 用户导入的网页，合并为一个列表
      function allItems() {
        const crawled = (window.KG_HOTSPOTS && window.KG_HOTSPOTS.items) || [];
        const imported = DB.state.hotspotsImports || [];
        return crawled.concat(imported);
      }
      function daysAgo(d) {
        if (!d) return 999;
        const t = Date.parse(d);
        if (isNaN(t)) return 999;
        return Math.floor((Date.now() - t) / 86400000);
      }

      function itemHtml(it) {
        const i = HS.all.indexOf(it);
        const edit = (DB.state.hotspotsEdits && DB.state.hotspotsEdits[it.id]) || {};
        const summary = edit.summary != null ? edit.summary : (it.summary || (it.body ? it.body.slice(0, 160) : ""));
        return `<div class="hot-item" data-i="${i}">
          <div class="hot-item-h">
            <span class="hot-badge ${it.region === "广东" ? "gd" : "cn"}">${regionOf(it)}</span>
            <span class="hot-src">${esc(it.source || "")}</span>
            <span class="hot-date">${esc(it.date || "近日")}</span>
          </div>
          <div class="hot-title">${hl(edit.title != null ? edit.title : it.title)}</div>
          <div class="hot-sum">${hl(summary)}</div>
          <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">
            <button class="btn sm primary hs-view">📖 查看完整</button>
            <button class="btn sm ghost hs-edit">✏️ 编辑/笔记</button>
            <button class="btn sm ghost hs-pdf">⬇ 导出PDF</button>
          </div>
        </div>`;
      }

      function renderHotspots(j) {
        if (j) window.KG_HOTSPOTS = j;
        const all = allItems();
        HS.all = all;
        const upd = (window.KG_HOTSPOTS && window.KG_HOTSPOTS.updatedAt) || "";
        hsUpdated.textContent = upd ? ("更新于 " + upd) : "";

        // 顶部计数（不受搜索影响）
        const n1 = hsBody.querySelector("#hsN1"), n2 = hsBody.querySelector("#hsN2");
        if (n1) n1.textContent = all.filter(it => regionOf(it) === "全国").length;
        if (n2) n2.textContent = all.filter(it => regionOf(it) === "广东").length;

        if (!all.length) { hsList.innerHTML = `<div class="empty">暂无可展示的时事热点。可点「刷新」触发抓取，或用「➕ 导入网页」自己添加。</div>`; return; }

        const q = (HS.q || "").trim().toLowerCase();
        let list = all.filter(it => regionOf(it) === HS.region);
        if (q) {
          list = list.filter(it => {
            const ed = (DB.state.hotspotsEdits && DB.state.hotspotsEdits[it.id]) || {};
            const hay = [ed.title != null ? ed.title : it.title,
                         ed.body != null ? ed.body : (it.body || ""),
                         it.summary || "", it.source || ""].join(" ").toLowerCase();
            return hay.indexOf(q) >= 0;
          });
        }
        if (!list.length) { hsList.innerHTML = `<div class="empty">没有匹配的新闻。换个关键词，或切换到「${HS.region === "全国" ? "广东" : "全国"}」。</div>`; return; }

        // 按日期分组（新 → 旧）
        const byDate = {};
        list.forEach(it => { const d = it.date || "未标注日期"; (byDate[d] = byDate[d] || []).push(it); });
        const dates = Object.keys(byDate).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

        hsList.innerHTML = dates.map(d => {
          const arr = byDate[d];
          const recent = daysAgo(d) <= 3;          // 近三天默认展开，更早默认折叠
          const open = HS.dateOpen[d] === undefined ? recent : HS.dateOpen[d];
          return `<div class="hs-date ${open ? "open" : ""}" data-d="${esc(d)}">
            <div class="hs-date-h">
              <span class="hs-caret">${open ? "▾" : "▸"}</span>
              <span class="hs-date-t">📅 ${esc(d)}</span>
              <span class="muted small">${arr.length} 条</span>
              ${recent ? `<span class="hs-new">近三天</span>` : `<span class="hs-old">更早</span>`}
            </div>
            <div class="hs-date-b" ${open ? "" : "hidden"}>
              ${arr.map(it => itemHtml(it)).join("")}
            </div>
          </div>`;
        }).join("");

        hsList.querySelectorAll(".hs-date-h").forEach(h => {
          h.onclick = () => {
            const box = h.parentElement;
            const nowOpen = !box.classList.contains("open");
            HS.dateOpen[box.dataset.d] = nowOpen;
            box.classList.toggle("open", nowOpen);
            h.querySelector(".hs-caret").textContent = nowOpen ? "▾" : "▸";
            box.querySelector(".hs-date-b").hidden = !nowOpen;
          };
        });
        hsList.querySelectorAll(".hot-item").forEach(el => {
          const it = HS.all[+el.dataset.i];
          if (!it) return;
          const v = el.querySelector(".hs-view"); if (v) v.onclick = () => openHotspot(it, false);
          const e = el.querySelector(".hs-edit"); if (e) e.onclick = () => openHotspot(it, true);
          const p = el.querySelector(".hs-pdf");  if (p) p.onclick = () => exportHotspot(it, (DB.state.hotspotsEdits || {})[it.id]);
        });
      }

      // 地区切换
      hsBody.querySelectorAll(".hs-tab").forEach(b => {
        b.onclick = () => {
          HS.region = b.dataset.r;
          hsBody.querySelectorAll(".hs-tab").forEach(x => x.classList.toggle("active", x === b));
          renderHotspots();
        };
      });
      // 关键词搜索（防抖）
      const hsSearch = hsBody.querySelector("#hsSearch");
      let hsTimer = null;
      function applyHsSearch() { HS.q = hsSearch.value || ""; renderHotspots(); }
      hsSearch.oninput = () => {
        clearTimeout(hsTimer);
        hsTimer = setTimeout(applyHsSearch, 200);
      };
      hsSearch.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(hsTimer); applyHsSearch(); } };
      hsBody.querySelector("#hsSearchBtn").onclick = () => { clearTimeout(hsTimer); applyHsSearch(); };

      function openHotspot(it, editMode) {
        const edits = (DB.state.hotspotsEdits = DB.state.hotspotsEdits || {});
        const cur = edits[it.id] || {};
        const title = cur.title != null ? cur.title : it.title;
        const body = stripFooterLines(cur.body != null ? cur.body : (it.body || it.summary || ""));
        const imgs = cur.imgs || it.imgs || [];
        const box = UI.el(`<div class="hot-detail" style="max-height:72vh;overflow:auto">
          <div class="hot-item-h" style="margin-bottom:8px">
            <span class="hot-badge ${it.region === "广东" ? "gd" : "cn"}">${it.region === "广东" ? "广东" : "全国"}</span>
            <span class="hot-src">${esc(it.source || "")}</span>
            <span class="hot-date">${esc(it.date || "近日")}</span>
          </div>
          <input class="hot-edit-title" value="${esc(title)}" ${editMode ? "" : "readonly"}/>
          <div class="hot-edit-wrap" style="${editMode ? "" : "display:none"}">
            <textarea class="hot-edit-body" rows="10">${esc(body)}</textarea>
          </div>
          <div class="hot-body">${hl(body)}</div>
          ${imgs.length ? `<div class="hot-imgs">${imgs.map(u => `<img src="${esc(u)}" loading="lazy" referrerpolicy="no-referrer" alt=""/>`).join("")}</div>` : ""}
          <div class="muted small" style="margin-top:8px">来源：${esc(it.source || "")}　原文日期：${esc(it.date || "未标注")}　<a href="${esc(it.url || "#")}" target="_blank" rel="noopener">打开原文 ↗</a></div>
        </div>`);
        box.appendChild(UI.notebook("时事热点", "hs_" + it.id, box.querySelector(".hot-body")));
        const detailBody = box.querySelector(".hot-body");
        const editTitle = box.querySelector(".hot-edit-title");
        const editBody = box.querySelector(".hot-edit-body");
        const editWrap = box.querySelector(".hot-edit-wrap");
        if (editMode) { editWrap.style.display = ""; detailBody.style.display = "none"; }
        UI.modal({
          title: "🔥 时事热点", body: box, width: "800px",
          actions: editMode
            ? [
                { label: "取消", cls: "ghost", onClick: (m, c) => c() },
                { label: "保存修改", cls: "primary", onClick: (m, c) => {
                  edits[it.id] = { title: editTitle.value.trim() || it.title, body: editBody.value };
                  DB.save(); c(); openHotspot(it, false); UI.toast("已保存你的修改");
                } }
              ]
            : [
                { label: "✏️ 编辑/笔记", cls: "ghost", onClick: (m, c) => { c(); openHotspot(it, true); } },
                { label: "⬇ 导出PDF", cls: "ghost", onClick: () => exportHotspot(it, edits[it.id]) },
                { label: "关闭", cls: "ghost", onClick: (m, c) => c() }
              ]
        });
      }

      function exportHotspot(it, editObj) {
        const title = (editObj && editObj.title != null) ? editObj.title : it.title;
        const body = stripFooterLines((editObj && editObj.body != null) ? editObj.body : (it.body || it.summary || ""));
        const imgs = (editObj && editObj.imgs) || it.imgs || [];
        let html = `<h2>${esc(title)}</h2>`;
        html += `<p class="muted">${esc(it.source || "")} · ${esc(it.date || "近日")}</p>`;
        html += `<p>${esc(body).replace(/\n/g, "<br/>")}</p>`;
        if (imgs.length) html += `<div>${imgs.map(u => `<img src="${esc(u)}" referrerpolicy="no-referrer" style="max-width:100%;margin:6px 0"/>`).join("")}</div>`;
        const notes = UI.Notes.get("时事热点", "hs_" + it.id);
        if (notes && notes.strokes && notes.strokes.length) {
          const W = notes.vw || 720;
          html = `<div style="position:relative;width:${W}px">${html}${UI.Notes.overlayHtml(notes)}</div>`;
        }
        html += UI.Attachments.toHtml("时事热点", "hs_" + it.id);
        window.PDF.exportHtml(title, html);
        UI.toast("已生成PDF，请在打印窗口选择「另存为 PDF」");
      }

      /* 刷新：已登录（有同步令牌）则触发 Actions 实时抓取；随后重新拉取最新数据 */
      function triggerCrawlDispatch() {
        try {
          const tok = localStorage.getItem("kg_sync_token");
          if (!tok) return;
          const GH = (window.APP_CONFIG && window.APP_CONFIG.GH) || { owner: "12345kobe", repo: "kaogong" };
          fetch("https://api.github.com/repos/" + GH.owner + "/" + GH.repo + "/dispatches", {
            method: "POST",
            headers: { "Authorization": "token " + tok, "Accept": "application/vnd.github+json", "Content-Type": "application/json" },
            body: JSON.stringify({ event_type: "crawl-hotspots" })
          }).catch(() => {});
        } catch (e) {}
      }
      /* ================= 导入网页：粘贴 URL 自动抓取正文 ================= */
      function htmlToArticle(html, url) {
        let h = String(html || "")
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<!--[\s\S]*?-->/g, " ");
        const textOf = (s) => {
          let t = String(s || "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/(p|div|h\d|li)>/gi, "\n")
            .replace(/<[^>]+>/g, "");
          return t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
                  .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
                  .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
        };
        // 标题：og:title > h1 > title
        let title = "";
        const og = h.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
        if (og && og[1]) title = textOf(og[1]);
        if (!title) { const h1 = h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i); if (h1) title = textOf(h1[1]); }
        if (!title) { const tm = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i); if (tm) title = textOf(tm[1]); }
        // 日期
        let date = "";
        const dm = h.match(/<meta[^>]+(?:property|name|itemprop)=["'][^"']*(?:published_time|pubdate|publishdate|release_date|date)["'][^>]+content=["']([^"']+)["']/i)
                || h.match(/<time[^>]+datetime=["']([^"']+)["']/i)
                || h.match(/(20\d{2})[-\/年](\d{1,2})[-\/月](\d{1,2})/);
        if (dm) {
          if (dm[3] && dm[2]) date = dm[1] + "-" + String(dm[2]).padStart(2, "0") + "-" + String(dm[3]).padStart(2, "0");
          else date = (dm[1] || "").slice(0, 10);
        }
        if (!date) date = DB.today();
        // 正文：article / main / 内容容器
        let main = (h.match(/<div[^>]+(?:id|class)=["'][^"']*(?:pages_content|UCAP-CONTENT|article-content|articleContent|TRS_Editor|xl_content|detail-content|news-content)[^"']*["'][\s\S]*?<\/div>/i) || [])[0]
                || (h.match(/<article[\s\S]*?<\/article>/i) || [])[0]
                || (h.match(/<main[\s\S]*?<\/main>/i) || [])[0]
                || (h.match(/<div[^>]+(?:id|class)=["'][^"']*(?:content|article|main|detail|text)[^"']*["'][\s\S]*?<\/div>/i) || [])[0]
                || h;
        const paras = (main.match(/<p[\s\S]*?<\/p>/gi) || []).map(textOf).filter(t => t.length >= 15);
        let body = paras.join("\n\n");
        if (body.length < 120) body = textOf(main).replace(/\n{2,}/g, "\n\n");
        body = stripFooterLines(body);
        // 提取正文配图（过滤小图标/广告/logo；补全相对地址）
        const imgs = [];
        const imgRe = /<img[^>]*>/gi;
        let im;
        while ((im = imgRe.exec(main)) !== null) {
          const tag = im[0];
          const sm = tag.match(/src=["']([^"']+)["']/i);
          if (!sm) continue;
          let u = sm[1].trim();
          if (!u || /^data:/i.test(u)) continue;
          try { u = new URL(u, url).href; } catch (e) { continue; }
          if (/(logo|icon|sprite|spacer|blank|qrcode|2wm|weixin|wechat|weibo|share|btn|button|avatar|banner|nav|menu|footer|header|back|print|search|arrow|more|next|prev|star|dot|bg_|background|ad_|adv|poster|thumb|qq|sina|email|tel|phone|\.svg(\?|$)|placeholder|loading)/i.test(u)) continue;
          const atm = tag.match(/alt=["']([^"']*)["']/i);
          if (atm && /(图标|二维码|微信|微博|分享|打印|返回|顶部|导航|logo|icon)/i.test(atm[1])) continue;
          const wm = tag.match(/width=["']?(\d{1,4})["']?/i);
          if (wm && parseInt(wm[1], 10) > 0 && parseInt(wm[1], 10) < 160) continue;
          const hm = tag.match(/height=["']?(\d{1,4})["']?/i);
          if (hm && parseInt(hm[1], 10) > 0 && parseInt(hm[1], 10) < 120) continue;
          if (!imgs.includes(u)) imgs.push(u);
        }
        let source = "";
        try { source = new URL(url).hostname.replace(/^www\./, ""); } catch (e) {}
        const gd = /广东|广州|深圳|佛山|东莞|珠海|粤港澳|大湾区|湾区|中山|惠州|汕头|湛江|江门|肇庆|清远|韶关|梅州|茂名|揭阳|潮州|汕尾|河源|阳江|云浮/.test((title + body).slice(0, 4000));
        return { title: title || "导入的网页", body: body || "", date, source, region: gd ? "广东" : "全国", url, imgs };
      }

      async function fetchPageHtml(url) {
        // 1) 自己的后端代理（若已配置，最稳）
        try {
          if (window.Social && Social.isConfigured && Social.isConfigured()) {
            const r = await fetch(Social.getBase() + "/api/fetch-url?url=" + encodeURIComponent(url));
            if (r.ok) { const j = await r.json(); if (j && j.html) return j.html; }
          }
        } catch (e) {}
        // 2) 公共 CORS 代理兜底
        const proxies = [
          u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
          u => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
          u => "https://r.jina.ai/" + u
        ];
        for (const p of proxies) {
          try { const r = await fetch(p(url)); if (r.ok) return await r.text(); } catch (e) {}
        }
        throw new Error("网页抓取失败（浏览器跨域限制）。若已部署后端，在设置里填好后端地址后导入会更稳定。");
      }

      function openImportUrl() {
        const box = UI.el(`<div>
          <div class="muted small" style="margin-bottom:8px">粘贴一个新闻网页地址，自动抓取标题 / 日期 / 正文，并按时事热点同样的排版归档（可标注、加笔迹、导出 PDF）。</div>
          <input id="impUrl" class="kg-fld" style="width:100%" placeholder="https://example.com/news/..."/>
          <div id="impMsg" class="muted small" style="margin-top:8px"></div>
        </div>`);
        UI.modal({
          title: "➕ 导入网页", body: box, width: "560px",
          actions: [
            { label: "取消", cls: "ghost", onClick: (m, c) => c() },
            { label: "抓取并导入", cls: "primary", onClick: async (m, c) => {
              const u = (box.querySelector("#impUrl").value || "").trim();
              const msg = box.querySelector("#impMsg");
              if (!/^https?:\/\//i.test(u)) { msg.textContent = "请填写以 http(s):// 开头的完整网址。"; return; }
              msg.textContent = "正在抓取…";
              try {
                const html = await fetchPageHtml(u);
                const a = htmlToArticle(html, u);
                if (!a.body) { msg.textContent = "没能抓到正文内容，换个网页试试。"; return; }
                a.id = "imp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                const list = (DB.state.hotspotsImports = DB.state.hotspotsImports || []);
                list.unshift(a);
                DB.save();
                scheduleSyncHotspots();
                c(); renderHotspots();
                UI.toast("已导入：" + a.title.slice(0, 20));
              } catch (e) { msg.textContent = "抓取失败：" + (e && e.message ? e.message : e); }
            } }
          ]
        });
      }
      const hsImportBtn = hsBody.querySelector("#hsImport");
      if (hsImportBtn) hsImportBtn.onclick = openImportUrl;

      let lastCrawlTs = 0;
      hsBody.querySelector("#hsRefresh").onclick = () => {
        const now = Date.now();
        if (now - lastCrawlTs < 3 * 60 * 1000) {
          UI.toast("刚刚已触发过抓取，云端正在处理，请稍候再点");
          setTimeout(loadHotspots, 3000);
          return;
        }
        lastCrawlTs = now;
        UI.toast("已触发云端抓取，约 1 分钟后更新，请稍候…");
        triggerCrawlDispatch();
        // 轮询拉取：直到 updatedAt 变化（最多 8 次 × 15s），避免固定 6s 拉不到又让用户再点
        const baseUpdated = (window.KG_HOTSPOTS && window.KG_HOTSPOTS.updatedAt) || "";
        let tries = 0;
        const timer = setInterval(() => {
          tries++;
          loadHotspots();
          const up = (window.KG_HOTSPOTS && window.KG_HOTSPOTS.updatedAt) || "";
          if ((up && up !== baseUpdated) || tries >= 8) clearInterval(timer);
        }, 15000);
      };

      /* =========== 🎯 每周时政演练（考点学习 + 模拟演练，支持自导入） =========== */
      const drSec = UI.section("🎯 每周时政演练（考点学习 + 模拟演练）", { open: true });
      body.appendChild(drSec);
      const drBody = drSec.querySelector(".kg-det-b");
      /* 考点重点突出：① 书名号《》内的政策/文件/文章名 ② 时间/数字（年份·百分数·期次）
       * ③ 用户显式 **标粗**（PDF 原标粗 / 自导入保留）。内置 drills-data.js 考点无 **，
       * 靠①②自动突出重点；自导入 PDF 的 ** 照常生效。esc 先行，注入的 <b> 受信任。 */
      const drBold = s => {
        let h = esc(s || "");
        h = h.replace(/《([^》]{1,80})》/g, '《<b class="dr-emp">$1</b>》');
        h = h.replace(/(20\d{2}(?:年\d{1,2}月\d{1,2}日|年\d{1,2}月|年)|约?\d+(?:\.\d+)?%|第[一二三四五六七八九十百零0-9]+(?:期|次))/g, '<b class="dr-emp">$1</b>');
        h = h.replace(/\*\*([^*]{1,300})\*\*/g, "<b>$1</b>");
        return h;
      };

      function allDrills() {
        const built = (window.KG_DRILLS || []).map(w => Object.assign({ id: "d_" + w.label, custom: false }, w));
        const mine = (DB.state.weeklyDrills || []).slice();
        const key = w => { const m = /^(\d{1,2})\.(\d{1,2})/.exec(w.label || ""); return m ? (+m[1]) * 100 + (+m[2]) : 0; };
        return mine.concat(built).sort((a, b) => key(b) - key(a) || (b.createdAt || 0) - (a.createdAt || 0)); // 最新在前
      }

      function drillLabelSub(w) {
        return w.points.length + " 个考点 · " + w.questions.length + " 题" + (w.custom ? " · 自导入" : "");
      }

      function renderDrillList() {
        const ds = allDrills();
        drBody.innerHTML = `
          <div class="muted small" style="margin-bottom:8px">每周一期：先看<b>考点</b>（重点已加粗），再做<b>模拟演练</b>（单选 + 多选，做完统一核对答案，错题自动进错题本、可 AI 咨询）。最新一期在最前。</div>
          <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">
            <button class="btn sm primary" id="drImport">➕ 导入演练 PDF</button>
            <input type="file" id="drFile" accept=".pdf,.txt,.md" style="display:none"/>
            <span class="muted small" id="drStat"></span>
          </div>
          <div id="drList" class="dr-list"></div>`;
        const list = drBody.querySelector("#drList");
        list.innerHTML = ds.map(w => `
          <button class="dr-item" data-id="${esc(w.id)}">
            <span class="dr-ic">📄</span>
            <span class="dr-name"><b>${esc(w.name || ("每周时政演练 " + w.label))}</b><span class="muted small">${esc(drillLabelSub(w))}</span></span>
            <span class="dr-go">›</span>
          </button>`).join("");
        list.querySelectorAll(".dr-item").forEach(btn => {
          btn.onclick = () => {
            const w = ds.find(x => x.id === btn.dataset.id);
            if (w) openDrill(w);
          };
        });
        const file = drBody.querySelector("#drFile");
        drBody.querySelector("#drImport").onclick = () => file.click();
        file.onchange = () => importDrillFile(file.files[0]);
      }

      // 自导入：PDF/文本 → 解析（考点+题目+答案），命名默认取文件名、可修改
      async function importDrillFile(f) {
        if (!f) return;
        const stat = drBody.querySelector("#drStat");
        try {
          stat.textContent = "正在提取 " + f.name + " …";
          let text = "";
          if (/\.pdf$/i.test(f.name)) {
            const r = await window.KGPdfImport.fileToPages(f);
            text = (r.pages || []).join("\n");
          } else {
            text = await f.text();
          }
          const parsed = parseDrillText(text);
          if (!parsed.points.length && !parsed.questions.length) {
            stat.innerHTML = '<span style="color:var(--red)">⚠️ 未识别到考点/题目（请确认是「每周时政演练」格式 PDF）</span>';
            return;
          }
          const defName = f.name.replace(/\.(pdf|txt|md)$/i, "");
          const m = /(\d{1,2}\.\d{1,2})\s*-\s*(\d{1,2}\.\d{1,2})/.exec(defName);
          const defLabel = m ? m[1] + "-" + m[2] : "";
          const mbox = UI.el(`<div>
              <label class="kg-fld">名称<input id="drNm" value="${esc(defName)}" maxlength="60"/></label>
              <label class="kg-fld">时间标签（如 9.14-9.20）<input id="drLb" value="${esc(defLabel)}" placeholder="自动识别，可修改" maxlength="20"/></label>
              <div class="muted small">识别到 <b>${parsed.points.length}</b> 个考点、<b>${parsed.questions.length}</b> 道题（单选 ${parsed.questions.filter(q => q.t === "单选").length} / 多选 ${parsed.questions.filter(q => q.t === "多选").length}）。导入后随云端同步到所有设备；PDF 里的<b>标粗重点</b>会保留突出显示（旧版导入的演练若没有标粗，删除后重新导入一次即可）。</div>
            </div>`);
          UI.modal({
            title: "确认导入演练", width: "440px", body: mbox,
            actions: [
              { label: "取消", cls: "ghost", onClick: (m2, c) => { c(); stat.textContent = ""; } },
              { label: "导入", cls: "primary", onClick: (m2, c) => {
                  const name = mbox.querySelector("#drNm").value.trim() || defName;
                  const label = mbox.querySelector("#drLb").value.trim() || defName;
                  DB.state.weeklyDrills = DB.state.weeklyDrills || [];
                  DB.state.weeklyDrills.push({
                    id: "u_" + Date.now(), label: label, name: name, custom: true,
                    points: parsed.points, questions: parsed.questions, createdAt: Date.now()
                  });
                  DB.save();
                  c(); UI.toast("✓ 演练已导入：" + name);
                  renderDrillList();
                } }
            ]
          });
          stat.textContent = "";
        } catch (e) {
          stat.innerHTML = '<span style="color:var(--red)">❌ 提取失败：' + esc(e.message || e) + '</span>';
        }
      }

      // 客户端解析器（与 tools/extract_drills.py 同规则）：考点 + 模拟演练 + 答案
      function parseDrillText(text) {
        const CJK = "\\u4e00-\\u9fff\\u3000-\\u303f\\uff00-\\uffef";
        const cleanLine = s => s
          .replace(new RegExp("(?<=[" + CJK + "])\\s+(?=[" + CJK + "])", "g"), "")
          .replace(new RegExp("(?<=\\d)\\s+(?=[" + CJK + "])", "g"), "")
          .replace(new RegExp("(?<=[" + CJK + "])\\s+(?=\\d)", "g"), "")
          .replace(/\s+([，。、；：？！）】》])/g, "$1")
          .replace(/([（【《])\s+/g, "$1")
          .replace(/[（(]\s*[）)]/g, "（  ）")
          .trim();
        const ITEM = /^(\d{1,3})[.、．]\s*(.+)$/, OPT = /^([A-D])[.、．]\s*(.*)$/,
              QM = /^(\d{1,3})\s*[.、．]?\s*【(单选|多选|判断)】\s*(.*)$/,
              ANS = /^(\d{1,3})\s*[.、．]\s*([A-D]{1,4})\s*$/, MARK = /^【(.+?)】\s*$/;
        let lines = String(text || "").replace(/\r\n?/g, "\n").split("\n").map(cleanLine).filter(Boolean);
        lines = lines.filter(l => {
          if (/^\d{1,3}$/.test(l)) return false;
          if (/^\d{1,2}\.\d{1,2}\s*-\s*\d{1,2}\.\d{1,2}$/.test(l)) return false;
          if (l === "本资料仅供内部交流使用" || /官方微信/.test(l)) return false;
          return true;
        });
        const cut = lines.findIndex(l => /免责声明/.test(l));
        if (cut >= 0) lines = lines.slice(0, cut);
        const points = [], questions = [], answers = {};
        let mode = "point", cur = null, curq = null;
        for (const raw of lines) {
          const l = raw.replace(/\*\*/g, "");
          const mm = MARK.exec(l);
          if (mm) {
            if (/模拟演练/.test(mm[1])) { mode = "quiz"; if (cur) { points.push(cur); cur = null; } continue; }
            if (/^答案|^参考答案/.test(mm[1])) { mode = "answer"; if (curq) { questions.push(curq); curq = null; } continue; }
          }
          if (mode === "point") {
            /* 考点区保留 PDF 原有的 **标粗**（渲染时由 drBold 转粗体）：
               标题先在含标粗的原文行上匹配，剥掉首尾星号；正文整行原样累积。
               仅当原文行匹配失败（如 **12.** 开头）才退回去星后的行。 */
            const imR = ITEM.exec(raw), imL = ITEM.exec(l);
            const im = imR || imL;
            if (im && !OPT.test(l)) {
              if (cur) points.push(cur);
              const seg = (imR ? imR[2] : imL[2]).replace(/^\*\*+|\*\*+$/g, "").trim();
              cur = { n: +im[1], title: seg.includes("**") ? seg : "**" + seg + "**", body: "" };
              continue;
            }
            if (cur) { cur.body += raw; }
          } else if (mode === "quiz") {
            const qm = QM.exec(l);
            if (qm) { if (curq) questions.push(curq); curq = { t: qm[2], n: +qm[1], q: qm[3], options: [] }; continue; }
            const om = OPT.exec(l);
            if (om && curq) { curq.options.push(om[1] + "." + om[2]); continue; }
            const am = ANS.exec(l);
            if (am && !curq) { answers[am[1]] = am[2]; continue; }
            if (curq) { if (curq.options.length) curq.options[curq.options.length - 1] += l; else curq.q += l; }
          } else {
            const am = ANS.exec(l);
            if (am) answers[am[1]] = am[2];
            else { let m2; const re = /(\d{1,3})\s*[.、．]\s*([A-D]{1,4})/g; while ((m2 = re.exec(l))) answers[m2[1]] = m2[2]; }
          }
        }
        if (cur) points.push(cur);
        if (curq) questions.push(curq);
        const qs = [];
        for (const q of questions) {
          const a = answers[String(q.n)] || "";
          if (!a || !q.options.length) continue;
          qs.push({ t: q.t, q: q.q, options: q.options, a: a });
        }
        return { points: points, questions: qs };
      }

      function openDrill(w) {
        drBody.innerHTML = `
          <div class="row" style="gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
            <button class="btn sm ghost" id="drBack">‹ 返回列表</button>
            <b>${esc(w.name || ("每周时政演练 " + w.label))}</b>
            <span class="muted small">${esc(drillLabelSub(w))}</span>
          </div>
          <div id="drPoints"></div>
          <div class="row" style="gap:8px;margin:10px 0;flex-wrap:wrap">
            <button class="btn primary" id="drQuiz">📝 开始模拟演练（${w.questions.length} 题）</button>
            <span class="muted small">做完统一核对答案；错题自动进错题本，可 AI 咨询</span>
          </div>
          <div id="drQuizHost"></div>`;
        const pts = drBody.querySelector("#drPoints");
        pts.innerHTML = `<h3 class="dr-h">📖 本周考点</h3>` + w.points.map(p => `
          <div class="dr-pt">
            <div class="dr-pt-t">${drBold(p.n + ". " + p.title)}</div>
            ${p.body ? `<div class="dr-pt-b">${drBold(p.body)}</div>` : ""}
          </div>`).join("");
        drBody.querySelector("#drBack").onclick = renderDrillList;
        drBody.querySelector("#drQuiz").onclick = () => {
          if (!w.questions.length) { UI.toast("该周没有题目"); return; }
          const qs = w.questions.map(q => ({ q: q.q, options: q.options, a: q.a, e: "", kp: "时政演练" }));
          const run = () => window.Quiz.start(drBody.querySelector("#drQuizHost"), qs.map(q => Object.assign({}, q)), "时政演练", { onAgain: run });
          run();
          setTimeout(() => { const h = drBody.querySelector("#drQuizHost"); if (h) h.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
        };
      }
      renderDrillList();

      /* =========== 历史时政（全部归档：自动抓取 + 导入网页 + 我的记录） =========== */
      const histSec = UI.section("🗂 历史时政（全部归档 · 可搜索）", { open: false });
      body.appendChild(histSec);
      const histBody = histSec.querySelector(".kg-det-b");
      histBody.innerHTML = `
        <div class="hs-bar" style="margin-bottom:6px">
          <div class="hs-tools" style="flex:1">
            <input id="histSearch" class="hs-search" type="search" placeholder="🔍 搜索历史时政（标题/正文/来源）"/>
            <button class="hs-btn" id="histSearchBtn">搜索</button>
          </div>
          <span class="muted small" id="histStat"></span>
        </div>
        <div id="histList"><div class="empty">加载中…</div></div>`;
      const histList = histBody.querySelector("#histList");
      const histStat = histBody.querySelector("#histStat");
      const HIST = { q: "", loaded: false, items: [], openMonth: {} };

      function weekday(d) {
        const t = Date.parse(d);
        if (isNaN(t)) return "";
        return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date(t).getDay()];
      }
      function normKeyH(s) { return (s || "").replace(/\s+/g, "").slice(0, 40); }

      function normalizeHist() {
        const server = (window.KG_HOTSPOTS_HISTORY && window.KG_HOTSPOTS_HISTORY.items)
                    || (window.KG_HOTSPOTS && window.KG_HOTSPOTS.items) || [];
        const imports = DB.state.hotspotsImports || [];
        const records = (DB.state.currentAffairs || []).map(r => {
          const d = r.data || {};
          const body = [
            (d.news || []).map(n => (n.title || "") + " " + (n.body || "")).join("\n"),
            (d.essay && (d.essay.paras || []).join("\n")),
            (d.words || []).map(w => (w.word || "") + "：" + (w.def || "")).join("\n")
          ].filter(Boolean).join("\n");
          return {
            id: "rec_" + r.id, date: r.date || "", title: r.title || "时政记录",
            source: "我的时政记录", region: "全国", type: "record",
            summary: body.slice(0, 160), body: body, url: "", imgs: [], rec: r
          };
        });
        const merged = [];
        const seen = new Set();
        function pushIt(it) {
          const k = (it.type === "record" ? "rec" : it.type === "import" ? "imp" : "web")
                  + "|" + normKeyH(it.title) + "|" + (it.date || "");
          if (seen.has(k)) return;
          seen.add(k);
          it.summary = it.summary || (it.body ? it.body.slice(0, 160) : "");
          it.imgs = it.imgs || [];
          it.url = it.url || "";
          merged.push(it);
        }
        server.forEach(it => pushIt(Object.assign({}, it, { type: "web", id: "h_" + normKeyH(it.title) + "_" + (it.date || "") })));
        imports.forEach(it => pushIt(Object.assign({}, it, { type: "import", id: it.id || ("imp_" + normKeyH(it.title)) })));
        records.forEach(it => pushIt(it));
        return merged;
      }

      function groupHist(items) {
        const byMonth = {};
        items.forEach(it => {
          const d = it.date || "未标注";
          const ym = d.length >= 7 ? d.slice(0, 7) : "未标注";
          byMonth[ym] = byMonth[ym] || {};
          (byMonth[ym][d] = byMonth[ym][d] || []).push(it);
        });
        const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));
        return months.map(ym => {
          const label = ym === "未标注" ? "未标注日期" : (parseInt(ym.slice(0, 4)) + "年" + parseInt(ym.slice(5, 7)) + "月");
          const days = Object.keys(byMonth[ym]).sort((a, b) => b.localeCompare(a));
          const dayGroups = days.map(d => {
            const dd = d === "未标注" ? "未标注" : (parseInt(d.slice(5, 7)) + "月" + parseInt(d.slice(8, 10)) + "日 " + weekday(d));
            return { dateKey: d, label: dd, items: byMonth[ym][d] };
          });
          return { ym, label, dayGroups, count: dayGroups.reduce((s, g) => s + g.items.length, 0) };
        });
      }

      function renderHist() {
        histList.innerHTML = "";
        const all = normalizeHist();
        HIST.items = all;
        const q = (HIST.q || "").trim().toLowerCase();
        let filtered = all;
        if (q) {
          filtered = all.filter(it => {
            const hay = [it.title, it.summary, it.body, it.source].filter(Boolean).join(" ").toLowerCase();
            return hay.indexOf(q) >= 0;
          });
        }
        if (!filtered.length) {
          histList.innerHTML = `<div class="empty">${q ? "没有匹配的历史时政。" : "暂无可归档的时政记录。"}</div>`;
          histStat.textContent = "";
          return;
        }
        const groups = groupHist(filtered);
        histStat.textContent = `共 ${filtered.length} 条${q ? "（已筛选）" : ""} · 跨 ${groups.length} 个月`;
        const searching = !!q;
        groups.forEach((mo, mi) => {
          const monthOpen = searching ? true : (HIST.openMonth[mo.ym] !== undefined ? HIST.openMonth[mo.ym] : (mi === 0));
          const mEl = UI.el(`<div class="hist-month ${monthOpen ? "open" : ""}" data-ym="${mo.ym}">
            <div class="hist-month-h"><span class="hs-caret">${monthOpen ? "▾" : "▸"}</span><span class="hist-month-t">📂 ${esc(mo.label)}</span><span class="muted small">${mo.count} 条</span></div>
            <div class="hist-month-b" ${monthOpen ? "" : "hidden"}></div></div>`);
          const mBody = mEl.querySelector(".hist-month-b");
          mo.dayGroups.forEach((dg, di) => {
            const dayOpen = searching ? true : (monthOpen && mi === 0 && di === 0);
            const dEl = UI.el(`<div class="hist-day ${dayOpen ? "open" : ""}" data-d="${esc(dg.dateKey)}">
              <div class="hist-day-h"><span class="hs-caret">${dayOpen ? "▾" : "▸"}</span><span class="hist-day-t">📅 ${esc(dg.label)}</span><span class="muted small">${dg.items.length} 条</span></div>
              <div class="hist-day-b" ${dayOpen ? "" : "hidden"}></div></div>`);
            const dBody = dEl.querySelector(".hist-day-b");
            dg.items.forEach(it => {
              const tagHtml = it.type === "record" ? `<span class="hist-tag tag-rec">我的记录</span>`
                           : it.type === "import" ? `<span class="hist-tag tag-imp">导入</span>` : "";
              dBody.insertAdjacentHTML("beforeend", `<div class="hist-item" data-id="${esc(it.id)}" data-type="${it.type}">
                <div class="hot-item-h">
                  <span class="hot-badge ${it.region === "广东" ? "gd" : "cn"}">${it.region === "广东" ? "广东" : "全国"}</span>
                  ${tagHtml}
                  <span class="hot-src">${esc(it.source || "")}</span>
                </div>
                <div class="hot-title">${hl(it.title)}</div>
                ${it.summary ? `<div class="hot-sum">${hl(it.summary)}</div>` : ""}
              </div>`);
            });
            dEl.querySelector(".hist-day-h").onclick = () => {
              const open = !dEl.classList.contains("open");
              dEl.classList.toggle("open", open);
              dEl.querySelector(".hist-day-b").hidden = !open;
              dEl.querySelector(".hs-caret").textContent = open ? "▾" : "▸";
            };
            mBody.appendChild(dEl);
          });
          mEl.querySelector(".hist-month-h").onclick = () => {
            const open = !mEl.classList.contains("open");
            mEl.classList.toggle("open", open);
            mEl.querySelector(".hist-month-b").hidden = !open;
            mEl.querySelector(".hs-caret").textContent = open ? "▾" : "▸";
            HIST.openMonth[mo.ym] = open;
          };
          histList.appendChild(mEl);
        });
        histList.querySelectorAll(".hist-item").forEach(el => {
          el.onclick = () => {
            const it = HIST.items.find(x => x.id === el.dataset.id);
            if (!it) return;
            if (it.type === "record") viewRecord(it.rec);
            else openHotspot(it, false);
          };
        });
      }

      function loadHist() {
        if (HIST.loaded) { renderHist(); return; }
        histList.innerHTML = `<div class="empty">加载中…</div>`;
        fetch("assets/data/hotspot_history.js?t=" + Date.now(), { cache: "no-store" })
          .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
          .then(txt => {
            const m = txt.indexOf("=");
            window.KG_HOTSPOTS_HISTORY = JSON.parse(txt.slice(m + 1).replace(/;\s*$/, ""));
            HIST.loaded = true; renderHist();
          })
          .catch(() => { HIST.loaded = true; renderHist(); });
      }
      const histSearch = histBody.querySelector("#histSearch");
      let histTimer = null;
      function applyHistSearch() { HIST.q = histSearch.value || ""; renderHist(); }
      histSearch.oninput = () => {
        clearTimeout(histTimer);
        histTimer = setTimeout(applyHistSearch, 200);
      };
      histSearch.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(histTimer); applyHistSearch(); } };
      histBody.querySelector("#histSearchBtn").onclick = () => { clearTimeout(histTimer); applyHistSearch(); };
      loadHist();

      loadHotspots();

      /* 进入本模块时，若已登录社交账号，自动拉取其他设备的时政记录并合并 */
      pullHotspots().then(() => { try { refreshCurrentViews(); } catch (e) {} });

      /* —— 导入卡 —— */
      const today = DB.today();
      const card = UI.el(`<div class="card">
        <h3>📝 粘贴时政材料，自动识别</h3>
        <div class="muted small">把每天整理的「时政汇总 / 申论时评+金句 / 时政词语 / 原创言语真题 / 原创时政单选」整段粘进来即可。识别后会存入本模块，按日期归档。</div>
        <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap;align-items:center">
          <label class="fld" style="margin:0">日期</label>
          <input type="date" id="curDate" value="${today}" style="width:160px"/>
          <button class="btn ghost" id="curSample">填入示例格式</button>
        </div>
        <textarea id="curText" rows="9" placeholder="第一部分：XXXX年X月X日公考标准时政汇总（星级重难点）&#10;国内时政&#10;⭐1. …&#10;…" style="margin-top:8px;width:100%"></textarea>
        <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button class="btn primary" id="curSave">✓ 识别并保存</button>
          <span class="muted small">识别后自动跳到本页列表，可直接查看/练题</span>
        </div>
      </div>`);
      // 粘贴区默认折叠，记录区默认展开
      const pasteSec = UI.section("📝 粘贴时政材料", { open: false });
      pasteSec.querySelector(".kg-det-b").appendChild(card);
      body.appendChild(pasteSec);

      /* =========== 每日时政热点（每晚 20:00 自动生成：材料 + 言语 10 题 + 时政 20 题） =========== */
      const hotSec = UI.section("🔥 每日时政热点（每晚 20:00 自动生成）", { open: false });
      body.appendChild(hotSec);
      mountDailyHot(hotSec.querySelector(".kg-det-b"));

      const SAMPLE = [
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

      card.querySelector("#curSample").onclick = () => { card.querySelector("#curText").value = SAMPLE; };
      card.querySelector("#curSave").onclick = () => {
        const txt = card.querySelector("#curText").value.trim();
        if (!txt) { UI.toast("请先粘贴文字"); return; }
        try {
          const rec = importText(txt, card.querySelector("#curDate").value || today);
          UI.toast("已识别并保存：" + rec.title);
          location.hash = "#/current";
          renderList();
        } catch (e) { UI.toast("识别失败：" + e.message); }
      };

      /* —— 列表 —— */
      const lc = UI.el(`<div class="card" style="margin-top:14px"><h3>📅 我的时政记录</h3><div id="curList"></div></div>`);
      const recSec = UI.section("📅 我的时政记录", { open: true });
      recSec.querySelector(".kg-det-b").appendChild(lc);
      body.appendChild(recSec);
      function renderList() { renderRecords(lc.querySelector("#curList")); }
      renderList();

      /* 顶部快捷入口：展开并定位到「历史时政」/「我的时政记录」 */
      const gotoHistBtn = document.getElementById("gotoHist");
      if (gotoHistBtn) gotoHistBtn.onclick = () => {
        histSec.open = true;
        loadHist();
        histSec.scrollIntoView({ behavior: "smooth", block: "start" });
      };
      const gotoRecBtn = document.getElementById("gotoRec");
      if (gotoRecBtn) gotoRecBtn.onclick = () => {
        recSec.open = true;
        recSec.scrollIntoView({ behavior: "smooth", block: "start" });
      };

      /* —— 时政记录同步（社交后端，像聊天那样跨设备 / 多端一致）—— */
      refreshCurrentViews = () => { try { renderList(); renderHotspots(); renderHist(); } catch (e) {} };
      const hsSyncBtn = document.getElementById("hsSync");
      if (hsSyncBtn) hsSyncBtn.onclick = async () => {
        if (!hsLoggedIn()) { UI.toast("请先在「我的」登录社交账号，才能跨设备同步时政记录"); return; }
        hsSyncBtn.disabled = true;
        UI.toast("正在同步时政记录…");
        try { await pushHotspots(); await pullHotspots(); refreshCurrentViews(); UI.toast("已同步：我的记录 + 导入网页"); }
        catch (e) { UI.toast("同步失败：" + (e && e.message ? e.message : e)); }
        finally { hsSyncBtn.disabled = false; }
      };
      setHsSyncStatus(hsLoggedIn() ? "ok" : "off");

      function renderRecords(host) {
        const arr = listRecords();
        if (!arr.length) { host.innerHTML = `<div class="empty">还没有记录，粘贴上面的文字识别后即可归档。</div>`; return; }
        host.innerHTML = arr.map(r => {
          const qn = allQuestions(r).length;
          const news = (r.data.news || []).length;
          const words = (r.data.words || []).length;
          return `<div class="cur-item" data-id="${r.id}">
            <div class="cur-item-h">
              <input class="ct" value="${esc(r.title)}" title="可修改名称" style="flex:1;min-width:180px;font-weight:700"/>
              <span class="muted small">${esc(r.date)} · 时政 ${news} 条 · 词语 ${words} 个 · 题 ${qn} 道</span>
            </div>
            <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">
              <input type="date" class="cd" value="${esc(r.date)}" style="width:150px"/>
              <button class="btn c-view">📖 查看资料</button>
              ${qn ? `<button class="btn primary c-go">✍ 练题（${qn}）</button>` : ""}
              <button class="btn c-pdf">⬇ 导出PDF（全部）</button>
              ${qn ? `<button class="btn ghost c-pdfw">⬇ 错题PDF</button>` : ""}
              <button class="btn danger c-del">🗑 删除</button>
            </div>
          </div>`;
        }).join("");
        host.querySelectorAll(".cur-item").forEach(it => {
          const id = it.dataset.id, rec = getRecord(id);
          it.querySelector(".cd").onchange = e => { setDate(id, e.target.value); UI.toast("已修改日期"); };
          it.querySelector(".ct").onchange = e => { setTitle(id, e.target.value); UI.toast("已修改名称"); };
          it.querySelector(".c-view").onclick = () => viewRecord(rec);
          const go = it.querySelector(".c-go");
          if (go) go.onclick = () => practice(rec);
          it.querySelector(".c-pdf").onclick = () => exportPdf(rec, true);
          const pw = it.querySelector(".c-pdfw");
          if (pw) pw.onclick = () => window.PDF.exportWrong(SUBJECT);
          it.querySelector(".c-del").onclick = () => {
            UI.confirm("删除这条时政记录？").then(ok => {
              if (!ok) return;
              removeRecord(id); renderList(); UI.toast("已删除");
            });
          };
        });
      }

      function viewRecord(rec) {
        if (!rec) return;
        const box = UI.el(`<div style="max-height:70vh;overflow:auto">${recordHtml(rec, true)}</div>`);
        box.appendChild(UI.notebook(SUBJECT, "rec_" + rec.id, box));
        UI.modal({
          title: "📖 " + (rec.title || "时政资料"), body: box, width: "780px",
          actions: [
            { label: "⬇ 导出PDF", cls: "ghost", onClick: () => exportPdf(rec, true) },
            { label: "关闭", cls: "ghost", onClick: (m, c) => c() }
          ]
        });
      }

      function practice(rec) {
        const qs = allQuestions(rec);
        if (!qs.length) { UI.toast("这条记录里没有可练习的题目"); return; }
        const box = UI.el(`<div class="card"><div class="cur-quiz"></div></div>`);
        UI.modal({
          title: "✍ " + (rec.title || "时政练习"), body: box, width: "820px",
          actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }]
        });
        try {
          window.Quiz.start(box.querySelector(".cur-quiz"), qs, SUBJECT, {});
        } catch (e) { box.querySelector(".cur-quiz").innerHTML = `<div class="empty">练习启动失败：${esc(e.message)}</div>`; }
      }

      function exportPdf(rec, withAnswer) {
        const rid = "rec_" + rec.id;
        let html = recordHtml(rec, withAnswer);
        // 若写了手写痕迹，按捕获时的内容宽度包裹并叠加矢量覆盖层（位置不偏移）
        const notes = UI.Notes.get(SUBJECT, rid);
        if (notes && notes.strokes && notes.strokes.length) {
          const W = notes.vw || 720;
          html = `<div style="position:relative;width:${W}px">${html}${UI.Notes.overlayHtml(notes)}</div>`;
        }
        html += UI.Attachments.toHtml(SUBJECT, rid);
        window.PDF.exportHtml((rec.title || "时政复习") + (withAnswer ? "（含答案）" : ""), html);
        UI.toast("已生成PDF，请在打印窗口选择「另存为 PDF」");
      }
    }
  };
})();
