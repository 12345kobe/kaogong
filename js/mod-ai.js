/* 模块：AI 咨询（GitHub Models 免费额度）
   - 默认令牌以 base64 混淆存放：避免在公开仓库里出现明文 PAT（会被 GitHub 自动扫描吊销）；
     用户可在「设置」或本页 ⚙ 里填入自己的 PAT，自定义令牌优先级最高。
   - 主界面只保留对话；令牌、清空、温度等次要项收进右上角 ⚙ 设置。
   - 支持「题目图片 / PDF」：图片走多模态识图，PDF 前端抽文字后作为上下文；也可直接 Ctrl+V 粘贴。
   - 模型选择放在输入框下方；界面高度占满屏幕（约 90%）。
*/
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};

  const ENDPOINT = "https://models.inference.ai.azure.com/chat/completions";
  const LS_TOKEN = "kg_ai_token";
  const LS_MODEL = "kg_ai_model";
  const LS_LOG = "kg_ai_log";
  const LS_TEMP = "kg_ai_temp";
  // 注意：令牌只存在本机 localStorage，绝不能写进代码/仓库——GitHub 推送保护会直接拦截含密钥的提交。

  const MODELS = [
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini", note: "推荐·可识图", vision: true },
    { id: "gpt-4o-mini", label: "GPT-4o mini", note: "可识图", vision: true },
    { id: "gpt-4.1", label: "GPT-4.1", note: "更强·可识图", vision: true },
    { id: "DeepSeek-R1", label: "DeepSeek-R1", note: "推理型·不识图", vision: false },
    { id: "Meta-Llama-3.3-70B", label: "Llama 3.3 70B", note: "不识图", vision: false }
  ];
  const SYS = "你是一名资深公务员考试（行测+申论）辅导老师。回答要简洁、准确、贴合中国考情，必要时给出解题步骤与易错点。中文作答。";

  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function decodeBuiltin() { return ""; }
  function getToken() {
    // 令牌只存本机：优先用户自定义（设置页填写），绝不内置在代码里
    try { const t = (localStorage.getItem(LS_TOKEN) || "").trim(); if (t) return t; } catch (e) {}
    return decodeBuiltin();
  }
  function hasCustom() { return !!getToken(); }
  function setToken(v) { try { if (v && v.trim()) localStorage.setItem(LS_TOKEN, v.trim()); else localStorage.removeItem(LS_TOKEN); } catch (e) {} }
  function getModel() { try { return localStorage.getItem(LS_MODEL) || MODELS[0].id; } catch (e) { return MODELS[0].id; } }
  function setModel(v) { try { localStorage.setItem(LS_MODEL, v); } catch (e) {} }
  function modelById(id) { return MODELS.filter(m => m.id === id)[0] || MODELS[0]; }
  function getLog() { try { return JSON.parse(localStorage.getItem(LS_LOG) || "[]"); } catch (e) { return []; } }
  function setLog(a) { try { localStorage.setItem(LS_LOG, JSON.stringify(a.slice(-40))); } catch (e) {} }
  function getTemp() { const v = parseFloat(localStorage.getItem(LS_TEMP)); return isNaN(v) ? 0.6 : v; }
  function setTemp(v) { try { localStorage.setItem(LS_TEMP, String(v)); } catch (e) {} }

  let pending = ""; // 外部（如答题页「询问AI」）预填内容
  function ask(text) { pending = text || ""; location.hash = "#/ai"; }

  // 供「设置」模块复用（令牌藏在那里，主界面不暴露）
  window.KGAI = {
    MODELS: MODELS, getToken: getToken, setToken: setToken, hasCustom: hasCustom,
    getModel: getModel, setModel: setModel, getLog: getLog, setLog: setLog,
    getTemp: getTemp, setTemp: setTemp, ask: ask
  };

  async function chat(token, model, messages) {
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ model: model, messages: messages, temperature: getTemp(), max_tokens: 2000 })
    });
    if (!resp.ok) {
      let msg = "HTTP " + resp.status;
      try { const j = await resp.json(); msg = (j.error && (j.error.message || j.error)) || msg; } catch (e) {}
      throw new Error(msg);
    }
    const j = await resp.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "（无内容）";
  }

  /* ===== PDF → 文本（按 Y 坐标重建行，避免整页挤成一行） ===== */
  async function pdfToText(file, maxPages) {
    const lib = window.pdfjsLib;
    if (!lib) throw new Error("PDF 解析组件未就绪，请稍后重试");
    const buf = await file.arrayBuffer();
    const doc = await lib.getDocument({ data: buf }).promise;
    const n = Math.min(doc.numPages, maxPages || 20);
    const chunks = [];
    for (let p = 1; p <= n; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const rows = {};
      (tc.items || []).forEach(it => {
        if (!it || !it.str) return;
        const tr = it.transform || [];
        const y = Math.round(tr[5] || 0), x = Math.round(tr[4] || 0);
        (rows[y] = rows[y] || []).push({ x: x, s: it.str });
      });
      const lines = Object.keys(rows).map(Number).sort((a, b) => b - a)
        .map(y => rows[y].sort((a, b) => a.x - b.x).map(o => o.s).join(""));
      chunks.push("=== 第 " + p + " 页 ===\n" + lines.join("\n"));
    }
    if (doc.numPages > n) chunks.push("（PDF 共 " + doc.numPages + " 页，仅取前 " + n + " 页）");
    return chunks.join("\n");
  }

  window.MODULES.ai = {
    title: "AI 咨询", icon: "ai",
    render(body) {
      const UI = window.UI;
      let log = getLog();
      let atts = [];   // 附件：{kind:'image'|'pdf', name, dataUrl, text}
      let model = getModel();
      let busy = false;

      body.innerHTML = `
        <div class="ai-wrap">
          <div class="ai-head">
            <div class="ai-head-t">🤖 AI 咨询<span class="ai-head-sub" id="aiModelNote"></span></div>
            <div class="ai-head-r">
              <button class="btn ghost sm" id="aiGear" title="设置">⚙</button>
              <button class="btn ghost sm" id="aiClear">清空</button>
            </div>
          </div>
          <div id="aiMsgs" class="ai-msgs"></div>
          <div id="aiAtts" class="ai-atts"></div>
          <div class="ai-dock">
            <textarea id="aiInput" rows="2" placeholder="输入问题，或粘贴 / 上传题目图片与 PDF。例如：这道题为什么选 B？"></textarea>
            <div class="ai-dock-row">
              <button class="btn ghost sm" id="aiPickImg">🖼 图片</button>
              <button class="btn ghost sm" id="aiPickPdf">📄 PDF</button>
              <span class="ai-spacer"></span>
              <button class="btn primary" id="aiSend">发送</button>
            </div>
            <div class="ai-models" id="aiModels"></div>
          </div>
        </div>
        <input type="file" id="aiFileImg" accept="image/*" multiple style="display:none"/>
        <input type="file" id="aiFilePdf" accept="application/pdf" style="display:none"/>`;

      const msgs = body.querySelector("#aiMsgs");
      const input = body.querySelector("#aiInput");
      const sendBtn = body.querySelector("#aiSend");
      const attsBox = body.querySelector("#aiAtts");
      const modelsBox = body.querySelector("#aiModels");
      const fileImg = body.querySelector("#aiFileImg");
      const filePdf = body.querySelector("#aiFilePdf");

      function renderModels() {
        modelsBox.innerHTML = MODELS.map(m =>
          `<button class="ai-chip ${m.id === model ? "on" : ""}" data-id="${m.id}">${esc(m.label)}<span class="ai-chip-n">${esc(m.note)}</span></button>`
        ).join("");
        modelsBox.querySelectorAll(".ai-chip").forEach(b => {
          b.onclick = () => { model = b.dataset.id; setModel(model); renderModels(); renderHead(); };
        });
      }
      function renderHead() {
        const m = modelById(model);
        const el = body.querySelector("#aiModelNote");
        if (el) el.textContent = " · " + m.label;
      }

      function renderAtts() {
        if (!atts.length) { attsBox.innerHTML = ""; attsBox.style.display = "none"; return; }
        attsBox.style.display = "";
        attsBox.innerHTML = atts.map((a, i) => `
          <div class="ai-att">
            ${a.kind === "image" ? `<img src="${a.dataUrl}" alt="附图"/>` : `<span class="ai-att-pdf">📄</span>`}
            <span class="ai-att-n">${esc(a.name)}</span>
            <button class="ai-att-x" data-i="${i}" title="移除">×</button>
          </div>`).join("");
        attsBox.querySelectorAll(".ai-att-x").forEach(b => {
          b.onclick = () => { atts.splice(parseInt(b.dataset.i, 10), 1); renderAtts(); };
        });
      }

      function renderMsgs() {
        if (!log.length) {
          msgs.innerHTML = `<div class="empty">还没有对话。可以直接粘贴题目图片、上传 PDF，或输入你的疑问。</div>`;
          return;
        }
        msgs.innerHTML = log.map(m => {
          let html = "";
          if (m.images && m.images.length) {
            html += m.images.map(u => `<img class="ai-img" src="${u}" alt="附图"/>`).join("");
          }
          return `<div class="ai-msg ${m.role === "user" ? "user" : "bot"}">
            <div class="ai-who">${m.role === "user" ? "我" : "AI"}</div>
            <div class="ai-text">${esc(m.content).replace(/\n/g, "<br>")}${html}</div>
          </div>`;
        }).join("");
        msgs.scrollTop = msgs.scrollHeight;
      }

      /* ===== ⚙ 设置（令牌等次要项都收在这里，主界面不暴露令牌） ===== */
      function openGear() {
        const mask = UI.el(`<div class="modal-mask"><div class="modal">
          <h3>⚙ AI 设置</h3>
          <div class="ai-set">
            <div class="ai-set-l">GitHub 令牌</div>
            <input id="gTok" type="password" autocomplete="off" placeholder="${hasCustom() ? "已配置，留空保持不变；填新值可覆盖" : "粘贴你的 GitHub PAT（需勾选 models:read）"}"/>
            <div class="ai-set-hint" id="gTokHint"></div>
          </div>
          <div class="ai-set">
            <div class="ai-set-l">回答随机性</div>
            <input id="gTemp" type="range" min="0" max="1" step="0.1" value="${getTemp()}"/>
            <div class="ai-set-hint">当前 <b id="gTempV">${getTemp()}</b>（越小越严谨，适合解题）</div>
          </div>
          <div class="row" style="margin-top:14px;gap:8px;justify-content:flex-end">
            <button class="btn ghost" id="gCancel">取消</button>
            <button class="btn primary" id="gSave">保存</button>
          </div>
        </div></div>`);
        document.body.appendChild(mask);
        const hint = mask.querySelector("#gTokHint");
        const sync = () => { hint.textContent = hasCustom()
          ? "✓ 已配置令牌（出于安全，不显示内容）。"
          : "⚠️ 尚未配置令牌：请在上方粘贴你的 GitHub PAT（需勾选 models:read 权限）。"; };
        sync();
        const t = mask.querySelector("#gTemp"), tv = mask.querySelector("#gTempV");
        t.oninput = () => { tv.textContent = t.value; };
        const close = () => mask.remove();
        mask.querySelector("#gCancel").onclick = close;
        mask.onclick = e => { if (e.target === mask) close(); };
        mask.querySelector("#gSave").onclick = () => {
          const v = mask.querySelector("#gTok").value.trim();
          if (v) setToken(v);
          setTemp(parseFloat(t.value));
          close(); UI.toast("AI 设置已保存"); sync();
        };
      }

      /* ===== 发送 ===== */
      async function send() {
        if (busy) return;
        const text = input.value.trim();
        if (!text && !atts.length) { UI.toast("请输入内容或附加图片/PDF"); return; }
        const token = getToken();
        if (!token) { UI.toast("未配置令牌，请在 ⚙ 设置里填写 GitHub PAT"); return; }

        const m = modelById(model);
        const imgAtts = atts.filter(a => a.kind === "image");
        if (imgAtts.length && !m.vision) { UI.toast(m.label + " 不支持识图，已切换为 GPT-4.1 mini"); model = "gpt-4.1-mini"; setModel(model); renderModels(); renderHead(); }

        const parts = [];
        if (text) parts.push({ type: "text", text: text });
        atts.forEach(a => {
          if (a.kind === "image") parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
          else if (a.kind === "pdf") parts.push({ type: "text", text: "【以下是我上传的 PDF 内容，请据此作答】\n" + a.text });
        });
        if (!parts.length) parts.push({ type: "text", text: " " });

        log.push({ role: "user", content: text || "（见图/PDF）", images: imgAtts.map(a => a.dataUrl) });
        input.value = ""; atts = []; renderAtts(); renderMsgs();
        msgs.innerHTML += `<div class="ai-msg bot" id="aiPending"><div class="ai-who">AI</div><div class="ai-text">思考中…</div></div>`;
        msgs.scrollTop = msgs.scrollHeight;
        sendBtn.disabled = true; busy = true;
        try {
          const messages = [{ role: "system", content: SYS }]
            .concat(log.slice(0, -1).map(x => ({ role: x.role, content: x.content })))
            .concat([{ role: "user", content: parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts }]);
          const reply = await chat(token, model, messages);
          log.push({ role: "assistant", content: reply });
          setLog(log); renderMsgs();
        } catch (e) {
          const p = msgs.querySelector("#aiPending"); if (p) p.remove();
          UI.toast("请求失败：" + e.message);
          msgs.innerHTML += `<div class="ai-msg bot"><div class="ai-who">AI</div><div class="ai-text" style="color:var(--red)">请求失败：${esc(e.message)}<br>（网络/CORS 问题请确认可访问 github.com；401/403 请检查 PAT 是否有 models:read 权限）</div></div>`;
        } finally { sendBtn.disabled = false; busy = false; }
      }

      /* ===== 附件 ===== */
      function addImageFiles(files) {
        Array.prototype.forEach.call(files, f => {
          if (!/^image\//.test(f.type)) return;
          const rd = new FileReader();
          rd.onload = () => { atts.push({ kind: "image", name: f.name || "图片", dataUrl: rd.result }); renderAtts(); };
          rd.readAsDataURL(f);
        });
      }
      async function addPdfFile(f) {
        UI.toast("正在解析 PDF…");
        try {
          const txt = await pdfToText(f, 20);
          atts.push({ kind: "pdf", name: f.name || "PDF", text: txt });
          renderAtts(); UI.toast("PDF 已解析，可补充问题后发送");
        } catch (e) { UI.toast("PDF 解析失败：" + e.message); }
      }

      sendBtn.onclick = send;
      input.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); });
      input.addEventListener("paste", e => {
        const items = (e.clipboardData && e.clipboardData.items) || [];
        let found = false;
        Array.prototype.forEach.call(items, it => {
          if (it.type && it.type.indexOf("image/") === 0) {
            const f = it.getAsFile(); if (!f) return;
            found = true;
            const rd = new FileReader();
            rd.onload = () => { atts.push({ kind: "image", name: "粘贴的图片", dataUrl: rd.result }); renderAtts(); UI.toast("已粘贴图片"); };
            rd.readAsDataURL(f);
          }
        });
        if (found) e.preventDefault();
      });
      body.querySelector("#aiGear").onclick = openGear;
      body.querySelector("#aiClear").onclick = () => { log = []; setLog(log); renderMsgs(); UI.toast("对话已清空"); };
      body.querySelector("#aiPickImg").onclick = () => fileImg.click();
      body.querySelector("#aiPickPdf").onclick = () => filePdf.click();
      fileImg.onchange = () => { addImageFiles(fileImg.files); fileImg.value = ""; };
      filePdf.onchange = () => { if (filePdf.files && filePdf.files[0]) addPdfFile(filePdf.files[0]); filePdf.value = ""; };

      renderModels(); renderHead(); renderAtts(); renderMsgs();

      // 外部预填（答题页「询问AI」）
      if (pending) { input.value = pending; pending = ""; setTimeout(() => input.focus(), 60); }
    }
  };
})();
