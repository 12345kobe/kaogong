/* jsdom 端到端渲染测试：手动按 index.html 顺序注入所有本地脚本，
   进入常识模块 -> 点「练习」-> 选 10 题 -> 开始练习，
   断言题目卡片真正渲染出来，并捕获任何 JS 报错。 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = "C:/Users/28621/Desktop/考公工作台/site";
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf-8");

// 抽取本地脚本路径（去掉 ?v= 查询）——兼容「缺少 >」的畸形标签
const scripts = [];
html.replace(/<script\b[^>]*\bsrc="([^"]+)"[\s\S]*?<\/script>/g, (m, src) => {
  if (!src.startsWith("http")) scripts.push(src.split("?")[0]);
  return m;
});

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push("jsdomError: " + (e.message || e)));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));

const dom = new JSDOM(html.replace(/<script\s+src="[^"]+"[^>]*><\/script>/g, ""), {
  runScripts: "dangerously",
  url: "http://localhost/",
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;
window.addEventListener("error", e => errors.push("window.error: " + (e.message || e.error)));

// 逐脚本注入：用动态 <script> 元素（jsdom 最可靠的全局执行方式）
window.Chart = function(){ return {}; };
window.Chart.defaults = {};
log("提取到本地脚本数:", scripts.length);
for (const rel of scripts) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { errors.push("文件缺失: " + rel); continue; }
  const s = window.document.createElement("script");
  s.textContent = fs.readFileSync(file, "utf-8");
  try {
    window.document.body.appendChild(s);
  } catch (e) {
    errors.push("脚本执行失败 [" + rel + "]: " + e.message);
  }
}

setTimeout(run, 300);

function log(...a){ console.log(...a); }
function run(){
  const W = window;
  log("=== 全局对象检查 ===");
  log("window.COMMON_BANK 存在:", !!W.COMMON_BANK);
  if (W.COMMON_BANK){
    const total = ["geo","law","eco","tech","pol"].reduce((a,m)=>a+(W.COMMON_BANK[m]?W.COMMON_BANK[m].items.length:0),0);
    log("COMMON_BANK 总题数:", total);
  }
  log("window.Quiz 存在:", !!W.Quiz);
  log("window.UI 存在:", !!W.UI, " UI.el:", !!(W.UI&&W.UI.el), " UI.modal:", !!(W.UI&&W.UI.modal));
  log("window.DB 存在:", !!W.DB);
  log("window.MODULES.common 存在:", !!(W.MODULES && W.MODULES.common));
  log("捕获的 JS 错误数:", errors.length);
  errors.slice(0,12).forEach(e=>log("  ✗", e));

  if (!W.MODULES || !W.MODULES.common){ log("✗ 无法继续：common 模块未加载"); return finish(); }

  const body = W.document.createElement("div");
  W.document.body.appendChild(body);
  try { W.MODULES.common.render(body); }
  catch(e){ log("✗ render 抛错:", e.message); return finish(); }

  log("=== 渲染常识模块后 ===");
  log("分模块行数:", body.querySelectorAll(".cm-row").length);
  log("预测题「开始练习」按钮存在:", !!body.querySelector("#start"));
  log("分模块「练习」按钮存在:", !!body.querySelector(".cm-practice"));

  let modalOpened = false;
  W.UI.modal = function(opts){
    modalOpened = true;
    const startBtn = (opts.actions||[]).find(a=>a.label.includes("开始"));
    if (startBtn) startBtn.onClick(null, ()=>{});
    return { close(){} };
  };

  const modPractice = body.querySelector(".cm-practice");
  if (modPractice){ try { modPractice.click(); } catch(e){ log("✗ 点击练习抛错:", e.message); } }
  log("orderModal 是否触发:", modalOpened);

  setTimeout(() => {
    const quiz2 = body.querySelector("#quiz2");
    const cards = quiz2 ? quiz2.querySelectorAll(".quiz-q") : [];
    log("=== 练习渲染结果 ===");
    log("#quiz2 存在:", !!quiz2);
    log("渲染出的题目卡片数:", cards.length);
    if (cards[0]) log("首个题目文本(截断):", cards[0].querySelector(".q").textContent.slice(0,40));
    log(cards.length>0 ? "✅ 练习题目成功显示" : "❌ 练习题目仍未显示");
    finish();
  }, 600);
}
function finish(){
  log("\n=== 错误汇总 ===");
  if (!errors.length) log("无 JS 错误"); else errors.forEach(e=>log("  ✗", e));
  process.exit(0);
}
