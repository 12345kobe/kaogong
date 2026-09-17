// 验证：① 旧版系统字体栈自动迁移为网页字体栈；② 网页字体栈被应用到 --font-body/--font-head；
// ③ 页面含网页字体 <link>；④ 加载无致命报错。
const { chromium } = require('C:/Users/28621/.workbuddy/binaries/node/workspace/node_modules/playwright/index.js');

(async () => {
  const out = { pass: false, steps: {} };
  const errors = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console:' + m.text()); });
  try {
    const base = 'http://localhost:8099/index.html';

    // 1) 写入旧版系统字体栈（手机上无此字体，之前会回退默认）
    await page.goto(base);
    await page.evaluate(() => localStorage.setItem('kg_font', '"华文行楷","STXingkai","行楷",cursive'));
    await page.reload();
    await page.waitForTimeout(400);

    // 2) 迁移后 localStorage 应变成带网页字体的新栈
    out.steps.rawKgFont = await page.evaluate(() => localStorage.getItem('kg_font') || '');
    out.steps.migrated = await page.evaluate(() => {
      const s = localStorage.getItem('kg_font') || '';
      return s.indexOf('"Ma Shan Zheng"') === 0; // 行楷 → 网页字体 Ma Shan Zheng 在前（含引号）
    });

    // 3) 应用层 --font-body 应含网页字体族
    out.steps.bodyHasWebFont = await page.evaluate(() => {
      const v = document.documentElement.style.getPropertyValue('--font-body') || '';
      return v.indexOf('Ma Shan Zheng') !== -1;
    });
    out.steps.headHasWebFont = await page.evaluate(() => {
      const v = document.documentElement.style.getPropertyValue('--font-head') || '';
      return v.indexOf('Ma Shan Zheng') !== -1;
    });

    // 4) 切换为楷体（LXGW WenKai）并验证应用
    await page.evaluate(() => localStorage.setItem('kg_font', '"LXGW WenKai","楷体","KaiTi","Kaiti SC","STKaiti",serif'));
    await page.reload();
    await page.waitForTimeout(400);
    out.steps.kaitiApplied = await page.evaluate(() => {
      const v = document.documentElement.style.getPropertyValue('--font-body') || '';
      return v.indexOf('LXGW WenKai') !== -1;
    });

    // 5) 页面应含网页字体 link
    out.steps.hasGoogleFontsLink = await page.evaluate(() =>
      !!document.querySelector('link[href*="fonts.googleapis.cn/css2"]'));
    out.steps.hasLxgwLink = await page.evaluate(() =>
      !!document.querySelector('link[href*="lxgw-wenkai-webfont"]'));

    // 6) 设置页能打开且字体按钮存在
    await page.evaluate(() => { location.hash = '#/settings'; });
    await page.waitForTimeout(300);
    out.steps.settingsFontOpts = await page.evaluate(() =>
      document.querySelectorAll('.font-opt').length);

    // 仅过滤掉字体网络相关的 404/失败（CDN 在某些网络下可能慢），其他报错视为致命
    const fatal = errors.filter(e => !/font|woff|gstatic|jsdelivr|googleapis|net::ERR/i.test(e));
    out.steps.fatalErrors = fatal;
    out.steps.fontNetErrors = errors.length - fatal.length;

    out.pass = out.steps.migrated && out.steps.bodyHasWebFont && out.steps.headHasWebFont &&
      out.steps.kaitiApplied && out.steps.hasGoogleFontsLink && out.steps.hasLxgwLink &&
      out.steps.settingsFontOpts >= 6 && fatal.length === 0;
  } catch (e) {
    out.error = String(e);
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.pass ? 0 : 1);
})();
