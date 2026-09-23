/* 模块：设置
   - 字体设置：华文行楷 / 楷体 / 宋体 / 黑体 / 华文仿宋（网页字体 + 系统字体兜底，手机/平板也能显示），选择后记忆；
   - 数据管理：导出备份 / 导入备份（合并）/ 上传云端 / 拉取云端。
   全部通过 localStorage 记忆、跨模块即时生效。
*/
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};

  // 字体栈：网页字体（免费可商用，随页面从 CDN 加载）放在最前，保证手机/平板（安卓·iOS）也能显示；
  // 其后为本机系统字体作为桌面端兜底。网页字体与系统字体风格一致，仅作跨设备显示之用。
  const FONTS = [
    { key: "default", label: "默认（系统字体）", stack: "" },
    { key: "xingkai", label: "华文行楷", stack: '"Ma Shan Zheng","华文行楷","STXingkai","行楷",cursive' },
    { key: "kaiti",   label: "楷体",     stack: '"LXGW WenKai","楷体","KaiTi","KaiTi_GB2312","Kaiti SC","STKaiti",serif' },
    { key: "song",    label: "宋体",     stack: '"Noto Serif SC","宋体","SimSun","Songti SC","STSong",serif' },
    { key: "hei",     label: "黑体",     stack: '"Noto Sans SC","黑体","SimHei","Heiti SC","STHeiti","PingFang SC","Microsoft YaHei",sans-serif' },
    { key: "fangsong",label: "华文仿宋", stack: '"ZCOOL XiaoWei","华文仿宋","STFangsong","FangSong","仿宋",serif' }
  ];
  const FONT_MAP = {};
  FONTS.forEach(f => { FONT_MAP[f.key] = f.stack; });

  // 旧版存的是纯系统字体栈（手机/平板无此字体，回退成默认）。这里把旧栈映射为新栈（网页字体在前），
  // 让已选过字体的老用户在点开在线链接时也能在手机/平板上看到所选字体。
  const LEGACY_MAP = {
    '"华文行楷"': '"Ma Shan Zheng","华文行楷","STXingkai","行楷",cursive',
    '"楷体"':     '"LXGW WenKai","楷体","KaiTi","KaiTi_GB2312","Kaiti SC","STKaiti",serif',
    '"宋体"':     '"Noto Serif SC","宋体","SimSun","Songti SC","STSong",serif',
    '"黑体"':     '"Noto Sans SC","黑体","SimHei","Heiti SC","STHeiti","PingFang SC","Microsoft YaHei",sans-serif',
    '"华文仿宋"': '"ZCOOL XiaoWei","华文仿宋","STFangsong","FangSong","仿宋",serif'
  };
  (function migrateFont() {
    try {
      const raw = localStorage.getItem("kg_font");
      if (!raw) return;
      for (const k in LEGACY_MAP) {
        if (raw.indexOf(k) === 0 && raw !== LEGACY_MAP[k]) {
          localStorage.setItem("kg_font", LEGACY_MAP[k]);
          break;
        }
      }
    } catch (e) {}
  })();

  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function getSaved() {
    try { return localStorage.getItem("kg_font") || ""; } catch (e) { return ""; }
  }
  function applyFont(stack) {
    try {
      // 关键修复：字体变量必须设在 <body> 的内联样式上。
      // 主题 CSS（body.theme-wuxia 等）在 body 级定义 --font-body/--font-head，
      // 会覆盖 <html> 上继承下来的值；body 内联样式优先级最高，任何主题下都能生效。
      const t = document.body.style;
      if (stack) {
        t.setProperty("--font-body", stack);
        t.setProperty("--font-head", stack);
      } else {
        t.removeProperty("--font-body");
        t.removeProperty("--font-head");
      }
      // 清掉历史版本设在 <html> 上的残留
      document.documentElement.style.removeProperty("--font-body");
      document.documentElement.style.removeProperty("--font-head");
    } catch (e) {}
  }
  function keyOfStack(stack) {
    const f = FONTS.find(x => x.stack === stack);
    return f ? f.key : "default";
  }

  // 系统字号：通过对 #app 容器使用 zoom 缩放（聊天/弹窗在 #app 之外，不受影响），
  // 数值为比例（1=标准），存 localStorage。提供全局 applyFontSize 供 app.js 启动时使用。
  function getFontSizeScale() {
    try { const v = parseFloat(localStorage.getItem("kg_font_size")); if (!isNaN(v) && v >= 0.7 && v <= 1.6) return v; } catch (e) {}
    return 1;
  }
  function fontSizeLabel(scale) {
    const p = Math.round(scale * 100);
    if (p <= 90) return "小（" + p + "%）";
    if (p >= 110) return "大（" + p + "%）";
    return "标准（" + p + "%）";
  }
  function applyFontSize(scale) {
    try {
      // 关键修复：iOS Safari 的 CSS zoom 只放大盒子、文字不跟着变（WebKit 已知怪癖）。
      // 改用 transform:scale + 反向宽高（1/s），全平台文字与布局一起缩放，视觉占满视口。
      const app = document.getElementById("app");
      if (!app) return;
      const s = (scale && scale !== 1 && scale >= 0.7 && scale <= 1.6) ? scale : 0;
      if (!s) {
        app.style.transform = ""; app.style.width = ""; app.style.height = "";
        app.style.transformOrigin = "";
      } else {
        app.style.transformOrigin = "0 0";
        app.style.transform = "scale(" + s + ")";
        app.style.width = (100 / s) + "%";
        app.style.height = (100 / s) + "%";
      }
    } catch (e) {}
  }
  window.applyKgFontSize = applyFontSize; // 供 app.js 启动调用

  window.MODULES.settings = {
    title: "设置", icon: "settings",
    render(body) {
      const DB = window.DB, UI = window.UI;
      const saved = getSaved();
      const curKey = keyOfStack(saved);
      const scale = getFontSizeScale();
      const voiceOk = !!(window.KGVoice && window.KGVoice.supported);

      body.innerHTML = `
        <div class="card">
          <h3>🔤 字体设置</h3>
          <div class="muted small">选择界面整体字体（标题与正文统一）。已接入网页字体（免费可商用，随页面从 CDN 加载），手机 / 平板（安卓 · iOS）打开在线链接也能看到所选字体；电脑端优先用本机系统字体。选择后自动记忆，下次打开沿用。</div>
          <div class="font-grid" style="margin-top:14px">
            ${FONTS.map(f => `
              <button class="font-opt ${f.key === curKey ? "on" : ""}" data-key="${f.key}">
                <span class="font-sample" style="font-family:${f.stack ? f.stack : "var(--font-body)"}">考公加油 Aa 0123</span>
                <span class="font-name">${esc(f.label)}</span>
              </button>`).join("")}
          </div>
          <div class="muted small" id="fontCur" style="margin-top:10px">当前：${esc(curKey === "default" ? "默认（系统字体）" : FONTS.find(x => x.key === curKey).label)}</div>
          <hr class="kg-sep" style="margin:16px 0 12px"/>
          <div>
            <div class="row" style="justify-content:space-between;align-items:center">
              <strong>系统字号</strong>
              <span id="fsVal" class="muted small">${fontSizeLabel(scale)}</span>
            </div>
            <input type="range" id="fsRange" min="80" max="140" step="5" value="${Math.round(scale * 100)}" style="width:100%;margin-top:8px;accent-color:var(--accent,#3b6cff)"/>
            <div class="muted small" style="display:flex;justify-content:space-between;margin-top:2px"><span>小</span><span>标准</span><span>大</span></div>
          </div>
        </div>

        <div class="card" style="margin-top:12px">
          <h3>💬 后端服务地址（好友 / 聊天）</h3>
          <div class="muted small">加好友、聊天、在线状态、媒体上传依赖一个常驻后端。把部署 <b>backend</b>（Render / Railway 一键部署，或本地 <code>node backend/server.js</code>）得到的地址填到这里，例如 <code>https://kaogong-sync.onrender.com</code> 或本地 <code>http://localhost:3000</code>。填写后到「我的」登录 / 注册社交账号即可使用。</div>
          <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap;align-items:center">
            <input id="apiBase" placeholder="https://你的后端地址" style="flex:1;min-width:220px" value="${esc(Social.getBase())}"/>
            <button class="btn primary sm" id="saveBase">保存</button>
            <button class="btn sm ghost" id="testBase">测试连接</button>
          </div>
          <div class="muted small" id="baseNote" style="margin-top:10px"></div>
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
        </div>

        <div class="card" style="margin-top:12px">
          <h3>🎨 主题外观</h3>
          <div class="muted small">选择工作台整体主题，设置后自动记忆并上传云端，下次登录保持。每个主题都能单独切换浅色 / 深色。</div>
          <div class="theme-grid" id="themeGrid">
            <button class="theme-opt" data-name="cyber"><span class="theme-sw" style="background:linear-gradient(135deg,#34e7e4,#ff5cf0)"></span><span>赛博朋克</span></button>
            <button class="theme-opt" data-name="minimal"><span class="theme-sw" style="background:linear-gradient(135deg,#4a90d9,#8a7fd0)"></span><span>简约</span></button>
            <button class="theme-opt" data-name="cute"><span class="theme-sw" style="background:linear-gradient(135deg,#ffb3d9,#ff6fae)"></span><span>可爱</span></button>
            <button class="theme-opt" data-name="wuxia"><span class="theme-sw" style="background:linear-gradient(135deg,#4caf7d,#2f8f5f)"></span><span>武侠</span></button>
            <button class="theme-opt" data-name="custom"><span class="theme-sw" style="background:linear-gradient(135deg,#34e7e4,#9b6cff)"></span><span>自定义背景</span></button>
          </div>
          <div class="row" style="margin-top:12px;gap:10px;align-items:center;flex-wrap:wrap">
            <label class="muted small">模式</label>
            <select id="themeMode">
              <option value="auto">自动（跟随时间）</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
            <label class="row" style="gap:6px;align-items:center;margin:0 0 0 8px">
              <input type="checkbox" id="iosGlass"/>
              <span class="muted small">iOS 透明键（ios27 质感）</span>
            </label>
          </div>
          <div id="glassBox" style="display:none;margin-top:8px">
            <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
              <span class="muted small">玻璃质感</span>
              <span class="muted small" style="flex:0 0 auto">💧 透明</span>
              <input type="range" id="glassLevel" min="0" max="100" step="5" value="50" style="flex:1;min-width:130px"/>
              <span class="muted small" style="flex:0 0 auto">⬜ 色调</span>
            </div>
            <div class="muted small" style="margin-top:4px">往左越通透（边缘反光更明显），往右白色调更浓、对比度更高。下面的示例会随滑条实时变化。</div>
            <div class="glass-preview">
              <div class="card gp-card">示例板块 · 玻璃卡片<button class="btn">示例按键</button></div>
              <span class="muted small" style="color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.3)">拖动滑条，这块玻璃的透明度与高光会立刻变化</span>
            </div>
          </div>
          <div id="customThemeBox" style="display:none;margin-top:12px">
            <div class="muted small">自定义主题 = 武侠水墨基底 + 你自己的修饰：可选背景图、按钮边框色，还能给每个板块挑专属 emoji。</div>
            <div class="row" style="margin-top:8px;gap:10px;align-items:center;flex-wrap:wrap">
              <input type="file" id="customBg" accept="image/*"/>
              <label class="muted small">按钮边框色</label>
              <input type="color" id="customColor" value="#6f9f7f"/>
              <button class="btn sm ghost" id="customEmoji">🎨 板块表情</button>
              <button class="btn sm ghost" id="customBgClear">清除背景</button>
            </div>
            <div class="row" style="margin-top:8px;gap:10px;align-items:center;flex-wrap:wrap">
              <span class="muted small">背景模糊</span>
              <span class="muted small" style="flex:0 0 auto">清晰</span>
              <input type="range" id="customBlur" min="0" max="100" step="5" value="50" style="flex:1;min-width:130px"/>
              <span class="muted small" style="flex:0 0 auto">最糊</span>
              <span class="muted small" id="customBlurVal">50%</span>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:12px">
          <h3>❓ 使用说明书</h3>
          <div class="muted small">各模块的使用说明都集中在这里与顶栏「❓ 帮助」里，界面保持简洁。每次功能更新都会同步更新。</div>
          <button class="btn primary" id="openHelp" style="margin-top:10px">📖 打开使用说明书</button>
        </div>`;

      /* ===== PDF 题库导入（合并进设置的子板块） ===== */
      const pdfSec = UI.section("📄 PDF 题库导入", { open: false });
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

      /* ===== 系统字号滑块 ===== */
      const fsRange = body.querySelector("#fsRange");
      const fsVal = body.querySelector("#fsVal");
      if (fsRange) {
        const onFs = () => {
          const s = Math.max(0.7, Math.min(1.6, (+fsRange.value) / 100));
          try { localStorage.setItem("kg_font_size", String(s)); } catch (e) {}
          applyFontSize(s);
          if (fsVal) fsVal.textContent = fontSizeLabel(s);
        };
        fsRange.addEventListener("input", onFs);
        fsRange.addEventListener("change", onFs);
      }

      /* ===== 后端服务地址（好友/聊天） ===== */
      const baseNote = body.querySelector("#baseNote");
      const apiBase = body.querySelector("#apiBase");
      const saveBase = body.querySelector("#saveBase");
      const testBase = body.querySelector("#testBase");
      if (saveBase) saveBase.onclick = () => {
        const v = (apiBase.value || "").trim().replace(/\/+$/, "");
        Social.setBase(v);
        baseNote.innerHTML = `已保存：<b>${UI.esc(v || "（空）")}</b>。到「我的」登录社交账号后启用。`;
        UI.toast("后端地址已保存");
      };
      if (testBase) testBase.onclick = () => {
        const v = (apiBase.value || "").trim().replace(/\/+$/, "");
        if (!v) { baseNote.textContent = "请先填写地址"; return; }
        baseNote.textContent = "连接中…";
        fetch(v + "/api/health").then(r => r.json()).then(j => { baseNote.innerHTML = j && j.ok ? "✓ 连接成功，后端在线" : "返回异常"; })
          .catch(e => baseNote.textContent = "连接失败：" + e.message);
      };

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
          pullBtn.disabled = true; pullBtn.textContent = "拉取中…";
          io.pull().then((res) => {
            res = res || {};
            if (res.notFound) { UI.toast("云端暂无数据，已保留本机数据"); }
            else if (res.error) { UI.toast("拉取失败：" + (res.msg || "未知错误")); }
            else {
              const s = res.stats || {};
              const parts = [];
              if (s.pdfBooks) parts.push(s.pdfBooks + " 个刷题册");
              if (s.customQuestions) parts.push(s.customQuestions + " 道自建题");
              if (s.pdfBookPractice) parts.push(s.pdfBookPractice + " 条刷题记录");
              UI.toast(parts.length ? ("已从云端合并 " + parts.join("、") + "，并回传云端") : "已是最新，无新增");
              window.__refreshTop && window.__refreshTop();
              window.__updateTopTimer && window.__updateTopTimer();
            }
          }).catch(e => UI.toast("拉取失败：" + (e && e.message ? e.message : e)))
            .then(() => { pullBtn.disabled = false; pullBtn.textContent = "拉取云端"; });
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

      /* ===== 主题外观 ===== */
      const themeGrid = body.querySelector("#themeGrid");
      const themeMode = body.querySelector("#themeMode");
      const customThemeBox = body.querySelector("#customThemeBox");
      function reflectTheme() {
        const s = (window.Theme && Theme.getState()) || { name: "wuxia", mode: "auto", iosGlass: false, glassLevel: 0, customBlur: 50 };
        if (themeGrid) themeGrid.querySelectorAll(".theme-opt").forEach(b => b.classList.toggle("on", b.dataset.name === s.name));
        if (themeMode) themeMode.value = s.mode;
        if (customThemeBox) customThemeBox.style.display = (s.name === "custom") ? "block" : "none";
        const gChk = body.querySelector("#iosGlass"), gBox = body.querySelector("#glassBox"), gLv = body.querySelector("#glassLevel");
        if (gChk) gChk.checked = !!s.iosGlass;
        if (gBox) gBox.style.display = s.iosGlass ? "block" : "none";
        if (gLv) gLv.value = String(s.glassLevel);
        const cBl = body.querySelector("#customBlur"), cBlV = body.querySelector("#customBlurVal");
        if (cBl) cBl.value = String(s.customBlur);
        if (cBlV) cBlV.textContent = s.customBlur + "%";
      }
      if (themeGrid) themeGrid.querySelectorAll(".theme-opt").forEach(b => {
        b.onclick = () => {
          window.Theme.set({ name: b.dataset.name });
          UI.toast("已切换主题：" + b.querySelector("span:last-child").textContent);
          reflectTheme();
        };
      });
      if (themeMode) themeMode.onchange = () => { window.Theme.set({ mode: themeMode.value }); UI.toast("已切换为" + (themeMode.value === "auto" ? "自动模式" : (themeMode.value === "light" ? "浅色" : "深色"))); };
      const customBg = body.querySelector("#customBg");
      if (customBg) customBg.onchange = () => {
        const f = customBg.files && customBg.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => { window.Theme.set({ customBg: r.result }); UI.toast("背景已设置"); };
        r.readAsDataURL(f);
      };
      const customColor = body.querySelector("#customColor");
      if (customColor) customColor.onchange = () => { window.Theme.set({ customColor: customColor.value }); };
      /* 板块表情自定义：每个主屏导航模块可指定一个 emoji，仅自定义主题生效 */
      const customEmojiBtn = body.querySelector("#customEmoji");
      if (customEmojiBtn) customEmojiBtn.onclick = () => {
        const cur = (Theme.getState().emojis) || {};
        const keys = Object.keys(window.MODULES || {}).filter(k => (window.NAV || []).indexOf(k) >= 0);
        const list = (keys.length ? keys : Object.keys(window.MODULES || {}));
        const box = UI.el(`<div>
          <div class="muted small" style="margin-bottom:8px">给各板块挑一个 emoji 修饰（留空 = 用默认武侠元素）。点「跳过/关闭」即保持默认。</div>
          ${list.map(k => `<label class="kg-fld">${UI.esc((window.MODULES[k] && window.MODULES[k].title) || k)}<input data-k="${k}" value="${UI.esc(cur[k] || "")}" placeholder="如 ⚔️ 📖 🧘" maxlength="4"/></label>`).join("")}
        </div>`);
        UI.modal({
          title: "🎨 自定义板块表情", body: box, width: "420px",
          actions: [
            { label: "恢复默认", cls: "ghost", onClick: (m2, c) => { window.Theme.set({ emojis: {} }); c(); UI.toast("已恢复默认武侠元素"); } },
            { label: "保存", cls: "primary", onClick: (m2, c) => {
                const em = {};
                box.querySelectorAll("input[data-k]").forEach(inp => { const v = inp.value.trim(); if (v) em[inp.dataset.k] = v; });
                window.Theme.set({ emojis: em });
                c(); UI.toast("✓ 板块表情已保存");
              } }
          ]
        });
      };
      const customBgClear = body.querySelector("#customBgClear");
      if (customBgClear) customBgClear.onclick = () => { window.Theme.set({ customBg: "" }); UI.toast("已清除背景"); };
      /* iOS 透明键（ios27 质感）+ 玻璃质感滑条（毛玻璃↔全透明）+ 自定义背景模糊滑条 */
      const iosGlassChk = body.querySelector("#iosGlass");
      if (iosGlassChk) iosGlassChk.onchange = () => {
        window.Theme.set({ iosGlass: iosGlassChk.checked });
        UI.toast(iosGlassChk.checked ? "已开启 iOS 透明键（ios27 质感）" : "已关闭 iOS 透明键");
        reflectTheme();
      };
      const glassLevelInp = body.querySelector("#glassLevel");
      let glassDeb = null;
      if (glassLevelInp) glassLevelInp.oninput = () => {
        clearTimeout(glassDeb);
        glassDeb = setTimeout(() => { window.Theme.set({ glassLevel: Number(glassLevelInp.value) }); }, 250);
      };
      const customBlurInp = body.querySelector("#customBlur");
      let blurDeb = null;
      if (customBlurInp) customBlurInp.oninput = () => {
        const v = Number(customBlurInp.value);
        const lbl = body.querySelector("#customBlurVal"); if (lbl) lbl.textContent = v + "%";
        clearTimeout(blurDeb);
        blurDeb = setTimeout(() => { window.Theme.set({ customBlur: v }); }, 250);
      };
      reflectTheme();

      /* ===== 使用说明书 ===== */
      const openHelpBtn = body.querySelector("#openHelp");
      if (openHelpBtn) openHelpBtn.onclick = () => { window.KGHelp && window.KGHelp.open(); };
    }
  };
})();
