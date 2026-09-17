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
        if (/^【答案】|^【解析】/.test(t)) break;
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
        //   也可用选项文字作答：如「【答案】普惠、创新、协同」
        //   兼容答案与解析同行：如「【答案】A【解析】官方表述」
        const am = /^(?:【?答案】?|正确答案|正确选项)\s*[:：]?\s*([A-Da-d])\b(?:\s*[#【\[]?解析[#】\]]?\s*[:：]?\s*(.*))?$/.exec(t);
        if (am) {
          a = am[1].toUpperCase().charCodeAt(0) - 65;
          if (am[2] && am[2].trim()) e = (e ? e + "　" : "") + am[2].trim();
          i++; continue;
        }
        const tm = /^(?:【?答案】?|正确答案|正确选项)\s*[:：]?\s*(.+)$/.exec(t);
        if (tm) {
          const txt = tm[1].trim();
          const fi = opts.findIndex(o => o.replace(/\s+/g, "") === txt.replace(/\s+/g, ""));
          if (fi >= 0) a = fi;
          e = (e ? e + "　" : "") + "【答案】" + txt;
          i++; continue;
        }
        const em = /^【解析】\s*[:：]?\s*(.+)$/.exec(t);
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
      DB.save(); return true;
    }
    return false;
  }
  function setDate(id, date) { const r = getRecord(id); if (r) { r.date = date; DB.save(); } }
  function setTitle(id, title) {
    const r = getRecord(id); if (!r) return;
    const t = String(title == null ? "" : title).trim();
    r.title = t || (r.date || DB.today()) + " 时政";
    DB.save();
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
          const ans = (q.a >= 0) ? String.fromCharCode(65 + q.a) : "—";
          h += `<p style="color:#0a7">【答案】${ans}${q.e ? "　" + esc(q.e) : ""}</p>`;
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

  /* ================= 五、模块 UI ================= */
  window.KGCurrent = {
    parse: parseCurrentText, importText, list: listRecords, get: getRecord,
    remove: removeRecord, setDate: setDate, setTitle: setTitle, allQuestions: allQuestions,
    recordHtml: recordHtml, subject: SUBJECT
  };

  window.MODULES.current = {
    title: "时政", icon: "current",
    render(body) {
      const UI = window.UI;
      UI.StudyPanel && UI.StudyPanel("current", body);

      /* =========== 时事热点（每日 12:00 / 20:00 自动抓取） =========== */
      const hsSec = UI.section("🔥 时事热点（每日 12:00 / 20:00 自动抓取）", { open: false });
      body.appendChild(hsSec);
      const hsBody = hsSec.querySelector(".kg-det-b");
      hsBody.innerHTML = `
        <div class="muted small" style="margin-bottom:8px">热点来自中国政府网 / 大洋网（广州日报）等权威来源，每条保留<strong>原始发布日期</strong>，绝不把旧闻标成今天。<strong>全国</strong>在前、<strong>广东</strong>在后；按日期归档，可搜索关键词，并可<strong>标注重点 / 加笔迹 / 导出 PDF</strong>。</div>
        <div class="hs-bar">
          <div class="hs-tabs">
            <button class="hs-tab active" data-r="全国">🌐 全国 <span class="hs-n" id="hsN1">0</span></button>
            <button class="hs-tab" data-r="广东">🏙 广东 <span class="hs-n" id="hsN2">0</span></button>
          </div>
          <div class="hs-tools">
            <input id="hsSearch" class="hs-search" type="search" placeholder="🔍 搜索关键词（标题/正文/来源）"/>
            <button class="btn sm ghost" id="hsImport">➕ 导入网页</button>
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
      hsSearch.oninput = () => {
        clearTimeout(hsTimer);
        hsTimer = setTimeout(() => { HS.q = hsSearch.value || ""; renderHotspots(); }, 200);
      };

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
        let main = (h.match(/<article[\s\S]*?<\/article>/i) || [])[0]
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
          if (/(logo|icon|sprite|spacer|blank|qrcode|weixin|wechat|share|btn|button|avatar|banner|\.svg(\?|$))/i.test(u)) continue;
          const wm = tag.match(/width=["']?(\d{1,4})["']?/i);
          if (wm && parseInt(wm[1], 10) > 0 && parseInt(wm[1], 10) < 120) continue;
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
                c(); renderHotspots();
                UI.toast("已导入：" + a.title.slice(0, 20));
              } catch (e) { msg.textContent = "抓取失败：" + (e && e.message ? e.message : e); }
            } }
          ]
        });
      }
      const hsImportBtn = hsBody.querySelector("#hsImport");
      if (hsImportBtn) hsImportBtn.onclick = openImportUrl;

      hsBody.querySelector("#hsRefresh").onclick = () => {
        UI.toast("已触发抓取，稍后自动刷新最新热点…");
        triggerCrawlDispatch();
        setTimeout(loadHotspots, 6000);
      };

      /* =========== 历史时政（全部归档：自动抓取 + 导入网页 + 我的记录） =========== */
      const histSec = UI.section("🗂 历史时政（全部归档 · 可搜索）", { open: false });
      body.appendChild(histSec);
      const histBody = histSec.querySelector(".kg-det-b");
      histBody.innerHTML = `
        <div class="muted small" style="margin-bottom:8px">这里汇总<strong>所有</strong>自动抓取的时事热点，以及你粘贴识别 / 导入网页的时政记录，按<strong>年份月份 → 具体日期</strong>两级归档，可搜索标题 / 正文 / 来源。点击任意条目查看详情。</div>
        <div class="hs-bar" style="margin-bottom:8px">
          <div class="hs-tools" style="flex:1">
            <input id="histSearch" class="hs-search" type="search" placeholder="🔍 搜索历史时政（标题/正文/来源）"/>
          </div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">
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
      histSearch.oninput = () => {
        clearTimeout(histTimer);
        histTimer = setTimeout(() => { HIST.q = histSearch.value || ""; renderHist(); }, 200);
      };
      loadHist();

      loadHotspots();

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
