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

  const LS_TOKEN = "kg_ai_token";          // 兼容旧版：GitHub 令牌
  const LS_PROVIDER = "kg_ai_provider";    // 当前服务商
  const LS_LOG = "kg_ai_log";
  const LS_TEMP = "kg_ai_temp";
  // 注意：令牌只存在本机 localStorage，绝不能写进代码/仓库——GitHub 推送保护会直接拦截含密钥的提交。

  /* 免费 / 低成本服务商（均走 OpenAI 兼容接口，一键切换） */
  const PROVIDERS = [
    { id: "github", label: "GitHub Models（免费额度 · 可识图）", base: "https://models.inference.ai.azure.com/chat/completions",
      keyHint: "GitHub 个人访问令牌（勾选 models:read）", keyUrl: "https://github.com/settings/tokens",
      models: [
        { id: "gpt-4.1-mini", label: "GPT-4.1 mini", note: "推荐 · 可识图", vision: true },
        { id: "gpt-4o-mini", label: "GPT-4o mini", note: "可识图", vision: true },
        { id: "gpt-4.1", label: "GPT-4.1", note: "更可识图", vision: true },
        { id: "DeepSeek-R1", label: "DeepSeek-R1", note: "推理型 · 不识图", vision: false },
        { id: "Meta-Llama-3.3-70B", label: "Llama 3.3 70B", note: "不识图", vision: false }
      ] },
    { id: "gemini", label: "Google Gemini（免费额度 · 可识图）", base: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      keyHint: "Google AI Studio API Key", keyUrl: "https://aistudio.google.com/app/apikey",
      models: [
        { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", note: "免费 · 可识图", vision: true },
        { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", note: "免费额度 · 可识图", vision: true },
        { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", note: "可识图", vision: true }
      ] },
    { id: "groq", label: "Groq（免费额度 · 极快）", base: "https://api.groq.com/openai/v1/chat/completions",
      keyHint: "Groq API Key", keyUrl: "https://console.groq.com/keys",
      models: [
        { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", note: "免费额度", vision: false },
        { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B", note: "极快", vision: false },
        { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", note: "新版", vision: false }
      ] },
    { id: "openrouter", label: "OpenRouter（含免费模型）", base: "https://openrouter.ai/api/v1/chat/completions",
      keyHint: "OpenRouter API Key", keyUrl: "https://openrouter.ai/keys",
      models: [
        { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3（free）", note: "免费", vision: false },
        { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B（free）", note: "免费", vision: false },
        { id: "qwen/qwen3-8b:free", label: "Qwen3 8B（free）", note: "免费", vision: false }
      ] },
    { id: "siliconflow", label: "硅基流动 SiliconFlow（有免费模型）", base: "https://api.siliconflow.cn/v1/chat/completions",
      keyHint: "SiliconFlow API Key", keyUrl: "https://cloud.siliconflow.cn/account/ak",
      models: [
        { id: "Qwen/Qwen2.5-7B-Instruct", label: "Qwen2.5 7B", note: "免费", vision: false },
        { id: "THUDM/glm-4-9b-chat", label: "GLM-4 9B", note: "免费", vision: false },
        { id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3", note: "低价", vision: false }
      ] },
    { id: "zhipu", label: "智谱 GLM（glm-4-flash 免费）", base: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      keyHint: "智谱 API Key", keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
      models: [
        { id: "glm-4-flash", label: "GLM-4-Flash", note: "免费", vision: false },
        { id: "glm-4-air", label: "GLM-4-Air", note: "低价", vision: false },
        { id: "glm-4v-flash", label: "GLM-4V-Flash", note: "可识图", vision: true }
      ] },
    { id: "ollama", label: "本地 Ollama（完全免费 · 离线）", base: "http://localhost:11434/v1/chat/completions",
      keyHint: "无需 Key（留空即可）", keyUrl: "https://ollama.com/download", noKey: true,
      models: [
        { id: "qwen2.5:7b", label: "Qwen2.5 7B", note: "本地", vision: false },
        { id: "llama3.1:8b", label: "Llama 3.1 8B", note: "本地", vision: false },
        { id: "deepseek-r1:7b", label: "DeepSeek-R1 7B", note: "本地", vision: false }
      ] }
  ];
  const SYS = "你是一名资深公务员考试（行测+申论）辅导老师。回答要简洁、准确、贴合中国考情，必要时给出解题步骤与易错点。中文作答。";

  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function providerById(id) { return PROVIDERS.filter(p => p.id === id)[0] || PROVIDERS[0]; }
  function getProviderId() { try { return providerById(localStorage.getItem(LS_PROVIDER)).id; } catch (e) { return PROVIDERS[0].id; } }
  function setProviderId(id) { try { localStorage.setItem(LS_PROVIDER, providerById(id).id); } catch (e) {} }
  function keyStore(id) { return "kg_ai_key_" + id; }
  function getKey(id) {
    id = id || getProviderId();
    try { const k = (localStorage.getItem(keyStore(id)) || "").trim(); if (k) return k; } catch (e) {}
    if (id === "github") { try { const t = (localStorage.getItem(LS_TOKEN) || "").trim(); if (t) return t; } catch (e) {} }
    return "";
  }
  function setKey(v, id) {
    id = id || getProviderId();
    try { if (v && v.trim()) localStorage.setItem(keyStore(id), v.trim()); else localStorage.removeItem(keyStore(id)); } catch (e) {}
    if (id === "github") { try { if (v && v.trim()) localStorage.setItem(LS_TOKEN, v.trim()); else localStorage.removeItem(LS_TOKEN); } catch (e) {} }
  }
  function modelStore(id) { return "kg_ai_model_" + id; }
  function getModel(id) {
    id = id || getProviderId();
    try { const m = localStorage.getItem(modelStore(id)); if (m) return m; } catch (e) {}
    if (id === "github") { try { const m = localStorage.getItem("kg_ai_model"); if (m) return m; } catch (e) {} }
    return providerById(id).models[0].id;
  }
  function setModel(v, id) { id = id || getProviderId(); try { localStorage.setItem(modelStore(id), v); } catch (e) {} }
  function modelInfo(pid, mid) { const p = providerById(pid); return p.models.filter(m => m.id === mid)[0] || { id: mid, label: mid, note: "", vision: false }; }
  function canVision(pid, mid) { return !!modelInfo(pid, mid).vision; }

  // 兼容旧接口（设置页 / 答题页）
  function getToken() { return getKey(); }
  function setToken(v) { setKey(v); }
  function hasCustom() { return !!getKey(); }

  function getLog() { try { return JSON.parse(localStorage.getItem(LS_LOG) || "[]"); } catch (e) { return []; } }
  function setLog(a) { try { localStorage.setItem(LS_LOG, JSON.stringify(a.slice(-40))); } catch (e) {} }
  function getTemp() { const v = parseFloat(localStorage.getItem(LS_TEMP)); return isNaN(v) ? 0.6 : v; }
  function setTemp(v) { try { localStorage.setItem(LS_TEMP, String(v)); } catch (e) {} }

  let pending = ""; // 外部（如答题页「询问AI」）预填内容
  function ask(text) { pending = text || ""; location.hash = "#/ai"; }

  /* ===== 调用（OpenAI 兼容，按当前服务商） ===== */
  async function chat(messages, o) {
    o = o || {};
    const pid = o.providerId || getProviderId();
    const p = providerById(pid);
    const key = (o.key != null ? o.key : getKey(pid));
    const model = o.model || getModel(pid);
    const headers = { "Content-Type": "application/json" };
    if (key) headers["Authorization"] = "Bearer " + key;
    const resp = await fetch(o.baseUrl || p.base, {
      method: "POST", headers: headers,
      body: JSON.stringify({ model: model, messages: messages, temperature: getTemp(), max_tokens: 2000 })
    });
    if (!resp.ok) {
      let msg = "HTTP " + resp.status;
      try { const j = await resp.json(); msg = (j.error && (j.error.message || j.error)) || (j.message) || msg; } catch (e) {}
      throw new Error(msg);
    }
    const j = await resp.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "（无内容）";
  }

  // 测试连接（设置页 / AI ⚙ 共用）；token/model 兼容旧签名
  async function test(token, model) {
    const o = (token && typeof token === "object") ? token : { key: token, model: model };
    return await chat([
      { role: "system", content: "你是一个只回复极短确认消息的助手。" },
      { role: "user", content: "请只回复两个字：正常" }
    ], o);
  }

  window.KGAI = {
    PROVIDERS: PROVIDERS, providerById: providerById,
    getProvider: getProviderId, setProvider: setProviderId,
    getKey: getKey, setKey: setKey,
    getToken: getToken, setToken: setToken, hasCustom: hasCustom,
    getModel: getModel, setModel: setModel, modelInfo: modelInfo, canVision: canVision,
    getLog: getLog, setLog: setLog,
    getTemp: getTemp, setTemp: setTemp, ask: ask, test: test, chat: chat
  };

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
        const pid = getProviderId();
        const prov = providerById(pid);
        modelsBox.innerHTML = prov.models.map(m =>
          `<button class="ai-chip ${m.id === model ? "on" : ""}" data-id="${m.id}">${esc(m.label)}<span class="ai-chip-n">${esc(m.note || "")}</span></button>`
        ).join("");
        modelsBox.querySelectorAll(".ai-chip").forEach(b => {
          b.onclick = () => { model = b.dataset.id; setModel(model, pid); renderModels(); renderHead(); };
        });
      }
      function renderHead() {
        const m = modelInfo(getProviderId(), model);
        const el = body.querySelector("#aiModelNote");
        if (el) el.textContent = " · " + providerById(getProviderId()).label.split("（")[0] + " · " + m.label;
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

      /* ===== ⚙ 设置（服务商 / 密钥 / 模型 / 随机性） ===== */
      function openGear() {
        let pid = getProviderId();
        const mask = UI.el(`<div class="modal-mask"><div class="modal" style="max-width:560px;max-height:86vh;overflow:auto">
          <h3>⚙ AI 设置</h3>
          <div class="ai-set">
            <div class="ai-set-l">服务商（都支持免费额度）</div>
            <select id="gProv">${PROVIDERS.map(p => `<option value="${p.id}" ${p.id === pid ? "selected" : ""}>${esc(p.label)}</option>`).join("")}</select>
            <div class="ai-set-hint" id="gProvHint"></div>
          </div>
          <div class="ai-set" id="gKeyWrap">
            <div class="ai-set-l">API 密钥</div>
            <input id="gTok" type="password" autocomplete="off"/>
            <div class="ai-set-hint" id="gTokHint"></div>
          </div>
          <div class="ai-set">
            <div class="ai-set-l">模型</div>
            <input id="gModel" list="gModelList" placeholder="选择或手动输入模型名"/>
            <datalist id="gModelList"></datalist>
            <div class="ai-set-hint">下拉是常用模型，也可直接填服务商文档里的任意模型名。</div>
          </div>
          <div class="ai-set">
            <div class="ai-set-l">回答随机性</div>
            <input id="gTemp" type="range" min="0" max="1" step="0.1" value="${getTemp()}"/>
            <div class="ai-set-hint">当前 <b id="gTempV">${getTemp()}</b>（越小越严谨，适合解题）</div>
          </div>
          <div class="row" style="margin-top:14px;gap:8px;justify-content:flex-end">
            <button class="btn" id="gTest">测试连接</button>
            <button class="btn ghost" id="gCancel">取消</button>
            <button class="btn primary" id="gSave">保存</button>
          </div>
        </div></div>`);
        document.body.appendChild(mask);
        const hint = mask.querySelector("#gTokHint");
        const provHint = mask.querySelector("#gProvHint");
        const maskTok = t => { t = String(t || ""); return t.length <= 14 ? t.slice(0, 4) + "••••" : t.slice(0, 10) + "••••" + t.slice(-4); };
        const keyWrap = mask.querySelector("#gKeyWrap");
        function sync() {
          const p = providerById(pid);
          provHint.innerHTML = p.noKey
            ? `本地服务，无需密钥。请先在本机安装并运行 Ollama，然后 <code>ollama pull ${esc(p.models[0].id)}</code>。`
            : `获取密钥：<a href="${p.keyUrl}" target="_blank" rel="noopener">${esc(p.keyUrl)}</a>（保存在本机浏览器，不上传）`;
          keyWrap.style.display = p.noKey ? "none" : "";
          const k = getKey(pid);
          hint.innerHTML = p.noKey ? "" : (k ? `✅ 已保存：<code>${esc(maskTok(k))}</code>` : `⚠️ 尚未配置密钥：${esc(p.keyHint)}`);
          mask.querySelector("#gTok").placeholder = k ? "已配置，留空保持不变；填新值可覆盖" : ("粘贴 " + p.keyHint);
          const ml = mask.querySelector("#gModelList");
          ml.innerHTML = p.models.map(m => `<option value="${esc(m.id)}">${esc(m.label)}${m.note ? " · " + esc(m.note) : ""}</option>`).join("");
          mask.querySelector("#gModel").value = getModel(pid);
        }
        mask.querySelector("#gProv").onchange = e => { pid = e.target.value; sync(); };
        const t = mask.querySelector("#gTemp"), tv = mask.querySelector("#gTempV");
        t.oninput = () => { tv.textContent = t.value; };
        const close = () => mask.remove();
        mask.querySelector("#gCancel").onclick = close;
        mask.onclick = e => { if (e.target === mask) close(); };
        mask.querySelector("#gTest").onclick = async () => {
          const key = mask.querySelector("#gTok").value.trim() || getKey(pid);
          const model = mask.querySelector("#gModel").value.trim() || getModel(pid);
          UI.toast("正在测试连接…");
          try {
            const r = await chat([{ role: "user", content: "请只回复两个字：正常" }], { providerId: pid, key: key, model: model });
            UI.toast("✅ 连接成功：" + String(r).slice(0, 20));
          } catch (e) { UI.toast("❌ 连接失败：" + e.message); }
        };
        mask.querySelector("#gSave").onclick = () => {
          const v = mask.querySelector("#gTok").value.trim();
          if (v) setKey(v, pid);
          const mid = mask.querySelector("#gModel").value.trim();
          if (mid) setModel(mid, pid);
          setProviderId(pid);
          setTemp(parseFloat(t.value));
          model = getModel(getProviderId());
          close(); UI.toast("AI 设置已保存"); renderModels(); renderHead();
        };
        sync();
      }

      /* ===== 发送 ===== */
      async function send() {
        if (busy) return;
        const text = input.value.trim();
        if (!text && !atts.length) { UI.toast("请输入内容或附加图片/PDF"); return; }
        const pid = getProviderId(), prov = providerById(pid);
        const key = getKey(pid);
        if (!key && !prov.noKey) { UI.toast("未配置密钥，请点右上角 ⚙ 设置填写（免费服务商都可以）"); return; }

        const m = modelInfo(pid, model);
        const imgAtts = atts.filter(a => a.kind === "image");
        if (imgAtts.length && !m.vision) {
          const vis = prov.models.filter(x => x.vision)[0];
          if (vis) { UI.toast(m.label + " 不支持识图，已切换为 " + vis.label); model = vis.id; setModel(model, pid); renderModels(); renderHead(); }
          else { UI.toast("当前服务商不支持识图，图片将只作为提示（建议切到 Gemini / GitHub Models）"); }
        }

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
          const reply = await chat(messages, { providerId: pid, key: key, model: model });
          log.push({ role: "assistant", content: reply });
          setLog(log); renderMsgs();
        } catch (e) {
          const p = msgs.querySelector("#aiPending"); if (p) p.remove();
          UI.toast("请求失败：" + e.message);
          msgs.innerHTML += `<div class="ai-msg bot"><div class="ai-who">AI</div><div class="ai-text" style="color:var(--red)">请求失败：${esc(e.message)}<br>（点右上角 ⚙ 检查：服务商 / 密钥 / 模型名；401/403 多为密钥无效或权限不足；本地 Ollama 需先启动服务）</div></div>`;
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
