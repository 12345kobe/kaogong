/* 模块：政治理论（含「知识点复习」板块 + 母题特训）
   - 知识点复习：基于精讲精练 PDF 解析，按艾宾浩斯曲线安排每日10个
   - 点击展开：原文（重点加粗）+ "去做题"
   - 去做题：标准答题引擎（计时、解释、错题自动收录）
   - 导出：题目/答案分离 + 返回主页面按钮
*/
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};
  const SUBJECT = "政治";
  const EB = window.Ebbinghaus;
  const GROUP = "politics";

  function dayKey(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }

  /* 渲染"原文"——把 highlights 中的词在 body 中加粗，并按文件换行 */
  function renderBody(body, highlights) {
    if (!body) return "";
    let html = window.UI.esc(body);
    (highlights || []).forEach(h => {
      if (!h || h.length < 2) return;
      const safe = h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      html = html.replace(new RegExp(safe, "g"), "<b class='hl'>" + window.UI.esc(h) + "</b>");
    });
    return html.replace(/\n/g, "<br>");
  }

  /* === 渲染主页面（政治模块入口）=== */
  function renderKnowledgeDashboard(body, hostCard) {
    const UI = window.UI, DB = window.DB;
    const data = window.POLITICS_KP || {};
    const lessons = data.lessons || [];
    const points = data.points || [];
    const bank = data.bank || [];
    if (!points.length) return;

    const today = DB.today();
    const daily = EB.pickDaily(GROUP, points, { quota: 10 });
    const stats = EB.getStats(GROUP);

    hostCard.innerHTML = `
      <div class="card">
        <h3>📖 知识点复习（艾宾浩斯遗忘曲线）</h3>
        <div class="muted small" style="margin-bottom:10px">按艾宾浩斯曲线（${EB.INTERVALS.join("/")} 天）安排每日复习，今日 ${today}，已选 <b>${daily.length}</b> 个知识点。</div>

        <div class="eb-stats">
          <div class="eb-stat"><span class="n">${stats.total}</span><span class="l">总知识点</span></div>
          <div class="eb-stat"><span class="n">${stats.seen}</span><span class="l">已复习</span></div>
          <div class="eb-stat" id="ebDueStat" style="cursor:pointer" title="点击：学习 / 测试"><span class="n">${stats.due}</span><span class="l">待复习 · 点此</span></div>
          <div class="eb-stat"><span class="n">${stats.mastered}</span><span class="l">已掌握</span></div>
          <div class="eb-stat"><span class="n">${stats.accuracy}%</span><span class="l">总正确率</span></div>
        </div>

        <div class="row" style="margin-top:12px;gap:8px">
          <button class="btn primary" id="startDaily">▶ 开始今日 ${daily.length} 个知识点</button>
          <button class="btn" id="viewAll">📚 查看全部 (${points.length})</button>
          <button class="btn ghost" id="ebReset" title="重置全部复习进度">↺ 重置复习进度</button>
        </div>

        <h4 style="margin-top:18px;color:var(--txt)">今日复习清单（${daily.length} 个）</h4>
        <div id="ebToday" class="kp-list"></div>

        <details style="margin-top:14px"><summary class="linklike">课时列表（${lessons.length} 节 · 共 ${points.length} 知识点 · ${bank.length} 课堂练习题）</summary>
          <div id="ebLessons" class="kp-list"></div>
        </details>
      </div>
    `;

    // 今日清单
    const todayEl = hostCard.querySelector("#ebToday");
    if (!daily.length) todayEl.innerHTML = `<div class="empty">暂无可复习知识点</div>`;
    daily.forEach((p, i) => todayEl.appendChild(buildKPItem(p, i + 1, /*clickable*/ true)));

    // 「待复习」数字可点：弹出到期清单 + 学习 / 测试
    const dueEl = hostCard.querySelector("#ebDueStat");
    if (dueEl) dueEl.onclick = () => {
      const due = points.filter(p => EB.isDue(GROUP, p.id));
      window.KGReview.open({
        title: "政治 · 知识点 · 待复习", subject: "政治", group: GROUP,
        items: due.map(p => ({ id: p.id, prompt: p.title, answer: p.l1 || p.body || p.jiexi || "" })),
        frontLabel: "知识点", backLabel: "答案",
        emptyMsg: "当前没有到期待复习的政治知识点",
        onExit: () => { renderKnowledgeDashboard(body, hostCard); }
      });
    };

    // 课时列表
    const lessonsEl = hostCard.querySelector("#ebLessons");
    lessons.forEach(ls => {
      const lessPoints = points.filter(x => x.lessonIdx === ls.idx);
      const card = document.createElement("div");
      card.className = "kp-item";
      const stat = lessPoints.length ? EB.getStats(GROUP) : null;
      const seenCount = lessPoints.filter(p => EB.getRecord(GROUP, p.id)).filter(p => EB.getRecord(GROUP, p.id).seen > 0).length;
      card.innerHTML = `<div class="kp-q">
          <span class="kp-no">${ls.idx}</span>
          <span style="flex:1">${UI.esc(ls.title)} <span class="muted small">(${ls.date || ""})</span></span>
          <span class="muted small">${lessPoints.length} 个 · 已复习 ${seenCount}</span>
          <span class="arc-toggle">展开 ▾</span>
        </div>
        <div class="kp-c" style="display:none">
          ${lessPoints.length
            ? lessPoints.map((p, i) => `<div class="kp-row-mini"><b>${i + 1}.</b> ${UI.esc(p.title)}</div>`).join("")
            : ""}
        </div>`;
      card.querySelector(".kp-q").onclick = () => {
        const c = card.querySelector(".kp-c"); const open = c.style.display !== "none";
        c.style.display = open ? "none" : "block";
        card.querySelector(".arc-toggle").textContent = open ? "展开 ▾" : "收起 ▴";
      };
      // 课时全部习题入口（含未匹配到具体知识点的题）
      const lessQs = (window.POLITICS_KP.bank || []).filter(q => q.lessonIdx === ls.idx);
      if (lessQs.length) {
        const btn = document.createElement("button");
        btn.className = "btn small";
        btn.style.marginTop = "8px";
        btn.textContent = `📚 本课时全部习题（${lessQs.length} 题）`;
        btn.onclick = (e) => { e.stopPropagation(); openQuizForLesson(card, ls.idx, () => {}); };
        card.querySelector(".kp-c").appendChild(btn);
      }
      lessonsEl.appendChild(card);
    });

    hostCard.querySelector("#startDaily").onclick = () => {
      if (!daily.length) { UI.toast("今日没有待复习知识点"); return; }
      openKnowledgeList(daily, /*afterFinish*/ () => renderKnowledgeDashboard(body, hostCard));
    };
    hostCard.querySelector("#viewAll").onclick = () => {
      openKnowledgeList(points, /*afterFinish*/ () => renderKnowledgeDashboard(body, hostCard), /*allowChoose*/ true);
    };
    hostCard.querySelector("#ebReset").onclick = async () => {
      if (await UI.confirm("确认重置全部政治知识点复习进度？此操作不可撤销。")) {
        EB.resetGroup(GROUP);
        UI.toast("已重置");
        renderKnowledgeDashboard(body, hostCard);
      }
    };
  }

  /* 单个知识点卡片 - 列表用 */
  function buildKPItem(p, no, clickable) {
    const UI = window.UI;
    const rec = EB.getRecord(GROUP, p.id);
    const seenTag = rec && rec.seen > 0 ? `<span class="eb-tag eb-tag-seen">第${rec.seen}轮</span>` : `<span class="eb-tag eb-tag-new">新</span>`;
    const acc = rec && rec.total ? Math.round(rec.correct / rec.total * 100) : 0;
    const accTag = rec && rec.total ? `<span class="eb-tag eb-tag-acc">${acc}%</span>` : "";
    const item = document.createElement("div");
    item.className = "kp-item";
    item.innerHTML = `<div class="kp-q">
        <span class="kp-no">${no}</span>
        <span style="flex:1">${UI.esc(p.title)}</span>
        ${seenTag}${accTag}
        <span class="arc-toggle">详情 ▾</span>
      </div>
      <div class="kp-c kp-detail" style="display:none" data-pid="${UI.esc(p.id)}"></div>`;
    const detailEl = item.querySelector(".kp-c");
    const headEl = item.querySelector(".kp-q");
    headEl.onclick = () => {
      const open = detailEl.style.display !== "none";
      if (!open && clickable) renderDetail(detailEl, p);
      detailEl.style.display = open ? "none" : "block";
      headEl.querySelector(".arc-toggle").textContent = open ? "详情 ▾" : "收起 ▴";
    };
    return item;
  }

  /* 详情视图 */
  function renderDetail(host, p) {
    const UI = window.UI, DB = window.DB;
    const rec = EB.getRecord(GROUP, p.id);
    const jiexi = p.jiexi ? `<div class="kp-jiexi"><b>【解析】</b>${renderBody(p.jiexi, p.highlights)}</div>` : "";
    const zhu = (p.zhu && p.zhu.length) ? `<div class="kp-zhu"><b>【注意】</b>${p.zhu.map(z => UI.esc(z)).join("<br>")}</div>` : "";
    // 只展示「匹配到本知识点」的习题，避免复习内容与题目不一致
    const lessonQs = (window.POLITICS_KP.bank || []).filter(q => q.pointId === p.id);
    const allLessonQs = (window.POLITICS_KP.bank || []).filter(q => q.lessonIdx === p.lessonIdx);
    host.innerHTML = `
      <div class="kp-body">
        <h4>${UI.esc(p.title)}</h4>
        <div class="muted small">课时 ${p.lessonIdx} · ${UI.esc(p.lessonTitle || "")}</div>
        <div class="kp-orig"><b>【原文】</b>${renderBody(p.body, p.highlights)}</div>
        ${jiexi}
        ${zhu}
      </div>
      <div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px">
        <button class="btn primary" id="doQuiz">✏️ 去做题（${lessonQs.length} 题）</button>
        ${lessonQs.length === 0 && allLessonQs.length ? `<button class="btn" id="doLesson">📚 练习本课时全部习题（${allLessonQs.length} 题）</button>` : ""}
        <button class="btn" id="markRead">✓ 我已读完（标记复习）</button>
        ${rec ? `<span class="muted small">已复习 ${rec.seen} 次 · 答对 ${rec.correct}/${rec.total}</span>` : ""}
      </div>
      ${lessonQs.length === 0 ? `<div class="muted small" style="margin-top:6px">本知识点暂无专属习题（习题已按主题分配到对应知识点；可练习本课时全部习题）。</div>` : ""}`;
    host.querySelector("#doQuiz").onclick = () => {
      if (!lessonQs.length) { UI.toast("本知识点暂无匹配习题"); return; }
      openQuizForPoint(host, p, lessonQs);
    };
    if (lessonQs.length === 0 && allLessonQs.length) {
      host.querySelector("#doLesson").onclick = () => openQuizForLesson(host, p.lessonIdx);
    }
    host.querySelector("#markRead").onclick = () => {
      EB.updateAfterReview(GROUP, p.id, true);
      UI.toast("已记录为完成复习，明日再来 ✨");
      setTimeout(() => renderDetail(host, p), 100);
    };
  }

  /* 答题：复用 Quiz.start */
  function openQuizForPoint(host, p, questions) {
    const UI = window.UI;
    const wrap = document.createElement("div");
    wrap.className = "kp-quiz";
    wrap.innerHTML = `
      <div class="row" style="margin-bottom:8px;flex-wrap:wrap;gap:6px">
        <button class="btn ghost" data-act="back">← 返回知识点</button>
        <button class="btn ghost" data-act="home">← 返回主页面</button>
      </div>
      <h4 style="margin:6px 0">习题练习：${UI.esc(p.title)}</h4>
      <div class="muted small" style="margin-bottom:10px">仅展示匹配本知识点的课堂练习（${questions.length} 题）</div>
      <div class="kp-quiz-host"></div>`;
    host.appendChild(wrap);
    const quizHost = wrap.querySelector(".kp-quiz-host");
    wrap.querySelector("[data-act='back']").onclick = () => { wrap.remove(); renderDetail(host, p); };
    wrap.querySelector("[data-act='home']").onclick = () => goHome();
    startPointQuiz(quizHost, questions, p);
  }

  /* 课时级全部习题（未匹配到具体知识点的题统一在此练习，避免误放进某知识点） */
  function openQuizForLesson(host, lessonIdx, onBack) {
    const UI = window.UI;
    const all = (window.POLITICS_KP.bank || []).filter(q => q.lessonIdx === lessonIdx);
    if (!all.length) { UI.toast("本课时暂无习题"); return; }
    const wrap = document.createElement("div");
    wrap.className = "kp-quiz";
    wrap.innerHTML = `
      <div class="row" style="margin-bottom:8px;flex-wrap:wrap;gap:6px">
        <button class="btn ghost" data-act="back">← 返回</button>
        <button class="btn ghost" data-act="home">← 返回主页面</button>
      </div>
      <h4 style="margin:6px 0">本课时全部习题（${all.length} 题）</h4>
      <div class="muted small" style="margin-bottom:10px">以下为第 ${lessonIdx} 课全部课堂练习，含未匹配到具体知识点的题目。</div>
      <div class="kp-quiz-host"></div>`;
    host.appendChild(wrap);
    const quizHost = wrap.querySelector(".kp-quiz-host");
    wrap.querySelector("[data-act='back']").onclick = () => { wrap.remove(); if (onBack) onBack(); };
    wrap.querySelector("[data-act='home']").onclick = () => goHome();
    startPointQuiz(quizHost, all, null);
  }

  /* 统一的答题启动（知识点专属 / 课时全部 共用），含返回/复习记录 */
  function startPointQuiz(quizHost, questions, p) {
    const UI = window.UI;
    const qsForQuiz = questions.map(q => ({
      q: q.q,
      options: (q.options || []).slice(),
      a: typeof q.a === "string" ? q.a.charCodeAt(0) - 65 : q.a,
      e: q.e || "", optInfo: null, _kpId: p ? p.id : null, _qid: q.id,
    }));
    window.Quiz.start(quizHost, qsForQuiz, SUBJECT, {
      onDone: ({ correct, total }) => {
        if (p) {
          const ratio = total ? correct / total : 0;
          EB.updateAfterReview(GROUP, p.id, ratio >= 0.7);
          const rec = EB.getRecord(GROUP, p.id);
          const tip = document.createElement("div");
          tip.className = "muted small";
          tip.style.marginTop = "10px";
          tip.innerHTML = `<b>复习已记录</b> · 第 ${rec ? rec.seen : 0} 轮 · 答对 ${rec ? rec.correct : 0}/${rec ? rec.total : 0}`;
          quizHost.appendChild(tip);
        }
      },
      onAgain: () => {
        const old = quizHost.querySelector(".card.center"); if (old) old.remove();
        startPointQuiz(quizHost, questions, p);
      }
    });
  }

  /* 整列练习（每日清单 / 全部） */
  function openKnowledgeList(points, afterFinish, allowChoose) {
    const UI = window.UI;
    // 新页模式
    const host = document.createElement("div");
    host.className = "modal-mask";
    const m = document.createElement("div");
    m.className = "modal kp-list-modal";
    m.style.cssText = "width:min(720px,96vw);max-height:90vh;overflow:auto";
    m.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">📖 知识点复习（${points.length} 个）</h2>
        <button class="btn ghost" id="goHomeBtn">← 返回主页面</button>
      </div>
      <div class="muted small" style="margin:6px 0">点击卡片展开详情；详情里有"去做题"按钮。完成复习后自动记录，下一次按艾宾浩斯曲线安排。</div>
      <div id="kpListWrap" class="kp-list"></div>
    `;
    host.appendChild(m);
    document.getElementById("modalRoot").appendChild(host);
    host.querySelector("#goHomeBtn").onclick = () => goHome();
    host.onclick = e => { if (e.target === host) { host.remove(); if (afterFinish) afterFinish(); } };

    const wrap = m.querySelector("#kpListWrap");
    points.forEach((p, i) => {
      const item = buildKPItem(p, i + 1, true);
      item.addEventListener("click", e => {
        // 避免重复触发详情打开
      }, true);
      wrap.appendChild(item);
    });
  }

  /* 全屏"返回主页"导航 */
  function goHome() {
    // 清掉所有 modal
    document.querySelectorAll(".modal-mask").forEach(m => m.remove());
    if (location.hash !== "#/countdown") location.hash = "#/countdown";
  }

  /* 按课时浏览知识点（复习打卡 · 满30秒记1次） */
  function renderGroupBrowse(body) {
    const UI = window.UI, DB = window.DB;
    const data = window.POLITICS_KP || {};
    const lessons = data.lessons || [];
    const points = data.points || [];
    if (!points.length) return;

    const rev = DB.state.politicsReview = DB.state.politicsReview || {};
    function startDwell(ms, onFire) { const t = setTimeout(onFire, ms); return () => clearTimeout(t); }

    const card = UI.el(`<div class="card" style="margin-top:16px">
      <h3>📑 按课时浏览知识点（复习打卡 · 满30秒记1次）</h3>
      <div class="muted small">按课时分组浏览知识点；点开某个知识点看原文，停留超过 <b>30 秒</b> 自动记 1 次复习（不足 30 秒不计数）。知识点后标注「复习 N 次」。</div>
      <div id="pgrid" style="display:flex;flex-wrap:wrap;gap:8px;margin:10px 0"></div>
      <div id="pdetail"></div>
    </div>`);
    body.appendChild(card);
    const pgrid = card.querySelector("#pgrid");
    const pdetail = card.querySelector("#pdetail");
    let dwellCancel = null;

    lessons.forEach(ls => {
      const n = points.filter(x => x.lessonIdx === ls.idx).length;
      const b = UI.el(`<button class="chip" style="cursor:pointer;padding:8px 12px">${UI.esc(ls.title)} <span class="muted small">(${n})</span></button>`);
      b.onclick = () => openLesson(ls);
      pgrid.appendChild(b);
    });

    function openLesson(ls) {
      if (dwellCancel) dwellCancel();
      const lessPoints = points.filter(x => x.lessonIdx === ls.idx);
      pdetail.innerHTML = `<div class="row" style="gap:8px;margin-bottom:8px">
          <button class="btn ghost" id="lback">← 返回课时</button>
          <span class="muted small">${lessPoints.length} 个知识点 · 点击进入看原文</span>
        </div>
        <div id="llist" style="display:flex;flex-direction:column;gap:8px"></div>`;
      pdetail.querySelector("#lback").onclick = () => { if (dwellCancel) dwellCancel(); pdetail.innerHTML = ""; };
      const llist = pdetail.querySelector("#llist");
      lessPoints.forEach(p => {
        const c = rev[p.id] || 0;
        const row = UI.el(`<div class="todo" style="cursor:pointer"><div style="flex:1"><b>${UI.esc(p.title)}</b></div><span class="chip" style="font-size:11px">复习 ${c} 次</span></div>`);
        row.onclick = () => openPoint(p);
        llist.appendChild(row);
      });
    }

    function openPoint(p) {
      if (dwellCancel) dwellCancel();
      const lsTitle = (lessons.find(l => l.idx === p.lessonIdx) || {}).title || "";
      pdetail.innerHTML = `<div class="row" style="gap:8px;margin-bottom:8px">
          <button class="btn ghost" id="pback">← 返回知识点列表</button>
        </div>
        <h4>${UI.esc(p.title)}</h4>
        <div class="muted small">课时 ${p.lessonIdx} · ${UI.esc(lsTitle)} · 停留满 30 秒自动记复习 +1</div>
        <div class="kp-body" style="margin-top:8px">${renderBody(p.body, p.highlights)}</div>
        <div id="pstat" class="muted small" style="margin-top:8px">已复习 ${rev[p.id] || 0} 次</div>`;
      pdetail.querySelector("#pback").onclick = () => openLesson({ idx: p.lessonIdx, title: lsTitle });
      dwellCancel = startDwell(30000, () => {
        rev[p.id] = (rev[p.id] || 0) + 1;
        DB.save();
        const st = pdetail.querySelector("#pstat");
        if (st) st.textContent = "已复习 " + rev[p.id] + " 次";
        UI.toast("「" + p.title + "」复习 +1");
      });
    }
  }

  /* ===== 模块入口 ===== */
  window.MODULES.politics = {
    title: "政治理论", icon: "politics",
    render(body) {
      const UI = window.UI;
      UI.StudyPanel("politics", body);

      // 知识点复习板块
      const kpCard = UI.el(`<div></div>`);
      body.appendChild(kpCard);
      renderKnowledgeDashboard(body, kpCard);

      // 按课时浏览（复习打卡 · 满30秒记1次）
      renderGroupBrowse(body);

      // 母题特训
      const mutiCard = UI.el(`<div class="card" style="margin-top:16px"></div>`);
      body.appendChild(mutiCard);
      if (window.MODULES.muti) window.MODULES.muti.renderMuti(mutiCard);
      try { body.appendChild(UI.notebook(SUBJECT, "politics_main", body)); } catch (e) {}
    }
  };
})();
