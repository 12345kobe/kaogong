const { chromium } = require('C:/Users/28621/.workbuddy/binaries/node/workspace/node_modules/playwright/index.js');
const fs = require('fs');
const LOG = 'tools/_social_out.json';
function log(o) { try { fs.writeFileSync(LOG, JSON.stringify(o, null, 2)); } catch (e) {} }
const out = { pass: false, steps: {} };
const BASE = 'http://localhost:3000';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function page_wait(page, sel, t) { try { await page.waitForSelector(sel, { timeout: t }); return true; } catch (e) { return false; } }

async function ensureProfile(page, name) {
  // 若出现强制资料弹窗，自动填好并保存
  const has = await page_wait(page, '#pfNick', 6000);
  if (!has) return false;
  await page.fill('#pfNick', name.toUpperCase());
  await page.selectOption('#pfGender', '男').catch(() => {});
  await page.fill('#pfBirth', '2000-01-01');
  await page.fill('#pfBio', '测试签名');
  await page.evaluate(() => { const m = document.querySelector('.modal-mask:has(#pfNick)'); if (m) m.querySelector('.btn.primary').click(); });
  await sleep(500);
  return true;
}
async function goContacts(page, name) {
  await page.goto('http://localhost:8099/index.html#/contacts', { waitUntil: 'load' });
  await sleep(700); // 等 initSocial 的 400ms 强制弹窗
  await ensureProfile(page, name);
  await page.evaluate(() => document.querySelectorAll('.modal-mask').forEach(m => m.remove()));
  await page_wait(page, '.contacts-bar', 8000);
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    await ctxA.addInitScript(b => { try { localStorage.setItem('kg_api_base', b); } catch (e) {} }, BASE);
    await ctxB.addInitScript(b => { try { localStorage.setItem('kg_api_base', b); } catch (e) {} }, BASE);
    const pA = await ctxA.newPage();
    const pB = await ctxB.newPage();
    const errs = [];
    [pA, pB].forEach(p => p.on('pageerror', e => errs.push(String(e))));

    const ua = 'uA' + Date.now().toString().slice(-6);
    const ub = 'uB' + Date.now().toString().slice(-6);
    out.steps.users = { ua, ub };

    async function regProfile(page, uname) {
      await page.goto('http://localhost:8099/index.html', { waitUntil: 'load' });
      await page.waitForSelector('#accountBtn', { timeout: 8000 });
      await page.click('#accountBtn');
      await page_wait(page, '#pSReg', 5000);
      await page.click('#pSReg');
      await page.waitForSelector('#saU', { timeout: 5000 });
      await page.fill('#saU', uname);
      await page.fill('#saP', '1234');
      await page.evaluate(() => { const m = document.querySelector('.modal-mask:has(#saU)'); m.querySelector('.btn.primary').click(); });
      await page.waitForSelector('#pfNick', { timeout: 6000 });
      await page.fill('#pfNick', uname.toUpperCase());
      await page.selectOption('#pfGender', '男');
      await page.fill('#pfBirth', '2000-01-01');
      await page.fill('#pfBio', '测试签名');
      await page.evaluate(() => { const m = document.querySelector('.modal-mask:has(#pfNick)'); m.querySelector('.btn.primary').click(); });
      await sleep(600);
      await page.evaluate(() => document.querySelectorAll('.modal-mask').forEach(m => m.remove()));
      out.steps[uname + '_complete'] = await page.evaluate(() => Social.getProfile().then(j => j.complete).catch(() => 'err'));
    }
    await regProfile(pA, ua);
    out.steps.A_registered = await pA.evaluate(() => Social.isLoggedIn());
    await regProfile(pB, ub);
    out.steps.B_registered = await pB.evaluate(() => Social.isLoggedIn());

    // A 加 B
    await goContacts(pA, ua);
    await pA.click('#addFriend');
    await pA.waitForSelector('#afQ', { timeout: 5000 });
    await pA.fill('#afQ', ub);
    await sleep(500);
    await pA.waitForSelector('#afRes [data-u]', { timeout: 5000 });
    await pA.click('#afRes [data-u]');
    await sleep(400);
    out.steps.A_sentRequest = true;

    // B 接受
    await goContacts(pB, ub);
    await pB.click('#seeReq');
    await pB.waitForSelector('[data-f]', { timeout: 5000 });
    await pB.click('[data-f]');
    await sleep(500);
    out.steps.B_friendCount = await pB.evaluate(() => Social.listFriends().then(j => (j.friends || []).length));

    // A 发消息
    await goContacts(pA, ua);
    await pA.waitForFunction(u => Social.listFriends().then(j => (j.friends || []).some(f => f.username === u)).catch(() => false), ub, { timeout: 10000 });
    await pA.evaluate(() => { location.hash = '#/countdown'; });
    await sleep(300);
    await pA.evaluate(() => { location.hash = '#/contacts'; });
    await sleep(900);
    await pA.waitForSelector(`[data-user="${ub}"]`, { timeout: 8000 });
    await pA.click(`[data-user="${ub}"]`);
    await pA.waitForSelector('#fhChat', { timeout: 5000 });
    await pA.click('#fhChat');
    await pA.waitForSelector('#chText', { timeout: 5000 });
    await pA.fill('#chText', '你好，一起加油！');
    await pA.click('#chSend');
    await sleep(300);
    await pA.fill('#chText', '今天刷了几题？');
    await pA.click('#chSend');
    await sleep(500);
    out.steps.A_sentMsgs = await pA.evaluate(() => document.querySelectorAll('.chat-bubble').length);

    await sleep(400);
    await pB.evaluate(() => window.refreshSocialBadge && window.refreshSocialBadge());
    await sleep(600);
    out.steps.B_unreadApi = await pB.evaluate(() => Social.unread().then(j => JSON.stringify(j.unread)).catch(e => 'err:' + e.message));
    out.steps.B_badge = await pB.evaluate(() => { const b = document.querySelector('#accountBtn .kg-badge'); return b ? b.textContent : null; });

    // B 打开聊天
    await goContacts(pB, ub);
    await pB.waitForFunction(u => Social.listFriends().then(j => (j.friends || []).some(f => f.username === u)).catch(() => false), ua, { timeout: 10000 });
    await pB.evaluate(() => { location.hash = '#/countdown'; });
    await sleep(300);
    await pB.evaluate(() => { location.hash = '#/contacts'; });
    await sleep(900);
    await pB.waitForSelector(`[data-user="${ua}"]`, { timeout: 8000 });
    await pB.click(`[data-user="${ua}"]`);
    await pB.waitForSelector('#fhChat', { timeout: 5000 });
    await pB.click('#fhChat');
    await pB.waitForSelector('.chat-bubble', { timeout: 5000 });
    await sleep(500);
    out.steps.B_receivedMsgs = await pB.evaluate(() => document.querySelectorAll('.chat-bubble').length);
    await sleep(400);
    out.steps.B_badgeAfterRead = await pB.evaluate(() => { const b = document.querySelector('#accountBtn .kg-badge'); return b ? b.textContent : 'cleared'; });

    const fatal = errs.filter(e => !/font|woff|gstatic|jsdelivr|googleapis|net::ERR|favicon/i.test(e));
    out.steps.fatal = fatal.slice(0, 5);
    out.pass = out.steps.A_registered && out.steps.B_registered && out.steps.B_friendCount >= 1 &&
      out.steps.A_sentMsgs >= 2 && out.steps.B_badge && parseInt(out.steps.B_badge) >= 1 &&
      out.steps.B_receivedMsgs >= 2 && (out.steps.B_badgeAfterRead === "" || out.steps.B_badgeAfterRead === "cleared" || parseInt(out.steps.B_badgeAfterRead) < 1) && fatal.length === 0;
  } catch (e) {
    out.error = String(e && e.stack || e);
  } finally {
    log(out);
    try { await browser.close(); } catch (e) {}
  }
})();
