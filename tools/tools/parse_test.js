/* 复现时政答案识别：用真实用户格式测试 parseQuestions 是否抓到答案 */
global.window = {};
global.document = {};
const store = {};
window.DB = {
  state: {},
  save() {},
  today() { return "2026-09-13"; },
  uid() { return "u" + Math.random().toString(36).slice(2); }
};
window.UI = { esc: s => s };
const fs = require("fs");
const code = fs.readFileSync(__dirname + "/../js/mod-current.js", "utf8");
eval(code);
const parse = window.KGCurrent.parse;

const SAMPLE = [
  "第一部分：2026年9月12日公考标准时政汇总",
  "国内时政",
  "⭐1. 测试时政条目",
  "内容",
  "第三部分：词语释义 + 言语真题",
  "1. APEC能源会议倡导____、创新、协同。（双空）",
  "A.普惠 壁垒  B.公平 隔阂  C.共享 屏障  D.包容 鸿沟",
  "【答案】：A",
  "【解析】官方表述。",
  "第四部分：原创时政单选",
  "1. 第十六次APEC会议三大理念是（）",
  "A.绿色、低碳、高效",
  "B.普惠、创新、协同",
  "C.开放、包容、共赢",
  "D.创新、协调、绿色",
  "答案：B",
  "2. 金砖峰会聚焦（）",
  "A.大金砖合作",
  "B.小院高墙",
  "C.单边主义",
  "D.脱钩断链",
  "【答案】A"
].join("\n");

const r = parse(SAMPLE);
console.log("=== verbal (第三部分) ===");
r.verbal.forEach((q, i) => console.log(`Q${i + 1} stem=${q.q.slice(0, 12)}... opts=${q.options.length} a=${q.a} (${q.a >= 0 ? q.options[q.a] : "-"}) e=${q.e || ""}`));
console.log("=== quiz (第四部分) ===");
r.quiz.forEach((q, i) => console.log(`Q${i + 1} a=${q.a} (${q.a >= 0 ? q.options[q.a] : "-"}) e=${q.e || ""}`));
const bad = [...r.verbal, ...r.quiz].filter(q => q.a < 0);
console.log(bad.length ? `\n❌ 有 ${bad.length} 题答案未识别` : "\n✅ 全部答案已识别");
