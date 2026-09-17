// 真机验证：手写笔迹确认后，SVG 覆盖层应与原绘制位置重合（修复 56px 偏移）
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

async function main() {
  const url = "file://" + path.resolve(__dirname, "..", "index.html");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));

  await page.goto(url);
  await page.waitForTimeout(400);

  // 1) 放一个「在文档流里」的 anchor（inlineOverlay 会把它设成 position:relative，保持原位）
  const anchorRect = await page.evaluate(() => {
    const a = document.createElement("div");
    a.id = "hwtest";
    a.style.cssText = "position:relative;width:300px;height:300px;background:#fff;border:1px solid #999;margin:8px";
    document.body.insertBefore(a, document.body.firstChild);
    const r = a.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  });

  // 2) 打开手写标注
  await page.evaluate(() => {
    window.UI.Handwriting.open({ subject: "测试", id: "hw1", anchor: document.getElementById("hwtest"), onChange: () => {} });
  });
  await page.waitForTimeout(150);

  // 3) 在 anchor 内部画一条水平线（仅 2 点 → 单段 line，其中心即整条笔迹中点）
  const vx0 = anchorRect.left + 80, vy = anchorRect.top + 150, vx1 = anchorRect.left + 140;
  await page.mouse.move(vx0, vy);
  await page.mouse.down();
  await page.mouse.move(vx1, vy);
  await page.mouse.up();
  await page.waitForTimeout(150);

  // 4) 点 ✕ 关闭并保存
  await page.click(".hw-overlay .hw-tool.close");
  await page.waitForTimeout(200);

  // 5) 渲染 inline overlay，读取 line 的屏幕中心
  const res = await page.evaluate(() => {
    const anchor = document.getElementById("hwtest");
    window.UI.Notes.inlineOverlay(anchor, "测试", "hw1");
    const line = anchor.querySelector(".kg-inline-ov line");
    const has = window.UI.Notes.has("测试", "hw1");
    if (!line) return { has, found: false };
    const r = line.getBoundingClientRect();
    return { has, found: true, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });

  const expectX = (vx0 + vx1) / 2, expectY = vy;
  const dx = res.found ? Math.abs(res.cx - expectX) : 999;
  const dy = res.found ? Math.abs(res.cy - expectY) : 999;
  const pass = res.has && res.found && dx <= 8 && dy <= 8 && errors.length === 0;
  const verdict = { anchorRect, res, expectX, expectY, dx, dy, pageerrors: errors.length, pass };
  fs.writeFileSync(path.resolve(__dirname, "hw_offset_result.json"), JSON.stringify(verdict, null, 2));
  console.log("VERDICT:", JSON.stringify(verdict, null, 2));
  await browser.close().catch(() => {});
  process.exitCode = pass ? 0 : 1;
}
main().catch(e => { fs.writeFileSync(path.resolve(__dirname, "hw_offset_result.json"), "FATAL: " + (e && e.stack || e)); console.log("FATAL:", e && e.stack || e); process.exitCode = 1; });
