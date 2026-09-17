/* 隔离测试：仅加载 11 个常识分片，看 window.COMMON_BANK 最终结构 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const DIR = "C:/Users/28621/Desktop/考公工作台/site/assets/data";
const chunks = ["common_geo_1.js","common_geo_2.js","common_law_1.js","common_law_2.js","common_law_3.js","common_eco_1.js","common_tech_1.js","common_tech_2.js","common_tech_3.js","common_tech_4.js","common_pol_1.js"];

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { runScripts: "dangerously", url: "http://localhost/" });
const { window } = dom;
const errors = [];
window.addEventListener("error", e => errors.push("err: " + (e.message||e)));

for (const c of chunks) {
  const s = window.document.createElement("script");
  s.textContent = fs.readFileSync(path.join(DIR, c), "utf-8");
  try { window.document.body.appendChild(s); }
  catch (e) { errors.push(c + ": " + e.message); }
}

console.log("window.COMMON_BANK 存在:", !!window.COMMON_BANK);
if (window.COMMON_BANK) {
  console.log("keys:", Object.keys(window.COMMON_BANK));
  for (const k of Object.keys(window.COMMON_BANK)) {
    const v = window.COMMON_BANK[k];
    console.log(`  ${k}: name=${v && v.name}, items.length=${v && v.items ? v.items.length : "(无items)"}`);
  }
}
console.log("错误:", errors.length);
errors.forEach(e=>console.log("  ✗", e));
