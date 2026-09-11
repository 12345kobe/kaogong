/* 模块：PDF 题库导入
   - 前端用 pdf.js 提取 PDF 文字（按文字 Y 坐标重建行，解决"整页挤成一行"导致无法识别的问题）；
   - 支持「题目 PDF」+「答案 PDF（可选，题目与答案分离的题库）」；
   - 启发式识别题干 / A·B·C·D 选项 / 答案 / 解析，生成草稿卡片人工核对；
   - 保存到 DB.state.customQuestions[学科短名]，可在本模块练习、导出错题。
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

  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

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

  /* 按文字的 Y 坐标把零散 text item 还原成「行」，这是能识别题目的关键 */
  async function extractText(file) {
    const pdfjsLib = await loadPdfJs();
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let lastY = null, line = "";
      for (const it of content.items) {
        const y = (it.transform && it.transform[5] != null) ? it.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) {
          text += line.replace(/\s+$/, "") + "\n"; line = "";
        }
        line += it.str;
        if (it.hasEOL) { text += line.replace(/\s+$/, "") + "\n"; line = ""; lastY = null; continue; }
        lastY = y;
      }
      if (line.trim()) text += line.replace(/\s+$/, "") + "\n";
    }
    if (doc.destroy) await doc.destroy();
    return text;
  }

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

  /* 一行内出现 2 个以上选项标记时拆开：A.甲 B.乙 C.丙 D.丁 */
  function splitInlineOptions(line) {
    const re = /(?:^|[\s\u3000])([A-Ea-e])\s*[\.．、,，)）]\s*/g;
    const marks = [];
    let m;
    while ((m = re.exec(line)) !== null) {
      marks.push({ letter: m[1], start: m.index, end: re.lastIndex });
    }
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
      // 题号行：数字 1-9999 且后面不是「分值/分」这类
      if (qm && !/^\d{1,4}\s*分/.test(raw)) {
        flush();
        cur = { num: parseInt(qm[1], 10), q: qm[2] || "", options: [], a: 0, e: "", aSet: false };
        inOpts = false;
        continue;
      }
      if (!cur) continue;

      // 一行内含多个选项标记（如 "A.甲 B.乙 C.丙 D.丁"）→ 拆成多个选项
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
        // 仅当字母序号与当前选项数衔接时才视为选项（避免把 "A项语言" 之类误判）
        if (idx === cur.options.length || (idx <= cur.options.length + 1)) {
          while (cur.options.length < idx) cur.options.push("");
          cur.options[idx] = txt;
          inOpts = true;
          continue;
        }
      }

      // 答案/解析行
      const em = expRe.exec(raw);
      if (em && (inOpts || cur.options.length)) {
        const rest = (em[1] || "").trim();
        const am = rest.match(/^([A-Ea-e])\b/);
        if (am) setAns(am[1]);
        if (rest) cur.e = smartJoin(cur.e, rest);
        else cur.e = smartJoin(cur.e, raw);
        continue;
      }
      const amLine = raw.match(/^(?:参考答案|正确答案|答案)\s*[：:是为]?\s*([A-Ea-e])/);
      if (amLine) { setAns(amLine[1]); continue; }

      const am2 = raw.match(ansInline);
      if (am2 && !cur.aSet) {
        const letter = am2[1] || am2[2] || am2[3];
        if (letter) setAns(letter);
        // 去掉行尾答案标记后继续当文本
      }

      // 普通行：选项区续行 → 并入最后一个选项；否则并入题干
      if (inOpts && cur.options.length) {
        cur.options[cur.options.length - 1] = smartJoin(cur.options[cur.options.length - 1], raw);
      } else {
        cur.q = smartJoin(cur.q, raw);
      }
    }
    flush();
    return out;
  }

  /* ===== 答案解析（题目与答案分离的题库）===== */
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
        const clean = raw.replace(/^(?:答案解析|解析|答案)\s*[：:]\s*/, "");
        ansMap[curNum].e = smartJoin(ansMap[curNum].e, clean);
      }
    }
    return ansMap;
  }

  function getCustomQuestions() {
    const DB = window.DB;
    DB.state.customQuestions = DB.state.customQuestions || {};
    return DB.state.customQuestions;
  }

  window.__parsePdfQuestions = parseQuestions;
  window.__parsePdfAnswers = parseAnswers;
  window.__pdfExtractText = extractText;

  window.MODULES.pdfimport = {
    title: "PDF 题库", icon: "pdf",
    render(body) {
      const DB = window.DB, UI = window.UI;
      let parsed = [];

      body.innerHTML = `
        <div class="card">
          <h3>📄 PDF 题库导入</h3>
          <div class="muted small">
            ① 选「题目 PDF」→ 点「提取并识别」；若答案与题目分开，再选「答案 PDF」。<br>
            ② 核对下方草稿（可改答案、改题干、删误识别行）→ 保存到「自定义题库」。<br>
            <b>仅支持文字型 PDF</b>（可用鼠标选中文字的那种）；扫描件/纯图片 PDF 请先用 OCR 或换文字版。
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
        </div>
        <div class="card" style="margin-top:12px">
          <h3>📋 已保存的自定义题库</h3>
          <div id="customList"></div>
        </div>`;

      const qIn = body.querySelector("#pdfQ");
      const aIn = body.querySelector("#pdfA");
      const goBtn = body.querySelector("#pdfGo");
      const status = body.querySelector("#pdfStatus");
      const rawTa = body.querySelector("#pdfRaw");
      const reparseRow = body.querySelector("#reparseRow");
      let answerMap = {};

      function setStatus(html) { status.innerHTML = html; }

      goBtn.onclick = async () => {
        const qf = qIn.files && qIn.files[0];
        if (!qf) { UI.toast("请先选择题目 PDF"); return; }
        setStatus("正在加载 pdf.js 并提取文字，请稍候…");
        goBtn.disabled = true;
        try {
          const qText = await extractText(qf);
          rawTa.value = qText;
          rawTa.style.display = "block";
          reparseRow.style.display = "flex";
          const af = aIn.files && aIn.files[0];
          let aNote = "";
          if (af) {
            const aText = await extractText(af);
            answerMap = parseAnswers(aText);
            aNote = `，从答案 PDF 解析出 ${Object.keys(answerMap).length} 条答案`;
          } else {
            answerMap = {};
          }
          if (qText.replace(/\s/g, "").length < 40) {
            setStatus(`<span style="color:var(--red)">⚠️ 提取到的文字极少，这份 PDF 很可能是<b>扫描件/图片型</b>，无法识别文字。请改用文字版 PDF。</span>`);
            goBtn.disabled = false;
            return;
          }
          parsed = parseQuestions(qText);
          // 合并答案
          if (Object.keys(answerMap).length) {
            parsed.forEach((it, i) => {
              const key = it.num != null ? it.num : (i + 1);
              const a = answerMap[key];
              if (a) { if (a.a >= 0) it.a = a.a; it.aSet = true; if (a.e && !it.e) it.e = a.e; }
            });
          }
          const ok = parsed.filter(p => p.options.length >= 2).length;
          setStatus(`✓ 提取 ${qText.length} 字符，识别到 <b>${parsed.length}</b> 道题（其中 ${ok} 道选项完整）${aNote}。请核对下方草稿。`);
          renderDraft();
        } catch (e) {
          setStatus(`<span style="color:var(--red)">提取失败：${esc(e.message)}</span>`);
        } finally {
          goBtn.disabled = false;
        }
      };

      body.querySelector("#pdfManual").onclick = () => {
        rawTa.style.display = "block";
        reparseRow.style.display = "flex";
        setStatus("已切换到手动模式：把题目文字粘贴到下方，再点「用上方文字重新识别」。");
      };
      body.querySelector("#pdfReparse").onclick = () => {
        parsed = parseQuestions(rawTa.value || "");
        if (!parsed.length) { UI.toast("没识别出题目，请检查文字中是否含题号与 A/B/C/D"); return; }
        setStatus(`识别到 <b>${parsed.length}</b> 道题，请核对。`);
        renderDraft();
      };

      function renderDraft() {
        const items = parsed.filter(it => it.options.length >= 2);
        if (!items.length) { UI.toast("未识别出含选项的题目，请检查文字格式或手动修正"); return; }
        const old = body.querySelector("#draftCard");
        if (old) old.remove();
        const card = UI.el(`<div class="card" id="draftCard" style="margin-top:12px">
          <h3>📝 识别草稿（${items.length} 题）</h3>
          <div class="muted small">选择题干可改字、下拉选正确答案、点「删除」去掉误识别行。确认后保存。</div>
          <div class="row" style="margin:8px 0;gap:8px">
            <label class="muted small" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="draftAllOnly"/> 只留选项完整的题</label>
          </div>
          <div id="draft" style="max-height:62vh;overflow:auto;margin-top:8px"></div>
          <div class="row" style="margin-top:10px;gap:8px">
            <button class="btn primary" id="saveDraft">💾 保存到自定义题库</button>
            <button class="btn ghost" id="clearDraft">清空</button>
          </div>
        </div>`);
        body.appendChild(card);
        const draft = card.querySelector("#draft");
        const renderRows = (list) => {
          draft.innerHTML = "";
          list.forEach((it) => {
            const i = items.indexOf(it);
            const row = UI.el(`<div class="pdf-q" data-idx="${i}">
              <div class="row" style="gap:6px;margin-bottom:6px;flex-wrap:wrap">
                <b>题 ${i + 1}</b>
                <span class="muted small">正确答案</span>
                <select class="pdf-a" style="width:auto">${it.options.map((o, k) => `<option value="${k}" ${k === it.a ? "selected" : ""}>${String.fromCharCode(65 + k)}</option>`).join("")}</select>
                <button class="btn xs ghost pdf-del">删除</button>
              </div>
              <textarea class="pdf-qq" rows="2" style="width:100%">${esc(it.q)}</textarea>
              <div class="pdf-opts" style="margin-top:6px"></div>
              <textarea class="pdf-e" rows="2" style="width:100%;margin-top:6px" placeholder="解析（可选）">${esc(it.e)}</textarea>
            </div>`);
            const optsWrap = row.querySelector(".pdf-opts");
            it.options.forEach((o, k) => {
              const optRow = UI.el(`<div class="row" style="gap:6px;margin:3px 0"><span style="min-width:24px">${String.fromCharCode(65 + k)}.</span><input class="pdf-o" data-i="${k}" value="${esc(o)}" style="flex:1"/></div>`);
              optsWrap.appendChild(optRow);
            });
            row.querySelector(".pdf-a").onchange = e => { it.a = +e.target.value; it.aSet = true; };
            row.querySelector(".pdf-qq").oninput = e => { it.q = e.target.value; };
            row.querySelector(".pdf-e").oninput = e => { it.e = e.target.value; };
            row.querySelectorAll(".pdf-o").forEach(inp => { inp.oninput = e => { it.options[+e.target.dataset.i] = e.target.value; }; });
            row.querySelector(".pdf-del").onclick = () => { items.splice(items.indexOf(it), 1); renderRows(items); };
            draft.appendChild(row);
          });
        };
        renderRows(items);
        card.querySelector("#saveDraft").onclick = () => {
          const subject = body.querySelector("#pdfSubj").value || "常识";
          const valid = items.filter(it => it.q.trim() && it.options.length >= 2);
          if (!valid.length) { UI.toast("没有可保存的题目"); return; }
          const store = getCustomQuestions();
          store[subject] = store[subject] || [];
          valid.forEach(it => {
            store[subject].push({
              id: DB.uid(), q: it.q.trim(), options: it.options.slice(), a: it.a,
              e: (it.e || "").trim(), date: DB.today(), source: "PDF导入"
            });
          });
          DB.save();
          UI.toast(`已保存 ${valid.length} 道「${subject}」题目到自定义题库`);
          card.remove();
          renderList();
        };
        card.querySelector("#clearDraft").onclick = () => { items.length = 0; card.remove(); };
      }

      function renderList() {
        const list = body.querySelector("#customList");
        const store = getCustomQuestions();
        const keys = Object.keys(store).filter(k => store[k] && store[k].length);
        if (!keys.length) { list.innerHTML = `<div class="empty">暂无自定义题目，先上传 PDF 导入。</div>`; return; }
        let html = "";
        keys.forEach(k => {
          const arr = store[k];
          html += `<div class="card" style="margin-top:10px">
            <div class="row spread"><b>${esc(k)} · 自定义题库</b><span class="muted small">${arr.length} 题</span></div>
            <div class="row" style="margin-top:8px;gap:8px">
              <button class="btn primary pdf-practice" data-sub="${esc(k)}">开始练习</button>
              <button class="btn ghost pdf-clear" data-sub="${esc(k)}">清空本科目</button>
            </div>
          </div>`;
        });
        list.innerHTML = html;
        list.querySelectorAll(".pdf-practice").forEach(b => b.onclick = () => startPractice(b.dataset.sub));
        list.querySelectorAll(".pdf-clear").forEach(b => b.onclick = async () => {
          if (await UI.confirm(`确定清空「${b.dataset.sub}」自定义题库？`)) {
            delete store[b.dataset.sub]; DB.save(); renderList();
          }
        });
      }

      function startPractice(subject) {
        const store = getCustomQuestions();
        const items = (store[subject] || []).slice();
        if (!items.length) { UI.toast("本科目暂无题目"); return; }
        const qs = items.map(it => ({ q: it.q, options: it.options.slice(), a: it.a, e: it.e, tag: "PDF导入" }));
        const old = body.querySelector("#customQuiz");
        if (old) old.remove();
        const card = UI.el(`<div class="card" style="margin-top:12px" id="customQuiz"><div class="row spread"><b>${esc(subject)} · 自定义题库练习</b><button class="btn ghost sm" id="closeCustom">关闭</button></div><div class="qhost"></div></div>`);
        body.appendChild(card);
        card.querySelector("#closeCustom").onclick = () => card.remove();
        window.Quiz.start(card.querySelector(".qhost"), qs, subject, {
          onDone: (r) => UI.toast(`自定义题库练习完成：${r.correct}/${r.total}`),
          onAgain: () => startPractice(subject)
        });
      }

      renderList();
    }
  };
})();
