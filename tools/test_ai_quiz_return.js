// 验证：从「答题弹窗」（收藏批量练题）内点「没看懂？询问 AI」→ AI 返回键
// 能回到「那组题的那道题」（弹窗保留、滚动并高亮到对应题、作答状态保留）
const { chromium } = require("C:/Users/28621/.workbuddy/binaries/node/workspace/node_modules/playwright/index.js");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  const out = { pass: null, steps: {} };
  try {
    await page.goto("http://localhost:8099/index.html", { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.MODULES && window.MODULES.favorites && window.DB, null, { timeout: 15000 });

    // 注入 5 道收藏题（言语），确保批量练题正好抽满这 5 道（第 3 题作为「那道题」）
    await page.evaluate(() => {
      window.DB.state.favorites = window.DB.state.favorites || {};
      const mk = (i) => ({ qid: "q" + i, q: "收藏测试题" + i, options: ["选项A", "选项B", "选项C"], a: 0, e: "解析" + i, subject: "言语" });
      window.DB.state.favorites["言语"] = [mk(0), mk(1), mk(2), mk(3), mk(4)];
      window.DB.save();
      location.hash = "#/favorites";
    });
    await page.waitForSelector("#favBatch", { timeout: 8000 });
    await page.click("#favBatch");
    await page.waitForSelector("#bStart", { timeout: 8000 });
    await page.click("#bStart");
    // 等待答题卡渲染（5 题）
    await page.waitForSelector('.quiz-q[data-qi="2"]', { timeout: 8000 });
    out.steps.quizRendered = await page.$$eval(".quiz-q", els => els.length);

    // 每题都作答：第 3 题（data-qi=2）故意选错（选 index 1，正确答案为 0）
    await page.evaluate(() => {
      document.querySelectorAll(".quiz-q").forEach(card => {
        const qi = parseInt(card.dataset.qi, 10);
        const opts = card.querySelectorAll(".opt");
        const pick = (qi === 2) ? 1 : 0;
        opts[pick].click();
      });
    });
    // 交卷
    await page.click("#showAns");
    // 第 3 题揭示后应出现「没看懂？询问 AI」
    await page.waitForSelector('.quiz-q[data-qi="2"] .ask-ai', { timeout: 8000 });
    out.steps.askBtnShown = true;

    // 记录进入 AI 前第 3 题的作答状态（selected 选项）
    out.steps.beforeSelected = await page.evaluate(() => {
      const c = document.querySelector('.quiz-q[data-qi="2"]');
      const sel = c.querySelector(".opt.selected");
      return sel ? Array.from(c.querySelectorAll(".opt")).indexOf(sel) : -1;
    });

    // 点击「没看懂？询问 AI」
    await page.click('.quiz-q[data-qi="2"] .ask-ai');
    await page.waitForFunction(() => location.hash === "#/ai", null, { timeout: 8000 });
    out.steps.hashAfterAsk = await page.evaluate(() => location.hash);
    out.steps.dbgReturnHash = await page.evaluate(() => window.KGAI && window.KGAI.getReturn ? window.KGAI.getReturn() : null);
    out.steps.dbgAiBackExists = await page.evaluate(() => !!document.querySelector("#aiBack"));
    out.steps.dbgAiBackDisplay = await page.evaluate(() => { const b = document.querySelector("#aiBack"); return b ? getComputedStyle(b).display : "none-el"; });
    // 关键：答题弹窗应被「隐藏」（display:none）而非销毁
    out.steps.modalHidden = await page.evaluate(() => {
      const ms = Array.from(document.querySelectorAll(".modal-mask"));
      return ms.some(m => m.style.display === "none");
    });
    out.steps.aiBackVisible = await page.isVisible("#aiBack");

    // 点返回
    await page.click("#aiBack");
    await page.waitForFunction(() => location.hash === "#/favorites", null, { timeout: 8000 });
    out.steps.hashAfterBack = await page.evaluate(() => location.hash);
    // 弹窗应已恢复（不再 display:none）
    await page.waitForTimeout(400);
    out.steps.modalRestored = await page.evaluate(() => {
      const ms = Array.from(document.querySelectorAll(".modal-mask"));
      return ms.length > 0 && ms.every(m => m.style.display !== "none");
    });
    // 第 3 题应在视口内（被滚动定位）并带高亮
    out.steps.targetInView = await page.evaluate(() => {
      const c = document.querySelector('.quiz-q[data-qi="2"]');
      if (!c) return false;
      const r = c.getBoundingClientRect();
      return r.top >= -5 && r.bottom <= window.innerHeight + 5 && r.height > 0;
    });
    out.steps.targetFlashed = await page.evaluate(() => !!document.querySelector('.quiz-q[data-qi="2"].qz-flash'));
    // 作答状态应保留（第 3 题仍选中 index 1）
    out.steps.afterSelected = await page.evaluate(() => {
      const c = document.querySelector('.quiz-q[data-qi="2"]');
      const sel = c.querySelector(".opt.selected");
      return sel ? Array.from(c.querySelectorAll(".opt")).indexOf(sel) : -1;
    });

    out.steps.backWorks = out.steps.hashAfterAsk === "#/ai" && out.steps.modalHidden &&
      out.steps.aiBackVisible && out.steps.hashAfterBack === "#/favorites" &&
      out.steps.modalRestored && out.steps.targetInView && out.steps.afterSelected === 1;

    // 清理注入
    await page.evaluate(() => { delete window.DB.state.favorites["言语"]; window.DB.save(); });

    out.pass = out.steps.backWorks && errors.length === 0;
  } catch (e) {
    out.error = String(e && e.stack || e);
  }
  out.pageErrors = errors.slice(0, 5);
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(out.pass ? 0 : 1);
})();
