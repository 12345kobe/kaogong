/* 考公工作台 · 主程序（导航 / 路由 / 顶部栏 / 同步账号） */
(function () {
  "use strict";
  const DB = window.DB, UI = window.UI, ICONS = window.ICONS, MODULES = window.MODULES;

  const NAV = ["countdown", "verbal", "wrongwords", "data", "logic", "politics", "quantity", "common", "essay", "calendar", "wrongbook", "stats"];

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

  function renderRoute() {
    const key = (location.hash.replace("#/", "") || "countdown");
    if (!MODULES[key]) { location.hash = "#/countdown"; return; }
    setActive(key);
    const body = document.getElementById("pageBody"); body.innerHTML = "";
    try { MODULES[key].render(body); }
    catch (e) { body.innerHTML = `<div class="card empty">模块加载出错：${UI.esc(e.message)}</div>`; console.error(e); }
  }

  /* ===== 顶部栏 ===== */
  function tickClock() {
    const d = new Date();
    document.getElementById("clock").textContent =
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0");
    const wk = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    document.getElementById("todayDate").textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${wk}`;
  }

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

  /* ===== 账号 / 同步面板 ===== */
  function openAccount() {
    const syncOn = DB.syncEnabled();
    const logged = DB.isLoggedIn();
    const box = el(`<div></div>`);
    if (!syncOn) {
      box.innerHTML = `<div class="muted small" style="margin-bottom:10px">当前为「本地模式」：数据仅存本机浏览器。
        跨设备同步需部署后端（详见部署说明）。你也可通过「导出/导入数据」在设备间迁移备份。</div>
        <div class="row">
          <button class="btn primary" id="exp">导出数据(JSON)</button>
          <button class="btn" id="imp">导入数据(JSON)</button>
        </div>`;
    } else if (logged) {
      box.innerHTML = `<div class="muted small">已登录：<b>${UI.esc(DB.currentUser())}</b></div>
        <div class="row" style="margin-top:10px">
          <button class="btn primary" id="push">上传到云端</button>
          <button class="btn" id="pull">拉取云端</button>
          <button class="btn danger" id="logout">退出登录</button>
        </div>`;
    } else {
      box.innerHTML = `<div class="muted small" style="margin-bottom:10px">登录后可在多设备同步数据。</div>
        <label class="fld">用户名</label><input id="u"/>
        <label class="fld">密码</label><input id="p" type="password"/>
        <div class="row" style="margin-top:12px">
          <button class="btn primary" id="login">登录</button>
          <button class="btn" id="reg">注册</button>
        </div>`;
    }
    UI.modal({ title: syncOn ? (logged ? "云端同步" : "账号登录") : "数据同步", body: box, width: "460px",
      actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }] });

    if (!syncOn) {
      box.querySelector("#exp").onclick = exportData;
      box.querySelector("#imp").onclick = importData;
    } else if (logged) {
      box.querySelector("#push").onclick = () => { DB.push().then(() => UI.toast("已上传到云端")).catch(e => UI.toast("上传失败：" + e.message)); };
      box.querySelector("#pull").onclick = () => { DB.pull().then(() => { UI.toast("已拉取云端数据"); renderRoute(); refreshTop(); }).catch(e => UI.toast("拉取失败：" + e.message)); };
      box.querySelector("#logout").onclick = () => { DB.logout(); refreshTop(); UI.toast("已退出"); document.querySelector(".modal-mask") && document.querySelector(".modal-mask").remove(); };
    } else {
      box.querySelector("#login").onclick = () => {
        DB.login(box.querySelector("#u").value.trim(), box.querySelector("#p").value).then(() => {
          UI.toast("登录成功"); refreshTop(); DB.pull().then(() => renderRoute()); document.querySelector(".modal-mask").remove();
        }).catch(e => UI.toast("登录失败：" + e.message));
      };
      box.querySelector("#reg").onclick = () => {
        DB.register(box.querySelector("#u").value.trim(), box.querySelector("#p").value).then(() => {
          UI.toast("注册成功并已登录"); refreshTop(); document.querySelector(".modal-mask").remove();
        }).catch(e => UI.toast("注册失败：" + e.message));
      };
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
      rd.onload = () => { try { DB.state = JSON.parse(rd.result); DB.save(true); UI.toast("导入成功，正在刷新…"); renderRoute(); refreshTop(); } catch (e) { UI.toast("文件解析失败"); } };
      rd.readAsText(f);
    };
    inp.click();
  }

  function closeSidebar() { document.getElementById("sidebar").classList.remove("open"); }

  /* ===== 启动 ===== */
  function boot() {
    DB.load();
    loadNav();
    Theme.init();
    tickClock(); setInterval(tickClock, 1000);
    dailyQuote();
    refreshTop();
    document.getElementById("checkinBtn").onclick = doCheckin;
    document.getElementById("accountBtn").onclick = openAccount;
    document.getElementById("syncBtn").onclick = openAccount;
    document.getElementById("menuToggle").onclick = () => document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("themeBtn").onclick = () => { const t = Theme.toggle(); UI.toast(t === "light" ? "已切换到浅色（护眼）模式" : "已切换到深色模式"); };
    window.__refreshTop = refreshTop;
    window.addEventListener("hashchange", renderRoute);
    if (!location.hash) location.hash = "#/countdown";
    renderRoute();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
