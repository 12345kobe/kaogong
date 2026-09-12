/* 模块：时政（每日时政 / 申论时评金句 / 时政词语 / 原创言语真题 / 原创时政单选）
   支持把「定制格式」的纯文字直接粘贴识别 → 存 DB.state.currentAffairs → 页面自动跳到本模块。
   资料可查看、可练题（做错的进「时政」错题本）、可导出 PDF（全部 / 错题）。 */
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};
  const DB = window.DB;
  const SUBJECT = "时政";

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
        const am = /^【答案】\s*([A-Ea-e])\b/.exec(t);
        if (am) { a = am[1].toUpperCase().charCodeAt(0) - 65; i++; continue; }
        const tm = /^【答案】\s*(.+)$/.exec(t);
        if (tm) { e = "【答案】" + tm[1] + (e ? "　" + e : ""); i++; continue; }
        const em = /^【解析】\s*(.+)$/.exec(t);
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
    if (i >= 0) { arr.splice(i, 1); DB.save(); return true; }
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
      body.appendChild(card);

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
      body.appendChild(lc);
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
        const html = recordHtml(rec, withAnswer);
        window.PDF.exportHtml((rec.title || "时政复习") + (withAnswer ? "（含答案）" : ""), html);
        UI.toast("已生成PDF，请在打印窗口选择「另存为 PDF」");
      }
    }
  };
})();
