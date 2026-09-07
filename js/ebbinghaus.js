/* 艾宾浩斯遗忘曲线调度器
   intervals = [1, 2, 4, 7, 15, 30]   — 第1/2/3/...次复习间隔(天)
   每条记录：
     box: 盒子序号（0=新，1=1天后复习，2=2天后…）
     last: 上次复习日期 "YYYY-MM-DD"
     next: 下次应复习日期
     seenCount: 累计复习次数
     correctCount: 累计答对次数
     totalCount: 累计答题次数
   答对 → 升级 box（递增），更新 next
   答错 → 降级 box 到 0（重置），更新 next 为 +1d
*/
(function () {
  "use strict";
  const DB = window.DB;
  const INTERVALS = [1, 2, 4, 7, 15, 30];  // 天
  // 每天展示 10 个 知识点 / 4 个 错题复习 / 8 个 百化分
  const DAILY_QUOTAS = { politics: 10, wrong: 4, formula: 8 };

  function _ensure() {
    DB.state.eb = DB.state.eb || {};
    return DB.state.eb;
  }

  /* 从未复习过：建立记录，next = 明天 */
  function ensureRecord(group, id) {
    const eb = _ensure();
    eb[group] = eb[group] || {};
    if (!eb[group][id]) {
      eb[group][id] = { box: 0, last: null, next: DB.today(), seen: 0, correct: 0, total: 0 };
    }
    return eb[group][id];
  }

  function getRecord(group, id) {
    const eb = _ensure();
    return (eb[group] && eb[group][id]) || null;
  }

  function updateAfterReview(group, id, isCorrect) {
    const rec = ensureRecord(group, id);
    const t = DB.today();
    rec.last = t;
    rec.seen += 1;
    rec.total += 1;
    if (isCorrect) rec.correct += 1;
    // 调整 box
    let nextBox;
    if (isCorrect) {
      nextBox = Math.min(rec.box + 1, INTERVALS.length);  // 上限=数组长度（已完成全部6个阶段）
    } else {
      nextBox = 0;
    }
    rec.box = nextBox;
    // 下次复习 = 今天 + interval（如果 box>=1）
    const interval = INTERVALS[Math.max(0, nextBox - 1)];
    const d = new Date();
    d.setDate(d.getDate() + (interval || 1));
    rec.next = DB.fmtDate(d);
    DB.save();
    return rec;
  }

  // 是否到时间（next<=today）
  function isDue(group, id, today) {
    today = today || DB.today();
    const rec = getRecord(group, id);
    if (!rec) return true;        // 从未复习 → 到期
    return rec.next <= today;
  }

  // 取今日待复习的若干个（优先 due，未读过优先 seen==0 & last==null）
  function pickDaily(group, candidates, opts) {
    opts = opts || {};
    const quota = opts.quota || DAILY_QUOTAS[group] || 10;
    const today = DB.today();
    // 分类
    const dueKnown = [];     // 已看过今天到期
    const never = [];        // 从未看过
    const notDue = [];       // 已看过未到期
    candidates.forEach(c => {
      const rec = getRecord(group, c.id);
      if (!rec || rec.seen === 0) {
        if (!rec) never.push({ c, rec: null });
        else never.push({ c, rec });
      } else if (rec.next <= today) {
        dueKnown.push({ c, rec });
      } else {
        notDue.push({ c, rec });
      }
    });
    // 优先级：dueKnown > never > notDue
    const ordered = [...dueKnown, ...never, ...notDue];
    return ordered.slice(0, quota).map(o => o.c);
  }

  // 统计
  function getStats(group) {
    const eb = _ensure();
    const all = (eb[group] || {});
    const ids = Object.keys(all);
    const today = DB.today();
    const stats = {
      total: ids.length,
      seen: 0,
      due: 0,
      mastered: 0,  // box=INTERVALS.length
      intervals: INTERVALS,
      distribution: INTERVALS.map(() => 0),
      byBox: {},
      accuracy: 0,
    };
    let totalCorr = 0, totalAns = 0;
    ids.forEach(id => {
      const r = all[id];
      if (r.seen > 0) stats.seen++;
      if (r.next <= today) stats.due++;
      if (r.box === INTERVALS.length) stats.mastered++;
      if (r.box > 0) stats.distribution[r.box - 1]++;
      totalCorr += r.correct; totalAns += r.total;
      stats.byBox[r.box] = (stats.byBox[r.box] || 0) + 1;
    });
    stats.accuracy = totalAns ? Math.round(totalCorr / totalAns * 100) : 0;
    return stats;
  }

  // 重置某条记录为"新"
  function reset(group, id) {
    const eb = _ensure();
    if (eb[group] && eb[group][id]) {
      delete eb[group][id];
      DB.save();
    }
  }

  // 重置整组
  function resetGroup(group) {
    const eb = _ensure();
    if (eb[group]) {
      delete eb[group];
      DB.save();
    }
  }

  window.Ebbinghaus = { ensureRecord, getRecord, updateAfterReview, isDue, pickDaily, getStats, reset, resetGroup, INTERVALS };
})();
