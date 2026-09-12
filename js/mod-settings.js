/* 模块：设置
   - 字体设置：华文行楷 / 楷体 / 宋体 / 黑体 / 华文仿宋（内置 Windows 与苹果通用字体栈），选择后记忆；
   - 数据管理：导出备份 / 导入备份（合并）/ 上传云端 / 拉取云端。
   全部通过 localStorage 记忆、跨模块即时生效。
*/
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};

  // 字体栈：Windows 原名在前，苹果（iPhone/iPad/Mac）对应字体名在后，保证两端都能显示
  const FONTS = [
    { key: "default", label: "默认（系统字体）", stack: "" },
    { key: "xingkai", label: "华文行楷", stack: '"华文行楷","STXingkai","行楷",cursive' },
    { key: "kaiti",   label: "楷体",     stack: '"楷体","KaiTi","KaiTi_GB2312","Kaiti SC","STKaiti",serif' },
    { key: "song",    label: "宋体",     stack: '"宋体","SimSun","Songti SC","STSong",serif' },
    { key: "hei",     label: "黑体",     stack: '"黑体","SimHei","Heiti SC","STHeiti","PingFang SC","Microsoft YaHei",sans-serif' },
    { key: "fangsong",label: "华文仿宋", stack: '"华文仿宋","STFangsong","FangSong","仿宋",serif' }
  ];
  const FONT_MAP = {};
  FONTS.forEach(f => { FONT_MAP[f.key] = f.stack; });

  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function getSaved() {
    try { return localStorage.getItem("kg_font") || ""; } catch (e) { return ""; }
  }
  function applyFont(stack) {
    try {
      // 覆盖全站字体变量，让标题/正文/卡片/输入框全部统一切换（含移动端）
      if (stack) {
        document.documentElement.style.setProperty("--font-body", stack);
        document.documentElement.style.setProperty("--font-head", stack);
      } else {
        document.documentElement.style.removeProperty("--font-body");
        document.documentElement.style.removeProperty("--font-head");
      }
    } catch (e) {}
  }
  function keyOfStack(stack) {
    const f = FONTS.find(x => x.stack === stack);
    return f ? f.key : "default";
  }

  window.MODULES.settings = {
    title: "设置", icon: "settings",
    render(body) {
      const DB = window.DB, UI = window.UI;
      const saved = getSaved();
      const curKey = keyOfStack(saved);
      const voiceOk = !!(window.KGVoice && window.KGVoice.supported);

      body.innerHTML = `
        <div class="card">
          <h3>🔤 字体设置</h3>
          <div class="muted small">选择界面整体字体（标题与正文统一）。已内置 Windows 与苹果（iPhone / iPad / Mac）通用字体栈，换设备也能正常显示；选择后自动记忆，下次打开沿用。</div>
          <div class="font-grid" style="margin-top:14px">
            ${FONTS.map(f => `
              <button class="font-opt ${f.key === curKey ? "on" : ""}" data-key="${f.key}">
                <span class="font-sample" style="font-family:${f.stack ? f.stack : "var(--font-body)"}">考公加油 Aa 0123</span>
                <span class="font-name">${esc(f.label)}</span>
              </button>`).join("")}
          </div>
          <div class="muted small" id="fontCur" style="margin-top:10px">当前：${esc(curKey === "default" ? "默认（系统字体）" : FONTS.find(x => x.key === curKey).label)}</div>
        </div>

        <div class="card" style="margin-top:12px">
          <h3>📦 数据管理</h3>
          <div class="muted small">导出 / 导入为本地备份文件（JSON）；上传 / 拉取走 GitHub 云端同步。<b>导入会合并</b>现有数据、不覆盖，可放心恢复历史备份。</div>
          <div class="row" style="margin-top:12px;flex-wrap:wrap;gap:10px">
            <button class="btn" id="exp">📤 导出备份</button>
            <button class="btn" id="imp">📥 导入备份</button>
            <button class="btn" id="push">☁ 上传云端</button>
            <button class="btn" id="pull">☁ 拉取云端</button>
          </div>
          <div class="muted small" id="dataNote" style="margin-top:10px"></div>
        </div>

        <div class="card" style="margin-top:12px">
          <h3>🎤 语音输入</h3>
          <div class="muted small">在任意输入框聚焦时，右下角会出现 🎤 按钮，点一下即可<b>语音转文字</b>（再次点击停止）。支持<b>普通话 / 英文</b>切换（点 🎤 旁的语言按钮）。</div>
          ${voiceOk
            ? `<div class="muted small" style="margin-top:8px;color:var(--green)">✓ 当前浏览器支持语音识别（建议 Chrome / Edge / Safari，且需联网与授予麦克风权限）。</div>`
            : `<div class="muted small" style="margin-top:8px;color:var(--red)">⚠️ 当前浏览器不支持语音识别，请改用 Chrome / Edge / Safari，并确保通过 https 打开。</div>`}
        </div>

        <div class="card" style="margin-top:12px">
          <h3>🔑 AI 密钥</h3>
          <div class="muted small">AI 咨询支持多个<b>免费服务商</b>（GitHub Models / Google Gemini / Groq / OpenRouter / 硅基流动 / 智谱 GLM / 本地 Ollama）。在「AI 咨询」右上角 <b>⚙</b> 里选服务商与模型；这里保存的是<b>当前所选服务商</b>的密钥。密钥<b>只保存在本机浏览器</b>、不上传云端、界面不回显，换设备需重新粘贴一次。</div>
          <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap;align-items:center">
            <input id="aiTok" type="password" autocomplete="off" placeholder="粘贴当前服务商的 API Key / 令牌" style="flex:1;min-width:200px"/>
            <button class="btn primary" id="aiTokSave">保存</button>
            <button class="btn" id="aiTokTest">测试连接</button>
            <button class="btn ghost" id="aiTokClr">清除</button>
          </div>
          <div class="muted small" id="aiTokNote" style="margin-top:8px"></div>
        </div>`;

      /* ===== PDF 题库导入（合并进设置的子板块） ===== */
      const pdfSec = UI.section("📄 PDF 题库导入");
      body.appendChild(pdfSec);
      try { window.MODULES.pdfimport.render(pdfSec.querySelector(".kg-det-b")); }
      catch (e) { pdfSec.querySelector(".kg-det-b").innerHTML = `<div class="card empty">PDF 题库加载失败：${UI.esc(e.message)}</div>`; }

      /* ===== 字体选择 ===== */
      body.querySelectorAll(".font-opt").forEach(b => {
        b.onclick = () => {
          const stack = FONT_MAP[b.dataset.key] || "";
          try {
            if (stack) localStorage.setItem("kg_font", stack);
            else localStorage.removeItem("kg_font");
          } catch (e) {}
          applyFont(stack);
          body.querySelectorAll(".font-opt").forEach(x => x.classList.toggle("on", x.dataset.key === b.dataset.key));
          const lbl = b.dataset.key === "default" ? "默认（系统字体）" : FONTS.find(x => x.key === b.dataset.key).label;
          const curEl = body.querySelector("#fontCur");
          if (curEl) curEl.textContent = "当前：" + lbl;
          UI.toast("字体已切换为：" + lbl);
        };
      });

      /* ===== 数据管理 ===== */
      const note = body.querySelector("#dataNote");
      const io = window.KGDataIO;
      const expBtn = body.querySelector("#exp");
      const impBtn = body.querySelector("#imp");
      const pushBtn = body.querySelector("#push");
      const pullBtn = body.querySelector("#pull");
      if (expBtn) expBtn.onclick = () => { if (io && io.exportData) io.exportData(); else UI.toast("导出功能未就绪"); };
      if (impBtn) impBtn.onclick = () => { if (io && io.importData) io.importData(); else UI.toast("导入功能未就绪"); };
      if (pushBtn) pushBtn.onclick = () => {
        if (!DB.isLoggedIn()) { UI.toast("请先在顶栏「账号」里登录云端，再上传"); return; }
        if (io && io.push) io.push(); else DB.save(true);
        UI.toast("已触发上传到云端");
      };
      if (pullBtn) pullBtn.onclick = () => {
        if (!DB.isLoggedIn()) { UI.toast("请先在顶栏「账号」里登录云端，再拉取"); return; }
        if (io && io.pull) {
          io.pull().then(() => {
            UI.toast("已拉取云端数据");
            window.__refreshTop && window.__refreshTop();
            window.__updateTopTimer && window.__updateTopTimer();
          }).catch(e => UI.toast("拉取失败：" + (e && e.message ? e.message : e)));
        } else {
          UI.toast("拉取功能未就绪");
        }
      };

      /* ===== AI 令牌（保存后打码回显，让你能确认"确实存上了"） ===== */
      const aiTok = body.querySelector("#aiTok");
      const aiNote = body.querySelector("#aiTokNote");
      const aiSaveBtn = body.querySelector("#aiTokSave");
      const aiTestBtn = body.querySelector("#aiTokTest");
      const aiClrBtn = body.querySelector("#aiTokClr");

      // 打码：前 10 位 + •••• + 后 4 位
      function mask(t) {
        t = String(t || "");
        if (t.length <= 14) return t.slice(0, 4) + "••••";
        return t.slice(0, 10) + "••••" + t.slice(-4);
      }
      function syncTokNote() {
        const A = window.KGAI;
        if (!aiNote) return;
        const t = (A && A.getToken) ? A.getToken() : "";
        aiNote.innerHTML = t
          ? `✅ <b>已保存并生效</b>：<code>${UI.esc(mask(t))}</code>（共 ${t.length} 位）<br>去「AI 咨询」发一句话即可验证。`
          : `⚠️ 尚未配置：请在上方粘贴你的 GitHub 令牌（需勾选 <b>models:read</b>）。`;
      }
      // 真正的保存动作（按钮 / 回车 / 失焦自动保存 都会走这里）
      function doSave(silent) {
        const A = window.KGAI;
        if (!A) { UI.toast("AI 模块未就绪"); return false; }
        const v = (aiTok && aiTok.value ? aiTok.value : "").trim();
        if (!v) { if (!silent) UI.toast("输入框是空的，请先长按粘贴令牌"); return false; }
        try {
          A.setToken(v);
          const back = A.getToken();
          if (!back) throw new Error("写入后读取为空");
          if (aiTok) aiTok.value = "";
          syncTokNote();
          UI.toast("✓ 令牌已保存（" + mask(back) + "）");
          return true;
        } catch (e) {
          UI.toast("保存失败：" + e.message);
          if (aiNote) aiNote.innerHTML = `❌ <b>保存失败</b>：${UI.esc(e.message)}<br>如果是无痕/隐私模式，浏览器会禁用本地存储，请改用普通窗口打开。`;
          return false;
        }
      }
      syncTokNote();
      if (aiSaveBtn) aiSaveBtn.onclick = () => doSave(false);
      // 失焦自动保存：避免"点了保存没反应"导致白忙一场
      if (aiTok) {
        aiTok.addEventListener("change", () => { if (aiTok.value.trim()) doSave(false); });
        aiTok.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); doSave(false); } });
      }
      if (aiTestBtn) aiTestBtn.onclick = async () => {
        const A = window.KGAI;
        if (!A || !A.test) { UI.toast("AI 模块未就绪"); return; }
        if (!A.getToken()) { UI.toast("请先粘贴并保存令牌"); return; }
        aiTestBtn.disabled = true; const old = aiTestBtn.textContent; aiTestBtn.textContent = "测试中…";
        try {
          const r = await A.test();
          UI.toast("✓ 连接成功：" + String(r || "").replace(/\s+/g, " ").slice(0, 20));
          if (aiNote) aiNote.innerHTML += `<br>✅ <b>连接测试通过</b>，AI 可正常使用。`;
        } catch (e) {
          UI.toast("连接失败：" + e.message);
          if (aiNote) aiNote.innerHTML += `<br>❌ <b>连接失败</b>：${UI.esc(e.message)}（401/403 请检查令牌是否勾选 models:read；网络问题请确认可访问 github.com）`;
        } finally { aiTestBtn.disabled = false; aiTestBtn.textContent = old; }
      };
      if (aiClrBtn) aiClrBtn.onclick = () => {
        const A = window.KGAI;
        if (A) A.setToken("");
        if (aiTok) aiTok.value = "";
        syncTokNote(); UI.toast("已清除令牌");
      };
    }
  };
})();
