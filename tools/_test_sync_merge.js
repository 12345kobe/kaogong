// 测试跨设备增量合并逻辑：自建题库/刷题册/刷题记录按 id 去重，只导入本地没有的
global.window = {};
global.document = { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

require("../js/data.js");
const DB = global.window.DB;

function mk(id, extra) { return Object.assign({ id }, extra || {}); }

// 设备 A（本机）数据
const A = {
  customQuestions: { verbal: [mk("q_a1", { q: "A题1" }), mk("q_a2", { q: "A题2" })] },
  pdfBooks: [mk("bk_a", { name: "A册" })],
  pdfBookPractice: [mk("p_a", { total: 10 })]
};
// 云端（设备 B）数据：含 A 没有的，也含与 A 同 id 的（应去重不重复）
const cloud = {
  customQuestions: { verbal: [mk("q_a2", { q: "A题2-云端版" }), mk("q_b1", { q: "B题1" })] },
  pdfBooks: [mk("bk_a", { name: "A册-云端版" }), mk("bk_b", { name: "B册" })],
  pdfBookPractice: [mk("p_a", { total: 99 }), mk("p_b", { total: 5 })]
};

const before = DB._countCustom(A);
const merged = DB.mergeStates(JSON.parse(JSON.stringify(A)), cloud);
const after = DB._countCustom(merged);

const stats = {
  customQuestions: Math.max(0, after.customQuestions - before.customQuestions),
  pdfBooks: Math.max(0, after.pdfBooks - before.pdfBooks),
  pdfBookPractice: Math.max(0, after.pdfBookPractice - before.pdfBookPractice)
};

const qIds = (merged.customQuestions.verbal || []).map(x => x.id).sort();
const bkIds = (merged.pdfBooks || []).map(x => x.id).sort();
const pIds = (merged.pdfBookPractice || []).map(x => x.id).sort();

console.log("BEFORE:", JSON.stringify(before));
console.log("AFTER :", JSON.stringify(after));
console.log("STATS :", JSON.stringify(stats));
console.log("merged verbal q ids:", qIds.join(","));   // 期望 q_a1,q_a2,q_b1（q_a2 去重不重复）
console.log("merged pdfBooks ids:", bkIds.join(","));  // 期望 bk_a,bk_b
console.log("merged practice ids:", pIds.join(","));   // 期望 p_a,p_b

let ok = true;
function assert(name, cond) { console.log((cond ? "PASS" : "FAIL") + " - " + name); if (!cond) ok = false; }
assert("自建题净新增=1 (q_b1)", stats.customQuestions === 1);
assert("刷题册净新增=1 (bk_b)", stats.pdfBooks === 1);
assert("刷题记录净新增=1 (p_b)", stats.pdfBookPractice === 1);
assert("同 id 题 q_a2 不重复", qIds.length === 3 && qIds.join(",") === "q_a1,q_a2,q_b1");
assert("同 id 册 bk_a 不重复", bkIds.length === 2 && bkIds.join(",") === "bk_a,bk_b");
assert("同 id 记录 p_a 不重复", pIds.length === 2 && pIds.join(",") === "p_a,p_b");
assert("本地 q_a1 仍在", qIds.includes("q_a1"));
assert("本地 q_a2 内容保留(未被云端覆盖)", (merged.customQuestions.verbal.find(x => x.id === "q_a2").q) === "A题2");
console.log(ok ? "\nALL TESTS PASSED" : "\nSOME TESTS FAILED");
process.exit(ok ? 0 : 1);
