/* 手写打开真实调用测试：验证 open() 不再因缺失按钮而中断、canvas 被正确铺满全屏 */
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
    window.localStorage = (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })();
    window.onerror = (msg) => { errors.push("window.onerror: " + msg); };
    // 打桩 canvas：jsdom 无原生 2d context
    const fakeCtx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : (typeof p === "string" ? () => {} : undefined)), set: (t, p, v) => { t[p] = v; return true; } });
    window.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
    // 打桩尺寸：让 sizeCanvas 拿到真实全屏宽高
    window.Element.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, right: 400, bottom: 800, width: 400, height: 800, x: 0, y: 0 }; };
  }
});

const SCRIPTS = [
  "assets/data/idioms.js","assets/data/verbal_book.js","assets/data/muti.js","assets/data/politics_kp.js","assets/data/formula_table.js",
  "assets/data/common_geo_1.js","assets/data/common_geo_2.js","assets/data/common_law_1.js","assets/data/common_law_2.js","assets/data/common_law_3.js",
  "assets/data/common_eco_1.js","assets/data/common_tech_1.js","assets/data/common_tech_2.js","assets/data/common_tech_3.js","assets/data/common_tech_4.js","assets/data/common_pol_1.js",
  "assets/data/common_kp.js","assets/data/essay_quotes.js","assets/data/essay_normwords.js","assets/data/verbal_5000.js",
  "js/config.js","js/data.js","js/ebbinghaus.js","js/icons.js","js/ui.js","js/quiz.js","js/banks.js","js/pdf.js",
  "js/flashcard.js","js/learned-history.js","js/review.js",
  "js/mod-countdown.js","js/mod-verbal.js","js/mod-wrongwords.js","js/mod-formulas.js","js/mod-logic.js","js/mod-politics.js","js/mod-muti.js",
  "js/mod-common.js","js/mod-essay.js","js/mod-calendar.js","js/mod-wrongbook.js","js/mod-stats.js",
  "js/mod-timer.js","js/mod-shuati.js","js/voice.js","js/mod-current.js","js/mod-pdfimport.js","js/mod-ai.js","js/mod-settings.js","js/app.js"
];
const vm = require("vm");
const ctx = dom.getInternalVMContext();
for (const s of SCRIPTS) {
  const code = fs.readFileSync(path.join(ROOT, s), "utf8");
  try { vm.runInContext(code, ctx, { filename: s }); } catch (e) { errors.push("SCRIPT FAIL [" + s + "]: " + e.message); }
}
const w = dom.window;
if (w.DB && typeof w.DB.load === "function") { try { w.DB.load(); } catch (e) {} }

function check(name, cond) { console.log((cond ? "  ✓ " : "  ✗ ") + name); if (!cond) errors.push("CHECK FAIL: " + name); }

console.log("== UI.Handwriting.open 实测 ==");
let threw = null, canvasW = 0, canvasH = 0;
let drewStrokes = -1;
try {
  w.UI.Handwriting.open({ subject: "test", id: "hw1", title: "测试", anchor: null, onChange: () => {} });
  const overlay = w.document.querySelector(".hw-overlay");
  const canvas = overlay && overlay.querySelector(".hw-layer");
  if (canvas) { canvasW = canvas.width; canvasH = canvas.height; }
  check("手写覆盖层已插入 DOM", !!overlay);
  check("手写工具栏含完成按钮(.hw-done-fab)", !!(overlay && overlay.querySelector(".hw-done-fab")));
  check("手写工具栏含手写/荧光/橡皮/撤回/重做/清除", !!(overlay && overlay.querySelector(".t-pen") && overlay.querySelector(".t-hl") && overlay.querySelector(".t-erase") && overlay.querySelector(".undo") && overlay.querySelector(".redo") && overlay.querySelector(".clear")));
  check("canvas 已被 sizeCanvas 铺满全屏(400x800)", canvasW === 400 && canvasH === 800);

  // 真实模拟一笔：pointerdown -> 两次 move -> pointerup
  function fire(type, x, y) {
    const ev = new w.Event(type, { bubbles: true, cancelable: true });
    ev.clientX = x; ev.clientY = y; ev.button = 0; ev.pointerId = 1; ev.pointerType = "pen";
    canvas.dispatchEvent(ev);
  }
  fire("pointerdown", 50, 50);
  fire("pointermove", 100, 100);
  fire("pointermove", 150, 150);
  fire("pointerup", 150, 150);
  // 保存
  overlay.querySelector(".hw-done-fab").click();
  const saved = (w.DB.state.notes && w.DB.state.notes.test && w.DB.state.notes.test.hw1);
  drewStrokes = saved && saved.strokes ? saved.strokes.length : 0;
  check("模拟画一笔后已写入笔记 strokes（数量=" + drewStrokes + "）", drewStrokes >= 1);
  check("该笔画含 >=2 个点（" + (saved && saved.strokes[0] ? saved.strokes[0].points.length : 0) + "）", saved && saved.strokes[0] && saved.strokes[0].points.length >= 2);
  check("覆盖层在保存后已移除", !w.document.querySelector(".hw-overlay"));
} catch (e) {
  threw = e;
  errors.push("open 抛错: " + e.message + "\n" + (e.stack || "").split("\n").slice(0,4).join("\n"));
}
check("UI.Handwriting.open 全程无异常抛出", !threw);

console.log("\n=== 结果 ===");
if (errors.length) { console.log("发现 " + errors.length + " 个问题："); errors.forEach(e => console.log("  - " + e)); process.exit(1); }
else { console.log("手写打开测试全部通过 ✅"); process.exit(0); }
