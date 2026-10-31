/* 模块：学习统计（每日学习时长 / 各科累计正确率 / 正确率趋势 / 学习计划） */
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};
  window.MODULES.stats = {
    title: "学习统计", icon: "stats",
    render(body) {
      const DB = window.DB, UI = window.UI;
      /* 局部重渲染（旧代码裸调 render()/refreshTop() 会 ReferenceError 导致 save(true) 不执行） */
      const rerender = () => { try { window.MODULES.stats.render(body); } catch (e) {} };
      const refreshBrand = () => { try { window.KGKingke && KGKingke.renderBrand(); } catch (e) {} };
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

      // ★v20261021 当天各模块正确率（与「累计正确率」并列，互不混淆）
      const dayAcc = (DB.dayAccuracy ? DB.dayAccuracy() : { subjects: {}, total: { done: 0, right: 0, pct: null } });
      const todayPctNum = dayAcc.total.pct;

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
        { n: dayAcc.total.done, l: "今日答题数" },
        { n: (todayPctNum == null ? "—" : todayPctNum + "%"), l: "今日正确率" },
        { n: overallPct + "%", l: "总体正确率" },
        { n: wrongTotal, l: "错题总数" }
      ];
      let html = `<div class="grid g3">`;
      cards.forEach(c => html += `<div class="card stat-card"><div class="stat-num">${c.n}</div><div class="muted small">${c.l}</div></div>`);
      html += `</div>`;

      // ===== ★v20261021 今日正确率（当天各模块，单独小板块） =====
      const tRow = (k, i) => {
        const s = dayAcc.subjects[k];
        const pct = s && s.done ? Math.round(s.right / s.done * 100) : null;
        const color = palette[i % palette.length];
        const wide = Math.round((pct == null ? 0 : pct));
        return `<div class="acc-row">
          <div class="acc-name">${(window.KGSubjectFull ? KGSubjectFull(k) : k)}</div>
          <div class="acc-bar"><i style="width:${wide}%;background:${color}"></i></div>
          <div class="acc-pct">${pct == null ? "—" : pct + "%"}</div>
          <div class="acc-vol muted small">${s ? (s.right + "/" + s.done) : "0/0"} 题</div>
        </div>`;
      };
      html += `<div class="card today-acc">
        <h3>📅 今日正确率 <span class="muted small">${UI.esc(DB.today())}</span></h3>
        <div class="row" style="justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
          <span class="muted small">只统计今天（含 App 内答题、刷题模式记录，多选题同样计入）。</span>
          <span class="today-acc-big ${todayPctNum == null ? "" : (todayPctNum >= 70 ? "good" : (todayPctNum >= 50 ? "mid" : "bad"))}">
            ${todayPctNum == null ? "今天还没有答题记录" : "今日 <b>" + dayAcc.total.right + "</b>/<b>" + dayAcc.total.done + "</b> 题 · 正确率 <b>" + todayPctNum + "%</b>"}
          </span>
        </div>
        <div>${SUBJECTS.map(tRow).join("")}</div>
      </div>`;

      // ===== ★v20261031b 近7天预估分数（按广东省考/国考分值表赋分）+ 分数波动 + 薄弱模块 =====
      (function () {
        const EM = window.KGExam;
        if (!EM || !DB.recentScores) return;
        const r7 = DB.recentScores(7);
        const ORDER = EM.ORDER;
        const modeLabel = EM.label();
        const tblLabel = (EM.scoreTable() || {}).label || modeLabel;

        /* 行测：近7天各模块「正确题量 ÷ 题量」= 得分率 → 预估分 = 得分率 × 该模块整卷分 */
        const rows = [], rates = [];
        let estTotal = 0, fullCovered = 0;
        ORDER.forEach(m => {
          const cfg = EM.scoreCfg(m); if (!cfg) return;
          const recs = (r7.exam || []).filter(x => x.module === m);
          const tot = recs.reduce((a, b) => a + (b.total || 0), 0);
          const cor = recs.reduce((a, b) => a + (b.correct || 0), 0);
          if (tot <= 0) { rows.push({ m: m, tot: 0, cor: 0, rate: null, est: null, full: cfg.full }); return; }
          const rate = cor / tot, est = rate * cfg.full;
          rows.push({ m: m, tot: tot, cor: cor, rate: rate, est: est, full: cfg.full });
          rates.push(rate); estTotal += est; fullCovered += cfg.full;
        });
        const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

        /* 申论：近7天各题型「得分 ÷ 总分值」= 得分率 → 预估分 = 得分率 × 该题型的总分值 */
        const blocks = EM.shenlunBlocks();
        const slRows = [];
        let slEst = 0, slFull = 0;
        blocks.forEach(b => {
          const recs = (r7.shenlun || []).filter(x => x.block === b.n);
          const ts = recs.reduce((a, x) => a + (x.totalScore || 0), 0);
          const sc = recs.reduce((a, x) => a + (x.score || 0), 0);
          if (!recs.length || ts <= 0) { slRows.push({ n: b.n, rate: null, est: null, full: 0 }); return; }
          const full = ts / recs.length, rate = sc / ts, est = rate * full;
          slRows.push({ n: b.n, rate: rate, est: est, full: full });
          slEst += est; slFull += full;
        });

        /* 波动：与「上一个7天（第8~14天）」比，看预估行测分是升还是降（红涨绿跌） */
        let delta = null, prevEst = 0;
        try {
          const r14 = DB.recentScores(14);
          const in7 = {}; (r7.exam || []).forEach(x => { in7[x.date] = 1; });
          const prev = (r14.exam || []).filter(x => !in7[x.date]);
          let anyPrev = false;
          ORDER.forEach(m => {
            const cfg = EM.scoreCfg(m); if (!cfg) return;
            const recs = prev.filter(x => x.module === m);
            const tot = recs.reduce((a, b) => a + (b.total || 0), 0);
            const cor = recs.reduce((a, b) => a + (b.correct || 0), 0);
            if (tot > 0) { prevEst += (cor / tot) * cfg.full; anyPrev = true; }
          });
          if (anyPrev && fullCovered > 0) delta = estTotal - prevEst;
        } catch (e) {}

        /* 薄弱模块：近7天得分率低于「各模块平均得分率」的，标「要加强」 */
        const weak = rows.filter(r => r.rate != null && avgRate > 0 && r.rate < avgRate)
          .sort((a, b) => a.rate - b.rate);

        const pct = v => (v == null ? "—" : Math.round(v * 100) + "%");
        const pctCls = v => (v == null ? "" : (v >= 0.7 ? "good" : (v >= 0.5 ? "mid" : "bad")));
        const rowHtml = r => `<div class="acc-row">
          <div class="acc-name">${UI.esc(r.m || r.n)}</div>
          <div class="acc-bar"><i style="width:${Math.round((r.rate || 0) * 100)}%;background:${r.rate == null ? "var(--line)" : (r.rate < avgRate && avgRate > 0 ? "#ff6b81" : "#34e7e4")}"></i></div>
          <div class="acc-pct ${pctCls(r.rate)}">${r.m ? (r.rate == null ? "未练" : pct(r.rate)) : pct(r.rate)}</div>
          <div class="acc-vol muted small">${r.m
            ? (r.tot ? (r.cor + "/" + r.tot + " 题 · " + r.est.toFixed(1) + "/" + r.full.toFixed(1) + " 分") : "整卷 " + r.full.toFixed(1) + " 分")
            : (r.est == null ? "未录" : r.est.toFixed(1) + "/" + r.full.toFixed(1) + " 分")}</div>
        </div>`;

        const deltaHtml = (delta == null) ? '<span class="muted small">（暂无上一周期数据可比）</span>'
          : `<span style="font-weight:800;color:${delta >= 0 ? "#ff4d4f" : "#3ddc97"}">${delta >= 0 ? "▲ 升" : "▼ 降"} ${Math.abs(delta).toFixed(1)} 分</span>
             <span class="muted small">（对比第 8~14 天的 ${prevEst.toFixed(1)} 分）</span>`;

        html += `<div class="card" style="border-left:5px solid #ffd166">
          <h3>🎯 近7天预估分数 <span class="muted small">${UI.esc(r7.from)} ~ ${UI.esc(r7.to)} · 按${UI.esc(tblLabel)}分值表赋分</span></h3>
          <div class="row" style="gap:14px;flex-wrap:wrap;margin:10px 0 6px">
            <div><span class="muted small">预估行测</span> <b style="font-size:26px;color:var(--cyan)">${estTotal.toFixed(1)}</b>
              <span class="muted small">/ ${fullCovered.toFixed(1)} 分（已练模块）</span></div>
            <div><span class="muted small">预估申论</span> <b style="font-size:26px;color:#ffd166">${slEst.toFixed(1)}</b>
              <span class="muted small">/ ${slFull.toFixed(1)} 分（已录题型）</span></div>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">${deltaHtml}</div>
          <div class="muted small" style="margin:6px 0">行测各模块（得分率 × 模块整卷分 = 预估分）：</div>
          <div>${rows.map(rowHtml).join("")}</div>
          <div class="muted small" style="margin:12px 0 6px">申论各题型（按你录入的总分值/得分折算）：</div>
          <div>${slRows.map(rowHtml).join("")}</div>
          <div class="muted small" style="margin-top:10px">平均分位线：各模块平均得分率 <b>${pct(avgRate)}</b>。${
            weak.length
              ? '⚠️ 需加强：<b style="color:#ff6b81">' + UI.esc(weak.map(w => w.m).join("、")) + '</b>（低于平均线，优先补）'
              : '✅ 暂无明显短板模块（各模块均不低于平均线）'
          }</div>
          <div class="muted small" style="margin-top:6px">每次刷题保存 / 申论录入得分都会计入这里，用于掌握分数波动。</div>
        </div>`;
      })();

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
      const recSubs = (window.KG_SUBJECTS || ["言语理解", "资料分析", "数量关系", "判断推理", "常识判断", "政治理论", "申论"]);
      const recOpts = recSubs.map(s => `<option value="${UI.esc(s)}">${UI.esc(s)}</option>`).join("");
      html += `<div class="card stat-rec">
        <h3>✍️ 录入答题（按学科）</h3>
        <div class="muted small" style="margin-bottom:10px">手动补录某学科答题：选择学科 + 填答题数/正确数，保存后<b>按该学科</b>记入累计正确率（与自动刷题一一对应，不会串到别的学科）。下方「⏱ 时长统计」可同时补录学习时长与答题：时长计入今日/累计学习时长，答题数计入累计/今日答题数。</div>
        <div class="row rec-row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div><label class="fld" style="margin:0">学科</label><select id="recSubj" class="full">${recOpts}</select></div>
          <div><label class="fld" style="margin:0">答题数</label><input id="recTotal" type="number" min="0" inputmode="numeric" style="width:96px" placeholder="如 30"/></div>
          <div><label class="fld" style="margin:0">正确数</label><input id="recCorrect" type="number" min="0" inputmode="numeric" style="width:96px" placeholder="如 25"/></div>
          <button class="btn primary" id="recSave">💾 保存录入</button>
          <button class="btn" id="durBtn">⏱ 时长统计</button>
        </div>
        <div id="durPanel" style="display:none;margin-top:12px;border-top:1px dashed var(--line);padding-top:12px">
          <div class="muted small" style="margin-bottom:8px">手动补录学习时长与答题：时长计入「今日/累计学习时长」；填了答题数则按学科记入累计/今日正确率与答题数（正确数留空视为全对）。</div>
          <div class="row rec-row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
            <div><label class="fld" style="margin:0">学科</label><select id="durSubj" class="full">${recOpts}</select></div>
            <div><label class="fld" style="margin:0">时长(分)</label><input id="durMin" type="number" min="0" inputmode="numeric" style="width:90px" placeholder="如 60"/></div>
            <div><label class="fld" style="margin:0">答题数</label><input id="durTotal" type="number" min="0" inputmode="numeric" style="width:80px" placeholder="可留空"/></div>
            <div><label class="fld" style="margin:0">正确数</label><input id="durCorrect" type="number" min="0" inputmode="numeric" style="width:80px" placeholder="可留空"/></div>
            <button class="btn primary" id="durSave">💾 记录时长</button>
          </div>
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
          <div class="acc-name">${(window.KGSubjectFull ? KGSubjectFull(k) : k)}</div>
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
        rerender();
        DB.save(true);
        refreshBrand();
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
          rerender();
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
        rerender(); refreshBrand();
      };

      // ===== ★v20261031 时长统计：手动补录学习时长（计入今日/累计时长）+ 可选答题数（计入累计/今日答题数）=====
      const durBtn = body.querySelector("#durBtn");
      if (durBtn) durBtn.onclick = () => {
        const p = body.querySelector("#durPanel");
        if (p) p.style.display = (p.style.display === "none" ? "block" : "none");
      };
      const durSave = body.querySelector("#durSave");
      if (durSave) durSave.onclick = () => {
        const subjName = body.querySelector("#durSubj").value;
        const minutes = parseFloat(body.querySelector("#durMin").value);
        const total = parseInt(body.querySelector("#durTotal").value, 10);
        const correct = parseInt(body.querySelector("#durCorrect").value, 10);
        if (isNaN(minutes) || minutes <= 0) { UI.toast("请填写有效的学习时长（分钟）"); return; }
        if ((!isNaN(total) && total > 0) && !subjName) { UI.toast("要记入答题数请先选择学科"); return; }
        if ((!isNaN(total) && total > 0) && !isNaN(correct) && correct > total) { UI.toast("正确数不能大于答题数"); return; }
        DB.addTimerMinutes(subjName ? DB.subjectShort(subjName) : "", Math.round(minutes));
        if (!isNaN(total) && total > 0) {
          const cr = (!isNaN(correct) && correct >= 0) ? Math.min(correct, total) : total;
          DB.recordAccuracy(DB.subjectShort(subjName), cr, total);
        }
        DB.save(true);
        UI.toast("已记录时长 " + Math.round(minutes) + " 分" + ((!isNaN(total) && total > 0) ? " · " + total + " 题" : ""));
        rerender(); refreshBrand();
      };
    }
  };
})();
