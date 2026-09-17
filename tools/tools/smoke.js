/* jsdom 冒烟测试：启动整个 PWA，校验新增数据与三大板块模块无异常 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("C:/Users/28621/.workbuddy/binaries/node/workspace/node_modules/jsdom");

const ROOT = "C:/Users/28621/Desktop/考公工作台";
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

const errors = [];
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  resources: undefined,
  pretendToBeVisual: true,
  url: "http://localhost/",
  beforeParse(window) {
    window.alert = () => {};
    window.confirm = () => true;
    window.scrollTo = () => {};
    window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    window.localStorage = (() => {
      const m = {};
      return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
    })();
    window.onerror = (msg) => { errors.push("window.onerror: " + msg); };
    const origErr = window.console.error;
    window.console.error = (...a) => { errors.push("console.error: " + a.join(" ")); origErr.apply(window.console, a); };
  }
});

// 手动注入脚本（jsdom 对相对路径资源加载受限，改为读取文件 eval）
const SCRIPTS = [
  "assets/data/idioms.js","assets/data/verbal_book.js","assets/data/muti.js","assets/data/politics_kp.js","assets/data/formula_table.js",
  "assets/data/common_geo_1.js","assets/data/common_geo_2.js","assets/data/common_law_1.js","assets/data/common_law_2.js","assets/data/common_law_3.js",
  "assets/data/common_eco_1.js","assets/data/common_tech_1.js","assets/data/common_tech_2.js","assets/data/common_tech_3.js","assets/data/common_tech_4.js","assets/data/common_pol_1.js",
  "assets/data/common_kp.js","assets/data/essay_quotes.js","assets/data/essay_normwords.js","assets/data/verbal_5000.js",
  "js/config.js","js/data.js","js/ebbinghaus.js","js/icons.js","js/ui.js","js/quiz.js","js/banks.js","js/pdf.js",
  "js/flashcard.js","js/learned-history.js","js/review.js",
  "js/mod-countdown.js","js/mod-verbal.js","js/mod-wrongwords.js","js/mod-formulas.js","js/mod-logic.js","js/mod-politics.js","js/mod-muti.js",
  "js/mod-common.js","js/mod-essay.js","js/mod-calendar.js","js/mod-wrongbook.js","js/mod-stats.js",
  "js/mod-timer.js","js/mod-shuati.js","js/voice.js","js/mod-current.js","js/mod-pdfimport.js","js/mod-ai.js","js/mod-settings.js","js/mod-favorites.js","js/app.js"
];

const vm = require("vm");
const ctx = dom.getInternalVMContext();
for (const s of SCRIPTS) {
  const code = fs.readFileSync(path.join(ROOT, s), "utf8");
  try {
    vm.runInContext(code, ctx, { filename: s });
  } catch (e) {
    errors.push("SCRIPT FAIL [" + s + "]: " + e.message);
  }
}

const w = dom.window;
if (w.DB && typeof w.DB.load === "function") { try { w.DB.load(); } catch (e) { errors.push("DB.load: " + e.message); } }
function check(name, cond) {
  console.log((cond ? "  ✓ " : "  ✗ ") + name);
  if (!cond) errors.push("CHECK FAIL: " + name);
}

console.log("== 全局数据 ==");
check("window.COMMON_KP 存在且 >800", Array.isArray(w.COMMON_KP) && w.COMMON_KP.length > 800);
check("COMMON_KP 首条结构正确", w.COMMON_KP[0] && w.COMMON_KP[0].id && w.COMMON_KP[0].prompt && w.COMMON_KP[0].answer);
check("window.ESSAY_QUOTES_THEMED 存在且 11 主题", w.ESSAY_QUOTES_THEMED && Object.keys(w.ESSAY_QUOTES_THEMED).length === 11);
check("ESSAY_NORMWORDS 存在且 8 板块", Array.isArray(w.ESSAY_NORMWORDS) && w.ESSAY_NORMWORDS.length === 8);
check("window.Flashcard.start 是函数", w.Flashcard && typeof w.Flashcard.start === "function");
check("window.MODULES.common 存在", !!w.MODULES.common);
check("window.MODULES.essay 存在", !!w.MODULES.essay);

console.log("== 渲染模块（不抛错即过）==");
const RENDER_KEYS = ["countdown","current","verbal","wrongwords","data","logic","politics","muti","common","essay","calendar","wrongbook","favorites","stats","pdfimport","ai","settings"];
for (const key of RENDER_KEYS) {
  try {
    const b = w.document.getElementById("pageBody");
    w.MODULES[key].render(b);
    check(`${key}.render 执行成功`, true);
  } catch (e) { errors.push(`${key}.render: ` + e.message); check(`${key}.render 执行成功`, false); }
}

console.log("== 新功能断言 ==");
try {
  const b = w.document.getElementById("pageBody");
  // 1) 常识：常用知识点 10 个 + 下一组
  w.MODULES.common.render(b);
  const kpRows = b.querySelectorAll("#kpList .todo");
  check(`常识常用知识点展示 10 条（实际 ${kpRows.length}）`, kpRows.length === 10);
  check("常识有「下一组」按钮", !!b.querySelector("#kpNext"));
  check("常识有「导出本组PDF」按钮", !!b.querySelector("#kpExp"));
  const firstPrompt = kpRows.length ? kpRows[0].textContent.trim() : "";
  b.querySelector("#kpNext").click();
  const kpRows2 = b.querySelectorAll("#kpList .todo");
  const secondPrompt = kpRows2.length ? kpRows2[0].textContent.trim() : "";
  check("点「下一组」后内容变化（不重复同一批）", kpRows2.length === 10 && firstPrompt !== secondPrompt);

  // 2) 申论：规范词数据质量 + 学习按钮
  let badTerm = 0;
  (w.ESSAY_NORMWORDS || []).forEach(s => s.items.forEach(it => {
    if (!it.term || !it.scene || it.term.length > 16 || it.term.includes("，")) badTerm++;
  }));
  check(`规范词无错位/异常 term（异常 ${badTerm} 条）`, badTerm === 0);
  const dig = [];
  (w.ESSAY_NORMWORDS || []).forEach(s => s.items.forEach(it => { if (it.term === "提升数字素养") dig.push(it.scene); }));
  check("「提升数字素养」场景完整（含数字化技术解决日常工作）",
    dig.length === 1 && dig[0].includes("数字化技术解决日常工作"));
  w.MODULES.essay.render(b);
  check("申论规范词有「学习全部板块」按钮", !!b.querySelector("#nwStudyAll"));
  check("申论规范词每个板块有「学习」按钮", b.querySelectorAll("#nwSecs [data-act='study']").length === 8);
  check("申论规范词有「下一组」按钮", !!b.querySelector("#nwNext"));

  // 3) 言语：700词释义练习
  w.MODULES.verbal.render(b);
  check("言语有「词语释义练习」区块", !!b.querySelector("#wdStart"));
  check("言语有「下一组」按钮", !!b.querySelector("#wdNext"));

  // 4) 错词本模块
  w.DB.state.wrongwords = [{ id: "t1", word: "源远流长", def: "源头远，水流长。", ex: "历史源远流长。", group: "第1组", date: w.DB.today(), reviewCount: 0, correctStreak: 0, note: "" }];
  w.MODULES.wrongwords.render(b);
  check("错词本渲染出 1 条错词", b.querySelectorAll("#wwList .todo").length === 1);
  check("错词本有「开始复习」与「导出PDF」", !!b.querySelector("#wwReview") && !!b.querySelector("#wwExp"));
  w.DB.state.wrongwords = [];

  // 5) 错题本日期范围
  w.DB.state.wrongbook["言语"] = [
    { id: "x1", q: "旧错题", options: ["a","b","c","d"], a: 0, e: "e", date: "2020-01-01", note: "", img: "" },
    { id: "x2", q: "新错题", options: ["a","b","c","d"], a: 1, e: "e", date: w.DB.today(), note: "", img: "" }
  ];
  w.MODULES.wrongbook.render(b);
  check("错题本有日期范围控件", !!b.querySelector("#dFrom") && !!b.querySelector("#dTo"));
  check("错题本有「按日期范围导出」", !!b.querySelector("#expRange"));
  const df = b.querySelector("#dFrom"), dt = b.querySelector("#dTo");
  df.value = w.DB.today(); dt.value = w.DB.today();
  b.querySelector("#dApply").click();
  const shown = b.querySelectorAll("#list .todo").length;
  check(`日期筛选生效（今日仅 1 条，实际 ${shown}）`, shown === 1);
  w.DB.state.wrongbook["言语"] = [];

  // 6) 资料分析：5 个模块 + 学习/测试
  w.MODULES.data.render(b);
  const modCards = b.querySelectorAll("#fcMods .nw-sec");
  check(`资料分析有 5 个速算模块（实际 ${modCards.length}）`, modCards.length === 5);
  check("每个模块都有「学习」按钮", b.querySelectorAll("#fcMods [data-act='study']").length === 5);
  check("每个模块都有「测试」按钮", b.querySelectorAll("#fcMods [data-act='test']").length === 5);

  // 7) 已学习记录 + 按组/按课时浏览 + 释义选项只显示表达意思
  check("window.LearnedHistory.record/open 存在", w.LearnedHistory && typeof w.LearnedHistory.record === "function" && typeof w.LearnedHistory.open === "function");
  w.MODULES.common.render(b);
  check("常识已学习记录写入 learnedLog（今日≥10条）", (() => { const l = w.DB.state.learnedLog && w.DB.state.learnedLog.common_kp; const d = w.DB.today(); return !!(l && l[d] && l[d].length >= 10); })());
  w.MODULES.essay.render(b);
  check("申论名言已学习记录写入 learnedLog（今日11条）", (() => { const l = w.DB.state.learnedLog && w.DB.state.learnedLog.essay_quotes; const d = w.DB.today(); return !!(l && l[d] && l[d].length === 11); })());

  // 言语：按组浏览（翻书式 → 目录 → 逐词） + 释义练习选项只显示表达意思
  w.MODULES.verbal.render(b);
  check("言语按组浏览卡片存在（#openBook）", !!b.querySelector("#openBook"));
  check("VERBAL_BOOK 已加载（>400 组）", !!(w.VERBAL_BOOK && w.VERBAL_BOOK.groups && w.VERBAL_BOOK.groups.length > 400));
  const ob = b.querySelector("#openBook"); if (ob) ob.click();
  // 打开目录后，目录项应存在且可点击进入翻书阅读器
  const dirItem = b.querySelector(".book-dir-item") || (w.document.querySelector && w.document.querySelector(".book-dir-item"));
  const dirInDoc = w.document.querySelector(".book-dir-item");
  check("点击浏览后出现目录项", !!dirInDoc);
  if (dirInDoc) dirInDoc.click();
  const readerWord = w.document.querySelector(".book-word");
  check("进入组别后出现翻书词条（.book-word）", !!readerWord);
  const bookDef = w.document.querySelector(".book-def");
  check("翻书词条含释义（.book-def）", !!bookDef && bookDef.textContent.length > 0);
  const wd = b.querySelector("#wdStart"); if (wd) wd.click();
  let optBad = 0, optTotal = 0;
  b.querySelectorAll("#wdQuiz .opt").forEach(o => {
    optTotal++;
    const t = o.textContent.replace(/^[A-D]\.\s*/, "").trim();
    if (/^[（(]?[\u4e00-\u9fff]{1,2}[：:]/.test(t)) optBad++; // 仍为单字字面拆解 “差：尚”
  });
  check(`词语释义选项只显示表达意思（共${optTotal}项，单字拆解${optBad}项）`, optTotal > 0 && optBad === 0);
  b.querySelectorAll(".modal-mask").forEach(m => m.remove());

  // 政治：按课时浏览
  w.MODULES.politics.render(b);
  check("政治按课时浏览卡片存在（#pgrid）", !!b.querySelector("#pgrid"));
  check("政治按课时浏览课时数=6", b.querySelectorAll("#pgrid .chip").length === 6);
  const pbtn = b.querySelector("#pgrid .chip"); if (pbtn) pbtn.click();
  check("点击课时后展开知识点列表", !!b.querySelector("#llist") && b.querySelector("#llist").querySelectorAll(".todo").length > 0);
} catch (e) {
  errors.push("新功能断言异常: " + e.message + "\n" + (e.stack || "").split("\n").slice(0,3).join("\n"));
  check("新功能断言", false);
}

console.log("== 时政 / 言语5000题 ==");
try {
  const b = w.document.getElementById("pageBody");
  // 时政解析
  const sample = ["第一部分：2026年9月12日公考标准时政汇总（星级重难点）","国内时政","⭐1. 第十六次APEC能源部长会议在北京闭幕","会议正式确立普惠、创新、协同三大合作理念。","第二部分：申论标准时评+必背金句","申论时评主题：秉持多边协同理念 共筑绿色发展未来","当前世界变局加速演进，能源安全成为全球性难题。","今日必背申论金句","1. 协同聚合力，绿色启新程，开放赢未来。","第三部分：时政专属词语释义 + 8道原创言语真题","1. 普惠（两字）：惠及全体、兼顾公平。","1. APEC能源会议倡导____、创新、协同的发展理念。（双空）","A.普惠 壁垒  B.公平 隔阂  C.共享 屏障  D.包容 鸿沟","【答案】A","【解析】官方固定表述。","第四部分：8道原创时政单选","1. 第十六次APEC能源部长会议确立的三大核心理念是（）","A.绿色、低碳、高效","B.普惠、创新、协同","C.开放、包容、共赢","D.创新、协调、绿色","【答案】B"].join("\n");
  const pd = w.KGCurrent.parse(sample);
  check("时政解析：时政条目 " + pd.news.length, pd.news.length >= 1);
  check("时政解析：词语 " + pd.words.length, pd.words.length === 1);
  check("时政解析：言语题 " + pd.verbal.length + " / 时政单选 " + pd.quiz.length, pd.verbal.length === 1 && pd.quiz.length === 1 && pd.quiz[0].a === 1);
  // 时政答案多种写法（带冒号 / 无书名号 / 选项文字 / 答案解析同行）识别回归
  const sample2 = ["第四部分：测试","1. 理念是（）","A.绿色","B.普惠","C.开放","D.创新","【答案】：B","2. 峰会聚焦（）","A.大金砖","B.小院高墙","C.单边","D.脱钩","答案：A","3. 测试（）","A.x","B.y","C.z","D.w","【答案】y","4. 同行（）","A.p","B.q","C.r","D.s","【答案】A【解析】官方表述"].join("\n");
  const pd2 = w.KGCurrent.parse(sample2);
  const allAns = pd2.quiz.length === 4 && pd2.quiz.every(q => q.a >= 0);
  check("时政答案多种写法均识别（4 题，全有答案=" + allAns + "）", allAns);
  // 时政模块渲染 + 保存
  w.MODULES.current.render(b);
  check("时政模块渲染出导入区（#curText）", !!b.querySelector("#curText"));
  const rec = w.KGCurrent.importText(sample, "2026-09-12");
  check("时政导入并入库（" + (w.KGCurrent.list().length) + " 条）", w.KGCurrent.list().length >= 1 && !!rec.id);
  check("时政题目可练（" + w.KGCurrent.allQuestions(rec).length + " 题）", w.KGCurrent.allQuestions(rec).length === 2);
  check("时政默认名 = 日期+时政（" + rec.title + "）", rec.title === "2026-09-12 时政");
  w.KGCurrent.setTitle(rec.id, "我的自定义时政");
  check("时政可改名（" + w.KGCurrent.get(rec.id).title + "）", w.KGCurrent.get(rec.id).title === "我的自定义时政");
  w.MODULES.current.render(b);
  check("时政列表有名称输入框（.ct）", !!b.querySelector(".cur-item .ct"));
  const ctEl = b.querySelector(".cur-item .ct");
  if (ctEl) { ctEl.value = "改名测试"; ctEl.dispatchEvent(new w.Event("change")); }
  check("列表改名生效（" + w.KGCurrent.get(rec.id).title + "）", w.KGCurrent.get(rec.id).title === "改名测试");
  // 折叠默认状态 + 金句同步
  const detList = Array.prototype.slice.call(b.querySelectorAll(".kg-det"));
  const pasteDet = detList.find(d => d.querySelector(".kg-det-t") && /粘贴时政材料/.test(d.querySelector(".kg-det-t").textContent));
  const recDet = detList.find(d => d.querySelector(".kg-det-t") && /我的时政记录/.test(d.querySelector(".kg-det-t").textContent));
  check("时政粘贴区默认折叠", !!pasteDet && !pasteDet.open);
  check("时政记录区默认展开", !!recDet && recDet.open);
  const uq = (w.DB.state.essay && w.DB.state.essay.userQuotes) || [];
  check("时政金句同步到申论素材（" + uq.length + " 条）", uq.some(q => q.source === rec.id && /协同聚合力/.test(q.t)));
  // 申论模块出现「申论时评」板块
  w.MODULES.essay.render(b);
  const hasCom = Array.prototype.slice.call(b.querySelectorAll(".kg-det")).some(d => d.querySelector(".kg-det-t") && /申论时评/.test(d.querySelector(".kg-det-t").textContent));
  check("申论模块出现「申论时评」板块", hasCom);
  // 言语 5000 卡片
  w.MODULES.verbal.render(b);
  check("VERBAL_5000 已加载（" + ((w.VERBAL_5000 && w.VERBAL_5000.chapters.length) || 0) + " 章）", !!(w.VERBAL_5000 && w.VERBAL_5000.chapters.length >= 4));
  check("言语有「行测5000题」目录按钮（#v5dir）", !!b.querySelector("#v5dir"));
  // 目录：章列表 + 整章练题 + 展开后每考点「练题/学/已学完」+ 题量选择
  b.querySelector("#v5dir").click();
  const dirMask = w.document.querySelector(".modal-mask");
  const hasHead = !!w.document.querySelector("[data-head]");
  const hasChGo = !!w.document.querySelector("[data-ch-go]");
  const hasCnt = !!w.document.querySelector("#v5cnt");
  check("目录含章列表与「整章练题」按钮", hasHead && hasChGo && hasCnt);
  const head0 = w.document.querySelector("[data-head]");
  if (head0) head0.click();
  const sGoEl = w.document.querySelector("[data-s-go]");
  const sDoneEl = w.document.querySelector("[data-s-done]");
  check("展开章后每考点有「练题」「标记已学完」", !!sGoEl && !!sDoneEl);
  if (sDoneEl) {
    sDoneEl.click();
    check("点「已学完」写入学习记录", !!(w.LearnedHistory && w.LearnedHistory.count("verbal5000_theory") >= 1));
  }
  if (dirMask) dirMask.remove();
  const v5secs = (w.VERBAL_5000.chapters || []).reduce((n, c) => n + c.sections.length, 0);
  const v5q = (w.VERBAL_5000.chapters || []).reduce((n, c) => n + c.sections.reduce((m, s) => m + (s.questions || []).length, 0), 0);
  check("言语5000题量（" + v5secs + " 考点 / " + v5q + " 题）", v5q > 900);
  const withAns = (w.VERBAL_5000.chapters || []).reduce((n, c) => n + c.sections.reduce((m, s) => m + (s.questions || []).filter(q => q.a >= 0).length, 0), 0);
  check("言语5000题答案匹配（" + withAns + " / " + v5q + "）", withAns === v5q);
  b.querySelectorAll(".modal-mask").forEach(m => m.remove());
} catch (e) {
  errors.push("时政/言语断言异常: " + e.message + "\n" + (e.stack || "").split("\n").slice(0,3).join("\n"));
  check("时政/言语断言", false);
}

console.log("== 待复习按钮 / 错词本并入言语 / AI 免费服务商 ==");
try {
  const b = w.document.getElementById("pageBody");
  check("KGReview 通用待复习面板存在", !!(w.KGReview && typeof w.KGReview.open === "function"));
  w.MODULES.common.render(b);
  check("常识「待复习」可点（#kpDueStat）", !!b.querySelector("#kpDueStat"));
  w.MODULES.verbal.render(b);
  const hasWW = Array.prototype.some.call(b.querySelectorAll("summary"), s => /错词本/.test(s.textContent));
  check("言语模块出现「错词本」板块", hasWW);
  check("言语内错词本已渲染（#wwStats）", !!b.querySelector("#wwStats"));
  check("言语「待复习」可点（#wdDueStat）", !!b.querySelector("#wdDueStat"));
  w.MODULES.essay.render(b);
  check("申论规范词「待复习」可点（#nwDueStat）", !!b.querySelector("#nwDueStat"));
  w.MODULES.politics.render(b);
  check("政治「待复习」可点（#ebDueStat）", !!b.querySelector("#ebDueStat"));
  w.MODULES.data.render(b);
  check("资料分析「待复习」可点（#fcDueStat）", !!b.querySelector("#fcDueStat"));
  if (w.KGReview) w.KGReview.open({ title: "t", group: "g", subject: "常识", items: [{ id: "x", prompt: "p", answer: "a" }], onStudy() {}, onTest() {} });
  let hasStudy = false, hasTest = false;
  Array.prototype.forEach.call(w.document.querySelectorAll(".modal-mask .btn"), x => {
    if (/学习/.test(x.textContent)) hasStudy = true;
    if (/测试/.test(x.textContent)) hasTest = true;
  });
  check("待复习弹窗含「学习」「测试」两个按钮", hasStudy && hasTest);
  w.document.querySelectorAll(".modal-mask").forEach(m => m.remove());
  check("KGAI 免费服务商清单（" + ((w.KGAI && w.KGAI.PROVIDERS && w.KGAI.PROVIDERS.length) || 0) + " 个）", !!(w.KGAI && w.KGAI.PROVIDERS && w.KGAI.PROVIDERS.length >= 6));
  check("KGAI 支持切换服务商/密钥", !!(w.KGAI && w.KGAI.setProvider && w.KGAI.setKey && w.KGAI.getProvider && w.KGAI.getKey));
  w.MODULES.ai.render(b);
  const gear = b.querySelector("#aiGear"); if (gear) gear.click();
  check("AI 设置里有服务商下拉（#gProv）", !!w.document.querySelector("#gProv"));
  const optN = w.document.querySelectorAll("#gProv option").length;
  check("AI 服务商下拉项 ≥6（实际 " + optN + "）", optN >= 6);
  w.document.querySelectorAll(".modal-mask").forEach(m => m.remove());
} catch (e) {
  errors.push("待复习/错词本/AI 断言异常: " + e.message + "\n" + (e.stack || "").split("\n").slice(0,3).join("\n"));
  check("待复习/错词本/AI 断言", false);
}

console.log("== Flashcard 调用（easy/hard 不抛错）==");
try {
  w.Flashcard.start({ title:"t", group:"test_g", subject:"常识", items:[{id:"x1",prompt:"q1",answer:"a1"}], mode:"easy", frontLabel:"正面", backLabel:"答案" });
  w.document.querySelectorAll(".modal-mask").forEach(m => m.remove());
  w.Flashcard.start({ title:"t2", group:"test_g2", subject:"申论", items:[{id:"y1",prompt:"q2",answer:"a2"}], mode:"hard", frontLabel:"应用场景", backLabel:"规范词汇" });
  w.document.querySelectorAll(".modal-mask").forEach(m => m.remove());
  check("Flashcard.start easy/hard 成功", true);
} catch (e) { errors.push("Flashcard.start: " + e.message); check("Flashcard.start easy/hard 成功", false); }

console.log("\n=== 结果 ===");
if (errors.length) {
  console.log("发现 " + errors.length + " 个问题：");
  errors.forEach(e => console.log("  - " + e));
  process.exit(1);
} else {
  console.log("全部通过 ✅");
  process.exit(0);
}
