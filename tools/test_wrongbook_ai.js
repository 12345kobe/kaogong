// 真机验证：错题本每题有「AI 咨询」「重做本题」，且时政错题被纳入
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

  // 注入一条「时政」和一条「言语」错题
  await page.evaluate(() => {
    const DB = window.DB;
    DB.state.wrongbook = DB.state.wrongbook || {};
    DB.state.wrongbook["时政"] = [{
      id: "t1", q: "2024年中央一号文件聚焦什么？", options: ["粮食安全", "科技创新", "金融"], a: 0, ua: 1,
      date: "2026-09-14", e: "强调粮食安全", note: "", img: "", reviewCount: 0, correctStreak: 0
    }];
    DB.state.wrongbook["言语"] = [{
      id: "y1", q: "下列词语中加点字读音相同的是？", options: ["A", "B", "C", "D"], a: 2, ua: 0,
      date: "2026-09-14", e: "解析内容", note: "", img: "", reviewCount: 0, correctStreak: 0
    }];
    DB.save();
  });

  // 进入错题本
  await page.evaluate(() => { location.hash = "#/wrongbook"; });
  await page.waitForTimeout(500);

  const tabsText = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("#tabs .chip")).map(c => c.textContent);
  });

  // 切到「时政」tab
  await page.evaluate(() => {
    const chip = Array.from(document.querySelectorAll("#tabs .chip")).find(c => /时政/.test(c.textContent));
    if (chip) chip.click();
  });
  await page.waitForTimeout(300);

  const itemInfo = await page.evaluate(() => {
    const card = document.querySelector("#list .todo");
    if (!card) return { found: false };
    return {
      found: true,
      hasAi: !!card.querySelector("[data-ai]"),
      hasRedo: !!card.querySelector("[data-redo]"),
      q: (card.textContent || "").slice(0, 20)
    };
  });

  // 点「AI 咨询」→ 应跳到 AI 模块且输入框预填
  await page.evaluate(() => { document.querySelector("#list .todo [data-ai]").click(); });
  await page.waitForTimeout(500);
  const afterAi = await page.evaluate(() => {
    const inp = document.querySelector("#aiInput");
    return { hash: location.hash, activeNav: (document.querySelector("#nav .nav-item.active") || {}).textContent || "", inputVal: inp ? inp.value : null };
  });

  // 回到错题本，点「重做本题」→ 应弹出答题（不应重复写入错题本）
  const beforeCount = await page.evaluate(() => (window.DB.state.wrongbook["时政"] || []).length);
  await page.evaluate(() => { location.hash = "#/wrongbook"; });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const chip = Array.from(document.querySelectorAll("#tabs .chip")).find(c => /时政/.test(c.textContent));
    if (chip) chip.click();
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => { document.querySelector("#list .todo [data-redo]").click(); });
  await page.waitForTimeout(400);
  const afterRedo = await page.evaluate(() => {
    const hasModal = !!document.querySelector("#modalRoot .modal");
    const hasQuiz = !!document.querySelector("#modalRoot .quiz-q");
    const count = (window.DB.state.wrongbook["时政"] || []).length;
    return { hasModal, hasQuiz, count };
  });

  const pass =
    tabsText.some(t => /时政/.test(t)) &&       // 时政被纳入 tab
    itemInfo.found && itemInfo.hasAi && itemInfo.hasRedo &&
    afterAi.hash === "#/ai" && /AI/.test(afterAi.activeNav || "") && afterAi.inputVal && afterAi.inputVal.includes("2024年中央一号文件") &&
    afterRedo.hasModal && afterRedo.count === beforeCount; // 重做未重复写入错题本
  const verdict = { tabsText, itemInfo, afterAi, beforeCount, afterRedo, pageerrors: errors.length, pass };
  fs.writeFileSync(path.resolve(__dirname, "wrongbook_ai_result.json"), JSON.stringify(verdict, null, 2));
  console.log("VERDICT:", JSON.stringify(verdict, null, 2));
  await browser.close().catch(() => {});
  process.exitCode = pass ? 0 : 1;
}
main().catch(e => { fs.writeFileSync(path.resolve(__dirname, "wrongbook_ai_result.json"), "FATAL: " + (e && e.stack || e)); console.log("FATAL:", e && e.stack || e); process.exitCode = 1; });
