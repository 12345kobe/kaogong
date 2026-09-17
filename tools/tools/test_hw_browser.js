/* 真浏览器实测：打开手写面板，检查中央命中元素 + 模拟拖拽是否产生笔画 */
const { chromium } = require("playwright");
const URL = process.env.HW_URL || "http://localhost:8099/";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.UI.Handwriting.open({ subject: "t", id: "x", anchor: null }));
  await page.waitForTimeout(300);

  const probe = await page.evaluate(() => {
    const cx = Math.floor(window.innerWidth / 2), cy = Math.floor(window.innerHeight / 2);
    const el = document.elementFromPoint(cx, cy);
    const overlay = document.querySelector(".hw-overlay");
    const canvas = overlay && overlay.querySelector(".hw-layer");
    const r = canvas ? canvas.getBoundingClientRect() : null;
    return {
      center: { cx, cy },
      hitTag: el && el.tagName,
      hitClass: el && (el.className && el.className.toString()),
      hitIsCanvas: !!(el && el.classList && el.classList.contains("hw-layer")),
      overlayZ: overlay ? getComputedStyle(overlay).zIndex : null,
      canvasZ: canvas ? getComputedStyle(canvas).zIndex : null,
      canvasPE: canvas ? getComputedStyle(canvas).pointerEvents : null,
      canvasRect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
      overlayRect: overlay ? (() => { const o = overlay.getBoundingClientRect(); return { w: Math.round(o.width), h: Math.round(o.height) }; })() : null
    };
  });
  console.log("PROBE:", JSON.stringify(probe, null, 2));

  // 模拟在面板中部画一笔（先用鼠标，验证命中 + 指针链路）
  await page.mouse.move(100, 300);
  await page.mouse.down();
  await page.mouse.move(160, 360);
  await page.mouse.move(220, 420);
  await page.mouse.up();
  await page.waitForTimeout(150);
  // 点击「关闭并保存」把笔画写回 DB.state.notes
  await page.click(".hw-tool.close");
  await page.waitForTimeout(150);
  const strokes = await page.evaluate(() => {
    const n = window.DB.state.notes && window.DB.state.notes.t && window.DB.state.notes.t.x;
    return n ? n.strokes.length : -1;
  });
  console.log("STROKES_AFTER_MOUSE_DRAW:", strokes);
  console.log("ERRORS:", JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(2); });
