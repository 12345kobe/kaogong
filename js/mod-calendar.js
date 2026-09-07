/* 模块：打卡日历 */
(function () {
  window.MODULES = window.MODULES || {};
  window.MODULES.calendar = {
    title: "打卡日历", icon: "calendar",
    render(body) {
      const DB = window.DB, UI = window.UI;
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
          <div class="muted small" style="margin-top:10px">点击日期记录开始/结束学习时间；勾选“已打卡”会在日历标记，并与顶部打卡联动。</div>
        </div>`;
        body.querySelectorAll("[data-day]").forEach(c => c.onclick = () => editDay(c.dataset.day));
        body.querySelector("#prevM").onclick = () => { view.setMonth(view.getMonth() - 1); render(); };
        body.querySelector("#nextM").onclick = () => { view.setMonth(view.getMonth() + 1); render(); };
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
              // 联动顶部打卡
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
      render();
    }
  };
})();
