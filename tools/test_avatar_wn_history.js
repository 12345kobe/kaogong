// 验证：① 白噪音按钮只显示耳机符号；② 头像支持框选裁剪（选图→裁剪弹窗→确认→头像更新）；
// ③ 申论时评区含「查看历史金句」按钮。
const { chromium } = require('C:/Users/28621/.workbuddy/binaries/node/workspace/node_modules/playwright/index.js');
const fs = require('fs');
function done(out) {
  fs.writeFileSync('C:/Users/28621/Desktop/考公工作台/tools/_test_out.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

(async () => {
  const out = { pass: false, steps: {} };
  const errors = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console:' + m.text()); });
  try {
    const base = 'http://localhost:8099/index.html';
    await page.goto(base);
    await page.waitForTimeout(300);

    // 1) 白噪音按钮仅显示耳机符号
    out.steps.wnText = await page.evaluate(() => document.getElementById('whiteNoiseBtn').textContent.trim());

    // 2) 头像裁剪
    await page.evaluate(() => document.getElementById('accountBtn').click());
    await page.waitForSelector('#pAva', { timeout: 3000 });
    await page.click('#pAva');
    await page.setInputFiles('#pFile', 'C:/Users/28621/Desktop/考公工作台/tools/_test_avatar.png');
    // 裁剪弹窗出现
    await page.waitForSelector('.crop-box', { timeout: 3000 });
    out.steps.cropOpened = true;
    out.steps.cropBoxSize = await page.evaluate(() => {
      const b = document.querySelector('.crop-box');
      return { w: b.offsetWidth, h: b.offsetHeight };
    });
    // 尝试拖动选框（验证 pointer 拖拽不报错）；headless 下指针捕获可能不移动，仅验证无异常
    const box = await page.$('.crop-box');
    const bb = await box.boundingBox();
    if (bb) { await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + 20, bb.y + 15); await page.mouse.up(); }
    // 确认使用
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.modal-actions button')];
      const b = btns.find(x => x.textContent.includes('使用此区域'));
      if (b) b.click();
    });
    await page.waitForTimeout(300);
    out.steps.avatarUpdated = await page.evaluate(() => {
      const img = document.querySelector('.prof-ava img');
      return !!img && (img.getAttribute('src') || '').startsWith('data:image');
    });

    // 3) 申论时评 → 查看历史金句 按钮存在
    await page.evaluate(() => { location.hash = '#/essay'; });
    await page.waitForTimeout(500);
    out.steps.historyBtn = await page.evaluate(() => !!document.getElementById('comHistory'));

    const fatal = errors.filter(e => !/font|woff|gstatic|jsdelivr|googleapis|net::ERR/i.test(e));
    out.steps.fatalErrors = fatal;
    out.pass = out.steps.wnText === '🎧' && out.steps.cropOpened && out.steps.avatarUpdated &&
      out.steps.historyBtn && fatal.length === 0;
  } catch (e) {
    out.error = String(e);
  } finally {
    await browser.close();
  }
  done(out);
  process.exit(out.pass ? 0 : 1);
})().catch(e => { done({ pass: false, fatal: String(e) }); process.exit(1); });
