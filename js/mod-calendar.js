/* 模块：打卡日历 + 每日计划
   - 日历：记录每天开始/结束学习时间，勾选打卡（与顶部联动）；
   - 每日计划：自动记录刷题/闪卡，手动新增（模块 + 类型：学习/复习/积累/刷题），
     积累类按艾宾浩斯曲线部署复习，刷题记正确率+时间，完成率统计 + 激励语，当天备注。
*/
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};
  const TYPE_LABEL = { study: "学习", review: "复习", accumulate: "积累", quiz: "刷题", flash: "闪卡", focus: "专注" };

  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function fmt(sec) { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return m + "分" + (s ? s + "秒" : ""); }

  function motivation(pct, total) {
    if (!total) return "今天还没有计划，先加一条吧 💪";
    if (pct >= 100) return "今日计划全部完成，太棒了！🎉";
    if (pct >= 60) return "进度过半，继续保持节奏！🔥";
    if (pct >= 30) return "好的开始是成功的一半，继续！";
    return "慢慢来，完成比完美更重要。";
  }

  window.MODULES.calendar = {
    title: "打卡日历", icon: "calendar",
    render(body) {
      const DB = window.DB, UI = window.UI, EB = window.Ebbinghaus;
      let view = new Date(); view.setDate(1);
      const WK = ["日", "一", "二", "三", "四", "五", "六"];

      function render() {
        const y = view.getFullYear(), m = view.getMonth();
        const first = new Date(y, m, 1).getDay();
        const days = new Date(y, m + 1, 0).getDate();
        const today = DB.today();
        let cells = "";
        for (let i = 0; i < first; i++) cells += `<div class="cal-cell muted"></div>`;
        for (let d = 1; d <= days; d++) {
          const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const rec = DB.state.calendar[ds];
          const cls = ["cal-cell"];
          if (ds === today) cls.push("today");
          if (rec && rec.checked) cls.push("checked");
          cells += `<div class="${cls.join(" ")}" data-day="${ds}">
            <div class="d">${d}</div>${rec && rec.checked ? '<div class="dot"></div>' : ""}
            ${rec && rec.start ? `<div class="small" style="color:#9fb0d8">${rec.start}-${rec.end || ""}</div>` : ""}</div>`;
        }
        body.innerHTML = `<div class="card">
          <div class="spread"><h3 style="margin:0">📆 打卡日历</h3>
            <div class="row">
              <button class="btn" id="prevM">‹</button>
              <b>${y}年 ${m + 1}月</b>
              <button class="btn" id="nextM">›</button>
            </div></div>
          <div class="cal-grid" style="margin-top:12px">
            ${WK.map(w => `<div class="center muted small" style="padding:4px">${w}</div>`).join("")}
            ${cells}
          </div>
          <div class="muted small" style="margin-top:10px">点击日期记录开始/结束学习时间；勾选"已打卡"会在日历标记，并与顶部打卡联动。</div>
        </div>`;
        body.querySelectorAll("[data-day]").forEach(c => c.onclick = () => editDay(c.dataset.day));
        body.querySelector("#prevM").onclick = () => { view.setMonth(view.getMonth() - 1); render(); };
        body.querySelector("#nextM").onclick = () => { view.setMonth(view.getMonth() + 1); render(); };

        // 追加每日计划
        const planHost = document.createElement("div");
        body.appendChild(planHost);
        renderPlan(planHost);
      }

      function editDay(ds) {
        const rec = DB.state.calendar[ds] = DB.state.calendar[ds] || { start: "", end: "", checked: false };
        const box = UI.el(`<div></div>`);
        box.innerHTML = `<div class="muted small">日期：${ds}</div>
          <label class="fld">开始时间</label><input type="time" id="st" value="${rec.start || ""}"/>
          <label class="fld">结束时间</label><input type="time" id="en" value="${rec.end || ""}"/>
          <label class="row" style="margin-top:10px;cursor:pointer"><input type="checkbox" id="ck" style="width:auto" ${rec.checked ? "checked" : ""}/> 标记为已打卡</label>`;
        UI.modal({
          title: "学习记录", body: box,
          actions: [
            { label: "取消", cls: "ghost", onClick: (m, c) => c() },
            { label: "保存", cls: "primary", onClick: (m, c) => {
              rec.start = box.querySelector("#st").value;
              rec.end = box.querySelector("#en").value;
              rec.checked = box.querySelector("#ck").checked;
              if (rec.checked) {
                if (!DB.state.checkin.dates.includes(ds)) DB.state.checkin.dates.push(ds);
                DB.state.checkin.lastDate = ds;
              } else {
                DB.state.checkin.dates = DB.state.checkin.dates.filter(x => x !== ds);
              }
              DB.save(); c(); render(); window.__refreshTop && window.__refreshTop();
            } }
          ]
        });
      }

      /* ===== 每日计划 ===== */
      function renderPlan(host) {
        const date = DB.today();
        const plan = DB.getPlan(date);
        const items = plan.items;
        const done = items.filter(i => i.done).length;
        const total = items.length;
        const pct = total ? Math.round(done / total * 100) : 0;

        // 艾宾浩斯待复习数（积累类）
        let dueCount = 0;
        if (EB && DB.state.eb && DB.state.eb.planAccumulate) {
          const grp = DB.state.eb.planAccumulate;
          dueCount = Object.keys(grp).filter(id => grp[id].seen > 0 && grp[id].next <= date).length;
        }

        let listHtml = "";
        if (!total) {
          listHtml = `<div class="muted small" style="padding:8px 0">暂无计划项，点「＋ 新增」添加，或先做几道题/闪卡会自动记录。</div>`;
        } else {
          listHtml = items.map(it => {
            const dim = it.done ? " style=\"opacity:.5;text-decoration:line-through\"" : "";
            const meta = [];
            if (it.type === "quiz") {
              if (it.count != null) {
                const pct2 = (it.correct != null && it.count) ? Math.round(it.correct / it.count * 100) : null;
                meta.push(`刷题 ${it.count} 道 · 对 ${it.correct != null ? it.correct : "?"} 道${pct2 != null ? "（正确率 " + pct2 + "%）" : ""}`);
              } else if (it.meta && it.meta.pct != null) meta.push(`正确率 ${it.meta.pct}%`);
            }
            if (it.minutes) meta.push("专注 " + fmt(it.minutes * 60));
            const metaStr = meta.length ? `<span class="muted small">· ${meta.join(" · ")}</span>` : "";
            const focusBtn = ((it.focusMin && !it.done) || (it.type === "quiz" && !it.done))
              ? `<button class="btn xs" data-focus="${it.id}" style="margin-left:6px">${it.type === "quiz" ? "📱 进入刷题" : "⏱ 开始专注"}</button>`
              : "";
            return `<div class="todo"${dim}>
              <label class="row" style="gap:8px;flex:1;align-items:flex-start;cursor:pointer">
                <input type="checkbox" data-toggle="${it.id}" ${it.done ? "checked" : ""} style="width:auto;margin-top:3px"/>
                <div style="flex:1">
                  <span class="tag" style="margin-right:6px">${TYPE_LABEL[it.type] || it.type}</span>
                  ${esc(it.text)}${metaStr}
                  ${it.module ? `<span class="muted small"> · ${esc(it.module)}</span>` : ""}
                  ${it.focusMin ? `<span class="muted small"> · 计划专注 ${it.focusMin} 分</span>` : ""}
                </div>
              </label>
              ${focusBtn}
              <button class="del" data-del="${it.id}" style="border:none;background:none;color:#ff6b81;font-size:15px">✕</button>
            </div>`;
          }).join("");
        }

        host.innerHTML = `<div class="card" style="margin-top:10px">
          <div class="spread">
            <h3 style="margin:0">📋 每日计划 <span class="muted small">${date}</span></h3>
            <button class="btn xs primary" id="addPlan">＋ 新增</button>
          </div>
          <div class="row spread" style="margin-top:8px">
            <div class="muted small">完成 ${done} / ${total}　${pct}%</div>
            ${dueCount ? `<span class="tag" title="艾宾浩斯待复习">🧠 待复习 ${dueCount}</span>` : ""}
          </div>
          <div class="progress" style="height:8px;background:#2a3358;border-radius:6px;overflow:hidden;margin:6px 0 10px">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#34e7e4,#9b6cff);transition:width .3s"></div>
          </div>
          <div class="muted small" style="margin-bottom:8px">💡 ${motivation(pct, total)}</div>
          <div id="planList">${listHtml}</div>
          <label class="fld" style="margin-top:10px">当天备注</label>
          <textarea id="planNote" rows="2" placeholder="今天的状态 / 想说的话…" style="width:100%;resize:vertical">${esc(plan.note || "")}</textarea>
        </div>`;

        host.querySelector("#addPlan").onclick = () => openAddPlan(host);
        host.querySelector("#planNote").onchange = e => { DB.setPlanNote(date, e.target.value); };
        host.querySelectorAll("[data-toggle]").forEach(cb => cb.onchange = () => {
          DB.togglePlanItem(date, cb.dataset.toggle); renderPlan(host);
        });
        host.querySelectorAll("[data-focus]").forEach(b => b.onclick = () => {
          const it = DB.getPlan(date).items.find(x => x.id === b.dataset.focus);
          if (it) {
            window.__pendingFocus = { planId: it.id, text: it.text, focusMin: it.focusMin || 0, type: it.type };
            location.hash = (it.type === "quiz") ? "#/shuati" : "#/timer";
          }
        });
        host.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
          const plan2 = DB.getPlan(date);
          plan2.items = plan2.items.filter(x => x.id !== b.dataset.del);
          if (window.Ebbinghaus) window.Ebbinghaus.reset("planAccumulate", b.dataset.del);
          DB.save(); renderPlan(host);
        });
      }

      function openAddPlan(host) {
        // 新增计划项时，模块下拉不包括：倒计时、上岸计时器、学习统计（这些是功能/界面，不是可排计划的学习模块）
        const EXCLUDE = { countdown: 1, timer: 1, stats: 1, shuati: 1 };
        const mods = (window.MODULES ? Object.keys(window.MODULES) : []).filter(k => !EXCLUDE[k]);
        const modOpts = mods.map(k => `<option value="${k}">${esc(window.MODULES[k].title)}</option>`).join("");
        const typeOpts = Object.keys(TYPE_LABEL).map(k => `<option value="${k}">${TYPE_LABEL[k]}</option>`).join("");
        const box = UI.el(`<div></div>`);
        box.innerHTML = `
          <label class="fld">模块</label><select id="pm" class="full">${modOpts}</select>
          <label class="fld">类型</label><select id="pt" class="full">${typeOpts}</select>
          <label class="fld">内容</label><input id="ptx" placeholder="例如：复习类比推理专题三 / 做常识10题" class="full"/>
          <label class="fld" style="margin-top:10px">专注时长（分钟，可选）</label>
          <input id="pfm" type="number" min="1" class="full" placeholder="例如 25，留空则不计时长"/>
          <div class="muted small" style="margin-top:6px">类型说明：学习/复习=普通任务；积累=按艾宾浩斯曲线安排复习；刷题=会记录正确率与时间；专注=可点「开始专注」跳到计时器倒计时。</div>`;
        // 每次新增都恢复到原始状态（不带上次填写的内容）
        const ptx = box.querySelector("#ptx"); ptx.value = "";
        box.querySelector("#pfm").value = "";
        box.querySelector("#pm").selectedIndex = 0;
        box.querySelector("#pt").selectedIndex = 0;
        UI.modal({
          title: "新增计划项", body: box, width: "460px",
          actions: [
            { label: "取消", cls: "ghost", onClick: (m, c) => c() },
            { label: "添加", cls: "primary", onClick: (m, c) => {
              const text = ptx.value.trim() || (TYPE_LABEL[box.querySelector("#pt").value] + "任务");
              const fmin = parseInt(box.querySelector("#pfm").value, 10);
              DB.addPlanItem(DB.today(), {
                module: box.querySelector("#pm").value,
                type: box.querySelector("#pt").value,
                text: text,
                focusMin: (!isNaN(fmin) && fmin > 0) ? fmin : 0
              });
              c(); renderPlan(host);
            } }
          ]
        });
      }

      render();
    }
  };
})();
