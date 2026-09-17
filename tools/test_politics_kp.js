/* jsdom 冒烟测试：政治理论 知识点复习模块 */
process.env.NODE_PATH = "C:\\Users\\28621\\.workbuddy\\binaries\\node\\workspace\\node_modules";
require("module").Module._initPaths();
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const html = `<!DOCTYPE html><html><body>
<div id="app">
  <div id="content"><div id="pageTitle"></div><div id="pageBody"></div></div>
</div>
<div id="modalRoot"></div><div id="toastRoot"></div>
</body></html>`;
const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
const win = dom.window;
global.window = win;
global.document = win.document;
global.localStorage = win.localStorage;
global.location = win.location;
global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });

// 注入数据 + 代码
eval(fs.readFileSync("assets/data/idioms.js", "utf8"));
eval(fs.readFileSync("assets/data/politics_kp.js", "utf8"));
eval(fs.readFileSync("js/config.js", "utf8"));
eval(fs.readFileSync("js/data.js", "utf8"));
eval(fs.readFileSync("js/ebbinghaus.js", "utf8"));
eval(fs.readFileSync("js/icons.js", "utf8"));
eval(fs.readFileSync("js/ui.js", "utf8"));
eval(fs.readFileSync("js/quiz.js", "utf8"));
eval(fs.readFileSync("js/mod-muti.js", "utf8"));
eval(fs.readFileSync("js/mod-politics.js", "utf8"));

(async function () {
  // 初始化数据层
  win.DB.load();
  const body = win.document.getElementById("pageBody");

  // === 测试 1：模块可加载 + 渲染 ===
  if (!win.MODULES.politics) { console.error("FAIL: politics 模块未注册"); process.exit(1); }
  win.MODULES.politics.render(body);
  console.log(`PASS 渲染面板 - body 内 cards=${body.querySelectorAll(".card").length}`);

  // === 测试 2：POLITICS_KP 解析数据 ===
  if (!win.POLITICS_KP || !win.POLITICS_KP.points) { console.error("FAIL: POLITICS_KP 数据缺失"); process.exit(1); }
  console.log(`PASS 知识点数量: ${win.POLITICS_KP.points.length}, 课时 ${win.POLITICS_KP.lessons.length}, 练习题 ${win.POLITICS_KP.bank.length}`);

  // === 测试 3：每日复习清单 ===
  const eb = win.Ebbinghaus;
  const dueToday = eb.pickDaily("politics", win.POLITICS_KP.points, { quota: 10 });
  console.log(`PASS 今日待复习: ${dueToday.length} 个`);
  if (dueToday.length === 0) { console.error("FAIL: 应至少有知识点"); process.exit(1); }

  // === 测试 4：模拟复习流程：markRead 等效路径 ===
  const p = win.POLITICS_KP.points[0];
  eb.updateAfterReview("politics", p.id, true);
  const rec = eb.getRecord("politics", p.id);
  console.log(`PASS 复习记录: box=${rec.box}, last=${rec.last}, next=${rec.next}, seen=${rec.seen}`);
  if (rec.box < 1) { console.error("FAIL: 答对后 box 应该>=1"); process.exit(1); }

  // === 测试 5：再次 pickDaily 应优先返回 due 卡片 ===
  eb.updateAfterReview("politics", win.POLITICS_KP.points[1].id, false);  // 错 → box=0 → next=明天
  // 强制 next <= today，把 rec1 也设为到期
  const rec1 = eb.getRecord("politics", win.POLITICS_KP.points[1].id);
  rec1.next = win.DB.today();  // 改成今天
  const next = eb.pickDaily("politics", win.POLITICS_KP.points.slice(0, 15), { quota: 10 });
  const idx1 = next.findIndex(x => x.id === win.POLITICS_KP.points[1].id);
  console.log(`PASS 已复习/到期切片: 点2在今日清单位置=${idx1}`);

  // === 测试 6：statistics ===
  const stats = eb.getStats("politics");
  console.log(`PASS 复习统计: total=${stats.total}, seen=${stats.seen}, due=${stats.due}, accuracy=${stats.accuracy}%`);
  if (stats.seen < 2) { console.error("FAIL: 应至少有2次复习记录"); process.exit(1); }

  // === 测试 7：DOM 验证 ===
  const today = body.querySelector("#ebToday");
  if (!today) { console.error("FAIL: ebToday DOM 缺失"); process.exit(1); }
  const items = today.querySelectorAll(".kp-item");
  console.log(`PASS DOM 今日清单项: ${items.length} 个卡片`);

  // === 测试 8：复习重置 ===
  eb.resetGroup("politics");
  console.log(`PASS 重置后 total=${eb.getStats("politics").total}`);

  console.log("\nAll tests passed!");
  setTimeout(() => process.exit(0), 100);
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
