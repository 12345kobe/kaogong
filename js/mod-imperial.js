/* 模块：科举进度 —— v20261027b 起：书房 2D 立绘场景整体移除（用户定版：太丑），
   舞台位置直接展示当前科举等级大图（scholar_1~7.png），等级卡图集保留。 */
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};

  /* ================= 页面 ================= */
  window.MODULES.imperial = {
    title: "科举进度", icon: "imperial",
    render(body) {
      const DB = window.DB, UI = window.UI;
      const KK = window.KGKingke || {};
      const LEVELS = KK.LEVELS || [];
      const idx = KK.levelIndex ? KK.levelIndex() : 0;
      const cur = LEVELS[idx] || { name: "秀才", img: "assets/img/scholar_1.png" };

      body.innerHTML = `
      <div class="imp-page">
        <div class="imp-topbar">
          <button class="btn sm ghost" id="impBack">← 返回</button>
          <div class="imp-title">科举进度 · 书斋养成</div>
          <button class="btn sm ghost" id="impEdit">✏️ 编辑资料</button>
        </div>
        <div class="imp-stage-wrap">
          <div id="impStage" class="imp-stage imp-stage-scholar">
            <img class="imp-scholar-big" id="impScholarBig" src="${cur.img}" alt="${cur.name}"
                 onclick="this.classList.toggle('zoom')"/>
            <div class="imp-scholar-tag">📜 ${cur.name}</div>
          </div>
        </div>
        <div class="card imp-level" id="impLevel"></div>
        <div id="impStats"></div>
      </div>`;

      body.querySelector("#impBack").onclick = () => { location.hash = "#/countdown"; };
      body.querySelector("#impEdit").onclick = () => openProfile(body);

      renderLevelCard(body);
      /* 学习统计整体搬进来 */
      const statsBox = body.querySelector("#impStats");
      try { window.MODULES.stats.render(statsBox); }
      catch (e) { statsBox.innerHTML = '<div class="card muted">学习统计加载失败：' + UI.esc(e.message) + "</div>"; }
    }
  };

  /* ---- 等级卡（v20261027a：展示科举 7 等级图集，当前等级高亮）---- */
  function renderLevelCard(body) {
    const KK = window.KGKingke || {};
    const LEVELS = KK.LEVELS || [];
    const idx = KK.levelIndex ? KK.levelIndex() : 0;
    const total = KK.treeTotal ? KK.treeTotal() : 1;
    const done = KK.doneCount ? KK.doneCount() : 0;
    const L = LEVELS[idx] || { name: "秀才" };
    const next = LEVELS[idx + 1];
    let pct = 100;
    if (next) pct = Math.max(0, Math.min(100, (done / total - L.p) / (next.p - L.p) * 100));
    /* ★v20261027a：用 scholar_1~7.png 等级图集替换原来的纯文字行；
       已达成等级置灰描边、当前等级高亮描金、未达成半透明，点击可放大查看。 */
    const cards = LEVELS.map((l, i) => {
      const cls = i === idx ? "cur" : (i < idx ? "done" : "lock");
      const label = i === idx ? "★ " + l.name : l.name;
      return `<div class="imp-lv-card ${cls}" data-img="${l.img}" data-name="${l.name}">
        <div class="imp-lv-img"><img src="${l.img}" alt="${l.name}" loading="lazy" onerror="this.parentNode.innerHTML='<span class=\\'imp-lv-ph\\'>${l.name}</span>'"/></div>
        <div class="imp-lv-name">${label}</div>
      </div>`;
    }).join("");
    body.querySelector("#impLevel").innerHTML = `
      <div class="spread" style="align-items:baseline">
        <div><span class="imp-lv-now">${L.name}</span><span class="muted small" style="margin-left:8px">已刷 ${done} 题 / 题库 ${total}</span></div>
        <span class="muted small">${next ? "距「" + next.name + "」还差 " + Math.max(0, Math.ceil(total * next.p - done)) + " 题" : "状元及第 🎉"}</span>
      </div>
      <div class="progress-bar" style="margin:10px 0 12px"><i style="width:${pct}%"></i></div>
      <div class="imp-lvs-grid">${cards}</div>
      <div class="muted small" style="margin-top:8px;text-align:center">轻点任意等级图可放大查看 · 当前等级已描金高亮</div>`;
    // 点击放大查看单张等级图
    body.querySelectorAll("#impLevel .imp-lv-card").forEach(c => {
      c.onclick = () => {
        const src = c.dataset.img, name = c.dataset.name || "等级";
        const mask = document.createElement("div");
        mask.className = "imp-mask";
        mask.innerHTML = `<div class="imp-modal small imp-lv-zoom">
          <h3 style="margin-bottom:10px">${name}</h3>
          <img src="${src}" alt="${name}" style="max-width:100%;max-height:60vh;border-radius:12px" onerror="this.style.display='none'"/>
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" id="lvzClose">关闭</button></div>
        </div>`;
        document.body.appendChild(mask);
        mask.onclick = (e2) => { if (e2.target === mask || e2.target.id === "lvzClose") mask.remove(); };
      };
    });
  }

  /* ---- 编辑资料 ---- */
  function openProfile(body) {
    const DB = window.DB, UI = window.UI;
    const prof = DB.state.profile || (DB.state.profile = {});
    const mask = document.createElement("div");
    mask.className = "imp-mask";
    mask.innerHTML = `<div class="imp-modal">
      <h3>✏️ 编辑个人信息</h3>
      <label class="fld">昵称<input id="ipNick" value="${UI.esc(prof.nickname || "")}" maxlength="20" placeholder="例如：小明"/></label>
      <label class="fld">性别
        <select id="ipGender">
          <option value="男"${prof.gender !== "女" ? " selected" : ""}>男</option>
          <option value="女"${prof.gender === "女" ? " selected" : ""}>女</option>
        </select>
      </label>
      <label class="fld">生日<input id="ipBirth" type="date" value="${UI.esc(prof.birthday || "")}"/></label>
      <label class="fld">个性签名<input id="ipSig" value="${UI.esc(prof.signature || "")}" maxlength="40" placeholder="例如：上岸倒计时，冲！"/></label>
      <div class="row" style="margin-top:14px">
        <button class="btn primary" id="ipSave">💾 保存</button>
        <button class="btn ghost" id="ipCancel">取消</button>
      </div></div>`;
    document.body.appendChild(mask);
    const close = () => mask.remove();
    mask.querySelector("#ipCancel").onclick = close;
    mask.onclick = (e) => { if (e.target === mask) close(); };
    mask.querySelector("#ipSave").onclick = () => {
      prof.nickname = mask.querySelector("#ipNick").value.trim();
      prof.gender = mask.querySelector("#ipGender").value;
      prof.birthday = mask.querySelector("#ipBirth").value;
      prof.signature = mask.querySelector("#ipSig").value.trim();
      DB.save();
      UI.toast("已保存，" + (prof.nickname || "考生") + "加油！");
      close();
      window.MODULES.imperial.render(body);
    };
  }


  /* ================= 左上角入口：点击 brand → 面板 ================= */
  function bindBrandEntry() {
    const logo = document.getElementById("kingkeLogo");
    const text = document.querySelector(".brand-text");
    if (!logo || logo.dataset.impBound) return;
    logo.dataset.impBound = "1";
    const open = (e) => {
      e.stopPropagation();
      const old = document.getElementById("impEntryMask"); if (old) old.remove();
      const mask = document.createElement("div");
      mask.id = "impEntryMask"; mask.className = "imp-mask";
      mask.innerHTML = `<div class="imp-modal small">
        <div class="imp-entry" id="ieGo">🎓<div><b>科举进度</b><span>书房小人 · 等级 · 学习统计</span></div><i>›</i></div>
        <div class="imp-entry" id="ieStats">📊<div><b>学习统计</b><span>时长 / 正确率趋势图表</span></div><i>›</i></div>
      </div>`;
      document.body.appendChild(mask);
      mask.onclick = (e2) => { if (e2.target === mask) mask.remove(); };
      mask.querySelector("#ieGo").onclick = () => { mask.remove(); location.hash = "#/imperial"; };
      mask.querySelector("#ieStats").onclick = () => { mask.remove(); location.hash = "#/stats"; };
    };
    logo.addEventListener("click", open);
    if (text && !text.dataset.impBound) { text.dataset.impBound = "1"; text.addEventListener("click", open); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindBrandEntry);
  else bindBrandEntry();
})();
