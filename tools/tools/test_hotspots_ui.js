/* 时事热点改造冒烟测试：地区切换 / 日期分组 / 搜索 / 展开折叠 */
const { chromium } = require("playwright");
const fs = require("fs");
const BASE = "https://12345kobe.github.io/kaogong/";
const OUT = __dirname + "/_hotspots_out.json";

(async () => {
  const out = { pass: false, steps: {}, fatal: [] };
  let browser;
  try {
    browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    page.on("pageerror", e => out.fatal.push("pageerror: " + e.message));
    page.on("console", m => { if (m.type() === "error") out.fatal.push("console: " + m.text().slice(0, 160)); });

    await page.goto(BASE + "#/current", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    // 展开「时事热点」折叠区
    await page.evaluate(() => {
      document.querySelectorAll("details").forEach(d => { if ((d.textContent || "").includes("时事热点")) d.open = true; });
    });
    await page.waitForSelector("#hsList", { state: "attached", timeout: 15000 });
    await page.waitForSelector(".hs-date", { timeout: 15000 });

    // 1. 两个地区按钮，全国在前且默认选中
    const tabs = await page.$$eval(".hs-tab", els => els.map(e => ({ t: e.textContent.trim(), active: e.classList.contains("active"), r: e.dataset.r })));
    out.steps.tabs = tabs;
    out.steps.tabsOk = tabs.length === 2 && tabs[0].r === "全国" && tabs[0].active && tabs[1].r === "广东";

    // 2. 按日期分组
    const dates = await page.$$eval(".hs-date", els => els.map(e => ({
      d: e.dataset.d, open: e.classList.contains("open"), n: e.querySelectorAll(".hot-item").length
    })));
    out.steps.dateGroups = dates.length;
    out.steps.datesSample = dates.slice(0, 6);
    out.steps.groupedOk = dates.length > 0 && dates.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x.d) || x.d === "未标注日期");

    // 3. 近三天展开、更早折叠
    const openDates = dates.filter(x => x.open).map(x => x.d);
    out.steps.openDates = openDates;
    out.steps.recentOpenOk = openDates.length > 0;

    // 4. 点击日期可折叠/展开
    const firstD = dates[0].d;
    await page.click(`.hs-date[data-d="${firstD}"] .hs-date-h`);
    await page.waitForTimeout(300);
    const afterToggle = await page.$eval(`.hs-date[data-d="${firstD}"]`, e => e.classList.contains("open"));
    out.steps.toggleWorks = afterToggle === !dates[0].open;
    await page.click(`.hs-date[data-d="${firstD}"] .hs-date-h`); // 还原
    await page.waitForTimeout(300);

    // 5. 切换到「广东」
    await page.click('.hs-tab[data-r="广东"]');
    await page.waitForTimeout(600);
    const gdInfo = await page.evaluate(() => {
      const items = [...document.querySelectorAll(".hs-date-b:not([hidden]) .hot-item")];
      const badges = items.map(i => (i.querySelector(".hot-badge") || {}).textContent || "");
      return { total: items.length, allGd: badges.length > 0 && badges.every(b => b.trim() === "广东") };
    });
    out.steps.gdTab = gdInfo;

    // 6. 搜索关键词
    await page.click('.hs-tab[data-r="全国"]');
    await page.waitForTimeout(500);
    const before = await page.$$eval(".hot-item", e => e.length);
    // 取第一条标题的前几个字作为关键词
    const kw = await page.$eval(".hs-date-b:not([hidden]) .hot-title", e => (e.textContent || "").trim().slice(0, 4));
    await page.fill("#hsSearch", kw);
    await page.waitForTimeout(700);
    const after = await page.$$eval(".hot-item", e => e.length);
    out.steps.search = { kw, before, after, narrowed: after > 0 && after <= before };

    // 7. 导入网页按钮存在
    out.steps.hasImportBtn = !!(await page.$("#hsImport"));
    // 8. 每条都有导出PDF与查看完整
    const btns = await page.$$eval(".hs-date-b:not([hidden]) .hot-item", els => els.map(e => ({
      view: !!e.querySelector(".hs-view"), pdf: !!e.querySelector(".hs-pdf")
    })));
    out.steps.itemBtnsOk = btns.length > 0 && btns.every(b => b.view && b.pdf);

    out.pass = out.steps.tabsOk && out.steps.groupedOk && out.steps.recentOpenOk
      && out.steps.toggleWorks && out.steps.gdTab.allGd
      && out.steps.search.narrowed && out.steps.hasImportBtn && out.steps.itemBtnsOk
      && out.fatal.length === 0;
  } catch (e) {
    out.fatal.push("FATAL: " + e.message);
  } finally {
    if (browser) await browser.close();
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
  }
})();
