/* 考试模式（国考 / 省考）+ 限时刷题折算 + 复盘计时
   —— 各模块配速来自「参考题量 / 参考用时」，系统据此折算任意题数应给的时限。 */
(function () {
  "use strict";

  /* 参考配速：refCount 题 用 refMin 分钟 → 每题 refMin/refCount 分钟
     省考（默认）：言语15/15、资料20/25、判断25/25、政治10/5、常识5/3、数量15/20
     国考：常识20/10、言语40/35、判断40/35、资料20/25、数量15/15、政治20/10 */
  const MODES = {
    shengkao: {
      label: "省考", tag: "省考模式",
      subjects: {
        政治理论: { refCount: 10, refMin: 5 },
        常识判断: { refCount: 5, refMin: 3 },
        言语理解: { refCount: 15, refMin: 15 },
        数量关系: { refCount: 15, refMin: 20 },
        判断推理: { refCount: 25, refMin: 25 },
        资料分析: { refCount: 20, refMin: 25 }
      }
    },
    guokao: {
      label: "国考", tag: "国考模式",
      subjects: {
        政治理论: { refCount: 20, refMin: 10 },
        常识判断: { refCount: 20, refMin: 10 },
        言语理解: { refCount: 40, refMin: 35 },
        数量关系: { refCount: 15, refMin: 15 },
        判断推理: { refCount: 40, refMin: 35 },
        资料分析: { refCount: 20, refMin: 25 }
      }
    }
  };
  const ORDER = ["政治理论", "常识判断", "言语理解", "数量关系", "判断推理", "资料分析"];

  function DB() { return window.DB; }

  function mode() {
    const d = DB();
    const m = d && d.state && d.state.examMode;
    return (m === "guokao" || m === "shengkao") ? m : "shengkao"; // 默认省考
  }
  function setMode(m) {
    const d = DB(); if (!d) return;
    d.state.examMode = (m === "guokao") ? "guokao" : "shengkao";
    try { d.save(); } catch (e) {}
  }
  function toggleMode() { const n = mode() === "shengkao" ? "guokao" : "shengkao"; setMode(n); return n; }
  function cfg(subj) { const M = MODES[mode()]; return M.subjects[subj] || null; }
  /* 该模块每题分钟数（由参考题量/用时折算） */
  function perMin(subj) { const c = cfg(subj); return c ? (c.refMin / c.refCount) : 0; }
  /* 该模块参考配速文案，如「15 题 / 15 分钟（1.0 分/题）」 */
  function paceText(subj) {
    const c = cfg(subj); if (!c) return "";
    return c.refCount + " 题 / " + c.refMin + " 分钟（" + fmtMin(perMin(subj)) + "/题）";
  }
  function fmtMin(v) {
    if (!v) return "0";
    const m = Math.floor(v), s = Math.round((v - m) * 60);
    if (s === 60) return (m + 1) + " 分";
    return m > 0 ? (m + " 分" + (s ? s + " 秒" : "")) : (s + " 秒");
  }
  /* 折算：刷 n 道题建议给的时限（毫秒） */
  function suggestMs(subj, n) {
    const pm = perMin(subj); if (!pm || !n || n <= 0) return 0;
    return Math.round(pm * n * 60000);
  }
  function suggestMin(subj, n) { const ms = suggestMs(subj, n); return ms ? Math.round(ms / 60000 * 10) / 10 : 0; }
  function subjects() {
    const M = MODES[mode()];
    return ORDER.filter(s => M.subjects[s]);
  }
  function label() { return MODES[mode()].label; }

  /* ===== 限时刷题：按题数折算时限后直接启动倒计时 ===== */
  function startQuiz(subj, count, minOverride) {
    const d = DB(); if (!d || !subj) return null;
    const n = parseInt(count, 10) || 0;
    if (n <= 0) { if (window.UI) UI.toast("请先填写题目数量"); return null; }
    const mins = (minOverride && minOverride > 0) ? minOverride : Math.max(1, Math.round(suggestMin(subj, n)));
    const targetMs = Math.round(mins * 60000);
    const shortSubj = d.subjectShort ? d.subjectShort(subj) : subj;
    const task = subj + " " + n + " 题（限时 " + mins + " 分钟）";
    d.state.examQuiz = { subject: subj, subjectShort: shortSubj, count: n, mins: mins, mode: mode(), at: Date.now() };
    // 计入今日计划：新建一条专注项
    let planId = null;
    try {
      const it = d.addPlanItem(d.today(), { module: shortSubj || "计时器", type: "focus", text: task, minutes: mins });
      planId = it && it.id;
    } catch (e) {}
    d.timerStart(task, planId, targetMs, shortSubj);
    const tt = d.timerState(); tt.review = false;
    try { d.save(); } catch (e) {}
    return { mins: mins, targetMs: targetMs, task: task };
  }

  /* ===== 复盘：正向计时（不限时），时长计入今日专注，可写备注 ===== */
  function startReview(subj, note) {
    const d = DB(); if (!d || !subj) return null;
    const shortSubj = d.subjectShort ? d.subjectShort(subj) : subj;
    const task = "📝 " + subj + "复盘" + (note ? " · " + note : "");
    let planId = null;
    try {
      const it = d.addPlanItem(d.today(), { module: shortSubj || "计时器", type: "focus", text: task, minutes: 0 });
      planId = it && it.id;
    } catch (e) {}
    d.timerStart(task, planId, 0, shortSubj); // targetMs=0 → 正序累计
    const tt = d.timerState(); tt.review = true;
    try { d.save(); } catch (e) {}
    return { task: task };
  }
  /* 复盘结束时把时长单独记一笔（同时 timerSettle 已计入今日专注） */
  function logReview(subjectShort, mins) {
    const d = DB(); if (!d || !subjectShort || !mins) return;
    const t = d.today();
    d.state.timer = d.state.timer || {};
    d.state.timer.reviewSessions = d.state.timer.reviewSessions || {};
    d.state.timer.reviewSessions[t] = d.state.timer.reviewSessions[t] || {};
    d.state.timer.reviewSessions[t][subjectShort] = (d.state.timer.reviewSessions[t][subjectShort] || 0) + mins;
    try { d.save(); } catch (e) {}
  }
  function todayReviewMin(subjectShort) {
    const d = DB(); if (!d) return 0;
    const t = d.today();
    const m = d.state.timer && d.state.timer.reviewSessions && d.state.timer.reviewSessions[t];
    return m ? (m[subjectShort] || 0) : 0;
  }

  /* ===== 结束反馈：设备震动（iOS 不支持则退回提示音）+ 弹窗 ===== */
  function buzz() {
    let ok = false;
    try { if (navigator.vibrate) { navigator.vibrate([320, 160, 320, 160, 700]); ok = true; } } catch (e) {}
    beep();
    return ok;
  }
  function beep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ac = new AC(), o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.value = 880;
      o.connect(g); g.connect(ac.destination);
      const t = ac.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      o.start(t); o.stop(t + 0.7);
      setTimeout(() => { try { ac.close(); } catch (e) {} }, 1000);
    } catch (e) {}
  }

  let monIv = null, handling = false;
  function check() {
    if (handling) return;
    const d = DB(); if (!d || !d.timerState) return;
    const tt = d.timerState();
    if (!tt || !tt.running || !tt.targetMs || tt.targetMs <= 0) return;
    if (d.timerElapsedMs() >= tt.targetMs) onCountdownEnd();
  }
  function onCountdownEnd() {
    handling = true;
    const d = DB(), UI = window.UI;
    const tt = d.timerState();
    const plannedMin = Math.round(tt.targetMs / 60000);
    const subjectShort = tt.subject || "";
    const q = (d.state && d.state.examQuiz) || null;
    const count = q && q.subjectShort === subjectShort ? q.count : 0;
    // 先暂停并把 targetMs 归零，避免其它页面的监控重复结算
    try { d.timerPause(); } catch (e) {}
    tt.targetMs = 0;
    try { d.save(); } catch (e) {}
    const vibrated = buzz();
    const usedSec = Math.floor(d.timerElapsedMs() / 1000);
    const usedTxt = Math.floor(usedSec / 60) + " 分 " + (usedSec % 60) + " 秒";
    const fullSubj = d.fullSubject ? d.fullSubject(subjectShort) : subjectShort;
    const body =
      '<div style="font-size:15px;line-height:1.7">' +
      '<div>科目：<b>' + esc(fullSubj || "—") + '</b></div>' +
      (count ? '<div>题量：<b>' + count + ' 题</b>（' + esc(label()) + '配速 ' + esc(paceText(fullSubj)) + '）</div>' : '') +
      '<div>计划时限：<b>' + plannedMin + ' 分钟</b></div>' +
      '<div>实际用时：<b>' + usedTxt + '</b></div>' +
      '<div class="muted small" style="margin-top:10px">' + (vibrated ? '已触发设备震动提醒。' : '（当前设备/浏览器不支持网页震动，已用提示音代替）') + '</div>' +
      '</div>';
    if (UI && UI.modal) {
      UI.modal({
        title: "⏰ 时间到！", body: body, width: "360px",
        actions: [{
          label: "完成并结算", cls: "primary",
          onClick: (m, close) => {
            const r = d.timerSettle(fullSubj || "计时器");
            close(); handling = false;
            UI.toast("✅ 已结算：专注 " + r.mins + " 分钟，计入「" + (fullSubj || "总") + "」今日专注");
            try { window.__updateTopTimer && window.__updateTopTimer(); } catch (e) {}
            try { if (location.hash === "#/timer") { location.hash = "#/countdown"; setTimeout(() => { location.hash = "#/timer"; }, 30); } } catch (e) {}
          }
        }]
      });
    } else {
      handling = false;
    }
  }
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function startMonitor() {
    if (monIv) return;
    monIv = setInterval(check, 500);
  }

  window.KGExam = {
    MODES: MODES, ORDER: ORDER,
    mode: mode, setMode: setMode, toggleMode: toggleMode, label: label,
    cfg: cfg, perMin: perMin, paceText: paceText, suggestMs: suggestMs, suggestMin: suggestMin,
    subjects: subjects, fmtMin: fmtMin,
    startQuiz: startQuiz, startReview: startReview, logReview: logReview, todayReviewMin: todayReviewMin,
    buzz: buzz, startMonitor: startMonitor, onCountdownEnd: onCountdownEnd
  };

  setTimeout(startMonitor, 800);
})();
