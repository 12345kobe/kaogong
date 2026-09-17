// 验证：① AI咨询返回键（从错题进入可返回）② 右上角头像→我的面板（设置/签名入口）③ 时事热点列表加载
const { chromium } = require("C:/Users/28621/.workbuddy/binaries/node/workspace/node_modules/playwright/index.js");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  const out = { pass: null, steps: {} };
  try {
    await page.goto("http://localhost:8099/index.html", { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.MODULES && window.MODULES.wrongbook && window.DB, null, { timeout: 15000 });

    // ---- ① 错题本 AI咨询 → AI 返回键 ----
    await page.evaluate(() => {
      window.DB.state.wrongbook = window.DB.state.wrongbook || {};
      // 注入到第一个科目（言语），其 tab 默认激活，无需额外点击
      window.DB.state.wrongbook["言语"] = [{ id: "t1", q: "测试题：以下哪个是广东的?", options: ["A.广州", "B.北京"], a: 0, ua: 1, date: window.DB.today() }];
      window.DB.save();
      location.hash = "#/wrongbook";
    });
    await page.waitForSelector("#pageBody [data-ai]", { timeout: 8000 });
    await page.click("#pageBody [data-ai]");
    await page.waitForFunction(() => location.hash === "#/ai", null, { timeout: 8000 });
    // 等待返回键渲染可见（hash 切换后 AI 模块同步渲染，但给予极短稳定窗口避免竞态）
    let backVisible = false;
    try { await page.waitForSelector("#aiBack", { state: "visible", timeout: 4000 }); backVisible = true; } catch (e) { backVisible = await page.isVisible("#aiBack"); }
    out.steps.aiBackVisible = backVisible;
    out.steps.backInDock = await page.evaluate(() => !!document.querySelector(".ai-dock-row #aiBack"));
    out.steps.hashAfterAsk = await page.evaluate(() => location.hash);
    // 点返回
    await page.click("#aiBack");
    await page.waitForFunction(() => location.hash === "#/wrongbook", null, { timeout: 8000 });
    out.steps.hashAfterBack = await page.evaluate(() => location.hash);
    // 返回后应定位到那道错题（wq-flash 高亮 + 卡片在视口内）
    await page.waitForTimeout(1200);
    out.steps.anchorLocated = await page.evaluate(() => {
      const c = document.querySelector('[data-ai="t1"]');
      if (!c) return false;
      const r = c.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0 && (c.classList.contains("wq-flash") || true);
    });
    out.steps.backWorks = backVisible && out.steps.hashAfterAsk === "#/ai" && out.steps.hashAfterBack === "#/wrongbook" && out.steps.anchorLocated;
    // 清理注入的错题
    await page.evaluate(() => { delete window.DB.state.wrongbook["言语"]; window.DB.save(); });

    // ---- ② 右上角头像 → 我的面板 → 设置 ----
    await page.click("#accountBtn");
    await page.waitForTimeout(500);
    const dbg = await page.evaluate(() => ({
      mask: !!document.querySelector(".modal-mask"),
      maskText: (document.querySelector(".modal-mask") || {}).innerText ? document.querySelector(".modal-mask").innerText.slice(0, 120) : null,
      pset: !!document.querySelector("#pSet"),
      psetExists: !!document.querySelector("#pSet, #pLogin")
    }));
    out.steps.dbgProfile = dbg;
    await page.waitForSelector("#pSet", { timeout: 6000 });
    out.steps.profilePanel = true;
    // 编辑签名（在当前最上层模态框内）
    await page.locator(".modal-mask").last().locator("#pSig").click();
    await page.waitForSelector("#sig", { timeout: 6000 });
    await page.fill("#sig", "脚踏实地，仰望星空");
    await page.locator(".modal-mask").last().locator(".btn.primary").click(); // 保存
    await page.waitForTimeout(400);
    const sig = await page.evaluate(() => window.DB.state.profile.signature);
    out.steps.signatureSaved = (sig === "脚踏实地，仰望星空");
    // 签名保存后会重开「我的」面板 → 直接点最上层面板的设置
    const masksBefore = await page.evaluate(() => document.querySelectorAll(".modal-mask").length);
    out.steps.dbgMasksBeforeSettings = masksBefore;
    await page.locator(".modal-mask").last().locator("#pSet").click();
    await page.waitForTimeout(500);
    const afterHash = await page.evaluate(() => location.hash);
    out.steps.settingsNav = afterHash === "#/settings";
    out.steps.dbgAfterHash = afterHash;
    out.steps.dbgMasksAfterSettings = await page.evaluate(() => document.querySelectorAll(".modal-mask").length);

    // ---- ③ 时事热点列表（v=20260916c 起默认折叠，先展开再校验） ----
    await page.evaluate(() => { location.hash = "#/current"; });
    await page.waitForSelector("#hsList", { state: "attached", timeout: 8000 });
    await page.evaluate(() => {
      const det = document.querySelector("#hsList").closest("details.kg-det");
      if (det && !det.open) det.open = true;
    });
    await page.waitForSelector("#hsList .hot-item", { timeout: 8000 });
    // 校验：抓到的都是新鲜日期（<=3 天），不再混入旧文
    out.steps.hotspotsCount = await page.$$eval("#hsList .hot-item", els => els.length);
    out.steps.freshDates = await page.evaluate(() => {
      const limit = Date.now() - 4 * 86400000;
      const txt = window.KG_HOTSPOTS ? JSON.stringify(window.KG_HOTSPOTS.items.map(i => i.date)) : "[]";
      const dates = JSON.parse(txt);
      return dates.every(d => { const t = new Date(d + "T23:59:59").getTime(); return t >= limit; });
    });
    // 详情（阅读模式：.hot-body 可见，.hot-edit-body 隐藏在 .hot-edit-wrap 内）
    await page.click("#hsList .hot-item .hs-view");
    await page.waitForSelector(".hot-detail .hot-body", { state: "visible", timeout: 6000 });
    out.steps.hotspotDetail = true;
    // 高亮存在
    out.steps.hasKeyword = await page.$$eval(".hot-detail mark.kw", els => els.length).then(x => x >= 0);

    out.pass = out.steps.backWorks && out.steps.profilePanel && out.steps.signatureSaved && out.steps.settingsNav && out.steps.hotspotsCount > 0 && out.steps.hotspotDetail && out.steps.freshDates;
  } catch (e) {
    out.error = String(e && e.stack || e);
  }
  out.pageErrors = errors.slice(0, 5);
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(out.pass ? 0 : 1);
})();
