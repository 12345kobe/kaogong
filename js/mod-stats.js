/* 模块：学习统计（每日学习时长 / 各科累计正确率 / 正确率趋势 / 学习计划） */
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};
  window.MODULES.stats = {
    title: "学习统计", icon: "stats",
    render(body) {
      const DB = window.DB, UI = window.UI;
      // 以中文科目名为统一主键（与答题/错题本/每日时长存储一致）
      const SUBJECTS = ["言语", "资料", "逻辑", "政治", "数量", "常识", "申论"];
      const palette = ["#34e7e4", "#ff5cf0", "#ffd166", "#9b6cff", "#3ddc97", "#ff6b81", "#5b9bff"];

      // ===== 数据汇总 =====
      const sessions = DB.state.timer.sessions || {};
      const dates = Object.keys(sessions).sort();
      const last14 = dates.slice(-14);
      const totalMin = Object.values(sessions).reduce((a, b) => a + b, 0);
      const days = dates.length;
      const todayMin = DB.getTodayMinutes();

      const accC = DB.state.accuracyCumulative || {};
      let totalCorrect = 0, totalAnswered = 0;
      SUBJECTS.forEach(k => { const c = accC[k]; if (c) { totalCorrect += c.correct; totalAnswered += c.total; } });
      const overallPct = totalAnswered ? Math.round(totalCorrect / totalAnswered * 100) : 0;

      let wrongTotal = 0; Object.values(DB.state.wrongbook || {}).forEach(a => wrongTotal += a.length);

      const acc = (DB.state.accuracy || []).slice(-20);
      const plan = DB.state.studyPlan = DB.state.studyPlan || {};
      const todaySubject = (DB.state.timer.subjectSessions && DB.state.timer.subjectSessions[DB.today()]) || {};
      const totalTarget = SUBJECTS.reduce((s, k) => s + (plan[k] || 0), 0);

      // ===== 顶部统计卡片 =====
      const cards = [
        { n: days, l: "累计学习天数" },
        { n: (totalMin / 60).toFixed(1), l: "累计学习(小时)" },
        { n: todayMin, l: "今日学习(分钟)" },
        { n: totalAnswered, l: "累计答题数" },
        { n: overallPct + "%", l: "总体正确率" },
        { n: wrongTotal, l: "错题总数" }
      ];
      let html = `<div class="grid g3">`;
      cards.forEach(c => html += `<div class="card stat-card"><div class="stat-num">${c.n}</div><div class="muted small">${c.l}</div></div>`);
      html += `</div>`;

      // ===== 图表区 =====
      html += `<div class="grid g2">
        <div class="card"><h3>📈 每日学习时长（近14天）</h3><canvas id="c1" height="160"></canvas></div>
        <div class="card"><h3>🎯 各科累计正确率（使用以来）</h3><canvas id="c2" height="160"></canvas></div>
        <div class="card"><h3>📊 答题正确率趋势</h3><canvas id="c3" height="160"></canvas></div>
        <div class="card"><h3>🍩 各科答题量分布</h3><canvas id="c4" height="160"></canvas></div>
      </div>`;

      // ===== 各科累计正确率 明细表 =====
      const badC = DB.absurdCounts ? DB.absurdCounts() : [];
      html += `<div class="card"><h3>📋 各科累计正确率明细</h3>
        <div class="row" style="justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
          <span class="muted small">${badC.length
            ? "⚠️ 检测到「" + UI.esc(badC.join("、")) + "」答题数异常（历史翻倍导致），建议立即重置"
            : "若答题数出现异常放大，可一键重置为 0，之后重新累计"}</span>
          <button class="btn sm ${badC.length ? "magenta" : "ghost"}" id="accReset">🔧 重置累计答题数</button>
        </div>
        <div id="accTable"></div></div>`;

      // ===== 学习计划 =====
      const todayPct = totalTarget > 0 ? Math.min(100, Math.round(todayMin / totalTarget * 100)) : 0;
      html += `<div class="card">
        <h3>📅 学习计划</h3>
        <div class="muted small" style="margin-bottom:8px">设置每科每日目标时长，下方自动统计今日实际完成进度（数据来自「上岸计时器」与各科答题练习）。</div>
        <div class="plan-summary">
          <div><span class="muted small">今日已学</span> <b style="font-size:18px;color:var(--cyan)">${todayMin}</b> 分钟 ／ 目标 <b>${totalTarget}</b> 分钟</div>
          <div class="progress-bar" style="margin:8px 0 14px"><i style="width:${todayPct}%"></i></div>
        </div>
        <div class="plan-grid" id="planGrid"></div>
      </div>`;

      // ===== 录入答题（按学科，一一对应）=====
      const recSubs = (window.KG_SUBJECTS || ["言语理解", "资料分析", "数量关系", "逻辑判断", "常识判断", "政治理论", "申论"]);
      const recOpts = recSubs.map(s => `<option value="${UI.esc(s)}">${UI.esc(s)}</option>`).join("");
      html += `<div class="card stat-rec">
        <h3>✍️ 录入答题（按学科）</h3>
        <div class="muted small" style="margin-bottom:10px">手动补录某学科答题：选择学科 + 填答题数/正确数，保存后<b>按该学科</b>记入累计正确率（与自动刷题一一对应，不会串到别的学科）。</div>
        <div class="row rec-row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div><label class="fld" style="margin:0">学科</label><select id="recSubj" class="full">${recOpts}</select></div>
          <div><label class="fld" style="margin:0">答题数</label><input id="recTotal" type="number" min="0" inputmode="numeric" style="width:96px" placeholder="如 30"/></div>
          <div><label class="fld" style="margin:0">正确数</label><input id="recCorrect" type="number" min="0" inputmode="numeric" style="width:96px" placeholder="如 25"/></div>
          <button class="btn primary" id="recSave">💾 保存录入</button>
        </div>
      </div>`;

      body.innerHTML = html;

      // ===== 各科累计正确率 明细表 =====
      const accTable = body.querySelector("#accTable");
      SUBJECTS.forEach((k, i) => {
        const c = accC[k];
        const pct = c && c.total ? Math.round(c.correct / c.total * 100) : 0;
        const vol = c ? c.total : 0;
        const color = palette[i % palette.length];
        const row = UI.el(`<div class="acc-row">
          <div class="acc-name">${k}</div>
          <div class="acc-bar"><i style="width:${pct}%;background:${color}"></i></div>
          <div class="acc-pct">${pct}%</div>
          <div class="acc-vol muted small">${vol} 题</div>
        </div>`);
        accTable.appendChild(row);
      });

      // ===== 累计答题数 重置（修复历史翻倍）=====
      const accResetBtn = body.querySelector("#accReset");
      if (accResetBtn) accResetBtn.onclick = () => {
        const bad = DB.absurdCounts();
        const msg = bad.length
          ? "检测到「" + bad.join("、") + "」答题数被异常放大（历史翻倍导致）。"
          : "将把所有科目的累计答题数清零，之后重新开始累计（不会删除你的错题、学习历史等其他数据）。";
        if (!confirm(msg + "\n\n确定重置？")) return;
        const reset = DB.resetAccuracy();
        UI.toast("已重置 " + reset.length + " 个科目的累计答题数，正在同步…");
        // 立即重新渲染 + 推送云端，确保被污染的云端数值被覆盖
        render();
        DB.save(true);
        refreshTop();
      };

      // ===== 学习计划 可编辑 =====
      const planGrid = body.querySelector("#planGrid");
      SUBJECTS.forEach((k, i) => {
        const target = plan[k] || 0;
        const actual = todaySubject[k] || 0;
        const pct = target > 0 ? Math.min(100, Math.round(actual / target * 100)) : 0;
        const color = palette[i % palette.length];
        const card = UI.el(`<div class="plan-item">
          <div class="spread"><b>${k}</b><span class="muted small">${actual}/${target} 分</span></div>
          <div class="progress-bar" style="margin:6px 0"><i style="width:${pct}%;background:${color}"></i></div>
          <div class="row" style="margin-top:6px;align-items:center">
            <label class="fld" style="margin:0;font-size:12px">每日目标(分)</label>
            <input type="number" min="0" max="600" value="${target}" data-sub="${k}" style="width:74px;padding:5px 8px;font-size:13px"/>
          </div>
        </div>`);
        card.querySelector("input").onchange = e => {
          const v = Math.max(0, +e.target.value || 0);
          DB.state.studyPlan = DB.state.studyPlan || {};
          DB.state.studyPlan[k] = v; DB.save();
          render();
        };
        planGrid.appendChild(card);
      });

      // ===== 图表 =====
      if (window.Chart) {
        new window.Chart(body.querySelector("#c1"), {
          type: "line",
          data: { labels: last14, datasets: [{ label: "分钟", data: last14.map(d => sessions[d]), borderColor: "#34e7e4", backgroundColor: "rgba(52,231,228,.15)", fill: true, tension: .3 }] },
          options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#9fb0d8", maxTicksLimit: 7 } }, y: { ticks: { color: "#9fb0d8", beginAtZero: true } } } }
        });
        new window.Chart(body.querySelector("#c2"), {
          type: "bar",
          data: { labels: SUBJECTS, datasets: [{ label: "正确率%", data: SUBJECTS.map(k => { const c = accC[k]; return c && c.total ? Math.round(c.correct / c.total * 100) : 0; }), backgroundColor: palette }] },
          options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#9fb0d8" } }, y: { ticks: { color: "#9fb0d8", min: 0, max: 100 }, grid: { color: "rgba(159,176,216,.12)" } } } }
        });
        new window.Chart(body.querySelector("#c3"), {
          type: "line",
          data: { labels: acc.map(a => a.date), datasets: [{ label: "正确率%", data: acc.map(a => a.pct), borderColor: "#ffd166", backgroundColor: "rgba(255,209,102,.15)", fill: true, tension: .3 }] },
          options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#9fb0d8", maxTicksLimit: 7 } }, y: { ticks: { color: "#9fb0d8", min: 0, max: 100 } } } }
        });
        new window.Chart(body.querySelector("#c4"), {
          type: "doughnut",
          data: { labels: SUBJECTS, datasets: [{ data: SUBJECTS.map(k => (accC[k] ? accC[k].total : 0)), backgroundColor: palette }] },
          options: { plugins: { legend: { position: "right", labels: { color: "#9fb0d8" } } } }
        });
      } else {
        body.insertAdjacentHTML("beforeend", `<div class="card muted">图表库未加载（需联网加载 Chart.js）。统计数字与明细表仍正常显示。</div>`);
      }

      // ===== 录入答题（按学科）保存 =====
      const recSave = body.querySelector("#recSave");
      if (recSave) recSave.onclick = () => {
        const subjName = body.querySelector("#recSubj").value;
        if (!subjName) { UI.toast("请选择学科"); return; }
        const total = parseInt(body.querySelector("#recTotal").value, 10);
        const correct = parseInt(body.querySelector("#recCorrect").value, 10);
        if (isNaN(total) || total < 0) { UI.toast("请填写有效的答题数"); return; }
        if (!isNaN(correct) && correct > total) { UI.toast("正确数不能大于答题数"); return; }
        DB.recordAccuracy(DB.subjectShort(subjName), isNaN(correct) ? 0 : correct, total);
        DB.save(true);
        UI.toast("已录入：" + subjName + " " + total + " 题 · 对 " + (isNaN(correct) ? "?" : correct) + " 题");
        render();
      };
    }
  };
})();
