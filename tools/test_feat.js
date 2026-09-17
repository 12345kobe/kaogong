const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  await page.goto("http://localhost:8099/index.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  // ===== 1) 悬浮标注按钮 + 手写 =====
  await page.evaluate(() => {
    const pb = document.getElementById("pageBody");
    window.UI.floatingAnno("测试", "fabtest", pb);
  });
  const fabExists = await page.evaluate(() => !!document.querySelector(".kg-anno-fab"));
  console.log("悬浮按钮存在:", fabExists);

  // 点击悬浮按钮 → 手写覆盖层
  await page.click(".kg-anno-fab");
  await page.waitForTimeout(300);
  const overlayOpen = await page.evaluate(() => !!document.querySelector(".hw-overlay"));
  console.log("点击后手写覆盖层打开:", overlayOpen);

  // 在 canvas 上拖一道笔迹
  const box = await page.evaluate(() => {
    const c = document.querySelector(".hw-layer").getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height };
  });
  await page.mouse.move(box.x + 60, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 240, { steps: 8 });
  await page.mouse.move(box.x + 260, box.y + 210, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  // 关闭保存
  await page.click(".hw-tool.close");
  await page.waitForTimeout(200);

  const strokeCount = await page.evaluate(() => {
    const n = window.DB.state.notes && window.DB.state.notes["测试"] && window.DB.state.notes["测试"]["fabtest"];
    return n ? n.strokes.length : -1;
  });
  const overlayAfter = await page.evaluate(() => !!document.querySelector(".kg-inline-ov"));
  console.log("保存后笔迹数:", strokeCount, "| 页内笔迹覆盖层显示:", overlayAfter);

  // ===== 2) 收藏批量练题 =====
  await page.evaluate(() => {
    // 注入两科收藏题
    const DB = window.DB;
    DB.state.favorites = DB.state.favorites || {};
    DB.state.favorites["言语"] = [{ qid: "a1", q: "收藏测试题1", options: ["A选项", "B选项", "C选项", "D选项"], a: 0, e: "解析1", subject: "言语" }];
    DB.state.favorites["常识"] = [{ qid: "c1", q: "收藏测试题2", options: ["对", "错"], a: 0, e: "解析2", subject: "常识" }];
    DB.save();
  });
  // 导航到收藏模块
  await page.evaluate(() => { if (window.MODULES && window.MODULES.favorites) window.MODULES.favorites.render(document.getElementById("pageBody")); });
  await page.waitForTimeout(300);
  const batchBtn = await page.evaluate(() => !!document.querySelector("#favBatch"));
  console.log("收藏页「批量练题」按钮存在:", batchBtn);

  await page.click("#favBatch");
  await page.waitForTimeout(200);
  const cfgOpen = await page.evaluate(() => !!document.querySelector("#bStart"));
  console.log("批量练题配置弹窗打开:", cfgOpen);

  // 设题量 = 2（只有 2 道收藏），模式默认练题
  await page.evaluate(() => {
    const r = document.querySelector("#bN");
    r.value = "2";
    r.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click("#bStart");
  await page.waitForTimeout(400);

  const quizRendered = await page.evaluate(() => {
    const q = document.querySelector(".fav-quiz .quiz-q");
    const submit = document.querySelector(".fav-quiz .quiz-submit #showAns");
    return { hasQuiz: !!q, hasSubmit: !!submit, count: document.querySelectorAll(".fav-quiz .quiz-q").length };
  });
  console.log("批量练题渲染:", JSON.stringify(quizRendered));

  console.log("页面错误数:", errors.length, errors.slice(0, 5).join(" | "));
  await browser.close();
})();
