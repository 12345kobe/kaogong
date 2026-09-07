/* ============================================================
   考公工作台 · 统一数据层 (localStorage + 预留云端同步)
   所有模块共享一个 state 快照，便于一键同步。
   ============================================================ */
(function () {
  "use strict";

  // ★ 云端同步后端地址：优先读取 js/config.js 的 APP_CONFIG.SYNC_API_URL
  const SYNC_API_URL = (window.APP_CONFIG && window.APP_CONFIG.SYNC_API_URL) || "";

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
      quoteDaily: { date: null, seed: 0, picks: [], done: [] } // 申论名言：每日 11 主题各 1 句，勾选完成
    },
    calendar: {}, // { 'YYYY-MM-DD': {start,end,checked} }
    checkin: { lastDate: null, dates: [] },
    quotesLib: [],
    wrongbook: {}, // { subject: [ {id, q, a, ua, date, note, img} ] }
    notes: {}, // { subject: { qid: [ {color,width,points:[{x,y}]} ] } }  手写标注笔迹
    reviews: { verbal: {} }, // { word: {box, next} }
    lastResetDay: null
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
      return state;
    },

    save(immediate) {
      if (immediate) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
        if (this.syncEnabled() && DB._token) this.push();
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
    getTodaySubjectMinutes(subject) {
      const t = this.today();
      return (state.timer.subjectSessions[t] && state.timer.subjectSessions[t][subject]) || 0;
    },

    /* ===== 云端同步（配置 SYNC_API_URL 后生效） ===== */
    syncEnabled() { return !!(SYNC_API_URL && SYNC_API_URL.trim()); },
    isLoggedIn() { return !!(localStorage.getItem(LS_TOKEN)); },
    currentUser() { return localStorage.getItem(LS_USER) || ""; },

    async _req(path, opts) {
      const url = SYNC_API_URL.replace(/\/$/, "") + path;
      const res = await fetch(url, Object.assign({ headers: { "Content-Type": "application/json" } }, opts));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
      return data;
    },

    async register(username, password) {
      const d = await this._req("/api/register", { method: "POST", body: JSON.stringify({ username, password }) });
      this._afterAuth(d); return d;
    },
    async login(username, password) {
      const d = await this._req("/api/login", { method: "POST", body: JSON.stringify({ username, password }) });
      this._afterAuth(d); return d;
    },
    _afterAuth(d) {
      localStorage.setItem(LS_TOKEN, d.token);
      localStorage.setItem(LS_USER, d.username);
      DB._token = d.token;
    },
    logout() {
      localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_USER); DB._token = null;
    },
    async pull() {
      if (!this.isLoggedIn()) return;
      const d = await this._req("/api/data?token=" + encodeURIComponent(localStorage.getItem(LS_TOKEN)));
      if (d && d.data) { state = mergeDefault(d.data, DEFAULT_STATE); this.state = state; this.save(true); }
    },
    async push() {
      if (!this.isLoggedIn()) return;
      await this._req("/api/data", {
        method: "POST",
        body: JSON.stringify({ token: localStorage.getItem(LS_TOKEN), data: state })
      });
    }
  };
  DB._token = localStorage.getItem(LS_TOKEN) || null;

  window.DB = DB;
})();
