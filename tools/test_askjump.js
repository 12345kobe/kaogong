// 真机验证：在模态框里点「询问 AI」后，应关闭弹窗并跳到 AI 模块（输入框被预填），而不是停留在原位置
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

async function main() {
  const url = "file://" + path.resolve(__dirname, "..", "index.html");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));

  await page.goto(url);
  await page.waitForTimeout(400);

  // 模拟一个打开的刷题模态框（如收藏/资料/言语弹窗），再调用 KGAI.ask
  const sync = await page.evaluate(() => {
    const root = document.getElementById("modalRoot");
    if (!root) return { err: "no modalRoot" };
    const fake = document.createElement("div");
    fake.className = "modal-mask";
    fake.innerHTML = '<div class="modal"><h2>刷题弹窗</h2><div class="modal-body">题目...</div></div>';
    root.appendChild(fake);
    const before = root.childElementCount;
    // 模拟点击「询问 AI」
    window.KGAI.ask("【科目】常识\n【题目】为什么选 A？\n我的疑惑：没懂");
    return { before, afterRemove: root.childElementCount, hash: location.hash };
  });

  await page.waitForTimeout(500); // 等 hashchange → renderRoute → AI 模块渲染并消费 pending

  const after = await page.evaluate(() => {
    const root = document.getElementById("modalRoot");
    const inp = document.querySelector(".ai-input") || document.querySelector("#aiInput") || document.querySelector("textarea.ai-input");
    return {
      modalChildren: root ? root.childElementCount : -1,
      hash: location.hash,
      activeNav: (document.querySelector("#nav .nav-item.active") || {}).textContent || "",
      inputVal: inp ? inp.value : null,
      hasAiText: !!document.querySelector(".ai-text, .ai-wrap")
    };
  });

  const pass =
    sync.before === 1 &&
    sync.afterRemove === 0 &&            // 弹窗被同步关闭
    after.modalChildren === 0 &&         // 仍无残留弹窗
    after.hash === "#/ai" &&             // 跳到 AI 模块
    /AI/.test(after.activeNav || "") &&  // 导航高亮在 AI
    after.inputVal && after.inputVal.includes("为什么选 A"); // 输入框被预填
  const verdict = { sync, after, pageerrors: errors.length, errors: errors.slice(0, 3), pass };
  fs.writeFileSync(path.resolve(__dirname, "askjump_result.json"), JSON.stringify(verdict, null, 2));
  console.log("VERDICT:", JSON.stringify(verdict, null, 2));
  await browser.close().catch(() => {});
  process.exitCode = pass ? 0 : 1;
}

main().catch(e => { fs.writeFileSync(path.resolve(__dirname, "askjump_result.json"), "FATAL: " + (e && e.stack || e)); console.log("FATAL:", e && e.stack || e); process.exitCode = 1; });
