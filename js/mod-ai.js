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

  // 共享 AI：经后端代理转发，密钥只存服务端环境变量（Railway: ZHIPU_API_KEY），前端零配置。
  const SHARED_AI_BASE = (typeof location !== "undefined" && /railway\.app$/.test(location.hostname))
    ? "/api/ai-proxy"
    : "https://kaogong-production.up.railway.app/api/ai-proxy";

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
        { id: "THUDM/glm-4-9b-chat", label: "GLM-4 9B", note: "免费", vision: false }
      ] },
    { id: "zhipu", label: "智谱 GLM（glm-4-flash 免费）", base: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      keyHint: "智谱 API Key", keyUrl: "https://open.bigmodel.cn/usercenter/apikeys", maxTok: 1024,
      models: [
        { id: "glm-4-flash", label: "GLM-4-Flash", note: "免费", vision: false, maxOut: 4095 },
        { id: "glm-4v-flash", label: "GLM-4V-Flash", note: "可识图", vision: true, maxOut: 1024 },
        { id: "cogview-3-flash", label: "CogView-3-Flash（AI 生图）", note: "生图·举一反三配套出题", vision: false, image: true, maxOut: 1024 }
      ] },
    { id: "ollama", label: "本地 Ollama（完全免费 · 离线）", base: "http://localhost:11434/v1/chat/completions",
      keyHint: "无需 Key（留空即可）", keyUrl: "https://ollama.com/download", noKey: true,
      models: [
        { id: "qwen2.5:7b", label: "Qwen2.5 7B", note: "本地", vision: false },
        { id: "llama3.1:8b", label: "Llama 3.1 8B", note: "本地", vision: false },
        { id: "deepseek-r1:7b", label: "DeepSeek-R1 7B", note: "本地", vision: false }
      ] },
    { id: "shared", label: "共享 AI（免配置 · 女友直接用）", base: SHARED_AI_BASE,
      keyHint: "无需密钥（服务端已配置 GitHub 免费模型，打开即用）", keyUrl: "https://github.com/settings/tokens", noKey: true,
      models: [
        { id: "gpt-4.1-mini", label: "GPT-4.1 mini（推荐·可识图）", note: "可识图·推荐", vision: true },
        { id: "gpt-4o-mini", label: "GPT-4o mini（可识图）", note: "可识图", vision: true },
        { id: "DeepSeek-R1", label: "DeepSeek-R1（推理型）", note: "不识图", vision: false },
        { id: "Meta-Llama-3.3-70B", label: "Llama 3.3 70B", note: "不识图", vision: false }
      ] }
  ];
  const SYS = "你是一名资深公务员考试（行测+申论）辅导老师。回答要简洁、准确、贴合中国考情，必要时给出解题步骤与易错点。中文作答。";

  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function providerById(id) { return PROVIDERS.filter(p => p.id === id)[0] || PROVIDERS[0]; }
  function getProviderId() {
    const stored = localStorage.getItem(LS_PROVIDER);
    if (stored && providerById(stored)) return providerById(stored).id;
    return "shared"; // 新用户默认走「共享 AI（免配置）」，老用户仍用已存服务商
  }
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
    const p = providerById(id);
    let m = "";
    try { m = localStorage.getItem(modelStore(id)) || ""; } catch (e) {}
    if (!m && id === "github") { try { m = localStorage.getItem("kg_ai_model") || ""; } catch (e) {} }
    // 存的模型已下架/是生图模型（不该当对话模型）→ 回退第一个非生图模型
    const hit = p.models.filter(x => x.id === m)[0];
    if (m && hit && !hit.image) return m;
    const first = p.models.filter(x => !x.image)[0] || p.models[0];
    return first.id;
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
  let returnHash = null; // 从错题/答题页进入 AI 后，「返回」按钮要回到的界面
  let returnAnchor = null; // 「返回」要定位到的具体题目（错题卡 data-ai="id"）；返回后滚动到该题并高亮
  // 返回键钩子（由外部模块注入，用于回到「上一道题」等更精细的场景；不设置则回退到来源路由）
  let returnHook = null;
  // 浮层关闭钩子：内嵌答题页（政治理论等）用浮层 AI 时，返回键＝关闭浮层而非路由导航
  let overlayClose = null;
  // 「举一反三」上下文：最近一次来自答题/错题页的题目（AI 仿出同类题用）；持久化以免刷新丢失
  let qCtx = null;
  function saveQCtx() { try { localStorage.setItem("kg_ai_qctx", JSON.stringify(qCtx)); } catch (e) {} }
  function loadQCtx() { try { qCtx = JSON.parse(localStorage.getItem("kg_ai_qctx") || "null"); } catch (e) { qCtx = null; } }
  function setReturnHook(fn) { returnHook = (typeof fn === "function") ? fn : null; }
  function ask(text, ret, keepModal, hook) {
    pending = text || "";
    // 记录来源，供「返回」按钮使用（来自错题本 / 答题页时，返回到上一个界面继续看其他问题）
    returnHash = (ret && ret !== "#/ai") ? ret
      : (location.hash && location.hash !== "#/ai" ? location.hash : null);
    if (typeof hook === "function") setReturnHook(hook);
    if (keepModal) {
      // 不销毁、仅隐藏答题弹窗：返回时由 returnHook 恢复，从而能回到「那组题的那道题」（作答状态也保留）
      document.querySelectorAll(".modal-mask").forEach(m => { try { m.style.display = "none"; } catch (e) {} });
    } else {
      // 关闭所有打开的模态框（收藏/资料/言语等刷题弹窗）。否则 location.hash 切换后
      // AI 模块会渲染在弹窗背后，视觉上「没跳走」，用户以为还停留在原位置。
      try {
        const root = document.getElementById("modalRoot");
        if (root) { while (root.firstChild) root.removeChild(root.firstChild); }
      } catch (e) {}
    }
    location.hash = "#/ai";
  }
  // 把一道题整理成结构化文本并跳转 AI（答题页「没看懂？询问 AI」、错题本「AI 咨询」共用）
  // ret：可选，指定「返回」要回到的路由（如 #/wrongbook）；不传则回退到进入 AI 前的当前路由
  function askQuestion(subject, qq, ua, ret, opts) {
    opts = opts || {};
    const A = i => String.fromCharCode(65 + i);
    // 记录题目上下文：供「举一反三」仿出同类题（申论除外）
    qCtx = { subject: subject, q: { q: qq.q, options: qq.options, a: qq.a, e: qq.e, img: qq.img || null } };
    saveQCtx();
    const optsTxt = (qq.options || []).map((o, i) => A(i) + ". " + (o == null ? "" : o)).join("\n");
    // 多选答案：多字母原样输出（"BCD"）；单选/判断：转字母
    const ansLabel = (qq.a == null) ? "（见解析）" : (typeof qq.a === "string" ? qq.a.toUpperCase() : A(qq.a));
    const myAns = (ua === undefined || ua === null) ? "未作答"
      : (Array.isArray(ua) ? ua.slice().sort((x, y) => x - y).map(A).join("、") : (isNaN(ua) ? "未作答" : A(ua)));
    // 若来源页面上存在这道题的卡片（如错题本 data-ai="id"），记录锚点：返回时直接定位到这道题而不是页面顶部
    returnAnchor = null;
    try {
      if (qq && qq.id && document.querySelector('[data-ai="' + qq.id + '"]')) returnAnchor = String(qq.id);
    } catch (e) {}
    const txt =
      `【科目】${subject}\n` +
      `【题目】${qq.q || ""}\n` +
      (optsTxt ? `【选项】\n${optsTxt}\n` : "") +
      `【我的答案】${myAns}\n` +
      `【正确答案】${ansLabel}\n` +
      (qq.e ? `【解析】${qq.e}\n` : "") +
      `\n我看了解析还是没弄懂，请用通俗的方式一步步讲清楚：这道题的考点是什么、正确选项为什么对、我的思路错在哪里。\n我的疑惑点：（请在这里补充）`;
    ask(txt, ret || location.hash, !!opts.keepModal, opts.returnHook || null);
  }

  /* 内嵌答题页（政治理论等）专用：把 AI 以浮层模态打开，不切换路由，
     从而保留底层 quiz DOM 与全部答题记录；关闭浮层即回到原题位置。 */
  function askOverlay(text, hook, ctx) {
    const UI = window.UI;
    // 记录题目上下文（供「举一反三」）：内嵌答题页不经过 askQuestion，需显式传入
    if (ctx && ctx.subject && ctx.q) { qCtx = { subject: ctx.subject, q: Object.assign({}, ctx.q, { img: (ctx.q && ctx.q.img) || null }) }; saveQCtx(); }
    const root = document.getElementById("modalRoot") || document.body;
    const mask = UI.el(`<div class="modal-mask ai-overlay-mask">
      <div class="modal ai-overlay" style="width:min(900px,96vw);height:92vh;max-height:92vh;display:flex;flex-direction:column;overflow:hidden">
        <div class="ai-overlay-host" style="display:flex;flex-direction:column;flex:1;min-height:0"></div>
      </div></div>`);
    root.appendChild(mask);
    const host = mask.querySelector(".ai-overlay-host");
    // 关闭浮层：先执行返回钩子（定位到原题），再移除遮罩
    overlayClose = () => {
      try { if (typeof hook === "function") hook(); } catch (e) {}
      try { mask.remove(); } catch (e) {}
      overlayClose = null;
    };
    // 预填题目文本（render 内会读取 pending 写入输入框）
    pending = text || "";
    // 渲染 AI 面板到浮层（overlay 模式：返回键变为「关闭」）
    try { MODULES.ai.render(host, { overlay: true }); }
    catch (e) { host.innerHTML = '<div class="card empty">AI 面板加载出错：' + UI.esc(e.message) + '</div>'; }
    // 背景点击关闭
    mask.onclick = (e) => { if (e.target === mask) overlayClose(); };
    // ESC 关闭（容错：浮层已关闭则仅移除监听）
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (typeof overlayClose === "function") overlayClose();
        document.removeEventListener("keydown", onKey);
      }
    };
    document.addEventListener("keydown", onKey);
    // 输入框聚焦
    const input = host.querySelector("#aiInput");
    if (input) setTimeout(() => { try { input.focus(); } catch (e) {} }, 80);
  }

  /* ===== 调用（OpenAI 兼容，按当前服务商） ===== */
  async function chat(messages, o) {
    o = o || {};
    const pid = o.providerId || getProviderId();
    const p = providerById(pid);
    const key = (o.key != null ? o.key : getKey(pid));
    let model = o.model || getModel(pid);
    // 生图模型（CogView 等）不能对话：自动换回该服务商第一个对话模型
    if (modelInfo(pid, model).image) {
      const fb = p.models.filter(x => !x.image)[0];
      if (fb) model = fb.id;
    }
    const headers = { "Content-Type": "application/json" };
    if (key) headers["Authorization"] = "Bearer " + key;
    // max_tokens 按模型/服务商上限钳制（如智谱 GLM-4V-Flash 输出上限 1024，超了会报「max_tokens参数非法」）
    const outCap = modelInfo(pid, model).maxOut || p.maxTok || 2000;
    const resp = await fetch(o.baseUrl || p.base, {
      method: "POST", headers: headers,
      body: JSON.stringify({ model: model, messages: messages, temperature: getTemp(), max_tokens: Math.min(o.maxTok || outCap, outCap) })
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

  /* 用智谱 CogView-3-Flash 生成配套图片：返回图片 URL 或 dataURL（失败抛错，由调用方兜底） */
  async function genImage(prompt) {
    const key = getKey("zhipu");
    if (!key) throw new Error("未配置智谱密钥（请在 ⚙ 里选「智谱 GLM」并填入 API Key）");
    const resp = await fetch("https://open.bigmodel.cn/api/paas/v4/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({ model: "cogview-3-flash", prompt: String(prompt || "").slice(0, 800), n: 1, size: "1024x1024" })
    });
    if (!resp.ok) { let m = "HTTP " + resp.status; try { const j = await resp.json(); m = (j.error && (j.error.message || j.error)) || m; } catch (e) {} throw new Error(m); }
    const j = await resp.json();
    const item = (j.data && j.data[0]) || {};
    if (item.url) return item.url;
    if (item.b64_json) return "data:image/png;base64," + item.b64_json;
    throw new Error("生图结果为空");
  }

  window.KGAI = {
    PROVIDERS: PROVIDERS, providerById: providerById,
    genImage: genImage,
    getProvider: getProviderId, setProvider: setProviderId,
    getKey: getKey, setKey: setKey,
    getToken: getToken, setToken: setToken, hasCustom: hasCustom,
    getModel: getModel, setModel: setModel, modelInfo: modelInfo, canVision: canVision,
    getLog: getLog, setLog: setLog,
    getTemp: getTemp, setTemp: setTemp, ask: ask, askQuestion: askQuestion, askOverlay: askOverlay, test: test, chat: chat,
    setReturnHook: setReturnHook, getReturn: () => returnHash
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
    render(body, ropts) {
      const UI = window.UI;
      loadQCtx();   // 恢复最近的题目上下文（刷新后「举一反三」仍可用）
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
            <div id="aiJyfsRow" style="display:none;margin-bottom:6px">
              <button class="btn sm" id="aiJyfs" title="让 AI 仿照刚才的题目出几道同类题">💡 举一反三 · 出同类题</button>
            </div>
            <textarea id="aiInput" rows="2" placeholder="输入问题，或粘贴 / 上传题目图片与 PDF。例如：这道题为什么选 B？"></textarea>
            <div class="ai-dock-row">
              <button class="btn ghost sm" id="aiPickImg">🖼 图片</button>
              <button class="btn ghost sm" id="aiPickPdf">📄 PDF</button>
              <span class="ai-spacer"></span>
              <button id="aiBack" class="btn ghost sm ai-back-inline" style="display:none" title="返回来源题">← 返回</button>
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
          b.onclick = () => {
            // 生图模型只作展示：不需要选中，配好智谱密钥后在「举一反三」里勾选即可生成配图
            if (modelInfo(pid, b.dataset.id).image) {
              UI.toast("🎨 " + modelInfo(pid, b.dataset.id).label + " 是生图模型：无需选中，配好智谱密钥后在「举一反三」勾选「生成配套图片」即可");
              return;
            }
            model = b.dataset.id; setModel(model, pid); renderModels(); renderHead();
          };
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

      function scrollBottom() {
        // 图片等资源异步加载会撑高内容，分帧多次滚动 + 监听图片加载，确保进入/新消息时始终停在最底部
        const doScroll = () => { try { msgs.scrollTop = msgs.scrollHeight; } catch (e) {} };
        doScroll();
        requestAnimationFrame(doScroll);
        setTimeout(doScroll, 200); setTimeout(doScroll, 600);
        msgs.querySelectorAll("img").forEach(img => { if (!img.complete) img.addEventListener("load", doScroll, { once: true }); });
      }

      function renderMsgs() {
        if (!log.length) {
          msgs.innerHTML = `<div class="empty">还没有对话。可以直接粘贴题目图片、上传 PDF，或输入你的疑问。<br/>💡 <b>长按任意消息</b>可「引用提问」或「举一反三出题」。</div>`;
          return;
        }
        msgs.innerHTML = log.map((m, i) => {
          let html = "";
          if (m.images && m.images.length) {
            html += m.images.map(u => `<img class="ai-img" src="${u}" alt="附图"/>`).join("");
          }
          return `<div class="ai-msg ${m.role === "user" ? "user" : "bot"}" data-i="${i}">
            <div class="ai-who">${m.role === "user" ? "我" : "AI"}</div>
            <div class="ai-text">${UI.md(m.content)}${html}</div>
          </div>`;
        }).join("");
        // 长按消息 → 菜单（引用提问 / 举一反三出题 / 复制）；桌面端右键同样生效
        Array.prototype.forEach.call(msgs.querySelectorAll(".ai-msg"), el => {
          const i = parseInt(el.dataset.i, 10);
          let lpTimer = null;
          const cancel = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
          el.addEventListener("touchstart", () => { cancel(); lpTimer = setTimeout(() => { lpTimer = null; msgMenu(i); }, 480); }, { passive: true });
          el.addEventListener("touchmove", cancel, { passive: true });
          el.addEventListener("touchend", cancel);
          el.addEventListener("touchcancel", cancel);
          el.addEventListener("contextmenu", e => { e.preventDefault(); msgMenu(i); });
        });
        scrollBottom();
      }

      /* 长按消息菜单：引用提问 / 举一反三出题 / 复制 */
      function msgMenu(i) {
        const m = log[i];
        if (!m) return;
        const text = String(m.content || "").trim();
        const preview = text ? text.slice(0, 160) : (m.images && m.images.length ? "（图片消息）" : "（空消息）");
        const mask = UI.el(`<div class="modal-mask"><div class="modal" style="max-width:460px">
          <h3>${m.role === "user" ? "💬 我的消息" : "🤖 AI 回复"}</h3>
          <div class="muted small" style="max-height:110px;overflow:auto;word-break:break-all">${esc(preview)}${text.length > 160 ? "…" : ""}</div>
          <div class="row" style="flex-direction:column;gap:8px;margin-top:12px;align-items:stretch">
            <button class="btn" id="mmQuote">💬 引用这条消息提问</button>
            <button class="btn" id="mmJyfs">💡 按这条消息举一反三出题</button>
            <button class="btn ghost" id="mmCopy">📋 复制原文</button>
            <button class="btn ghost" id="mmCancel">取消</button>
          </div>
        </div></div>`);
        document.body.appendChild(mask);
        const close = () => mask.remove();
        mask.onclick = e => { if (e.target === mask) close(); };
        mask.querySelector("#mmCancel").onclick = close;
        mask.querySelector("#mmCopy").onclick = () => {
          close();
          try { navigator.clipboard.writeText(text).then(() => UI.toast("已复制"), () => UI.toast("复制失败")); }
          catch (e) { UI.toast("复制失败"); }
        };
        mask.querySelector("#mmQuote").onclick = () => {
          close();
          const clipped = text.length > 400 ? text.slice(0, 400) + "…" : text;
          input.value = (input.value ? input.value + "\n" : "") + "【引用】" + clipped + "\n我的问题：";
          try { input.focus(); input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
          UI.toast("已引用，请继续输入你的问题");
        };
        mask.querySelector("#mmJyfs").onclick = () => {
          close();
          if (!text) { UI.toast("这条消息没有文字内容，无法据此出题"); return; }
          const mk = (window.KGAIQuiz && KGAIQuiz.moduleForSubject(text)) || null;
          if (mk === "essay") { UI.toast("申论内容暂不支持出题"); return; }
          openJyfs({ ctxText: text.slice(0, 1500), modKey: mk });
        };
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
        scrollBottom();
        sendBtn.disabled = true; busy = true;
        try {
          const messages = [{ role: "system", content: SYS }]
            .concat(log.slice(0, -1).map(x => ({ role: x.role, content: x.content })))
            .concat([{ role: "user", content: parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts }]);
          const reply = await chat(messages, { providerId: pid, key: key, model: model });
          log.push({ role: "assistant", content: reply });
          setLog(log); renderMsgs();
          showJyfs();
        } catch (e) {
          const p = msgs.querySelector("#aiPending"); if (p) p.remove();
          const em = e.message || "";
          const isAuth = /401|403|unauthor|expired|invalid|token|密钥|令牌/.test(em);
          if (pid === "shared" && isAuth) {
            UI.toast("共享 AI 暂不可用（服务端密钥失效）");
            msgs.innerHTML += `<div class="ai-msg bot"><div class="ai-who">AI</div><div class="ai-text" style="color:var(--red)">共享 AI 暂不可用：${esc(em)}<br>任选其一即可恢复：<br>① 点右上角 ⚙ → 服务商选「GitHub Models / Gemini / Groq」→ 填一个<b>免费</b>密钥（⚙ 里附获取链接），立即能用；<br>② 或让开发者在 Railway 刷新服务端密钥（加 AI_GITHUB_KEY 即可）。</div></div>`;
          } else {
            UI.toast("请求失败：" + em);
            msgs.innerHTML += `<div class="ai-msg bot"><div class="ai-who">AI</div><div class="ai-text" style="color:var(--red)">请求失败：${esc(em)}<br>（点右上角 ⚙ 检查：服务商 / 密钥 / 模型名；401/403 多为密钥无效或权限不足；本地 Ollama 需先启动服务）</div></div>`;
          }
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

      /* ===== 举一反三：AI 仿题出同类选择题并自动进入训练 ===== */
      // 推断「出题板块」所属科目：优先用题目上下文；自由提问则从对话里识别
      function detectModKey() {
        if (qCtx && qCtx.subject) {
          return (window.KGAIQuiz && KGAIQuiz.moduleForSubject(qCtx.subject)) || null;
        }
        const text = log.filter(m => m.role === "user").map(m => m.content || "").join("\n");
        return (window.KGAIQuiz && KGAIQuiz.moduleForSubject(text)) || null;
      }
      function showJyfs() {
        const row = body.querySelector("#aiJyfsRow");
        if (!row) return;
        // 必须先有 AI 回复；申论暂不支持出题
        const hasReply = log.some(m => m.role === "assistant");
        const mk = detectModKey();
        row.style.display = (hasReply && mk !== "essay") ? "" : "none";
      }
      function parseQuestions(txt) {
        let t = String(txt || "").replace(/```[a-z]*```?/g, "```").replace(/```/g, "\n").trim();
        const s = t.indexOf("["), e = t.lastIndexOf("]");
        if (s < 0 || e <= s) throw new Error("AI 未返回题目数据");
        return JSON.parse(t.slice(s, e + 1));
      }
      function openJyfs(ov) {
        ov = ov || {};
        if (!ov.ctxText && !log.some(m => m.role === "assistant")) { UI.toast("请先发起一次 AI 咨询，再点举一反三"); return; }
        const modKey = (ov.modKey !== undefined) ? ov.modKey : detectModKey();
        if (modKey === "essay") { UI.toast("申论暂不支持出题"); return; }
        const isQuestion = !!(qCtx && qCtx.q);
        const boardKey = modKey || "ai";                 // 自由提问且无明确科目 → 归入「综合」
        const modTitle = modKey ? ((window.MODULES[modKey] || {}).title || modKey) : "综合";
        const zhipuKey = getKey("zhipu");
        const hasOrigImg = !!(isQuestion && qCtx.q && qCtx.q.img);
        const mask = UI.el(`<div class="modal-mask"><div class="modal" style="max-width:480px">
          <h3>💡 举一反三</h3>
          <div class="muted small">AI 将围绕你刚才咨询的【考点】出几道同考点选择题（含答案与解析）。只保证考点一致，背景材料由 AI 自行设计，不会照搬原题题干。出题过程不展示，完成后自动进入「${esc(modTitle)}AI出题」板块开始训练。</div>
          <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:10px" id="jyfsCnt">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button class="btn sm" data-n="${n}">${n} 题</button>`).join("")}
          </div>
          ${zhipuKey
            ? `<label class="row" style="margin-top:10px;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="jyfsImg" checked/> 🎨 用 CogView 为题目生成配套图片（需智谱密钥）</label>`
            : `<div class="muted small" style="margin-top:10px">⚠️ 未配置智谱密钥，「生图出题」暂不可用（去 ⚙ 选「智谱 GLM」填 Key 即可）。</div>`}
          <div id="jyfsBusy" class="muted small" style="display:none;margin-top:10px">⏳ AI 正在出题，请稍候…（思考过程不展示，完成后自动跳转）</div>
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" id="jyfsCancel">取消</button></div>
        </div></div>`);
        document.body.appendChild(mask);
        mask.querySelector("#jyfsCancel").onclick = () => mask.remove();
        mask.onclick = e => { if (e.target === mask) mask.remove(); };
        const busy = mask.querySelector("#jyfsBusy");
        mask.querySelectorAll("#jyfsCnt [data-n]").forEach(b => {
          b.onclick = async () => {
            const reqN = parseInt(b.dataset.n, 10);
            mask.querySelectorAll("#jyfsCnt [data-n]").forEach(x => x.disabled = true);
            busy.style.display = "";
            const A = i => String.fromCharCode(65 + i);
            // 先确定实际用来出题的模型：原题带图要走识图模型（把图一并发给 AI）
            let vision = null;
            if (hasOrigImg) {
              const curPid = getProviderId();
              if (canVision(curPid, getModel(curPid))) vision = { pid: curPid, model: getModel(curPid), key: getKey(curPid) };
              else {
                const pv = providerById(curPid).models.find(m => m.vision);
                if (pv) vision = { pid: curPid, model: pv.id, key: getKey(curPid) };
                else if (zhipuKey) vision = { pid: "zhipu", model: "glm-4v-flash", key: zhipuKey };
              }
            }
            // 模型单次输出上限（如智谱 GLM-4V-Flash 只有 1024）：决定单次能出几题、是否要精简输出
            const effPid = vision ? vision.pid : getProviderId();
            const effMid = vision ? vision.model : getModel(effPid);
            const lowCap = (modelInfo(effPid, effMid).maxOut || 1024) <= 1024;
            // 1~10 题全支持：单次装不下时自动分批生成后合并
            const n = reqN;
            const batchSize = lowCap ? 4 : 5;     // 单次请求能容纳的题量
            const rounds = Math.max(1, Math.ceil(n / batchSize));
            const leanNote = lowCap ? "\n注意：输出务必精炼——题干、选项简明扼要，每题解析不超过50字。" : "";
            // 通用出题风格 / 配图指令
            const styleInstr = `\n4) 只要求「考查的考点相同」，不要照搬原题：题干的背景材料、情境、事例、数据一律由你自行设计（可以是不同场景、不同主体、不同数据）；严禁沿用原题的背景/例子/数字，也不要写出与原题题干雷同的句子。保持题型与难度一致即可，不必复刻原题的写法或背景引入。`;
            const imgInstr = `\n5) 每题可选择性给出 "imgPrompt"（字符串）：当该题适合配图（如涉及图形、图表、空间位置、地图、实物图示、逻辑关系图等）时填写，描述应为该题绘制的图片内容；不需要配图的题不要给该字段。`;
            const fmtNote = `；可选字段 "imgPrompt":"图片描述"`;
            // 按当前批次题量构造 prompt（extra：已出题目的清单，避免重复）
            function buildPrompt(cnt, extra) {
              let p;
              if (isQuestion && qCtx.q) {
                const qq = qCtx.q;
                const optsTxt = (qq.options || []).map((o, i) => A(i) + ". " + (o == null ? "" : o)).join("\n");
                p = `你是公务员考试命题专家。请参照下面「${qCtx.subject}」原题所考查的【知识点】，再出 ${cnt} 道考点相同、难度相近的单项选择题（背景材料、情境、数据都由你自行设计，不必与原题相同）。\n要求：\n1) 每题必须包含题干、4个选项、正确答案、详细解析；\n2) 不与原题重复，围绕同一考点从不同角度命题；\n3) 只输出 JSON 数组，禁止输出 markdown 代码块标记或任何其他文字。格式：[{"q":"题干","options":["A内容","B内容","C内容","D内容"],"a":"B","e":"解析"}]${fmtNote}，其中 "a" 是正确选项字母。\n${styleInstr}${imgInstr}${hasOrigImg ? "\n6) 原题附有一张图片（已随消息提供），说明这类题需要看图才能作答。你出的题可以是需要看图理解的同类题，但图片内容由你自定，不要照抄原题图片；需要配图的题请给出 'imgPrompt'。" : ""}\n\n【原题】\n${qq.q || ""}\n${optsTxt ? "【原题选项】\n" + optsTxt + "\n" : ""}【原题解析】${qq.e || "略"}`;
              } else {
                // 自由提问：基于对话主题（或长按指定的那条消息）出题
                const ctx = ov.ctxText || log.filter(m => m.role === "user").map(m => m.content || "").slice(-3).join("\n---\n");
                const topic = (qCtx && qCtx.subject) ? qCtx.subject : (modTitle !== "综合" ? modTitle : "公务员考试相关知识点");
                p = `你是公务员考试命题专家。根据下面用户咨询的内容，围绕其关心的「${topic}」知识点，出 ${cnt} 道考查该知识点、难度相近的单项选择题。\n要求：\n1) 每题必须包含题干、4个选项、正确答案、详细解析；\n2) 紧贴用户咨询的主题，从常见考点、易错点角度命题；\n3) 只输出 JSON 数组，禁止输出 markdown 代码块标记或任何其他文字。格式：[{"q":"题干","options":["A内容","B内容","C内容","D内容"],"a":"B","e":"解析"}]${fmtNote}，其中 "a" 是正确选项字母。\n${styleInstr}${imgInstr}\n\n【用户咨询内容】\n${ctx}`;
              }
              return p + leanNote + (extra || "");
            }
            try {
              const imgEnabled = zhipuKey && mask.querySelector("#jyfsImg") && mask.querySelector("#jyfsImg").checked;
              // 分批调用：低输出上限的模型靠多轮合并凑够题量（如 GLM-4V-Flash 每批 4 题）
              const all = [];
              for (let r = 0; r < rounds; r++) {
                const cnt = Math.min(batchSize, n - all.length);
                if (cnt <= 0) break;
                if (rounds > 1) busy.textContent = `⏳ AI 正在出题…（第 ${r + 1}/${rounds} 批，共 ${n} 题）`;
                const already = all.length
                  ? "\n\n【本批已出过的题，严禁再出相同或高度相似的】\n" + all.map((q, i) => (i + 1) + ". " + String(q.q || "").slice(0, 60)).join("\n")
                  : "";
                let prompt = buildPrompt(cnt, already);
                let userContent;
                if (vision && qCtx.q && qCtx.q.img) {
                  userContent = [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: qCtx.q.img } }];
                } else {
                  if (hasOrigImg && !vision) prompt += "\n（注：原题含图片，但当前无可用识图模型，请仅按题干文字出题。）";
                  userContent = prompt;
                }
                const reply = await chat(
                  [{ role: "system", content: "你是公务员考试命题专家，只输出 JSON 数组，不输出任何其他文字。" },
                   { role: "user", content: userContent }],
                  vision ? { providerId: vision.pid, model: vision.model, key: vision.key, maxTok: 6000 } : { maxTok: 6000 });
                const got = parseQuestions(reply) || [];
                got.forEach(q => { if (q && q.q) all.push(q); });
                if (all.length >= n) break;
              }
              // 去重（题目可能跨批重复）后截取到目标题量
              const seen = {}; const qs = [];
              all.forEach(q => {
                const k = String(q.q || "").replace(/\s+/g, "");
                if (!k || seen[k]) return;
                seen[k] = 1; qs.push(q);
              });
              qs.length = Math.min(qs.length, n);
              if (!qs.length) throw new Error("AI 未返回可用的题目数据，请重试");
              // 用 CogView 为需要配图的题生成图片（best-effort，失败不阻断出题）
              let genNote = "";
              if (imgEnabled) {
                let ok = 0, fail = 0;
                for (const q of qs) {
                  if (q && q.imgPrompt) {
                    try { q.img = await genImage(q.imgPrompt); ok++; }
                    catch (e) { fail++; console.warn("CogView 生图失败", e); }
                  }
                }
                if (ok || fail) genNote = `（${ok} 题已生成配套图片${fail ? "，" + fail + " 题生图失败" : ""}）`;
              }
              const set = KGAIQuiz.addSet(boardKey, isQuestion ? (qCtx.subject || modTitle) : modTitle, qs);
              if (!set) throw new Error("AI 出的题目格式不完整，请重试");
              mask.remove();
              UI.toast(`✅ 已生成 ${set.n} 道同类题，正在进入「${modTitle}AI出题」…${genNote}`);
              window.__aiQuizAuto = { mod: boardKey, setId: set.id };
              // 关闭浮层（内嵌答题场景），清掉返回钩子，直接跳到对应学科模块
              if (typeof overlayClose === "function") { try { overlayClose(); } catch (e) {} }
              returnHash = null; returnHook = null; returnAnchor = null;
              const curKey = (location.hash.replace("#/", "") || "countdown");
              if (boardKey === curKey) {
                // 已在该模块页：hash 不变不会触发重渲染，手动刷新以挂载板块并自动开训
                if (typeof window.renderRoute === "function") window.renderRoute();
              } else {
                location.hash = "#/" + boardKey;
              }
            } catch (e) {
              busy.style.display = "none";
              mask.querySelectorAll("#jyfsCnt [data-n]").forEach(x => x.disabled = false);
              UI.toast("出题失败：" + e.message);
            }
          };
        });
      }
      body.querySelector("#aiJyfs").onclick = openJyfs;
      // 进入时有历史 AI 回复且带题目上下文 → 直接显示按钮
      if (log.some(m => m.role === "assistant")) showJyfs();

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

      /* ===== 返回键（来自错题本 / 答题页的「AI 咨询」时显示，位于发送键左侧） ===== */
      const backBtn = body.querySelector("#aiBack");
      if (backBtn) {
        if (overlayClose) {
          // 浮层模式：返回键＝关闭浮层（底层 quiz DOM 仍在，答题记录保留）
          backBtn.style.display = "";
          backBtn.textContent = "✕ 关闭";
          backBtn.onclick = () => { try { overlayClose(); } catch (e) {} };
        } else if (returnHash) {
          backBtn.style.display = "";
          backBtn.onclick = () => {
            const h = returnHash; const hook = returnHook; const anchor = returnAnchor;
            returnHash = null; returnHook = null; returnAnchor = null;
            if (typeof hook === "function") { try { hook(h); } catch (e) {} return; }
            location.hash = h;
            // 定位到来源的那一道错题（而不是只回到页面顶部）：等路由重渲染后滚动 + 高亮该题卡片
            if (!anchor) return;
            const t0 = Date.now();
            (function seek() {
              const card = document.querySelector('[data-ai="' + anchor + '"]');
              if (card) {
                try {
                  card.scrollIntoView({ behavior: "smooth", block: "center" });
                  card.classList.add("wq-flash");
                  setTimeout(() => card.classList.remove("wq-flash"), 2600);
                } catch (e) {}
                return;
              }
              if (Date.now() - t0 < 4000) setTimeout(seek, 150);
            })();
          };
        } else {
          backBtn.style.display = "none";
        }
      }

      // 自由提问生成的「综合AI出题」板块（无明确科目时归入此项）
      try { window.KGAIQuiz && KGAIQuiz.mount(body, "ai"); } catch (e) { console.error(e); }
    }
  };
})();
