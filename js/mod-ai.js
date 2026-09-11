/* 模块：AI 咨询（GitHub Models 免费额度）
   - 使用 GitHub Models（models.inference.ai.azure.com）的免费接口，无需付费、无需信用卡；
   - 鉴权使用 GitHub 个人访问令牌（PAT，需勾选 models:read 权限），可在本页单独填写；
   - 单次请求限制：输入约 8K、输出约 4K tokens；免费额度约 10~15 次/分钟、50~150 次/天。
   注：接口由 GitHub/Azure 提供，国内网络可能需要可访问 github.com 的网络环境。
*/
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};

  const ENDPOINT = "https://models.inference.ai.azure.com/chat/completions";
  const LS_AI_TOKEN = "kg_ai_token";
  const LS_AI_MODEL = "kg_ai_model";
  const LS_AI_LOG = "kg_ai_log";
  const MODELS = [
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini（推荐，15次/分）" },
    { id: "gpt-4o-mini", label: "GPT-4o mini（15次/分）" },
    { id: "DeepSeek-R1", label: "DeepSeek-R1（推理型，15次/分）" },
    { id: "Meta-Llama-3.3-70B", label: "Llama 3.3 70B（15次/分）" },
    { id: "gpt-4.1", label: "GPT-4.1（更强，10次/分）" }
  ];
  const SYS = "你是一名资深公务员考试（行测+申论）辅导老师。回答要简洁、准确、贴合中国考情，必要时给出解题步骤与易错点。中文作答。";

  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function getToken() {
    try { return localStorage.getItem(LS_AI_TOKEN) || localStorage.getItem("kg_sync_token") || ""; } catch (e) { return ""; }
  }
  function getModel() {
    try { return localStorage.getItem(LS_AI_MODEL) || MODELS[0].id; } catch (e) { return MODELS[0].id; }
  }
  function getLog() {
    try { return JSON.parse(localStorage.getItem(LS_AI_LOG) || "[]"); } catch (e) { return []; }
  }
  function setLog(arr) { try { localStorage.setItem(LS_AI_LOG, JSON.stringify(arr.slice(-40))); } catch (e) {} }

  async function chat(token, model, messages) {
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ model: model, messages: messages, temperature: 0.6, max_tokens: 1500 })
    });
    if (!resp.ok) {
      let msg = "HTTP " + resp.status;
      try { const j = await resp.json(); msg = (j.error && (j.error.message || j.error)) || msg; } catch (e) {}
      throw new Error(msg);
    }
    const j = await resp.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "（无内容）";
  }

  window.MODULES.ai = {
    title: "AI 咨询", icon: "ai",
    render(body) {
      const UI = window.UI;
      let log = getLog();

      body.innerHTML = `
        <div class="card">
          <h3>🤖 AI 咨询（GitHub Models · 免费）</h3>
          <div class="muted small">基于 GitHub Models 的<b>免费额度</b>接口，无需付费、无需信用卡。首次使用需填写一个 GitHub 个人访问令牌（PAT，勾选 <b>models:read</b> 权限即可）。也可复用云端同步已登录的令牌。</div>
          <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap;align-items:center">
            <input id="aiToken" type="password" placeholder="GitHub PAT（可留空复用同步令牌）" value="${esc(getToken())}" style="flex:1;min-width:220px"/>
            <select id="aiModel">${MODELS.map(m => `<option value="${m.id}" ${m.id === getModel() ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select>
            <button class="btn" id="aiSave">保存设置</button>
            <button class="btn ghost" id="aiClear">清空对话</button>
          </div>
          <div class="muted small" id="aiHint" style="margin-top:8px"></div>
        </div>
        <div class="card" style="margin-top:12px">
          <div id="aiMsgs" class="ai-msgs"></div>
          <div class="row" style="margin-top:10px;gap:8px;align-items:flex-end">
            <textarea id="aiInput" rows="2" placeholder="输入你的问题，例如：图形推理中「一笔画」怎么快速判断？" style="flex:1"></textarea>
            <button class="btn primary" id="aiSend">发送</button>
          </div>
          <div class="muted small" style="margin-top:6px">提示：答案由 AI 生成，可能存在错误，请以真题解析为准。</div>
        </div>`;

      const tokenIn = body.querySelector("#aiToken");
      const modelSel = body.querySelector("#aiModel");
      const msgs = body.querySelector("#aiMsgs");
      const input = body.querySelector("#aiInput");
      const sendBtn = body.querySelector("#aiSend");
      const hint = body.querySelector("#aiHint");

      function renderHint() {
        const t = getToken();
        hint.innerHTML = t
          ? `✓ 已配置令牌（${esc(t.slice(0, 7))}…）。若提示 401/403，请确认该 PAT 勾选了 <b>models:read</b>。`
          : `⚠️ 尚未配置令牌：请到 <a href="https://github.com/settings/tokens" target="_blank" rel="noopener">GitHub → Settings → Developer settings → Tokens</a> 生成一个带 <b>models:read</b> 权限的 PAT 填入上方。`;
      }

      function renderMsgs() {
        if (!log.length) {
          msgs.innerHTML = `<div class="empty">还没有对话，试着问一道你困惑的题吧。</div>`;
          return;
        }
        msgs.innerHTML = log.map(m => `
          <div class="ai-msg ${m.role === "user" ? "user" : "bot"}">
            <div class="ai-who">${m.role === "user" ? "我" : "AI"}</div>
            <div class="ai-text">${esc(m.content).replace(/\n/g, "<br>")}</div>
          </div>`).join("");
        msgs.scrollTop = msgs.scrollHeight;
      }

      body.querySelector("#aiSave").onclick = () => {
        try {
          localStorage.setItem(LS_AI_TOKEN, tokenIn.value.trim());
          localStorage.setItem(LS_AI_MODEL, modelSel.value);
        } catch (e) {}
        renderHint();
        UI.toast("AI 设置已保存");
      };
      body.querySelector("#aiClear").onclick = () => { log = []; setLog(log); renderMsgs(); UI.toast("对话已清空"); };

      async function send() {
        const text = input.value.trim();
        if (!text) return;
        const token = tokenIn.value.trim() || getToken();
        if (!token) { UI.toast("请先填写 GitHub 令牌（PAT）"); return; }
        log.push({ role: "user", content: text });
        input.value = "";
        renderMsgs();
        msgs.innerHTML += `<div class="ai-msg bot" id="aiPending"><div class="ai-who">AI</div><div class="ai-text">思考中…</div></div>`;
        msgs.scrollTop = msgs.scrollHeight;
        sendBtn.disabled = true;
        try {
          const messages = [{ role: "system", content: SYS }].concat(log.map(m => ({ role: m.role, content: m.content })));
          const reply = await chat(token, modelSel.value, messages);
          log.push({ role: "assistant", content: reply });
          setLog(log);
          renderMsgs();
        } catch (e) {
          const pending = msgs.querySelector("#aiPending");
          if (pending) pending.remove();
          UI.toast("请求失败：" + e.message);
          msgs.innerHTML += `<div class="ai-msg bot"><div class="ai-who">AI</div><div class="ai-text" style="color:var(--red)">请求失败：${esc(e.message)}<br>（若是网络/CORS 问题，请确认当前网络可访问 github.com；若是 401/403，请检查 PAT 是否有 models:read 权限）</div></div>`;
        } finally {
          sendBtn.disabled = false;
        }
      }
      sendBtn.onclick = send;
      input.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); });

      renderHint();
      renderMsgs();
    }
  };
})();
