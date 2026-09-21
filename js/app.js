/* 考公工作台 · 主程序（导航 / 路由 / 顶部栏 / 同步账号） */
(function () {
  "use strict";
  const DB = window.DB, UI = window.UI, ICONS = window.ICONS, MODULES = window.MODULES;

  const NAV = ["countdown", "timer", "current", "verbal", "data", "logic", "politics", "quantity", "common", "essay", "calendar", "wrongbook", "favorites", "stats", "ai", "settings"];
  const GH_LABEL = "12345kobe/kaogong";

  /* ===== 主题系统：赛博朋克(默认) / 简约 / 可爱 / 武侠 / 自定义背景 =====
     状态存 DB.state.theme（随云端同步），切换后自动保存并触发上传云端。 */
  const Theme = (function () {
    function getState() {
      const s = (window.DB && DB.state && DB.state.theme) || {};
      return { name: s.name || "cyber", mode: s.mode || "auto", customBg: s.customBg || "", customColor: s.customColor || "" };
    }
    function autoMode() {
      const now = new Date(); const t = now.getHours() * 60 + now.getMinutes();
      const light = (t >= 7 * 60 + 30 && t < 12 * 60 + 30) || (t >= 13 * 60 + 30 && t < 18 * 60);
      return light ? "light" : "dark";
    }
    function resolveMode(mode) { if (mode === "auto") return autoMode(); return mode === "light" ? "light" : "dark"; }
    function apply() {
      const s = getState();
      const mode = resolveMode(s.mode);
      const cls = (document.body.className || "").split(/\s+/).filter(c => c && !c.startsWith("theme-") && c !== "light");
      cls.push("theme-" + s.name);
      if (mode === "light") cls.push("light");
      document.body.className = cls.join(" ");
      // 自定义背景 / 主色（通过 CSS 变量注入；无则清除）
      if (s.name === "custom") {
        if (s.customBg) document.body.style.setProperty("--custom-bg", "url(" + JSON.stringify(s.customBg) + ")");
        else document.body.style.removeProperty("--custom-bg");
        if (s.customColor) document.body.style.setProperty("--custom-color", s.customColor);
        else document.body.style.removeProperty("--custom-color");
      } else {
        document.body.style.removeProperty("--custom-bg");
        document.body.style.removeProperty("--custom-color");
      }
    }
    function set(opts) {
      const st = (window.DB && DB.state && DB.state.theme) || (DB.state.theme = {});
      if (opts.name !== undefined) st.name = opts.name;
      if (opts.mode !== undefined) st.mode = opts.mode;
      if (opts.customBg !== undefined) st.customBg = opts.customBg;
      if (opts.customColor !== undefined) st.customColor = opts.customColor;
      try {
        DB.save();                                  // 本地保存（含 theme）
        if (DB.isLoggedIn && DB.isLoggedIn()) { DB.push && DB.push(); }  // 已登录则立即上传云端
      } catch (e) {}
      apply();
    }
    function init() {
      apply();
      setInterval(() => { const s = getState(); if (s.mode === "auto") apply(); }, 60000);
    }
    function toggle() {
      const cur = document.body.classList.contains("light") ? "light" : "dark";
      set({ mode: cur === "light" ? "dark" : "light" });
      return document.body.classList.contains("light") ? "light" : "dark";
    }
    function current() { return document.body.classList.contains("light") ? "light" : "dark"; }
    return { init: init, apply: apply, set: set, toggle: toggle, current: current, getState: getState };
  })();

  function el(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; }

  function loadNav() {
    const nav = document.getElementById("nav"); nav.innerHTML = "";
    NAV.forEach(key => {
      const m = MODULES[key]; if (!m) return;
      const item = el(`<div class="nav-item" data-key="${key}">${ICONS[m.icon] || ""}<span>${m.title}</span></div>`);
      item.onclick = () => { location.hash = "#/" + key; closeSidebar(); };
      nav.appendChild(item);
    });
  }
  function setActive(key) {
    document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.key === key));
    const m = MODULES[key];
    document.getElementById("pageTitle").innerHTML = (ICONS[m.icon] || "") + `<span>${m.title}</span>`;
  }

  let lastKey = null;
  function renderRoute() {
    const key = (location.hash.replace("#/", "") || "countdown");
    if (!MODULES[key]) { location.hash = "#/countdown"; return; }
    // 离开「刷题模式」且仍在计时 → 自动结算（结束计时）
    if (lastKey === "shuati" && key !== "shuati") {
      if (window.__shuatiCleanup) { try { window.__shuatiCleanup(); } catch (e) {} }
      if (DB.timerState && DB.timerState().running) {
        const r = DB.timerSettle("刷题模式");
        UI.toast(`已退出刷题模式，计时结束：专注 ${fmtMs(r.sec * 1000)}${r.planId ? "，已记入今日计划 ✓" : ""}`);
        window.__updateTopTimer && window.__updateTopTimer();
      }
    }
    setActive(key);
    // 更新日志气泡：进入某模块即视为已读该模块的更新
    try { window.Changelog && Changelog.onRoute(key); } catch (e) {}
    const body = document.getElementById("pageBody"); body.innerHTML = "";
    try { MODULES[key].render(body); }
    catch (e) { body.innerHTML = `<div class="card empty">模块加载出错：${UI.esc(e.message)}</div>`; console.error(e); }
    // 通用折叠：模块内辅助小板块默认收起（AI 有独立全屏布局、设置为表单页，均不参与）
    if (key !== "ai" && key !== "settings") {
      try { UI.autoCollapse(body); } catch (e) { console.error(e); }
    }
    // AI 咨询：整屏对话模式（隐藏浮动按钮、去掉内边距，让对话区占屏 80%+）
    try { document.body.classList.toggle("ai-mode", key === "ai"); } catch (e) {}
    // 把 PDF 导入的题册挂到对应模块的「自行刷题」入口
    try { mountPdfBooks(body, key); } catch (e) { console.error(e); }
    // AI 举一反三：挂「xxAI出题」板块（该模块有 AI 生成的题目时才显示）
    try { window.KGAIQuiz && KGAIQuiz.mount(body, key); } catch (e) { console.error(e); }
    // 每个模块页挂「悬浮手写」按钮（笔记覆盖整页、永久保存；AI 咨询/设置/刷题页隐藏）
    try {
      if (UI.floatingAnno) {
        if (key === "ai" || key === "settings" || key === "shuati") {
          UI.hideAnnoFab();
        } else {
          UI.floatingAnno((MODULES[key] && MODULES[key].title) || key, "mod_" + key, body);
        }
      }
    } catch (e) { console.error(e); }
    // 每个模块都提供「专注计时」入口（上岸计时器）：点击带本模块名跳到计时器
    const fab = document.getElementById("focusFab");
    if (fab) {
      if (key === "timer" || key === "shuati") { fab.style.display = "none"; }
      else { fab.style.display = ""; fab.dataset.module = key; }
    }
    lastKey = key;
  }
  window.renderRoute = renderRoute;  // 供同路由强制重渲染（如 AI 出题后停留在 AI 页时刷新板块）

  /* ===== PDF 导入的题册：挂到对应模块的「自行刷题」入口 =====
     题册由 js/mod-pdfimport.js 解析并存入 DB.state.pdfBooks，通过 window.KGPdfBooks 读取。
     展示方式：按章节折叠 → 有理论的提供「📖 学考点」→ 题目走 Quiz 引擎（记录每题用时与正确率）。 */
  const PDFBK_SUBJ = { verbal: "言语", politics: "政治", common: "常识", essay: "申论", data: "资料", logic: "逻辑", quantity: "数量" };
  function mountPdfBooks(body, key) {
    const subj = PDFBK_SUBJ[key];
    const api = window.KGPdfBooks;
    if (!subj || !api || !api.list) return;
    let books = [];
    try { books = api.list(subj) || []; } catch (e) { return; }
    if (!books.length) return;

    const sec = UI.section("📚 我导入的题册（" + (window.KGSubjectFull ? KGSubjectFull(subj) : subj) + "）");
    body.appendChild(sec);
    const box = sec.querySelector(".kg-det-b");

    function openHtml(title, html) {
      const mask = UI.el(`<div class="modal-mask"><div class="modal" style="max-width:760px;max-height:84vh;overflow:auto">
        <h3>📖 ${UI.esc(title)}</h3>
        <div class="pdb-theory">${html || "<div class='muted'>（本考点无讲解内容）</div>"}</div>
        <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost pdb-close">关闭</button></div>
      </div></div>`);
      document.body.appendChild(mask);
      mask.querySelector(".pdb-close").onclick = () => mask.remove();
      mask.onclick = e => { if (e.target === mask) mask.remove(); };
    }
    function openQuiz(title, qs) {
      const mask = UI.el(`<div class="modal-mask"><div class="modal" style="max-width:820px;max-height:88vh;overflow:auto">
        <h3>✍ ${UI.esc(title)}</h3>
        <div class="pdb-quiz"></div>
        <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost pdb-close">关闭</button></div>
      </div></div>`);
      document.body.appendChild(mask);
      mask.querySelector(".pdb-close").onclick = () => mask.remove();
      mask.onclick = e => { if (e.target === mask) mask.remove(); };
      try { window.Quiz.start(mask.querySelector(".pdb-quiz"), qs, subj, {}); }
      catch (e) { mask.querySelector(".pdb-quiz").innerHTML = `<div class="card empty">练习启动失败：${UI.esc(e.message)}</div>`; }
    }

    books.forEach(bk => {
      // 只保留有内容（有题或有讲解）的部分；题目必须有 options，避免 Quiz 抛错
      const secs = (bk.sections || []).filter(s => s && (((s.questions || []).length) || s.theory));
      const nq = secs.reduce((s, x) => s + ((x.questions || []).length), 0);
      const card = UI.el(`<div class="card">
        <h3>📘 ${UI.esc(bk.name || "未命名题册")}</h3>
        <div class="muted small">${secs.length} 个考点/部分 · 共 ${nq} 题${bk.date ? " · " + UI.esc(bk.date) : ""}</div>
        <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap;align-items:center">
          <label class="fld" style="margin:0">每次</label>
          <select class="pdb-size" style="width:96px">
            <option value="10" selected>10 题</option>
            <option value="20">20 题</option>
            <option value="5">5 题</option>
            <option value="0">本节全部</option>
          </select>
          <button class="btn primary pdb-all">▶ 从第一个考点开始练</button>
        </div>
      </div>`);
      let firstGo = null;

      secs.forEach((s, si) => {
        try {
          const qs = (s.questions || []).filter(q => q && q.options && q.options.length >= 2 && q.q);
          const nm = s.name || ("第 " + (si + 1) + " 部分");
          const label = qs.length ? (nm + "（" + qs.length + " 题）") : ("📖 " + nm + "（考点讲解）");
          const inner = UI.section(label);
          const ic = UI.el(`<div class="card"></div>`);
          const needChk = qs.filter(q => q.needCheck || q.a == null || q.a < 0).length;
          // 用单根 div 包装状态条和按钮，避免 UI.el 只返回 firstElementChild 截断按钮
          const statHtml = qs.length ? "共 " + qs.length + " 题" : "本部分为纯知识点，无题目";
          const warnHtml = needChk ? " · ⚠️ " + needChk + " 题答案待校对" : "";
          const btnHtml = [];
          if (s.theory) btnHtml.push(`<button class="btn pdb-learn">📖 学考点</button>`);
          if (qs.length) btnHtml.push(`<button class="btn primary pdb-go">✍ 练习本考点</button>`);
          ic.appendChild(UI.el(`<div>
            <div class="muted small">${statHtml}${warnHtml}</div>
            ${btnHtml.length ? `<div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap">${btnHtml.join("")}</div>` : ""}
          </div>`));
          const learnBtn = ic.querySelector(".pdb-learn");
          const goBtn = ic.querySelector(".pdb-go");
          if (learnBtn) learnBtn.onclick = () => openHtml(label, s.theory);
          if (qs.length && goBtn) {
            const go = () => {
              const sel = card.querySelector(".pdb-size");
              const n = sel ? parseInt(sel.value, 10) : 10;
              openQuiz(bk.name + " · " + nm, n > 0 ? qs.slice(0, n) : qs);
            };
            goBtn.onclick = go;
            if (!firstGo) firstGo = go;
          }
          // 题目清单：每题 + 所属考点
          if (qs.length) {
            const list = UI.section("题目清单（含考点）");
            const items = qs.slice(0, 300).map((q, qi) => {
              const stem = String(q.q || "").replace(/\s+/g, " ").slice(0, 46);
              const ans = q.multi ? ` · ${q.multi}` : (q.a >= 0 ? " · " + String.fromCharCode(65 + q.a) : "");
              return `<div class="pdb-qitem"><span class="pdb-qi">${qi + 1}.</span><span class="pdb-qt">${UI.esc(stem)}<span class="muted small" style="margin-left:4px">${ans}</span></span>${q.kp ? `<span class="pdb-kp">${UI.esc(String(q.kp).slice(0, 24))}</span>` : ""}</div>`;
            }).join("");
            list.querySelector(".kg-det-b").appendChild(UI.el(`<div class="card"><div class="pdb-qlist">${items}</div></div>`));
            ic.appendChild(list);
          }
          inner.querySelector(".kg-det-b").appendChild(ic);
          card.appendChild(inner);
        } catch (e) {
          card.appendChild(UI.el(`<div class="card empty">第 ${si + 1} 部分渲染失败：${UI.esc(e.message)}</div>`));
        }
      });

      const allBtn = card.querySelector(".pdb-all");
      if (allBtn) allBtn.onclick = () => { if (firstGo) firstGo(); else UI.toast("本题册暂无可练习的题目"); };
      box.appendChild(card);
    });
  }

  /* ===== 顶部栏 ===== */
  function tickClock() {
    const d = new Date();
    document.getElementById("clock").textContent =
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0");
    const wk = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    document.getElementById("todayDate").textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${wk}`;
    updateTopTimer();
  }

  // 顶栏常驻计时显示（上岸计时器跨界面持续）
  function fmtMs(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    const p = n => String(n).padStart(2, "0");
    return (h > 0 ? h + ":" : "") + p(m) + ":" + p(ss);
  }
  function updateTopTimer() {
    const el = document.getElementById("topTimer");
    if (!el) return;
    const s = DB.timerState ? DB.timerState() : null;
    if (s && s.running) {
      el.style.display = "";
      el.textContent = "⏱ " + fmtMs(DB.timerElapsedMs());
    } else {
      el.style.display = "none";
    }
  }
  window.__updateTopTimer = updateTopTimer;

  function dailyQuote() {
    const arr = window.BANKS.MOTIVATION;
    const d = new Date(); const seed = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    document.getElementById("dailyQuote").textContent = "“" + arr[seed % arr.length] + "”";
  }

  function refreshTop() {
    const today = DB.today();
    const checked = (DB.state.checkin.dates || []).includes(today) || (DB.state.calendar[today] && DB.state.calendar[today].checked);
    const btn = document.getElementById("checkinBtn");
    if (checked) { btn.textContent = "今日已打卡 ✓"; btn.classList.add("done"); btn.disabled = true; }
    else { btn.textContent = "今日打卡"; btn.classList.remove("done"); btn.disabled = false; }
    // sync btn
    const sb = document.getElementById("syncBtn");
    if (DB.isLoggedIn()) { sb.textContent = "☁ " + DB.currentUser(); sb.classList.add("on"); }
    else if (DB.syncEnabled()) { sb.textContent = "☁ 未登录"; sb.classList.remove("on"); }
    else { sb.textContent = "☁ 本地模式"; sb.classList.remove("on"); }
    // 右上角头像：显示用户头像（云端同步的 dataURL），否则默认 👤
    const ab = document.getElementById("accountBtn");
    if (ab) {
      const prof = (DB.state && DB.state.profile) || {};
      if (prof.avatar) {
        ab.innerHTML = `<img class="avatar-img" src="${prof.avatar}" alt="头像"/>`;
        ab.classList.add("has-avatar");
      } else {
        ab.textContent = "👤";
        ab.classList.remove("has-avatar");
      }
      const sig = prof.signature || "";
      ab.title = "我的" + (DB.isLoggedIn() ? "（" + DB.currentUser() + "）" : "") + (sig ? " · " + sig : "");
    }
  }

  function doCheckin() {
    const today = DB.today();
    DB.state.checkin.dates = DB.state.checkin.dates || [];
    if (!DB.state.checkin.dates.includes(today)) DB.state.checkin.dates.push(today);
    DB.state.checkin.lastDate = today;
    DB.state.calendar[today] = DB.state.calendar[today] || { start: "", end: "", checked: false };
    DB.state.calendar[today].checked = true;
    DB.save();
    refreshTop(); UI.toast("打卡成功，继续加油！💪");
  }

  /* ===== 账号 / 同步面板（GitHub 云端） ===== */
  function openAccount() {
    const logged = DB.isLoggedIn();
    const box = el(`<div></div>`);
    if (!logged) {
      box.innerHTML = `<div class="muted small" style="margin-bottom:10px">
        开启「云端同步」后，全部学习数据会自动存到 GitHub 仓库 <b>${UI.esc(GH_LABEL)}</b> 的 <b>userdata</b> 分支，
        <b>换设备 / 换链接都不丢、自动累积</b>。只需登录一次，之后一直保持登录。<br><br>
        获取令牌：GitHub → Settings → Developer settings → <b>Personal access tokens</b> →
        生成一个拥有 <b>repo</b>（或 public_repo）权限的令牌，粘贴到下面即可。
      </div>
      <label class="fld">云端账号名（自定义，例如 mykaogong）</label><input id="u" placeholder="mykaogong"/>
      <label class="fld">GitHub 个人访问令牌 (PAT)</label><input id="p" type="password" placeholder="ghp_..."/>
      <div class="muted small" style="margin-top:6px">⚠️ 数据文件位于公开仓库，建议仅存放学习进度；令牌仅保存在本机浏览器。</div>
      <div class="row" style="margin-top:12px">
        <button class="btn primary" id="login">连接并登录</button>
        <button class="btn" id="exp">仅导出备份</button>
        <button class="btn" id="imp">导入备份</button>
      </div>`;
    } else {
      box.innerHTML = `<div class="muted small">已登录云端：<b>${UI.esc(DB.currentUser())}</b><br>
        数据会<b>自动同步</b>到仓库 <b>${UI.esc(GH_LABEL)}</b> 的 <b>userdata</b> 分支（保存即上传、定时自动拉取），换设备用同一账号名 + 令牌即可恢复。</div>
        <div class="row" style="margin-top:10px">
          <button class="btn primary" id="push">立即上传</button>
          <button class="btn" id="pull">拉取云端</button>
          <button class="btn" id="exp">导出备份</button>
          <button class="btn" id="imp">导入历史数据</button>
          <button class="btn danger" id="logout">退出登录</button>
        </div>
        <div class="muted small" style="margin-top:8px">「导入历史数据」会把备份文件<b>合并</b>进现有进度，不会覆盖。退出仅清除本机令牌，云端数据保留。</div>`;
    }

    UI.modal({ title: logged ? "云端同步" : "开启云端同步", body: box, width: "480px",
      actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }] });

    if (!logged) {
      box.querySelector("#exp").onclick = exportData;
      box.querySelector("#imp").onclick = importData;
      box.querySelector("#login").onclick = () => {
        const u = box.querySelector("#u").value.trim(), p = box.querySelector("#p").value.trim();
        if (!u || !p) { UI.toast("请填写账号名和令牌"); return; }
        DB.login(u, p).then(() => {
          DB._cloudReady = true; DB.startAutoSync();
          UI.toast("登录成功，已开启自动同步"); refreshTop(); renderRoute();
          document.querySelector(".modal-mask") && document.querySelector(".modal-mask").remove();
        }).catch(e => UI.toast("连接失败：" + e.message));
      };
    } else {
      box.querySelector("#push").onclick = () => { DB.save(true); UI.toast("已触发上传"); };
      box.querySelector("#pull").onclick = () => {
        DB.pull().then((res) => {
          res = res || {};
          if (res.notFound) UI.toast("云端暂无数据，已保留本机数据");
          else if (res.error) UI.toast("拉取失败：" + (res.msg || "未知错误"));
          else {
            const s = res.stats || {};
            const parts = [];
            if (s.pdfBooks) parts.push(s.pdfBooks + " 个刷题册");
            if (s.customQuestions) parts.push(s.customQuestions + " 道自建题");
            if (s.pdfBookPractice) parts.push(s.pdfBookPractice + " 条刷题记录");
            UI.toast(parts.length ? ("已从云端合并 " + parts.join("、") + "，并回传云端") : "已是最新，无新增");
          }
          renderRoute(); refreshTop();
        }).catch(e => UI.toast("拉取失败：" + (e && e.message ? e.message : e)));
      };
      box.querySelector("#exp").onclick = exportData;
      box.querySelector("#imp").onclick = importData;
      box.querySelector("#logout").onclick = () => { DB.stopAutoSync(); DB.logout(); refreshTop(); UI.toast("已退出登录"); document.querySelector(".modal-mask") && document.querySelector(".modal-mask").remove(); };
    }
  }

  /* ===== 头像/签名：把图片压缩成 dataURL（限制尺寸，避免同步数据过大） ===== */
  function fileToAvatar(file, cb) {
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 240;
        let w = img.width, h = img.height;
        if (w > h && w > max) { h = Math.round(h * max / w); w = max; }
        else if (h > max) { w = Math.round(w * max / h); h = max; }
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        try { c.getContext("2d").drawImage(img, 0, 0, w, h); cb(c.toDataURL("image/jpeg", 0.85)); }
        catch (e) { cb(rd.result); }
      };
      img.onerror = () => cb(rd.result);
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  }

  /* ===== 头像裁剪：选图后框选区域作为头像 ===== */
  function enableCropDrag(stage, box, handle) {
    let mode = null, sx = 0, sy = 0, bx = 0, by = 0, bw0 = 0;
    const onDown = (e, m) => {
      mode = m;
      const p = e;
      sx = p.clientX; sy = p.clientY; bx = box.offsetLeft; by = box.offsetTop; bw0 = box.offsetWidth;
      try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!mode) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (mode === "move") {
        let nx = bx + dx, ny = by + dy;
        nx = Math.max(0, Math.min(nx, stage.clientWidth - box.offsetWidth));
        ny = Math.max(0, Math.min(ny, stage.clientHeight - box.offsetHeight));
        box.style.left = nx + "px"; box.style.top = ny + "px";
      } else if (mode === "resize") {
        const ns = Math.max(40, Math.min(bw0 + dx,
          stage.clientWidth - Math.max(0, box.offsetLeft),
          stage.clientHeight - Math.max(0, box.offsetTop)));
        box.style.width = ns + "px"; box.style.height = ns + "px";
      }
      e.preventDefault();
    };
    const onUp = () => { mode = null; };
    box.addEventListener("pointerdown", (e) => { if (e.target === handle) return; onDown(e, "move"); });
    box.addEventListener("pointermove", onMove);
    box.addEventListener("pointerup", onUp);
    handle.addEventListener("pointerdown", (e) => onDown(e, "resize"));
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }
  function cropAvatar(file, cb) {
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        const stage = UI.el(`<div class="crop-stage"><img class="crop-img" src="${rd.result}"/><div class="crop-box" id="cropBox"><span class="crop-handle" id="cropHandle"></span></div></div>`);
        const wrap = UI.el(`<div class="crop-wrap"></div>`);
        wrap.appendChild(stage);
        wrap.insertBefore(UI.el(`<div class="crop-tip muted small">拖动选框移动位置，拖右下角圆点缩放；选框内即为头像</div>`), stage);
        UI.modal({
          title: "裁剪头像", body: wrap, width: "440px",
          actions: [
            { label: "取消", cls: "ghost", onClick: (m, c) => c() },
            {
              label: "使用此区域", cls: "primary", onClick: (m, c) => {
                const box = stage.querySelector("#cropBox");
                const rect = box.getBoundingClientRect(), srect = stage.getBoundingClientRect();
                const scale = img.naturalWidth / stage.clientWidth;
                const sz = 240;
                const cv = document.createElement("canvas"); cv.width = sz; cv.height = sz;
                try {
                  cv.getContext("2d").drawImage(img,
                    (rect.left - srect.left) * scale, (rect.top - srect.top) * scale,
                    rect.width * scale, rect.height * scale, 0, 0, sz, sz);
                  cb(cv.toDataURL("image/jpeg", 0.85));
                } catch (e) { cb(rd.result); }
                c();
              }
            }
          ]
        });
        requestAnimationFrame(() => {
          const bw = stage.clientWidth, bh = stage.clientHeight;
          if (!bw || !bh) return;
          const s0 = Math.round(Math.min(bw, bh) * 0.7);
          const box = stage.querySelector("#cropBox");
          box.style.width = s0 + "px"; box.style.height = s0 + "px";
          box.style.left = Math.round((bw - s0) / 2) + "px";
          box.style.top = Math.round((bh - s0) / 2) + "px";
          enableCropDrag(stage, box, stage.querySelector("#cropHandle"));
        });
      };
      img.onerror = () => fileToAvatar(file, cb);
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  }

  /* ===== 右上角头像（👤）→ 我的面板：头像/签名/设置入口 ===== */
  function openProfile() {
    const prof = DB.state.profile || (DB.state.profile = { avatar: "", signature: "" });
    const logged = DB.isLoggedIn();
    // 关闭全部模态框：避免「编辑签名」重开时与旧面板叠加，或进入设置/同步时残留遮罩
    function closeAllModals() { try { document.querySelectorAll(".modal-mask").forEach(m => m.remove()); } catch (e) {} }
    const box = el(`<div class="prof"></div>`);
    box.innerHTML = `
      <div class="prof-top">
        <div class="prof-ava">${prof.avatar ? `<img src="${UI.esc(prof.avatar)}" alt="头像"/>` : "👤"}</div>
        <div class="prof-meta">
          <div class="prof-name">${logged ? UI.esc(DB.currentUser()) : "未登录"}</div>
          <div class="prof-sig">${prof.signature ? UI.esc(prof.signature) : '<span class="muted">（未设置个性签名）</span>'}</div>
        </div>
      </div>
      <div class="row prof-actions" style="gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn" id="pAva">🖼 更换头像</button>
        <button class="btn" id="pSig">✏️ 编辑签名</button>
        <button class="btn" id="pProfile">📝 完善资料</button>
        <button class="btn" id="pContacts">📇 通讯录</button>
        <button class="btn primary" id="pSet">⚙ 设置</button>
        ${logged
          ? `<button class="btn" id="pSync">☁ 云端同步</button><button class="btn danger" id="pOut">🚪 退出</button>`
          : `<button class="btn" id="pLogin">🔑 登录 / 同步</button>`}
      </div>
      <div id="pSocial" class="prof-social muted small"></div>
      <input type="file" id="pFile" accept="image/*" style="display:none"/>`;
    UI.modal({ title: "我的", body: box, width: "420px", actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }] });
    const avaBox = box.querySelector(".prof-ava");
    box.querySelector("#pAva").onclick = () => box.querySelector("#pFile").click();
    box.querySelector("#pFile").onchange = () => {
      const f = box.querySelector("#pFile").files[0]; if (!f) return;
      cropAvatar(f, dataUrl => {
        DB.state.profile.avatar = dataUrl; DB.save(); refreshTop();
        avaBox.innerHTML = `<img src="${UI.esc(dataUrl)}" alt="头像"/>`;
        UI.toast("头像已更新，将随云端同步到其他设备");
      });
    };
    box.querySelector("#pSig").onclick = () => {
      const ta = el(`<div><textarea id="sig" rows="3" placeholder="写一句你的个性签名…" style="width:100%">${UI.esc(prof.signature || "")}</textarea></div>`);
      UI.modal({
        title: "编辑个性签名", body: ta, width: "420px",
        actions: [
          { label: "取消", cls: "ghost", onClick: (m, c) => c() },
          { label: "保存", cls: "primary", onClick: (m, c) => {
            DB.state.profile.signature = ta.querySelector("#sig").value.trim(); DB.save(); refreshTop();
            c(); closeAllModals(); openProfile(); UI.toast("签名已保存");
          } }
        ]
      });
    };
    box.querySelector("#pSet").onclick = () => { closeAllModals(); location.hash = "#/settings"; };
    box.querySelector("#pContacts").onclick = () => { closeAllModals(); location.hash = "#/contacts"; };
    box.querySelector("#pProfile").onclick = () => { closeAllModals(); openProfileEdit(false); };
    if (logged) {
      box.querySelector("#pSync").onclick = () => { closeAllModals(); openAccount(); };
      box.querySelector("#pOut").onclick = () => { DB.stopAutoSync(); DB.logout(); refreshTop(); UI.toast("已退出登录"); closeAllModals(); };
    } else {
      box.querySelector("#pLogin").onclick = () => { closeAllModals(); openAccount(); };
    }
    renderSocialSection(box.querySelector("#pSocial"));
  }

  /* 我的面板里的社交账号状态（好友/聊天功能需要后端） */
  function renderSocialSection(host) {
    if (!host) return;
    if (!Social.isConfigured()) {
      host.innerHTML = `💬 聊天/好友功能需在「设置 → 后端服务地址」填写后端（部署 backend 后获得），填写后将自动启用。`;
      return;
    }
    if (!Social.isLoggedIn()) {
      host.innerHTML = `<button class="btn sm" id="pSLogin">🔑 登录社交账号</button> <button class="btn sm ghost" id="pSReg">注册</button>`;
      host.querySelector("#pSLogin").onclick = () => openSocialAuth(false);
      host.querySelector("#pSReg").onclick = () => openSocialAuth(true);
    } else {
      host.innerHTML = `💬 社交账号：<b>${UI.esc(Social.currentUser())}</b> · <span id="pSStatus">连接中…</span> <button class="btn sm ghost" id="pSOut">退出</button>`;
      host.querySelector("#pSOut").onclick = () => { Social.logout(); UI.toast("已退出社交账号"); openProfile(); };
      Social.autoLogin().then(() => { const s = host.querySelector("#pSStatus"); if (s) s.textContent = "已连接"; refreshSocialBadge(); }).catch(() => { const s = host.querySelector("#pSStatus"); if (s) s.textContent = "失败，请重登"; });
    }
  }
  function openSocialAuth(isReg) {
    const box = el(`<div>
      <div class="muted small" style="margin-bottom:10px">${isReg ? "注册新社交账号（仅用于好友/聊天）" : "登录社交账号"}</div>
      <input id="saU" placeholder="用户名（2-20位，字母/数字/中文）" style="width:100%;margin-bottom:8px"/>
      <input id="saP" type="password" placeholder="密码（≥4位）" style="width:100%"/>
    </div>`);
    UI.modal({
      title: isReg ? "注册社交账号" : "登录社交账号", body: box, width: "420px",
      actions: [
        { label: "取消", cls: "ghost", onClick: (m, c) => c() },
        { label: isReg ? "注册" : "登录", cls: "primary", onClick: (m, c) => {
          const u = box.querySelector("#saU").value.trim(), p = box.querySelector("#saP").value;
          if (!u || !p) { UI.toast("请输入用户名和密码"); return; }
          const fn = isReg ? Social.register(u, p) : Social.login(u, p);
          fn.then(() => { c(); UI.toast("已" + (isReg ? "注册并" : "") + "登录"); openProfileEdit(true); })
            .catch(e => UI.toast("失败：" + e.message));
        } }
      ]
    });
  }

  /* 完善基本资料（昵称/性别/生日/签名/头像），可强制（启动未完成时弹窗） */
  function openProfileEdit(force) {
    const prof = DB.state.profile || (DB.state.profile = {});
    const load = () => Social.isConfigured() && Social.isLoggedIn() ? Social.getProfile().then(j => j.profile).catch(() => prof) : Promise.resolve(prof);
    load().then(p => {
      const cur = Object.assign({}, prof, p || {});
      const box = el(`<div>
        <div class="muted small" style="margin-bottom:10px">${force ? "为了使用好友/聊天功能，请先完善你的基本信息：" : "完善你的公开资料，好友可在通讯录看到："}</div>
        <label class="kg-fld">昵称<input id="pfNick" value="${UI.esc(cur.nickname || "")}" placeholder="例如：小明" maxlength="20"/></label>
        <label class="kg-fld">性别
          <select id="pfGender">
            <option value="">不填</option>
            <option value="男"${cur.gender === "男" ? " selected" : ""}>男</option>
            <option value="女"${cur.gender === "女" ? " selected" : ""}>女</option>
          </select>
        </label>
        <label class="kg-fld">生日<input id="pfBirth" type="date" value="${UI.esc(cur.birthday || "")}"/></label>
        <label class="kg-fld">个性签名<input id="pfBio" value="${UI.esc(cur.bio || cur.signature || "")}" placeholder="一句话介绍自己" maxlength="60"/></label>
      </div>`);
      UI.modal({
        title: "完善资料", body: box, width: "440px",
        actions: [
          ...(force ? [] : [{ label: "取消", cls: "ghost", onClick: (m, c) => c() }]),
          { label: "保存", cls: "primary", onClick: (m, c) => {
            const np = {
              nickname: box.querySelector("#pfNick").value.trim(),
              gender: box.querySelector("#pfGender").value,
              birthday: box.querySelector("#pfBirth").value,
              bio: box.querySelector("#pfBio").value.trim()
            };
            if (!np.nickname || !np.gender || !np.birthday) { UI.toast("昵称、性别、生日为必填"); return; }
            // 本地镜像 + 后端保存
            DB.state.profile = Object.assign(DB.state.profile || {}, { nickname: np.nickname, gender: np.gender, birthday: np.birthday, signature: np.bio });
            DB.save();
            if (Social.isConfigured() && Social.isLoggedIn()) {
              Social.saveProfile(np).then(() => { c(); UI.toast("资料已保存"); refreshTop(); if (force) bootSocialAfterProfile(); })
                .catch(e => { c(); UI.toast("已本地保存，后端同步失败：" + e.message); refreshTop(); if (force) bootSocialAfterProfile(); });
            } else { c(); UI.toast("已本地保存（未连接后端，好友暂不可见）"); refreshTop(); if (force) bootSocialAfterProfile(); }
          } }
        ]
      });
    });
  }
  function bootSocialAfterProfile() {
    // 资料完善后若已登录社交，进入通讯录
    if (Social.isConfigured() && Social.isLoggedIn()) location.hash = "#/contacts";
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(DB.state, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "考公工作台_备份_" + DB.today() + ".json"; a.click(); UI.toast("已导出备份文件");
  }
  function importData() {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json";
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        let data = null;
        try { data = JSON.parse(rd.result); } catch (e) { UI.toast("文件解析失败"); return; }
        askImportMode(data);
      };
      rd.readAsText(f);
    };
    inp.click();
  }

  /* 导入方式：① 合并（计数取较大值，不累加） ② 以备份为准（把累计答题数重置成备份里的量） */
  function askImportMode(data) {
    const box = el(`<div></div>`);
    box.innerHTML = `
      <div class="muted small" style="margin-bottom:12px">学习记录一律合并、不会丢失。请选择<b>累计答题数</b>的处理方式：</div>
      <label class="row" style="gap:8px;align-items:flex-start">
        <input type="radio" name="imode" value="merge" checked style="width:auto;margin-top:3px"/>
        <span><b>合并（计数取较大值）</b><br><span class="muted small">累计答题数取两边较大的那个，<b>不会累加</b>。</span></span>
      </label>
      <label class="row" style="gap:8px;align-items:flex-start;margin-top:10px">
        <input type="radio" name="imode" value="replace" style="width:auto;margin-top:3px"/>
        <span><b>以备份为准（重置计数）</b><br><span class="muted small">累计答题数直接改成备份文件里的数值。想把刷题数恢复成上次备份的数量，选这个。</span></span>
      </label>`;
    UI.modal({
      title: "导入备份", body: box, width: "520px",
      actions: [
        { label: "取消", cls: "ghost", onClick: (m, c) => c() },
        { label: "开始导入", cls: "primary", onClick: (m, c) => {
          const picked = box.querySelector("input[name=imode]:checked");
          const mode = picked ? picked.value : "merge";
          c();
          doImport(data, mode);
        } }
      ]
    });
  }

  function doImport(data, mode) {
    DB.state = DB.mergeStates(DB.state, data);
    if (mode === "replace" && data.accuracyCumulative) {
      // 以备份为准：累计答题数 / 正确数直接重置为备份中的数值
      DB.state.accuracyCumulative = JSON.parse(JSON.stringify(data.accuracyCumulative));
    }
    DB.save(true);
    UI.toast(mode === "replace" ? "已导入，并按备份重置了累计答题数" : "导入成功（已合并，计数取较大值）");
    renderRoute(); refreshTop();
  }

  // 供「设置」模块复用：导出 / 导入 / 上传 / 拉取
  window.KGDataIO = {
    exportData: exportData,
    importData: importData,
    push() { DB.save(true); UI.toast("已触发上传到云端"); },
    pull() { return DB.pull(); }
  };

  function closeSidebar() { document.getElementById("sidebar").classList.remove("open"); }

  /* ===== 社交初始化：自动登录、未读角标、资料校验、实时事件 ===== */
  async function initSocial() {
    // 同域后端自动探测：一次部署同时托管网页+接口时（如 Railway），免手动填地址
    try { await Social.autoDetect(); } catch (e) {}
    if (!Social.isConfigured()) return;
    if (!Social.isLoggedIn()) return;
    try { await Social.autoLogin(); } catch (e) { return; }
    Social.connectWs();
    // 学习记录同步到后端（好友主页可看）
    if (window.syncStudyRecords) { try { window.syncStudyRecords(); } catch (e) {} }
    // 时政记录的「我的记录 / 导入网页」同步到社交后端（像聊天那样跨设备）
    if (window.syncHotspots) { try { window.syncHotspots(); } catch (e) {} }
    // 未读数角标
    Social.on("unread", () => refreshSocialBadge());
    Social.on("message", () => { refreshSocialBadge(); });
    Social.on("friend", () => refreshSocialBadge());
    Social.on("remind", (r) => { showReminderPopup(r); refreshSocialBadge(); });
    refreshSocialBadge();
    // 轮询兜底：即便 WebSocket 偶发未触发，红点也能在数秒内更新
    if (!window.__badgeTimer) window.__badgeTimer = setInterval(refreshSocialBadge, 5000);
    // 启动资料校验：若基本资料未完成，弹窗提醒
    try {
      const j = await Social.getProfile();
      if (!j.complete) setTimeout(() => openProfileEdit(true), 400);
    } catch (e) {}
  }
  function refreshSocialBadge() {
    const btn = document.getElementById("accountBtn");
    if (!btn) return;
    let badge = btn.querySelector(".kg-badge");
    if (!Social.isLoggedIn()) { if (badge) badge.remove(); return; }
    Social.unread().then(j => {
      const counts = (j && j.unread) || {};
      const muted = (DB.state && DB.state.chatSettings) || {};
      const total = Object.entries(counts).reduce((a, [u, c]) => a + ((muted[u] && muted[u].mute) ? 0 : (c | 0)), 0);
      if (!badge) { badge = document.createElement("span"); badge.className = "kg-badge"; btn.appendChild(badge); }
      if (total > 0) { badge.textContent = total > 99 ? "99+" : String(total); badge.style.display = ""; }
      else { badge.style.display = "none"; badge.textContent = ""; }
    }).catch(() => {});
  }
  function showReminderPopup(r) {
    const from = r && r.from ? r.from : "好友";
    const box = el(`<div style="text-align:center;padding:6px">
      <div style="font-size:40px;margin-bottom:8px">📚</div>
      <div style="font-size:16px;margin-bottom:6px"><b>${UI.esc(from)}</b> 提醒你去学习啦！</div>
      <div class="muted">${UI.esc(r && r.text ? r.text : "别掉队，坚持就是胜利～")}</div>
    </div>`);
    UI.modal({
      title: "学习提醒", body: box, width: "380px",
      actions: [{ label: "知道了，去学习", cls: "primary", onClick: (m, c) => { c(); Social.clearReminders().catch(() => {}); location.hash = "#/countdown"; } }]
    });
  }

  /* ===== 启动 ===== */
  async function boot() {
    DB.load();
    loadNav();
    Theme.init();
    // 应用用户已保存的界面字体（设置里选的）：覆盖 --font-body / --font-head，
    // 绝大多数文本元素都引用这两个变量，故全站（含移动端）统一生效
    try {
      const f = localStorage.getItem("kg_font");
      if (f) {
        document.documentElement.style.setProperty("--font-body", f);
        document.documentElement.style.setProperty("--font-head", f);
      }
    } catch (e) {}
    // 启用语音转文字浮动按钮（不支持的浏览器自动跳过）
    if (window.KGVoice && window.KGVoice.supported) {
      try { window.KGVoice.enableFloating(); } catch (e) { console.error(e); }
    }
    tickClock(); setInterval(tickClock, 1000);
    dailyQuote();
    refreshTop();
    document.getElementById("checkinBtn").onclick = doCheckin;
    document.getElementById("accountBtn").onclick = openProfile;
    document.getElementById("syncBtn").onclick = openAccount;
    document.getElementById("menuToggle").onclick = () => document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("themeBtn").onclick = () => { const t = Theme.toggle(); UI.toast(t === "light" ? "已切换到浅色（护眼）模式" : "已切换到深色模式"); };
    const helpBtn = document.getElementById("helpBtn");
    if (helpBtn) helpBtn.onclick = () => { if (window.KGHelp) window.KGHelp.open(); };
    const topTimer = document.getElementById("topTimer");
    if (topTimer) topTimer.onclick = () => { location.hash = "#/timer"; };
    updateTopTimer();

    /* ===== 白噪音（雨声）全局播放：跨模块持续，顶栏按钮控制 ===== */
    const wnAudio = document.getElementById("whiteNoise");
    const wnBtn = document.getElementById("whiteNoiseBtn");
    let wnOn = false;
    try { wnOn = localStorage.getItem("kg_whitenoise") === "on"; } catch (e) {}
    if (wnAudio) { wnAudio.loop = true; wnAudio.volume = 0.6; wnAudio.preload = "auto"; }
    function wnRender() {
      if (!wnBtn) return;
      wnBtn.classList.toggle("on", wnOn);
      wnBtn.textContent = "🎧";
    }
    function wnPlay() { if (wnAudio) wnAudio.play().catch(() => {}); }
    window.WhiteNoise = {
      toggle() {
        wnOn = !wnOn;
        try { localStorage.setItem("kg_whitenoise", wnOn ? "on" : "off"); } catch (e) {}
        if (wnOn) wnPlay(); else if (wnAudio) wnAudio.pause();
        wnRender(); return wnOn;
      },
      isOn() { return wnOn; },
      play() { if (!wnOn) { wnOn = true; try { localStorage.setItem("kg_whitenoise", "on"); } catch (e) {} wnPlay(); wnRender(); } },
      stop() { if (wnOn) { wnOn = false; try { localStorage.setItem("kg_whitenoise", "off"); } catch (e) {} if (wnAudio) wnAudio.pause(); wnRender(); } }
    };
    if (wnBtn) wnBtn.onclick = () => window.WhiteNoise.toggle();
    if (wnOn) {
      wnRender(); wnPlay();
      // 浏览器禁止无手势自动播放：首次交互时补播
      document.addEventListener("pointerdown", function once() {
        if (window.WhiteNoise.isOn() && wnAudio && wnAudio.paused) wnAudio.play().catch(() => {});
      }, { once: true });
    }
    window.__refreshTop = refreshTop;
    window.refreshSocialBadge = refreshSocialBadge;
    // 系统字号：启动时按保存的比例缩放主界面（聊天/弹窗在 #app 之外，不受影响）
    try {
      const fs = parseFloat(localStorage.getItem("kg_font_size"));
      const appEl = document.getElementById("app");
      if (appEl && !isNaN(fs) && fs >= 0.7 && fs <= 1.6 && fs !== 1) appEl.style.zoom = String(fs);
    } catch (e) {}
    initSocial();
    window.addEventListener("hashchange", renderRoute);
    if (!location.hash) location.hash = "#/countdown";
    // 更新日志：新版本首次打开自动弹出（点×/空白关闭），关闭后导航上标气泡
    try { window.Changelog && Changelog.maybeShow(); } catch (e) { console.error(e); }
      if (DB.isLoggedIn()) {
        UI.toast("正在从云端拉取数据…");
        DB.pull().then(() => { DB._cloudReady = true; DB.startAutoSync(); renderRoute(); refreshTop(); })
                .catch(() => { DB._cloudReady = true; DB.startAutoSync(); renderRoute(); });
      } else {
        DB._cloudReady = true;
        renderRoute();
      }

      // 每个模块的「专注计时」浮动按钮：跳到计时器并预填本模块名（默认计入计划）
      const fab = document.getElementById("focusFab");
      if (fab) fab.onclick = () => {
        const key = (location.hash.replace("#/", "") || "countdown");
        const m = MODULES[key];
        window.__focusPrefill = (m && m.title) ? m.title + " 专注" : "专注学习";
        location.hash = "#/timer";
      };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
