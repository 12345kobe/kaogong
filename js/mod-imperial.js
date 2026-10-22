/* 模块：科举进度 —— 2D 三渲二书房立绘（Canvas2D，v20261024 起弃 three.js）
   参考：古风动漫少女（蓝蝶发饰/珠链/月白襦裙）+ 暖暖比例；半身人像、天道酬勤大匾挂后墙。
   昼夜作息（用户定版）：00:00 趴桌睡觉 -> 07:00 起床；12:00-13:00 午睡；灯光丝滑过渡。 */
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};

  /* ================= 昼夜时段表 ================= */
  const PHASES = [
    { t0: 0,    key: "sleep",     label: "😴 睡梦中",     sub: "呼呼大睡，养足精神",  sun: 0.00, sunC: 0x2a3866, amb: 0.30, lamp: 1,  sleep: true },
    { t0: 6.4,  key: "wakeup",    label: "🌅 天刚蒙蒙亮", sub: "快睡醒啦",           sun: 0.45, sunC: 0xffc490, amb: 0.45, lamp: 0.4, sleep: true },
    { t0: 7,    key: "morning",   label: "🌤 早晨勤学",   sub: "一日之计在于晨",      sun: 1.60, sunC: 0xfff0d0, amb: 0.85, lamp: 0 },
    { t0: 12,   key: "nap",       label: "😌 午睡小憩",   sub: "趴一会儿，下午更有劲", sun: 1.50, sunC: 0xfff2dd, amb: 0.82, lamp: 0, sleep: true },
    { t0: 13,   key: "afternoon", label: "☀️ 下午勤学",   sub: "继续刷题冲冲冲",      sun: 1.55, sunC: 0xffedd0, amb: 0.82, lamp: 0 },
    { t0: 17.5, key: "dusk",      label: "🌇 暮色四合",   sub: "天色渐暗，点灯了",    sun: 0.70, sunC: 0xff9a56, amb: 0.55, lamp: 0.5 },
    { t0: 19,   key: "night",     label: "🌙 挑灯夜读",   sub: "煤油灯下笔耕不辍",    sun: 0.00, sunC: 0x2a3866, amb: 0.32, lamp: 1 },
    { t0: 24,   key: "night",     label: "🌙 挑灯夜读",   sub: "煤油灯下笔耕不辍",    sun: 0.00, sunC: 0x2a3866, amb: 0.32, lamp: 1 }
  ];
  function phaseAt(date) {
    const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    let i = 0;
    for (let k = 0; k < PHASES.length - 1; k++) { if (h >= PHASES[k].t0 && h < PHASES[k + 1].t0) { i = k; break; } }
    const a = PHASES[i], b = PHASES[i + 1] || a;
    const f = Math.min(1, Math.max(0, (h - a.t0) / Math.max(0.001, b.t0 - a.t0)));
    const s = f * f * (3 - 2 * f); // smoothstep 丝滑过渡
    const mix = (x, y) => x + (y - x) * s;
    /* ★v20261022d 修「上午就趴桌」bug：near 必须恒取当前所在时段 a。
       旧代码 f≥0.5 时取下一时段 b → 每天 9:30–12:00（morning→nap 过渡后半段）
       就被判定成午睡，角色大上午趴桌睡觉、Zzz 乱飘。光照数值仍可跨时段
       smoothstep 混合（丝滑），但 label/key/sleep 只认当前时段。 */
    return { key: a.key, label: a.label, sub: a.sub, sleep: a.sleep, sun: mix(a.sun, b.sun), sunC: a.sunC, amb: mix(a.amb, b.amb), lamp: mix(a.lamp, b.lamp), h };
  }

  /* ================= 页面 ================= */
  let _stop = null;        // 当前运行中的 3D 停止器
  let _swapCharacter = null; // ★v20261022c 性别切换：只换小人 mesh，不重建场景
  function stop2D() { if (_stop) { try { _stop(); } catch (e) {} _stop = null; _swapCharacter = null; } }

  window.MODULES.imperial = {
    title: "科举进度", icon: "imperial",
    render(body) {
      stop2D();
      const DB = window.DB, UI = window.UI;
      const prof = DB.state.profile || (DB.state.profile = {});
      const gender = prof.gender === "女" ? "女" : "男";

      body.innerHTML = `
      <div class="imp-page">
        <div class="imp-topbar">
          <button class="btn sm ghost" id="impBack">← 返回</button>
          <div class="imp-title">科举进度 · 书斋养成</div>
          <button class="btn sm ghost" id="impEdit">✏️ 编辑资料</button>
        </div>
        <div class="imp-stage-wrap">
          <div id="impStage" class="imp-stage"></div>
          <div class="imp-phase" id="impPhase"></div>
          <div class="imp-bubble" id="impBubble"></div>
          <div class="imp-goodnight" id="impNight">晚安 💤</div>
          <label class="imp-gender">小人
            <select id="impGender">
              <option value="男"${gender === "男" ? " selected" : ""}>男</option>
              <option value="女"${gender === "女" ? " selected" : ""}>女</option>
            </select>
          </label>
          <div class="imp-hint">✨ 眨眼 · 呼吸 · 执笔书写 · 发丝飘动 · 昼夜作息（后墙悬挂「天道酬勤」）</div>
        </div>
        <div class="card imp-level" id="impLevel"></div>
        <div id="impStats"></div>
      </div>`;

      body.querySelector("#impBack").onclick = () => { stop2D(); location.hash = "#/countdown"; };
      /* ★v20261022c 性别切换只重建小人（不重启页面/场景）——重启整页又慢又闪，
         且 iOS 上反复重建 WebGL 上下文会触发「只能看一次」 bug */
      body.querySelector("#impGender").onchange = (e) => {
        prof.gender = e.target.value; DB.save();
        UI.toast("已切换为" + e.target.value + "版小人");
        if (_swapCharacter) { try { _swapCharacter(prof.gender); } catch (er) { window.MODULES.imperial.render(body); } }
        else window.MODULES.imperial.render(body);
      };
      body.querySelector("#impEdit").onclick = () => openProfile(body);

      renderLevelCard(body);
      /* 学习统计整体搬进来 */
      const statsBox = body.querySelector("#impStats");
      try { window.MODULES.stats.render(statsBox); }
      catch (e) { statsBox.innerHTML = '<div class="card muted">学习统计加载失败：' + UI.esc(e.message) + "</div>"; }

      init2D(body, gender);
    }
  };

  /* ---- 等级卡 ---- */
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
    const row = LEVELS.map((l, i) => `<span class="imp-lv ${i === idx ? "cur" : (i < idx ? "done" : "")}">${l.name}</span>`).join("");
    body.querySelector("#impLevel").innerHTML = `
      <div class="spread" style="align-items:baseline">
        <div><span class="imp-lv-now">${L.name}</span><span class="muted small" style="margin-left:8px">已刷 ${done} 题 / 题库 ${total}</span></div>
        <span class="muted small">${next ? "距「" + next.name + "」还差 " + Math.max(0, Math.ceil(total * next.p - done)) + " 题" : "状元及第 🎉"}</span>
      </div>
      <div class="progress-bar" style="margin:10px 0 12px"><i style="width:${pct}%"></i></div>
      <div class="imp-lvs">${row}</div>`;
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
      <label class="fld">性别（决定书斋小人形象）
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


  /* ================= 2D 立绘初始化（v20261024 弃 three.js） ================= */
  function stop2D() { if (_stop) { try { _stop(); } catch (e) {} _stop = null; _swapCharacter = null; } }

  function init2D(body, gender) {
    const holder = body.querySelector("#impStage");
    if (typeof window.Imp2D === "undefined") {
      holder.innerHTML = '<div class="card muted" style="margin:20px;padding:24px;text-align:center">2D 立绘模块（imp2d.js）加载失败，请刷新重试。</div>';
      return;
    }
    /* 逻辑画布 900×1200 等比铺满 stage（竖幅半身人像） */
    let W = holder.clientWidth || 360;
    let H = Math.max(400, Math.min(620, Math.round(W * 4 / 3)));
    holder.style.height = H + "px";
    const cv = document.createElement("canvas");
    cv.style.cssText = "display:block;margin:0 auto;border-radius:14px;touch-action:manipulation";
    holder.appendChild(cv);
    const ctx = cv.getContext("2d");
    const DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(window.Imp2D.LW * DPR);
    cv.height = Math.round(window.Imp2D.LH * DPR);

    function fit() {
      W = holder.clientWidth || W;
      H = Math.max(400, Math.min(620, Math.round(W * 4 / 3)));
      holder.style.height = H + "px";
      let cw = W, ch = W * window.Imp2D.LH / window.Imp2D.LW;
      if (ch > H) { ch = H; cw = H * window.Imp2D.LW / window.Imp2D.LH; }
      cv.style.width = cw + "px"; cv.style.height = ch + "px";
    }
    fit();

    /* 骨架参数（Imp2D.render 每帧读取） */
    const sk = {
      t: 0, dpr: DPR, gender: gender, breath: 0, blink: 1, headRot: 0, sleep: 0,
      light: { amb: 0.85, sun: 1.6, lamp: 0 }
    };
    /* ★性别热切换：2D 立绘零成本（改参数即换形象） */
    _swapCharacter = (g) => { sk.gender = g; };

    /* 昼夜 + 眨眼 + 呼吸 + 叙事 */
    const phaseEl = body.querySelector("#impPhase");
    const bubbleEl = body.querySelector("#impBubble");
    const nightEl = body.querySelector("#impGoodnight") || body.querySelector("#impNight");
    let sleepAmt = phaseAt(new Date()).sleep ? 1 : 0;
    let wasSleep = !!sleepAmt, nightShown = !!sleepAmt;
    let bubbleTimer = 0, nightTimer = 0, phaseTimer = 0;
    let nextBlinkAt = 2.5, blinkCloseAt = -1;
    function sayBubble(txt) {
      if (!bubbleEl) return;
      bubbleEl.textContent = txt;
      bubbleEl.classList.add("on");
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => bubbleEl.classList.remove("on"), 3400);
    }
    function showNight() {
      if (!nightEl) return;
      nightEl.classList.add("on");
      clearTimeout(nightTimer);
      nightTimer = setTimeout(() => nightEl.classList.remove("on"), 3000);
    }

    let raf = 0, dead = false, lastTs = 0;
    function frame(ts) {
      if (dead) return;
      if (!holder.isConnected) { cleanup(); return; }
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
      lastTs = ts;
      sk.t += dt;

      /* —— 昼夜光照 —— */
      const ph = phaseAt(new Date());
      phaseTimer += dt;
      if (phaseTimer > 4) { phaseTimer = 0; if (phaseEl) phaseEl.innerHTML = "<b>" + ph.label + "</b><span>" + ph.sub + "</span>"; }
      sk.light.amb += (ph.amb - sk.light.amb) * Math.min(1, dt * 2.2);
      sk.light.sun += (ph.sun - sk.light.sun) * Math.min(1, dt * 2.2);
      sk.light.lamp += (ph.lamp - sk.light.lamp) * Math.min(1, dt * 2.2);

      /* —— 睡/醒叙事 + 平滑过渡 —— */
      const wantSleep = ph.sleep ? 1 : 0;
      if (!wasSleep && wantSleep === 1 && sleepAmt < 0.1) {
        sayBubble(ph.key === "nap" ? "吃完午饭啦，我趴一会儿~" : "夜深了，我要休息了…");
      }
      if (wasSleep && wantSleep === 0) sayBubble("天亮啦，新的一天继续加油！");
      wasSleep = wantSleep === 1;
      sleepAmt += (wantSleep - sleepAmt) * Math.min(1, dt * 0.9);
      if (sleepAmt > 0.92 && !nightShown) { nightShown = true; showNight(); }
      if (sleepAmt < 0.3) nightShown = false;
      sk.sleep = sleepAmt;

      /* —— 呼吸（醒着 0.26Hz；睡后深缓 0.18Hz） —— */
      sk.breath = Math.sin(sk.t * (sleepAmt > 0.5 ? 1.1 : 1.65) + 1.2);
      /* —— 头部轻摆 —— */
      sk.headRot = Math.sin(sk.t * 0.43) * 0.018 + sleepAmt * 0.34;

      /* —— 眨眼（随机间隔；趴睡不眨） —— */
      if (sleepAmt > 0.5) {
        sk.blink = 0.04;
      } else {
        if (blinkCloseAt >= 0) {
          const k = (sk.t - blinkCloseAt) / 0.16;
          sk.blink = k >= 1 ? 1 : Math.max(0.05, Math.abs(k - 0.5) / 0.5);
          if (k >= 1) blinkCloseAt = -1;
        } else if (sk.t > nextBlinkAt) {
          blinkCloseAt = sk.t;
          nextBlinkAt = sk.t + 2.2 + Math.random() * 3.2;
        } else {
          sk.blink += (1 - sk.blink) * Math.min(1, dt * 8);
        }
      }

      window.Imp2D.render(ctx, sk);
    }

    function cleanup() {
      if (dead) return;
      dead = true;
      cancelAnimationFrame(raf);
      clearTimeout(bubbleTimer); clearTimeout(nightTimer);
      try { if (cv && cv.parentNode) cv.parentNode.removeChild(cv); } catch (e) {}
    }
    _stop = cleanup;
    if (phaseEl) phaseEl.innerHTML = "";
    raf = requestAnimationFrame(frame);

    /* 自适应 */
    const ro = new ResizeObserver(() => { if (!dead && holder.isConnected) fit(); });
    ro.observe(holder);
    const oldStop = _stop;
    _stop = () => { try { ro.disconnect(); } catch (e) {} oldStop(); };
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
