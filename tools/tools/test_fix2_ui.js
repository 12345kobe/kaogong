/* 针对本轮两处改动的 UI 冒烟测试（jsdom）
   1) 政治：详情页按 pointId 过滤习题；原文 \n 渲染为 <br>；课时全部习题入口可用
   2) 百化分：入口出现"打乱内部顺序"勾选框
*/
const fs = require("fs");
const { JSDOM } = require("jsdom");

const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="modalRoot"></div><div id="app"></div></body></html>`, { runScripts: "outside-only" });
const { window } = dom;
global.window = window;
global.document = window.document;
global.location = window.location;
global.navigator = window.navigator;

// ---- 基础依赖 mock ----
const store = { state: { wrongbook: {}, accuracyCumulative: {}, formulas: { data: [], quantity: [] }, notes: {}, subjectSessions: {}, timers: {} } };
window.DB = {
  state: store.state,
  today: () => "2026-08-26",
  save() {},
  addTimerMinutes() {},
  addSubjectSession() {},
  uid: () => "u" + Math.random().toString(36).slice(2),
};
window.UI = {
  esc: (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  el: (html) => { const d = window.document.createElement("template"); d.innerHTML = html.trim(); return d.content.firstChild; },
  modal: () => {},
  confirm: async () => true,
  toast: () => {},
  StudyPanel: () => {},
  Handwriting: { open: () => {} },
};
// Ebbinghaus mock
function makeEB() {
  const rec = {};
  return {
    INTERVALS: [1, 2, 4, 7, 15, 30],
    isDue: () => false,
    getRecord: (g, id) => rec[g + ":" + id] || null,
    getStats: () => ({ total: 75, seen: 0, due: 0, mastered: 0, accuracy: 0 }),
    updateAfterReview: (g, id) => { const k = g + ":" + id; rec[k] = rec[k] || { seen: 0, correct: 0, total: 0 }; rec[k].seen++; rec[k].total++; rec[k].correct++; },
    pickDaily: (g, pts) => pts.slice(0, 10),
    resetGroup: () => {},
  };
}
window.Ebbinghaus = makeEB();
window.BANKS = { FORMULAS_DATA: [], FORMULAS_QUANTITY: [] };

// Quiz mock：记录收到的题目，渲染占位
window.Quiz = {
  start(container, questions) {
    this._last = questions;
    container.innerHTML = `<div class="quiz-q">收到 ${questions.length} 题</div>`;
  },
  _handler: null,
};

// ---- 载入数据 + 模块 ----
function load(p) { const code = fs.readFileSync(p, "utf8"); (new Function("window", "document", "location", "navigator", code))(window, window.document, window.location, window.navigator); }
load("assets/data/politics_kp.js");
load("assets/data/formula_table.js");
load("js/ebbinghaus.js");      // 覆盖 mock 的真实实现（带 isDue/getRecord）
load("js/mod-politics.js");
load("js/mod-formulas.js");

let fail = 0, pass = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗", m); } };

console.log("=== 政治模块渲染 ===");
const body = window.document.createElement("div");
window.MODULES.politics.render(body);
ok(body.innerHTML.includes("知识点复习"), "政治模块渲染出知识点复习板块");

// 打开知识点列表（openKnowledgeList 通过 startDaily 触发，或直接调用内部）
// 这里模拟点击「查看全部」按钮
const viewAll = body.querySelector("#viewAll");
ok(!!viewAll, "存在「查看全部」入口");
viewAll.click();
const modal = window.document.querySelector("#modalRoot .modal-mask");
ok(!!modal, "点击查看全部后弹出知识点列表");
const item = modal.querySelector(".kp-item");
ok(!!item, "列表含知识点卡片");

// 点击第一个知识点的「详情」展开 → renderDetail
const head = item.querySelector(".kp-q");
head.click();
const detail = item.querySelector(".kp-detail");
ok(detail && detail.innerHTML.length > 0, "点击后渲染出详情视图");
ok(detail.innerHTML.includes("<br>"), "详情原文含 <br>（换行已渲染）");

// 找到「江山就是人民」对应的知识点卡片，验证其专属习题过滤
const data = window.POLITICS_KP;
const s9 = data.points.find(p => p.id === "L1_S9");
const s9Item = Array.from(modal.querySelectorAll(".kp-item")).find(it => it.querySelector(".kp-detail") && it.innerHTML.includes("江山就是人民"));
ok(!!s9Item, "能定位到「江山就是人民」知识点卡片");
s9Item.querySelector(".kp-q").click();
const s9detail = s9Item.querySelector(".kp-detail");
// 其「去做题」按钮应显示 1 题（kp-1-q3）
const doBtn = s9detail.querySelector("#doQuiz");
ok(doBtn && /1 题/.test(doBtn.textContent), `「江山就是人民」专属习题数为 1（实际：${doBtn ? doBtn.textContent.trim() : "无"}）`);
doBtn.click();
const qz = s9Item.querySelector(".kp-quiz-host");
ok(qz && /收到 1 题/.test(qz.textContent), "点击去做题后只加载匹配本点的 1 题（非全课时）");

console.log("=== 百化分入口 ===");
const fbody = window.document.createElement("div");
window.MODULES.data.render(fbody);
const shuffleBox = fbody.querySelector("#fcShuffle");
ok(!!shuffleBox, "百化分入口出现「打乱内部顺序」勾选框");
ok(/百化分 → 平方数 → 三次方 → 四次方 → 开根号/.test(fbody.innerHTML), "勾选框说明含固定模块顺序");

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
