/* 考公工作台 · 主程序（导航 / 路由 / 顶部栏 / 同步账号） */
(function () {
  "use strict";
  const DB = window.DB, UI = window.UI, ICONS = window.ICONS, MODULES = window.MODULES;

  const NAV = ["countdown", "timer", "verbal", "wrongwords", "data", "logic", "relation", "politics", "quantity", "common", "essay", "essays", "allusion", "calendar", "wrongbook", "stats", "settings"];
  const GH_LABEL = "12345kobe/kaogong";

  /* ===== 深浅色主题：按时间自动切换 + 手动覆盖（到点仍按时间表切回） ===== */
  const Theme = (function () {
    const KEY = "kg_theme_manual";
    function auto() {
      const now = new Date(); const t = now.getHours() * 60 + now.getMinutes();
      const light = (t >= 7 * 60 + 30 && t < 12 * 60 + 30) || (t >= 13 * 60 + 30 && t < 18 * 60);
      return light ? "light" : "dark";
    }
    let manual = null;
    try { manual = localStorage.getItem(KEY) || null; } catch (e) {}
    let lastAuto = auto();
    function apply(theme) { document.body.classList.toggle("light", theme === "light"); }
    function tick() {
      const a = auto();
      if (a !== lastAuto) { lastAuto = a; manual = null; try { localStorage.removeItem(KEY); } catch (e) {} apply(a); }
      else if (manual) apply(manual);
    }
    return {
      init() { apply(manual && (manual === "light" || manual === "dark") ? manual : auto()); setInterval(tick, 30000); },
      toggle() {
        const cur = (document.body.classList.contains("light")) ? "light" : "dark";
        manual = cur === "light" ? "dark" : "light";
        try { localStorage.setItem(KEY, manual); } catch (e) {}
        apply(manual);
        return manual;
      },
      current() { return document.body.classList.contains("light") ? "light" : "dark"; }
    };
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
    const body = document.getElementById("pageBody"); body.innerHTML = "";
    try { MODULES[key].render(body); }
    catch (e) { body.innerHTML = `<div class="card empty">模块加载出错：${UI.esc(e.message)}</div>`; console.error(e); }
    // 每个模块都提供「专注计时」入口（上岸计时器）：点击带本模块名跳到计时器
    const fab = document.getElementById("focusFab");
    if (fab) {
      if (key === "timer" || key === "shuati") { fab.style.display = "none"; }
      else { fab.style.display = ""; fab.dataset.module = key; }
    }
    lastKey = key;
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
      box.querySelector("#pull").onclick = () => { DB.pull().then(() => { UI.toast("已拉取云端数据"); renderRoute(); refreshTop(); }).catch(e => UI.toast("拉取失败：" + e.message)); };
      box.querySelector("#exp").onclick = exportData;
      box.querySelector("#imp").onclick = importData;
      box.querySelector("#logout").onclick = () => { DB.stopAutoSync(); DB.logout(); refreshTop(); UI.toast("已退出登录"); document.querySelector(".modal-mask") && document.querySelector(".modal-mask").remove(); };
    }
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

  /* ===== 启动 ===== */
  async function boot() {
    DB.load();
    loadNav();
    Theme.init();
    // 应用用户已保存的界面字体（设置里选的）
    try {
      const f = localStorage.getItem("kg_font");
      if (f) document.documentElement.style.setProperty("--kg-user-font", f);
    } catch (e) {}
    // 启用语音转文字浮动按钮（不支持的浏览器自动跳过）
    if (window.KGVoice && window.KGVoice.supported) {
      try { window.KGVoice.enableFloating(); } catch (e) { console.error(e); }
    }
    tickClock(); setInterval(tickClock, 1000);
    dailyQuote();
    refreshTop();
    document.getElementById("checkinBtn").onclick = doCheckin;
    document.getElementById("accountBtn").onclick = openAccount;
    document.getElementById("syncBtn").onclick = openAccount;
    document.getElementById("menuToggle").onclick = () => document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("themeBtn").onclick = () => { const t = Theme.toggle(); UI.toast(t === "light" ? "已切换到浅色（护眼）模式" : "已切换到深色模式"); };
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
      wnBtn.textContent = wnOn ? "🎧 白噪音 · 播放中" : "🎧 白噪音";
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
    window.addEventListener("hashchange", renderRoute);
    if (!location.hash) location.hash = "#/countdown";
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
