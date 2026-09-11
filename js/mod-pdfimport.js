/* 模块：PDF 题库导入
   用户上传 PDF（选择题），前端用 pdf.js 提取文字，自动识别题干 / 选项 / 答案 / 解析，
   人工确认后保存到 localStorage（customQuestions），并可在本模块练习。
*/
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};

  const SUBJECTS = window.KG_SUBJECTS || ["言语理解", "资料分析", "数量关系", "逻辑判断", "常识判断", "政治理论", "申论"];
  const SUBJECT_SHORT = window.KG_SUBJECT_SHORT || {};

  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  /* 加载 pdf.js（CDN，失败则提示） */
  async function loadPdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    const CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = CDN;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      return window.pdfjsLib;
    } catch (e) { throw new Error("加载 pdf.js 失败，请检查网络（部分内网或国外 CDN 被屏蔽）"); }
  }

  async function extractText(file) {
    const pdfjsLib = await loadPdfJs();
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(it => it.str).join("") + "\n";
    }
    doc.destroy && await doc.destroy();
    return text;
  }

  /* 简单启发式解析：找题号 + 选项 + 答案 + 解析 */
  function parseQuestions(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const qRe = /^\s*(\d+)[\.．、,，\s]+(.*)$/;
    const optRe = /^\s*([A-Ea-e])[\.．、,，\s]+(.*)$/;
    const ansRe = /[\[【（(]?\s*([A-Ea-e])\s*[\]】）)]|答案[：:\s]+([A-Ea-e])|正确答案[：:\s]+([A-Ea-e])|故正确答案为([A-Ea-e])/;
    const expRe = /解析[：:](.*)|【解析】|【(?:答案)?解析】/;

    const out = [];
    let cur = null;
    function flush() {
      if (cur && cur.q && cur.options.length >= 2) {
        // 尝试在题干尾部找答案
        const m = cur.q.match(ansRe);
        if (m && !cur.aSet) {
          const letter = (m[1] || m[2] || m[3] || m[4]).toUpperCase();
          const idx = letter.charCodeAt(0) - 65;
          if (idx >= 0 && idx < cur.options.length) { cur.a = idx; cur.aSet = true; }
        }
        // 解析：把答案之后的文字当解析；或者题干中「解析：」之后
        const qm = cur.q.match(expRe);
        if (qm && !cur.e) {
          cur.e = qm[1] || "";
          cur.q = cur.q.slice(0, qm.index).trim();
        }
        // 去掉题干尾部的答案标记
        cur.q = cur.q.replace(/\s*[\[【（(]?\s*[A-Ea-e]\s*[\]】）)]\s*$/, "").trim();
        cur.q = cur.q.replace(/\s*(?:答案|正确答案)[：:\s]+[A-Ea-e]\s*$/, "").trim();
        cur.e = String(cur.e || "").replace(/^\s*【(?:答案)?解析】\s*/, "").trim();
        cur.q = String(cur.q || "").trim();
        out.push(cur);
      }
      cur = null;
    }

    for (const raw of lines) {
      const qm = qRe.exec(raw);
      if (qm && qm[1].length <= 4) {
        flush();
        cur = { q: qm[2] || "", options: [], a: 0, e: "", aSet: false };
        continue;
      }
      const om = optRe.exec(raw);
      if (om && cur) {
        const letter = om[1].toUpperCase();
        const idx = letter.charCodeAt(0) - 65;
        const txt = om[2].trim();
        if (idx === cur.options.length) { cur.options.push(txt); }
        else if (idx >= 0 && idx < 10) {
          while (cur.options.length <= idx) cur.options.push("");
          cur.options[idx] = txt;
        }
        continue;
      }
      // 答案行（单独一行）
      const am = raw.match(/^\s*(?:答案|正确答案|【答案】|答案[：:]\s*)([A-Ea-e])\s*$/);
      if (am && cur) {
        const idx = am[1].toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < cur.options.length) { cur.a = idx; cur.aSet = true; }
        continue;
      }
      // 解析行（单独一行）
      const em = expRe.exec(raw);
      if (em && cur) {
        cur.e = (cur.e ? cur.e + "\n" : "") + (em[1] || raw);
        continue;
      }
      // 普通行
      if (cur) {
        if (cur.options.length === 0) {
          // 题干续行
          const amIn = raw.match(ansRe);
          if (amIn && !cur.aSet) {
            const letter = (amIn[1] || amIn[2] || amIn[3] || amIn[4]).toUpperCase();
            const idx = letter.charCodeAt(0) - 65;
            if (idx >= 0) { cur.a = idx; cur.aSet = true; }
          }
          cur.q += (cur.q ? "\n" : "") + raw;
        } else {
          // 可能是解析续行，或下一题的题干（无题号）
          // 这里归入解析
          cur.e = (cur.e ? cur.e + "\n" : "") + raw;
        }
      }
    }
    flush();
    return out;
  }

  window.__parsePdfQuestions = parseQuestions; // 供自测/调试调用

  function getCustomQuestions() {
    const DB = window.DB;
    DB.state.customQuestions = DB.state.customQuestions || {};
    return DB.state.customQuestions;
  }

  window.MODULES.pdfimport = {
    title: "PDF 题库", icon: "pdf",
    render(body) {
      const DB = window.DB, UI = window.UI;
      let extracted = "";
      let parsed = [];

      body.innerHTML = `
        <div class="card">
          <h3>📄 PDF 题库导入</h3>
          <div class="muted small">上传 PDF 后自动提取文字，识别题干、选项、答案与解析。识别结果需要人工核对，确认无误后再保存到「自定义题库」。目前仅支持<b>文字型 PDF</b>（扫描件/图片 PDF 需先 OCR，暂不支持）。</div>
          <div class="row" style="margin-top:12px;gap:10px;flex-wrap:wrap;align-items:center">
            <input type="file" id="pdfIn" accept="application/pdf" />
            <select id="pdfSubj">${SUBJECTS.map(s => `<option value="${esc(SUBJECT_SHORT[s] || s)}">${esc(s)}</option>`).join("")}</select>
            <button class="btn primary" id="pdfExtract">🔍 提取文字</button>
            <button class="btn" id="pdfParse" disabled>🧩 识别题目</button>
          </div>
          <div class="muted small" id="pdfStatus" style="margin-top:8px"></div>
          <textarea id="pdfRaw" style="width:100%;height:140px;margin-top:10px;display:none" placeholder="PDF 原始文字会显示在这里，可手动修正后再识别题目"></textarea>
        </div>
        <div class="card" style="margin-top:12px">
          <h3>📋 已保存的自定义题库</h3>
          <div id="customList"></div>
        </div>`;

      const fileIn = body.querySelector("#pdfIn");
      const extractBtn = body.querySelector("#pdfExtract");
      const parseBtn = body.querySelector("#pdfParse");
      const rawTa = body.querySelector("#pdfRaw");
      const status = body.querySelector("#pdfStatus");

      function setStatus(html) { status.innerHTML = html; }

      extractBtn.onclick = async () => {
        const file = fileIn.files && fileIn.files[0];
        if (!file) { UI.toast("请先选择 PDF 文件"); return; }
        setStatus("正在加载 pdf.js 并提取文字，请稍候…");
        try {
          extracted = await extractText(file);
          rawTa.value = extracted;
          rawTa.style.display = "block";
          parseBtn.disabled = false;
          setStatus(`✓ 已提取 ${extracted.length} 字符。点「识别题目」生成题目草稿，或先在上方修正文字。`);
        } catch (e) {
          setStatus(`<span style="color:var(--red)">提取失败：${esc(e.message)}</span>`);
        }
      };

      parseBtn.onclick = () => {
        extracted = rawTa.value;
        parsed = parseQuestions(extracted);
        renderDraft(body.querySelector("#draft") || document.createElement("div"), parsed);
      };

      function renderDraft(host, items) {
        if (!items.length) { UI.toast("未识别出题目，请检查文字格式是否包含题号与 A/B/C/D"); return; }
        const old = body.querySelector("#draftCard");
        if (old) old.remove();
        const card = UI.el(`<div class="card" id="draftCard" style="margin-top:12px">
          <h3>📝 识别草稿（${items.length} 题）</h3>
          <div class="muted small">下方可删除误识别行、修正答案。确认后保存到自定义题库。</div>
          <div id="draft" style="max-height:62vh;overflow:auto;margin-top:10px"></div>
          <div class="row" style="margin-top:10px;gap:8px">
            <button class="btn primary" id="saveDraft">💾 保存到自定义题库</button>
            <button class="btn ghost" id="clearDraft">清空</button>
          </div>
        </div>`);
        body.appendChild(card);
        const draft = card.querySelector("#draft");
        items.forEach((it, i) => {
          const row = UI.el(`<div class="pdf-q" data-idx="${i}">
            <div class="row" style="gap:6px;margin-bottom:6px">
              <b>题 ${i + 1}</b>
              <select class="pdf-a" style="width:auto">${it.options.map((o, k) => `<option value="${k}" ${k === it.a ? "selected" : ""}>${String.fromCharCode(65 + k)}</option>`).join("")}</select>
              <button class="btn xs ghost pdf-del">删除</button>
            </div>
            <textarea class="pdf-qq" rows="3" style="width:100%">${esc(it.q)}</textarea>
            <div class="pdf-opts" style="margin-top:6px"></div>
            <textarea class="pdf-e" rows="2" style="width:100%;margin-top:6px" placeholder="解析（可选）">${esc(it.e)}</textarea>
          </div>`);
          const optsWrap = row.querySelector(".pdf-opts");
          it.options.forEach((o, k) => {
            const optRow = UI.el(`<div class="row" style="gap:6px;margin:3px 0"><span style="min-width:24px">${String.fromCharCode(65 + k)}.</span><input class="pdf-o" data-i="${k}" value="${esc(o)}" style="flex:1"/></div>`);
            optsWrap.appendChild(optRow);
          });
          row.querySelector(".pdf-a").onchange = e => { items[i].a = +e.target.value; };
          row.querySelector(".pdf-qq").oninput = e => { items[i].q = e.target.value; };
          row.querySelector(".pdf-e").oninput = e => { items[i].e = e.target.value; };
          row.querySelectorAll(".pdf-o").forEach(inp => {
            inp.oninput = e => { items[i].options[+e.target.dataset.i] = e.target.value; };
          });
          row.querySelector(".pdf-del").onclick = () => { items.splice(i, 1); renderDraft(host, items); };
          draft.appendChild(row);
        });
        card.querySelector("#saveDraft").onclick = () => {
          const subject = body.querySelector("#pdfSubj").value || "常识";
          const valid = items.filter(it => it.q.trim() && it.options.length >= 2);
          if (!valid.length) { UI.toast("没有可保存的题目"); return; }
          const store = getCustomQuestions();
          store[subject] = store[subject] || [];
          valid.forEach(it => {
            store[subject].push({
              id: DB.uid(), q: it.q.trim(), options: it.options.slice(), a: it.a,
              e: it.e.trim(), date: DB.today(), source: "PDF导入"
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
              <button class="btn ghost pdf-exp" data-sub="${esc(k)}">导出错题</button>
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
        const qs = items.map(it => ({ _id: it.id, q: it.q, options: it.options.slice(), a: it.a, e: it.e, tag: "PDF导入" }));
        const host = UI.el(`<div class="quiz-host" style="margin-top:10px"></div>`);
        const card = UI.el(`<div class="card" style="margin-top:12px"><div class="row"><b>${esc(subject)} · 自定义题库练习</b><button class="btn ghost sm" id="closeCustom">关闭</button></div><div id="customQuiz"></div></div>`);
        card.querySelector("#customQuiz").appendChild(host);
        const old = body.querySelector("#customQuiz");
        if (old) old.remove();
        body.appendChild(card);
        card.querySelector("#closeCustom").onclick = () => card.remove();
        window.Quiz.start(host, qs, subject, {
          onDone: (r) => {
            UI.toast(`自定义题库练习完成：${r.correct}/${r.total}`);
          },
          onAgain: () => startPractice(subject)
        });
      }

      renderList();
    }
  };
})();
