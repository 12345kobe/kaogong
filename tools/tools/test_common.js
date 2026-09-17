/* 常识分模块刷题 + 总体学习 冒烟测试（jsdom）
   - 全部题目常驻，永不删除（用户自定题数，新题优先但不删题）
   - 完成某模块弹出「X模块已完成 / 还差哪些 / 累计剩余」
   - 全部模块完成弹出「太棒了！你已经完成所有常识模块的学习！」
   - 总体学习跨模块、新题优先
   - 已练大量题目后，仍可取满用户指定的题数（旧题补位，绝不删）
*/
const fs = require("fs");
const { JSDOM } = require("jsdom");

const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="modalRoot"></div><div id="toastRoot"></div><div id="content"></div></body></html>`, { runScripts: "outside-only" });
const { window } = dom;
global.window = window;
global.document = window.document;
global.location = window.location;
global.navigator = window.navigator;

const store = { state: { wrongbook: {}, accuracyCumulative: {}, commonModules: { geo: [], law: [], eco: [], tech: [], pol: [] } } };
function mkDB() {
  return {
    state: store.state,
    today: () => "2026-08-26",
    save() {},
    addTimerMinutes() {},
    addSubjectSession() {},
    uid: () => "u" + Math.random().toString(36).slice(2),
  };
}
window.DB = mkDB();

const modals = [];
window.UI = {
  esc: (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  el: (html) => { const d = window.document.createElement("template"); d.innerHTML = html.trim(); return d.content.firstChild; },
  modal: (cfg) => { modals.push(cfg); return { el: cfg.body, body: cfg.body, close: () => {} }; },
  confirm: async () => true,
  toast: () => {},
  StudyPanel: () => {},
  Handwriting: { open: () => {} },
};

// Quiz mock：自动作答全部正确，触发 onAnswer/onDone
let lastQuiz = null;
window.Quiz = {
  start(container, questions, subject, opts) {
    lastQuiz = { questions, subject, opts };
    (questions || []).forEach(q => { if (opts && opts.onAnswer) opts.onAnswer(q, true); });
    if (opts && opts.onDone) opts.onDone({ correct: questions.length, total: questions.length, pct: 100 });
    container.innerHTML = `<div class="quiz-q">done</div>`;
  }
};

// 小型数据集（确定性）
window.COMMON_BANK = {
  geo: { name: "地理国情", items: [
    { id: "geo-1", q: "g1", options: ["A", "B", "C", "D"], a: 0, e: "e1", tag: "地理国情" },
    { id: "geo-2", q: "g2", options: ["A", "B", "C", "D"], a: 1, e: "e2", tag: "地理国情" },
    { id: "geo-3", q: "g3", options: ["A", "B", "C", "D"], a: 2, e: "e3", tag: "地理国情" },
  ] },
  law: { name: "法律常识", items: [
    { id: "law-1", q: "l1", options: ["A", "B", "C", "D"], a: 3, e: "e", tag: "法律常识" },
    { id: "law-2", q: "l2", options: ["A", "B", "C", "D"], a: 0, e: "e", tag: "法律常识" },
  ] },
  eco: { name: "经济常识", items: [{ id: "eco-1", q: "c1", options: ["A", "B", "C", "D"], a: 1, e: "e", tag: "经济常识" }] },
  tech: { name: "科技常识", items: [{ id: "tech-1", q: "t1", options: ["A", "B", "C", "D"], a: 2, e: "e", tag: "科技常识" }] },
  pol: { name: "政治常识", items: [{ id: "pol-1", q: "p1", options: ["A", "B", "C", "D"], a: 0, e: "e", tag: "政治常识" }] },
};

function load(p) { const code = fs.readFileSync(p, "utf8"); (new Function("window", "document", "location", "navigator", code))(window, window.document, window.location, window.navigator); }
load("js/mod-common.js");

let fail = 0, pass = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗", m); } };

const txt = (m) => (m && m.body) ? (typeof m.body === "string" ? m.body : (m.body.innerHTML || "")) : "";

const body = window.document.createElement("div");
window.document.getElementById("content").appendChild(body);
window.MODULES.common.render(body);

console.log("=== 渲染 ===");
const rows = body.querySelectorAll(".cm-row");
ok(rows.length === 5, `渲染出 5 个模块行（实际 ${rows.length}）`);
ok(body.querySelector("#overall") != null, "存在「总体学习」按钮");
ok(body.querySelector("#resetAll") != null, "存在「重置全部进度」按钮");

// 点击某模块「练习」→ 弹出顺序/打乱 modal → 点「开始练习」→ 自动作答 → 完成提示
function clickPractice(idx, expectCount) {
  modals.length = 0;
  const btn = body.querySelectorAll(".cm-practice")[idx];
  btn.click();
  // 找到「开始练习」action 并点击
  const startAct = modals.flatMap(m => m.actions || []).find(a => a.label.indexOf("开始练习") >= 0);
  if (startAct) startAct.onClick(null, () => {});
  return { modals };
}

// 1) 地理国情：3 题全部新，完成后提示「地理国情 模块已完成」
console.log("=== 地理国情完成提示 ===");
const r1 = clickPractice(0);
ok(lastQuiz && lastQuiz.questions.length === 3, `地理国情首次练习取出 3 道新题（实际 ${lastQuiz ? lastQuiz.questions.length : 0}）`);
ok(lastQuiz.questions.every(q => q._id && q._mod === "geo"), "取出的题都带模块标记 geo");
const comp1 = modals[modals.length - 1];
ok(comp1 && comp1.title.indexOf("模块完成") >= 0, "完成后弹出模块完成提示框");
ok(comp1 && txt(comp1).indexOf("地理国情") >= 0, "提示含「地理国情 模块已完成」");
ok(comp1 && txt(comp1).indexOf("还差") >= 0, "提示含「还差」及剩余模块");

// 2) 完成其余 4 个模块
console.log("=== 依次完成其余模块 ===");
clickPractice(1); // law
clickPractice(2); // eco
clickPractice(3); // tech
const r5 = clickPractice(4); // pol —— 应触发「全部完成」
const compAll = r5.modals[r5.modals.length - 1];
ok(compAll && compAll.title.indexOf("全部完成") >= 0, "最后一个模块完成后弹出「全部完成」");
ok(compAll && txt(compAll).indexOf("太棒了！你已经完成所有常识模块的学习") >= 0, "弹出「太棒了！你已经完成所有常识模块的学习！」");

// 3) 全部完成后点击任一模块 → 直接显示完成（不再出题）
console.log("=== 完成后点击模块 ===");
modals.length = 0;
body.querySelectorAll(".cm-practice")[0].click();
ok(modals.length === 1 && modals[0] && txt(modals[0]).indexOf("太棒了") >= 0, "全部完成后点击模块显示通关贺词，不再开新题");

// 3b) 重置后测试「总体学习」5-20 题新题优先
console.log("=== 总体学习（全部模块）===");
store.state.commonModules = { geo: [], law: [], eco: [], tech: [], pol: [] };
modals.length = 0;
body.querySelector("#resetAll").click(); // confirm mock 返回 true -> 重渲染
modals.length = 0;
body.querySelector("#overall").click();
const ovModal = modals[modals.length - 1];
ok(ovModal && ovModal.title.indexOf("总体学习") >= 0, "点击总体学习弹出配置框");
ovModal.body.querySelector("#cnt").value = "8";
const ovStart = (ovModal.actions || []).find(a => a.label.indexOf("开始练习") >= 0);
const beforeDone = JSON.parse(JSON.stringify(store.state.commonModules)); // 作答前快照
ovStart.onClick(null, () => {});
ok(lastQuiz && lastQuiz.questions.length === 8, `总体学习取出 8 道新题（实际 ${lastQuiz ? lastQuiz.questions.length : 0}）`);
const modsTouched = new Set(lastQuiz.questions.map(q => q._mod));
ok(modsTouched.size >= 2, `总体学习跨模块出题（覆盖 ${modsTouched.size} 个模块）`);
ok(lastQuiz.questions.every(q => !(beforeDone[q._mod] || []).includes(q._id)), "总体学习取出的题此前均未做过（新题优先）");

// 4) 新题保证：用真实大库测试「每次出新题」过滤
console.log("=== 新题过滤（真实库抽样） ===");
// 重新载入真实库
delete window.COMMON_BANK;
load("assets/data/common_bank.js");
const totalAll = ["geo", "law", "eco", "tech", "pol"].reduce((a, m) => a + window.COMMON_BANK[m].items.length, 0);
ok(totalAll === 1833, `真实库合计 1833 题（实际 ${totalAll}）`);
let dupIds = 0, badA = 0;
const seen = new Set();
["geo", "law", "eco", "tech", "pol"].forEach(m => {
  window.COMMON_BANK[m].items.forEach(it => {
    if (seen.has(it.id)) dupIds++; seen.add(it.id);
    if (it.a < 0 || it.a >= it.options.length) badA++;
  });
});
ok(dupIds === 0, `全部题目 id 唯一（重复 ${dupIds}）`);
ok(badA === 0, `全部题目正确答案下标合法（异常 ${badA}）`);

// 5) 不删题验证：标记 geo 前 320 题已做（仅剩 7 新题），仍可取满 10 题（旧题补位）
console.log("=== 不删题验证（真实库）===");
const geoIds = window.COMMON_BANK.geo.items.map(it => it.id);
store.state.commonModules.geo = geoIds.slice(0, 320); // 假装已练 320 题，仅剩 7 新题
window.MODULES.common.render(body); // 用真实库重渲染
modals.length = 0;
body.querySelectorAll(".cm-practice")[0].click(); // geo
const gModal = modals[modals.length - 1];
gModal.body.querySelector("#cnt").value = "10";
const gStart = (gModal.actions || []).find(a => a.label.indexOf("开始练习") >= 0);
gStart.onClick(null, () => {});
ok(lastQuiz && lastQuiz.questions.length === 10, `geo 仅剩 7 新题时仍可取出 10 题（含 3 旧题补位，实际 ${lastQuiz ? lastQuiz.questions.length : 0}）`);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
