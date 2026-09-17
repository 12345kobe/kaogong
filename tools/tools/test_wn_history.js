const { chromium } = require('C:/Users/28621/.workbuddy/binaries/node/workspace/node_modules/playwright/index.js');
const fs = require('fs');
const OUT = 'C:/Users/28621/Desktop/考公工作台/tools/_test_out2.json';
const steps = [];
function log(s) { steps.push(s); try { fs.writeFileSync(OUT, JSON.stringify(steps, null, 2)); } catch (e) {} }
(async () => {
  log('start');
  const errors = [];
  const browser = await chromium.launch({ args: ['--disable-dev-shm-usage', '--no-sandbox'] });
  log('launched');
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('c:' + m.text()); });
  await page.goto('http://localhost:8099/index.html', { timeout: 15000 });
  log('goto');
  await page.waitForTimeout(300);
  log('wnText=' + await page.evaluate(() => document.getElementById('whiteNoiseBtn').textContent.trim()));
  await page.evaluate(() => { location.hash = '#/essay'; });
  await page.waitForTimeout(500);
  log('historyBtn=' + await page.evaluate(() => !!document.getElementById('comHistory')));
  await page.evaluate(() => document.getElementById('comHistory').click());
  await page.waitForTimeout(300);
  log('historyModal=' + await page.evaluate(() =>
    document.body.textContent.includes('历史金句') || document.body.textContent.includes('暂无历史金句')));
  const fatal = errors.filter(e => !/font|woff|gstatic|jsdelivr|googleapis|net::ERR/i.test(e));
  log('fatal=' + JSON.stringify(fatal));
  log('PASS=' + (steps.some(s => s.startsWith('wnText=🎧')) && steps.some(s => s === 'historyBtn=true') && steps.some(s => s === 'historyModal=true') && fatal.length === 0));
  try { await browser.close(); } catch (e) {}
  log('done');
})().catch(e => { log('FATAL ' + e.message); });
