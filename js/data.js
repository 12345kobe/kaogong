/* ============================================================
   考公工作台 · 统一数据层 (localStorage + 预留云端同步)
   所有模块共享一个 state 快照，便于一键同步。
   ============================================================ */
(function () {
  "use strict";

  // ★ 学科模块统一表（计时 / 刷题 / 录入答题 共用，保证一一对应）
  // 完整名用于下拉展示，短名用于 accuracyCumulative / 学习计划等存储主键
  window.KG_SUBJECTS = ["言语理解", "资料分析", "数量关系", "逻辑判断", "常识判断", "政治理论", "申论"];
  window.KG_SUBJECT_SHORT = {
    "言语理解": "言语", "资料分析": "资料", "数量关系": "数量", "逻辑判断": "逻辑",
    "常识判断": "常识", "政治理论": "政治", "申论": "申论"
  };

  // ★ 云端同步后端地址：优先读取 js/config.js 的 APP_CONFIG.SYNC_API_URL
  const SYNC_API_URL = (window.APP_CONFIG && window.APP_CONFIG.SYNC_API_URL) || "";
  // ★ GitHub 云端同步配置（数据存仓库 userdata 分支，与部署的 main 分支隔离，部署不会清空）
  const GH = (window.APP_CONFIG && window.APP_CONFIG.GH) || { owner: "12345kobe", repo: "kaogong", dataBranch: "userdata" };

  const LS_KEY = "kg_desk_state_v1";
  const LS_TOKEN = "kg_sync_token";
  const LS_USER = "kg_sync_user";

  const DEFAULT_STATE = {
    meta: { version: 1, createdAt: null },
    settings: { mode: "cumulative", dailyReset: false, timerGoalMin: 25, quizMode: "practice" },
    profile: { name: "考生" },
    countdown: {
      exams: [
        { id: "gk", name: "国考", date: "2026-11-30", color: "#34e7e4" },
        { id: "gd", name: "广东省考", date: "2026-12-06", color: "#ff5cf0" },
        { id: "sy", name: "事业编联考", date: "2027-03-15", color: "#ffd166" }
      ]
    },
    timer: { sessions: {}, subjectSessions: {} }, // sessions: { 'YYYY-MM-DD': minutes }; subjectSessions: { 'YYYY-MM-DD': { subject: minutes } }
    timerGoal: {}, // { module: minutes }
    accuracyCumulative: {}, // { subject: { correct, total } }  自使用以来各科目累计
    studyPlan: { 言语: 60, 资料: 60, 逻辑: 45, 政治: 45, 数量: 45, 常识: 30, 申论: 30 }, // 各科每日目标(分钟)
    todos: {}, // { module: [ {id,text,done,day} ] }
    formulas: { data: [], quantity: [] },
    politics: { questions: [], lastGen: null },
    mutiHistory: [], // 母题特训：每次所做题目记录 [{date, count, items:[{q,options,a,e,ua}]}]
    common: {
      questions: [],
      kpDaily: { date: null, ids: [] },  // 兼容旧字段
      kpDeck: { seed: 0, ptr: 0, round: 1 }  // 常识常用知识点：固定种子洗牌轮转，保证每批不重复
    },
    verbalDef: { seed: 0, ptr: 0, round: 1 }, // 言语 700词释义练习：轮转进度
    wrongwords: [], // 错词本：[{id, word, def, ex, group, date, reviewCount, correctStreak, note}]
    idiomReview: {}, // 700词 按组浏览复习次数：{ word: count }
    politicsReview: {}, // 政治理论 按课时浏览复习次数：{ pointId: count }
    learnedLog: {}, // 已学习历史：{ stateKey: { 'YYYY-MM-DD': [id, ...按学习先后] } }
    commonModules: { geo: [], law: [], eco: [], tech: [], pol: [] }, // 常识分模块已做题目 id（用于完成度与「每次出新题」）
    commonHistory: {}, // 常识分模块做题记录：{ mod|overall: [ {date,count,shuffle,correct,total, items:[{q,options,a,e,ua,_id,_mod,tag}]} ] }
    essay: {
      xiaoti: { done: 0, total: 0 },
      dagongwen: { done: 0, total: 0 },
      quotes: [],
      quoteDaily: { date: null, seed: 0, picks: [], done: [] }, // 申论名言：每日 11 主题各 1 句，勾选完成
      essaysEdit: {} // 范文用户编辑：{[essayIdx]: {phrases: [string,...]|null, marks: [{id, phrase, type:'hl'|'line'|'wavy', color:'red'|'yellow'|...}]}}
    },
    calendar: {}, // { 'YYYY-MM-DD': {start,end,checked} }
    checkin: { lastDate: null, dates: [] },
    quotesLib: [],
    wrongbook: {}, // { subject: [ {id, q, a, ua, date, note, img} ] }
    notes: {}, // { subject: { qid: [ {color,width,points:[{x,y}]} ] } }  手写标注笔迹
    reviews: { verbal: {} }, // { word: {box, next} }
    lastResetDay: null,
    dailyPlan: {}, // 每日计划：{ 'YYYY-MM-DD': { items: [{id,module,type,text,done,createdAt,accuracy,minutes}], note:"" } }
    taskTimer: { task: "", startTs: 0, accumulated: 0, running: false, planId: null, targetMs: 0, laps: [], subject: "" }, // 上岸计时器（跨界面持续）；targetMs>0 为倒计时专注；laps 为分段记录；subject 为所选学科（用于按学科记时长/正确率）
    customQuestions: {}, // PDF 导入的自定义题库：{ 学科短名: [ {id,q,options,a,e,date,source} ] }
    currentAffairs: [] // 时政记录：[ {id,date,title,createdAt,data:{news,essay,words,verbal,quiz}} ]
  };

  let state = null;
  let saveTimer = null;

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  function mergeDefault(base, def) {
    for (const k in def) {
      if (def[k] && typeof def[k] === "object" && !Array.isArray(def[k])) {
        base[k] = base[k] || {};
        mergeDefault(base[k], def[k]);
      } else if (!(k in base)) {
        base[k] = deepClone(def[k]);
      }
    }
    return base;
  }

  const DB = {
    SYNC_API_URL,
    state: null,

    load() {
      let raw = null;
      try { raw = localStorage.getItem(LS_KEY); } catch (e) {}
      if (raw) {
        try { state = JSON.parse(raw); } catch (e) { state = null; }
      }
      if (!state) {
        state = deepClone(DEFAULT_STATE);
        state.meta.createdAt = Date.now();
      }
      mergeDefault(state, DEFAULT_STATE);
      this.state = state;

      // 迁移：官方考试日期（仅当该考试日期为空时填充，不覆盖用户已设日期）
      let migrated = false;
      const EXAM_DATES = { gk: "2026-11-30", gd: "2026-12-06", sy: "2027-03-15" };
      if (state.countdown && state.countdown.exams) {
        state.countdown.exams.forEach(ex => {
          if (EXAM_DATES[ex.id] && !ex.date) { ex.date = EXAM_DATES[ex.id]; migrated = true; }
        });
      }
      if (migrated) this.save(true);

      this.dailyResetIfNeeded();

      // 自检：累计答题数若被异常放大（历史「求和合并」导致的翻倍残留），自动清零并提示
      const bad = this.absurdCounts();
      if (bad.length) {
        bad.forEach(s => { state.accuracyCumulative[s] = { correct: 0, total: 0 }; });
        this.save(true);
        setTimeout(() => {
          try { window.UI && window.UI.toast("已修复「" + bad.join("、") + "」异常放大的答题数（历史翻倍导致），已清零重新累计"); } catch (e) {}
        }, 1200);
      }
      return state;
    },

    /* ===== 累计答题数：异常检测 / 重置 =====
       早期版本对 accuracyCumulative 做「求和」合并，配合自动同步会指数翻倍
       （100→200→400→800…），可涨到几百万。现已改为取大（不再增长），
       但已被污染的历史数值需要显式重置才能恢复。 */
    ABSURD_COUNT: 200000,
    absurdCounts() {
      const ac = (state && state.accuracyCumulative) || {};
      const bad = [];
      for (const s in ac) {
        const c = ac[s] || {};
        if ((c.total || 0) > this.ABSURD_COUNT || (c.correct || 0) > this.ABSURD_COUNT) bad.push(s);
      }
      return bad;
    },
    resetAccuracy(subjects) {
      const ac = state.accuracyCumulative = state.accuracyCumulative || {};
      const list = (subjects && subjects.length) ? subjects : Object.keys(ac);
      list.forEach(s => { ac[s] = { correct: 0, total: 0 }; });
      this.save(true);
      return list;
    },

    _localSave() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} },
    save(immediate) {
      if (immediate) {
        this._localSave();
        if (this.isLoggedIn() && this._cloudReady) this._schedulePush();
      } else {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => this.save(true), 400);
      }
    },

    uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
    today() { return this.fmtDate(new Date()); },
    fmtDate(d) {
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    },
    fmtTime(d) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); },

    /* 路径读写： get('timer.sessions'), set('profile.name', 'x') */
    get(path) {
      return path.split(".").reduce((o, k) => (o == null ? o : o[k]), state);
    },
    set(path, val) {
      const ks = path.split(".");
      let o = state;
      for (let i = 0; i < ks.length - 1; i++) {
        if (o[ks[i]] == null || typeof o[ks[i]] !== "object") o[ks[i]] = {};
        o = o[ks[i]];
      }
      o[ks[ks.length - 1]] = val;
      this.save();
    },

    /* 每日重置 / 累计模式 */
    dailyResetIfNeeded() {
      const t = this.today();
      if (state.lastResetDay === t) return;
      const prev = state.lastResetDay;
      state.lastResetDay = t;
      if (state.settings.mode === "daily" && prev) {
        // 清空当日待办完成状态（重新来过）；保留历史计时/错题/打卡
        for (const m in state.todos) {
          state.todos[m] = state.todos[m].map(t => ({ ...t, done: false }));
        }
      }
      this.save(true);
    },

    /* 上岸计时器：累加当日专注分钟 */
    addTimerMinutes(module, minutes) {
      const t = this.today();
      state.timer.sessions[t] = (state.timer.sessions[t] || 0) + minutes;
      this.save();
    },
    getTodayMinutes() {
      return state.timer.sessions[this.today()] || 0;
    },

    /* 按科目累加当日学习分钟（用于学习计划进度统计） */
    addSubjectSession(subject, minutes) {
      const t = this.today();
      state.timer.subjectSessions[t] = state.timer.subjectSessions[t] || {};
      state.timer.subjectSessions[t][subject] = (state.timer.subjectSessions[t][subject] || 0) + minutes;
      this.save();
    },

    /* 学科名 → 短名（与学习统计 accuracyCumulative 主键一致） */
    subjectShort(name) {
      return (window.KG_SUBJECT_SHORT && window.KG_SUBJECT_SHORT[name]) || name || "";
    },
    /* 短名 → 完整名（用于判断是否是已知学科） */
    fullSubject(short) {
      if (!window.KG_SUBJECT_SHORT) return short || "";
      for (const k in window.KG_SUBJECT_SHORT) if (window.KG_SUBJECT_SHORT[k] === short) return k;
      return short || "";
    },

    /* 集中写入某学科累计正确率 + 正确率趋势（刷题模式 / 手动录入答题 共用，保证一一对应） */
    recordAccuracy(subject, correct, total) {
      subject = this.subjectShort(subject);
      correct = Math.max(0, +correct || 0);
      total = Math.max(0, +total || 0);
      const ac = state.accuracyCumulative = state.accuracyCumulative || {};
      ac[subject] = ac[subject] || { correct: 0, total: 0 };
      ac[subject].correct += correct;
      ac[subject].total += total;
      state.accuracy = state.accuracy || [];
      state.accuracy.push({ date: this.today(), subject: subject, pct: total ? Math.round(correct / total * 100) : 0 });
      if (state.accuracy.length > 500) state.accuracy = state.accuracy.slice(-500);
      this.save();
    },

    /* ===== 每日计划 ===== */
    getPlan(date) {
      date = date || this.today();
      state.dailyPlan[date] = state.dailyPlan[date] || { items: [], note: "" };
      return state.dailyPlan[date];
    },
    addPlanItem(date, item) {
      date = date || this.today();
      const plan = this.getPlan(date);
      item.id = item.id || this.uid();
      item.done = false; item.createdAt = item.createdAt || Date.now();
      plan.items.push(item);
      this.save();
      return item;
    },
    togglePlanItem(date, id) {
      date = date || this.today();
      const plan = this.getPlan(date);
      const it = plan.items.find(x => x.id === id);
      if (!it) return;
      it.done = !it.done;
      // 积累类完成 → 注册艾宾浩斯复习
      if (it.type === "accumulate" && it.done && window.Ebbinghaus) {
        window.Ebbinghaus.ensureRecord("planAccumulate", it.id);
      }
      this.save();
      return it;
    },
    setPlanNote(date, note) {
      date = date || this.today();
      this.getPlan(date).note = note;
      this.save();
    },
    /* 刷题 / 闪卡 自动记录进当日计划 */
    autoPlanRecord(type, module, meta) {
      try {
        const label = { quiz: "刷题", flash: "闪卡" }[type] || type;
        const text = meta && meta.text ? meta.text : (label + (module ? "·" + module : ""));
        this.addPlanItem(this.today(), { module: module || "", type: type, text: text, meta: meta || null });
      } catch (e) {}
    },

    /* ===== 上岸计时器 ===== */
    timerState() { return state.taskTimer; },
    timerStart(task, planId, targetMs, subject) {
      const tt = state.taskTimer;
      tt.task = task || tt.task || "专注学习";
      tt.planId = (planId === undefined ? tt.planId : planId) || null;
      tt.targetMs = targetMs || 0;
      tt.subject = (subject != null && subject !== "") ? this.subjectShort(subject) : (tt.subject || "");
      tt.laps = []; // 重新开始，清空分段
      if (tt.running) return tt;
      tt.startTs = Date.now();
      tt.running = true;
      this.save();
      return tt;
    },
    timerRemainingMs() {
      const tt = state.taskTimer;
      if (!tt.targetMs || tt.targetMs <= 0) return 0;
      return Math.max(0, tt.targetMs - this.timerElapsedMs());
    },
    timerLap() {
      // 记录当前 elapsed 与已有 laps 总和的差为新段；只有 running 时才有效
      const tt = state.taskTimer;
      if (!tt.running) return null;
      const total = this.timerElapsedMs();
      const used = (tt.laps || []).reduce((a, b) => a + (b || 0), 0);
      const dur = Math.max(0, total - used);
      tt.laps = tt.laps || [];
      tt.laps.push(dur);
      this.save();
      return tt.laps.slice();
    },
    timerPause() {
      const tt = state.taskTimer;
      if (tt.running) {
        tt.accumulated += Date.now() - tt.startTs;
        tt.running = false;
        this.save();
      }
      return tt;
    },
    timerStop() {
      const tt = state.taskTimer;
      if (tt.running) { tt.accumulated += Date.now() - tt.startTs; tt.running = false; }
      // 在清空前追加最后一段（如果当前 elapsed > 已有 laps 总和）
      const total = tt.accumulated;
      const used = (tt.laps || []).reduce((a, b) => a + (b || 0), 0);
      if (total > used) {
        tt.laps = tt.laps || [];
        tt.laps.push(total - used);
      }
      const sec = Math.floor(tt.accumulated / 1000);
      tt.accumulated = 0; tt.startTs = 0; tt.task = ""; tt.planId = null; tt.targetMs = 0; tt.laps = [];
      this.save();
      return sec;
    },
    timerElapsedMs() {
      const tt = state.taskTimer;
      let ms = tt.accumulated || 0;
      if (tt.running) ms += Date.now() - tt.startTs;
      return ms;
    },
    /* 统一结算：停止计时 + 记当日专注分钟 + 标记绑定计划项完成。返回 {sec, mins, planId}
       上岸计时器与刷题模式共用，避免重复逻辑。有选学科时按学科记专注时长（供学习统计/学习计划）。 */
    timerSettle(label) {
      label = label || "计时器";
      const tt = state.taskTimer;
      const planId = tt.planId, targetMs = tt.targetMs, subject = tt.subject;
      const sec = this.timerStop();
      const mins = targetMs && targetMs > 0 ? Math.max(1, Math.round(targetMs / 60000)) : Math.max(1, Math.round(sec / 60));
      const mod = (subject && subject !== "") ? subject : label;
      this.addTimerMinutes(mod, mins);
      if (subject && subject !== "" && window.KG_SUBJECTS && window.KG_SUBJECTS.indexOf(this.fullSubject(subject)) >= 0) {
        this.addSubjectSession(subject, mins);
      }
      if (planId) {
        const plan = this.getPlan(this.today());
        const it = plan.items.find(x => x.id === planId);
        if (it) { it.minutes = (it.minutes || 0) + mins; it.done = true; this.save(); }
      }
      return { sec: sec, mins: mins, planId: planId, subject: subject };
    },
    timerReset() {
      const tt = state.taskTimer;
      tt.accumulated = 0; tt.startTs = 0; tt.running = false; tt.task = ""; tt.planId = null; tt.laps = [];
      this.save();
    },
    getTodaySubjectMinutes(subject) {
      const t = this.today();
      return (state.timer.subjectSessions[t] && state.timer.subjectSessions[t][subject]) || 0;
    },

    /* ===== 云端同步（基于 GitHub：账号 = 用户名 + 个人访问令牌，数据存仓库 userdata 分支） =====
       这样无需自建后端：换设备 / 换链接都不丢、数据持续累积；登录一次后令牌存本机，一直保持登录。 */
    syncEnabled() { return this.isLoggedIn(); },
    isLoggedIn() { return !!(localStorage.getItem(LS_TOKEN)); },
    currentUser() { return localStorage.getItem(LS_USER) || ""; },

    _b64enc(str) {
      const bytes = new TextEncoder().encode(str);
      let bin = ""; const CH = 0x8000;
      for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
      return btoa(bin);
    },
    _b64dec(b64) {
      const bin = atob((b64 || "").replace(/\s/g, ""));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    },
    async _gh(path, opts) {
      const token = (opts && opts.token) || localStorage.getItem(LS_TOKEN);
      const headers = { "Accept": "application/vnd.github+json" };
      if (token) headers["Authorization"] = "Bearer " + token;
      if (opts && opts.body) headers["Content-Type"] = "application/json";
      const res = await fetch("https://api.github.com" + path, { method: (opts && opts.method) || "GET", headers, body: opts && opts.body });
      if (res.status === 404) { const e = new Error("404"); e.notFound = true; throw e; }
      if (!res.ok) { let m = "HTTP " + res.status; try { const d = await res.json(); m = d.message || m; } catch (_) {} throw new Error(m); }
      if (res.status === 204) return null;
      return res.json();
    },
    _userPath() { return "data/" + (this.currentUser() || "user") + ".json"; },

    _hasMeaningfulData(s) {
      s = s || state;
      return !!(Object.keys(s.learnedLog || {}).length ||
        (s.checkin && s.checkin.dates && s.checkin.dates.length) ||
        (s.wrongwords && s.wrongwords.length) ||
        (s.commonHistory && Object.keys(s.commonHistory).length) ||
        (s.mutiHistory && s.mutiHistory.length) ||
        (s.wrongbook && Object.keys(s.wrongbook).length) ||
        (s.todos && Object.keys(s.todos).length));
    },
    /* ===== 累积合并：把两份数据「并集 / 求和 / 取大」地合在一起，绝不覆盖已有历史 ===== */
    mergeStates(a, b) {
      if (!a) return JSON.parse(JSON.stringify(b || {}));
      if (!b) return a;
      const out = JSON.parse(JSON.stringify(a));
      const S = (x) => (x == null ? "" : String(x));

      // 已学习历史 { key: { 'YYYY-MM-DD': [id...] } } → 按天取并集
      const ll = b.learnedLog || {};
      out.learnedLog = out.learnedLog || {};
      for (const k in ll) {
        out.learnedLog[k] = out.learnedLog[k] || {};
        for (const d in (ll[k] || {})) {
          out.learnedLog[k][d] = Array.from(new Set([...(out.learnedLog[k][d] || []), ...((ll[k] || {})[d] || [])]));
        }
      }

      // 专注计时：按天取大（不会把多的那份改小）
      out.timer = out.timer || {};
      const ts = (b.timer && b.timer.sessions) || {};
      out.timer.sessions = out.timer.sessions || {};
      for (const d in ts) out.timer.sessions[d] = Math.max(out.timer.sessions[d] || 0, ts[d] || 0);
      const ss = (b.timer && b.timer.subjectSessions) || {};
      out.timer.subjectSessions = out.timer.subjectSessions || {};
      for (const d in ss) {
        out.timer.subjectSessions[d] = out.timer.subjectSessions[d] || {};
        for (const s in (ss[d] || {})) {
          out.timer.subjectSessions[d][s] = Math.max(out.timer.subjectSessions[d][s] || 0, ss[d][s] || 0);
        }
      }

      // 累计正确率 / 累计答题数：取较大值（**不累加**）
      //   导入的数据更多 → 取导入的；导入的更少 → 维持本机不变
      //   但若 b 端数值异常放大（历史「求和合并」翻倍残留，可达数百万），
      //   则忽略 b 端、沿用本地值 —— 防止被污染的云端数据在自动拉取时反复污染本机
      const ac = b.accuracyCumulative || {};
      out.accuracyCumulative = out.accuracyCumulative || {};
      for (const s in ac) {
        out.accuracyCumulative[s] = out.accuracyCumulative[s] || { correct: 0, total: 0 };
        const bTotal = (ac[s] && ac[s].total) || 0, bCorrect = (ac[s] && ac[s].correct) || 0;
        if (bTotal > this.ABSURD_COUNT || bCorrect > this.ABSURD_COUNT) continue; // 污染值，跳过
        out.accuracyCumulative[s].correct = Math.max(out.accuracyCumulative[s].correct || 0, bCorrect);
        out.accuracyCumulative[s].total = Math.max(out.accuracyCumulative[s].total || 0, bTotal);
      }

      // 错词 / 错题本：按 id 去重追加
      function mergeArrById(cur, inc) {
        const arr = cur || [];
        const have = new Set(arr.map(x => S(x && x.id)));
        (inc || []).forEach(x => { const id = S(x && x.id); if (!id || !have.has(id)) { arr.push(x); if (id) have.add(id); } });
        return arr;
      }
      out.wrongwords = mergeArrById(out.wrongwords, b.wrongwords);
      const wb = b.wrongbook || {};
      out.wrongbook = out.wrongbook || {};
      for (const s in wb) out.wrongbook[s] = mergeArrById(out.wrongbook[s], wb[s]);

      // 做题历史：按「日期 + 题量」去重追加
      function mergeHist(cur, inc) {
        const arr = cur || [];
        const sig = (r) => S(r && r.date) + "|" + S(r && r.count) + "|" + ((r && r.items) ? r.items.length : "");
        const have = new Set(arr.map(sig));
        (inc || []).forEach(r => { if (!have.has(sig(r))) { arr.push(r); have.add(sig(r)); } });
        return arr;
      }
      out.mutiHistory = mergeHist(out.mutiHistory, b.mutiHistory);
      const ch = b.commonHistory || {};
      out.commonHistory = out.commonHistory || {};
      for (const m in ch) out.commonHistory[m] = mergeHist(out.commonHistory[m], ch[m]);

      // 打卡日期：并集
      out.checkin = out.checkin || {};
      out.checkin.dates = Array.from(new Set([...(out.checkin.dates || []), ...((b.checkin && b.checkin.dates) || [])]));

      // 日历：起止取已有值，打卡状态取「或」
      const cal = b.calendar || {};
      out.calendar = out.calendar || {};
      for (const d in cal) {
        const A = out.calendar[d] || {}, B = cal[d] || {};
        out.calendar[d] = {
          start: A.start != null ? A.start : B.start,
          end: A.end != null ? A.end : B.end,
          checked: !!(A.checked || B.checked)
        };
      }

      // 浏览复习次数：取大
      function mergeMax(cur, inc) { const o = cur || {}; for (const k in (inc || {})) o[k] = Math.max(o[k] || 0, inc[k] || 0); return o; }
      out.idiomReview = mergeMax(out.idiomReview, b.idiomReview);
      out.politicsReview = mergeMax(out.politicsReview, b.politicsReview);

      // 轮转进度（种子 / 游标 / 轮次）：取轮次更靠后的一份
      function mergeProgress(cur, inc, keys) {
        const A = cur || {}, B = inc || {};
        const pick = ((B.round || 0) > (A.round || 0)) ? B : A;
        const o = {};
        keys.forEach(k => { o[k] = pick[k] != null ? pick[k] : (A[k] != null ? A[k] : B[k]); });
        return o;
      }
      out.verbalDef = mergeProgress(out.verbalDef, b.verbalDef, ["seed", "ptr", "round"]);
      out.common = out.common || {};
      out.common.kpDeck = mergeProgress(out.common.kpDeck, (b.common || {}).kpDeck, ["seed", "ptr", "round"]);

      // 常识分模块已做 id：并集
      const cm = b.commonModules || {};
      out.commonModules = out.commonModules || {};
      for (const m in cm) out.commonModules[m] = Array.from(new Set([...(out.commonModules[m] || []), ...(cm[m] || [])]));

      // 金句 / 政治题库：按文本去重追加
      function mergeByField(cur, inc, field) {
        const arr = cur || [];
        const have = new Set(arr.map(x => S(x && x[field])));
        (inc || []).forEach(x => { const sig = S(x && x[field]); if (!sig || !have.has(sig)) { arr.push(x); if (sig) have.add(sig); } });
        return arr;
      }
      out.essay = out.essay || {};
      out.essay.quotes = mergeByField(out.essay.quotes, (b.essay || {}).quotes, "t");
      out.quotesLib = mergeByField(out.quotesLib, b.quotesLib, "t");
      out.politics = out.politics || {};
      out.politics.questions = mergeByField(out.politics.questions, (b.politics || {}).questions, "q");

      // 时政记录：按 id 去重追加（云端同步 / 备份导入都不丢）
      out.currentAffairs = mergeArrById(out.currentAffairs, b.currentAffairs);

      // 范文用户标记 / 自编辑好词好句：phrases 本地非空优先；marks 按 phrase+type+color 合并去重
      out.essay.essaysEdit = out.essay.essaysEdit || {};
      const eeIn = (b.essay && b.essay.essaysEdit) || {};
      function mergeMarks(ca, cb) {
        const out = (ca || []).slice();
        const seen = new Set(out.map(m => (m.phrase||"") + "|" + (m.type||"") + "|" + (m.color||"") + "|" + (m.nth||0)));
        (cb || []).forEach(m => {
          const sig = (m.phrase || "") + "|" + (m.type || "") + "|" + (m.color || "") + "|" + (m.nth||0);
          if (!seen.has(sig) && m.phrase) { out.push(m); seen.add(sig); }
        });
        return out;
      }
      for (const k in eeIn) {
        const cur = out.essay.essaysEdit[k] || { phrases: null, marks: [], origin: {} };
        const inc = eeIn[k] || { phrases: null, marks: [], origin: {} };
        const phrases = (cur.phrases != null && cur.phrases.length) ? cur.phrases
                       : ((inc.phrases != null && inc.phrases.length) ? inc.phrases : cur.phrases);
        // 原文标记改动：本地非空优先，缺失项用传入补齐
        const origin = Object.assign({}, inc.origin || {}, cur.origin || {});
        out.essay.essaysEdit[k] = { phrases: phrases, marks: mergeMarks(cur.marks, inc.marks), origin: origin };
      }

      // 其余字段：本地已有内容优先，缺失的才用传入数据补齐
      function fill(cur, inc) {
        for (const k in (inc || {})) {
          if (inc[k] && typeof inc[k] === "object" && !Array.isArray(inc[k])) { cur[k] = cur[k] || {}; fill(cur[k], inc[k]); }
          else if (cur[k] == null || cur[k] === "" || (Array.isArray(cur[k]) && !cur[k].length)) cur[k] = inc[k];
        }
      }
      fill(out, b);
      return out;
    },

    /* ===== 自动同步：定时拉取 + 切回页面 / 获得焦点时立即拉取（保存时自动上传已在 save() 中） ===== */
    startAutoSync(intervalMs) {
      this.stopAutoSync();
      const ms = intervalMs || 60000;
      this._autoTimer = setInterval(() => this._schedulePull(), ms);
      const onWake = () => { if (document.visibilityState === "visible") this._schedulePull(); };
      document.addEventListener("visibilitychange", onWake);
      window.addEventListener("focus", onWake);
      this._onWake = onWake;
    },
    stopAutoSync() {
      if (this._autoTimer) { clearInterval(this._autoTimer); this._autoTimer = null; }
      if (this._onWake) {
        document.removeEventListener("visibilitychange", this._onWake);
        window.removeEventListener("focus", this._onWake);
        this._onWake = null;
      }
    },
    _schedulePull() {
      if (!this.isLoggedIn() || !this._cloudReady || this._pulling || this._syncing) return;
      this._pulling = true;
      this.pull()
        .then(() => { if (window.__refreshTop) window.__refreshTop(); })
        .catch(() => {})
        .then(() => { this._pulling = false; });
    },
    async login(username, token) {
      const u = (username || "").trim(), t = (token || "").trim();
      if (!u || !t) throw new Error("请填写用户名和令牌");
      await this._gh("/user", { token: t });                                   // 校验令牌是否有效
      const safe = u.replace(/[^A-Za-z0-9_一-龥\-]/g, "_").slice(0, 40);
      const localSnapshot = JSON.parse(JSON.stringify(state));                 // 登录前先备份本机数据
      const localHasData = this._hasMeaningfulData(localSnapshot);
      localStorage.setItem(LS_TOKEN, t);
      localStorage.setItem(LS_USER, safe);
      DB._token = t;
      let cloudEmpty = false;
      try { await this.pull(); } catch (e) { cloudEmpty = !!(e && e.notFound); }
      if (cloudEmpty && localHasData) {
        // 云端尚为空：把本机已有学习数据上传，避免首次登录丢数据
        state = localSnapshot; this._localSave();
        try { await this.push(); } catch (e) { console.warn("首次上传本机数据失败", e); }
      } else if (!cloudEmpty && localHasData) {
        // 云端已有数据：pull 已把两边累积合并，回推一次，让云端也拿到本机历史
        try { await this.push(); } catch (e) { console.warn("上传本机历史数据失败", e); }
      }
      this._cloudReady = true;
      return { username: safe };
    },
    logout() {
      localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_USER); DB._token = null; this._cloudReady = false;
    },
    async pull() {
      if (!this.isLoggedIn()) return;
      try {
        const r = await this._gh(`/repos/${GH.owner}/${GH.repo}/contents/${this._userPath()}?ref=${GH.dataBranch}`);
        const data = mergeDefault(JSON.parse(this._b64dec(r.content)), DEFAULT_STATE);
        // 与本机「累积合并」：本机尚未上传的历史不会被云端覆盖
        state = this.mergeStates(state, data);
        this.state = state;
        this._localSave();
      } catch (e) { if (!e.notFound) console.warn("云端拉取失败", e); }
    },
    async push() {
      if (!this.isLoggedIn()) return;
      const path = this._userPath();
      const content = this._b64enc(JSON.stringify(state));
      let sha = null;
      try { const r = await this._gh(`/repos/${GH.owner}/${GH.repo}/contents/${path}?ref=${GH.dataBranch}`); sha = r.sha; } catch (e) {}
      try {
        await this._gh(`/repos/${GH.owner}/${GH.repo}/contents/${path}`, {
          method: "PUT",
          body: JSON.stringify({ message: "sync " + this.today(), content, branch: GH.dataBranch, sha: sha || undefined })
        });
      } catch (e) {
        const msg = (e && e.message) || "";
        if (/Branch .* not found/i.test(msg) || /Not Found/i.test(msg)) {
          // userdata 分支尚不存在：基于 main 创建后重试一次
          try {
            const mainRef = await this._gh(`/repos/${GH.owner}/${GH.repo}/git/refs/heads/main`);
            await this._gh(`/repos/${GH.owner}/${GH.repo}/git/refs`, { method: "POST",
              body: JSON.stringify({ ref: "refs/heads/" + GH.dataBranch, sha: mainRef.object.sha }) });
          } catch (e2) { console.warn("创建云端分支失败", e2); }
          await this._gh(`/repos/${GH.owner}/${GH.repo}/contents/${path}`, {
            method: "PUT",
            body: JSON.stringify({ message: "sync " + this.today(), content, branch: GH.dataBranch, sha: sha || undefined })
          });
        } else throw e;
      }
    },
    _schedulePush() {
      if (!this.isLoggedIn() || !this._cloudReady) return;
      if (this._syncing) { this._syncPending = true; return; }
      this._syncing = true;
      this.push().catch(e => console.warn("云端同步失败", e)).then(() => {
        this._syncing = false;
        if (this._syncPending) { this._syncPending = false; this._schedulePush(); }
      });
    }
  };
  DB._token = localStorage.getItem(LS_TOKEN) || null;
  DB._cloudReady = false;
  DB._syncing = false;
  DB._syncPending = false;

  window.DB = DB;
})();
