// 真机验证：写题手写笔迹「会话级」行为
// 1) 写完关闭后：笔迹仍在本次会话（pen 有 •、题目上出现内联覆盖层、且未落盘 DB）
// 2) 再次打开同一题：画布里能还原出笔迹（canvas 有墨迹）
// 3) 结束训练（交卷）：会话清空（再次打开画布无墨迹），且 DB 始终不含该题笔迹
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

async function canvasInk(page) {
  return await page.evaluate(() => {
    const c = document.querySelector(".hw-layer");
    if (!c) return -1;
    const ctx = c.getContext("2d");
    const w = c.width, h = c.height;
    if (!w || !h) return -1;
    let n = 0;
    try {
      const d = ctx.getImageData(0, 0, w, h).data;
      for (let i = 3; i < d.length; i += 4) { if (d[i] > 0) { if (++n > 80) break; } }
    } catch (e) { return -2; }
    return n;
  });
}

async function main() {
  const url = "file://" + path.resolve(__dirname, "..", "index.html");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(url);
  await page.waitForTimeout(400);

  // 直接启动一组测试题（练题模式）
  await page.evaluate(() => {
    const host = document.getElementById("app") || document.body;
    const h = document.createElement("div"); host.appendChild(h); window.__host = h;
    window.Quiz.start(h, [
      { q: "测试题：1+1 等于几？", options: ["1", "2", "3", "4"], a: 1, e: "等于2" },
      { q: "测试题：2+2 等于几？", options: ["2", "3", "4", "5"], a: 2, e: "等于4" }
    ], "测试科", {});
  });
  await page.waitForTimeout(300);

  const openPen = () => page.evaluate(() => document.querySelector(".quiz-q[data-qi='0'] .pen-btn").click());
  const closePen = () => page.evaluate(() => document.querySelector(".hw-tool.close").click());
  async function drawLine() {
    const box = await page.evaluate(() => {
      const c = document.querySelector(".hw-layer"); const r = c.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    const x1 = box.x + 60, y1 = box.y + 130, x2 = box.x + 210, y2 = box.y + 210;
    await page.mouse.move(x1, y1); await page.mouse.down();
    await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2);
    await page.mouse.move(x2, y2); await page.mouse.up();
    await page.waitForTimeout(150);
  }

  // 1) 打开→画→关闭
  await openPen(); await page.waitForTimeout(250);
  await drawLine();
  await closePen(); await page.waitForTimeout(250);
  const afterClose = await page.evaluate(() => {
    const card = document.querySelector(".quiz-q[data-qi='0']");
    const subj = window.DB.state.notes && window.DB.state.notes["测试科"];
    // 会话模式不得落盘：subject 下应无任何题目笔迹条目（open 会建空对象 {}，故查 keys 长度）
    const dbHas = !!(subj && Object.keys(subj).length > 0);
    return {
      penHas: card.querySelector(".pen-btn").classList.contains("has"),
      inlineOv: !!card.querySelector(".kg-hw-session-ov"),
      svgMarks: card.querySelectorAll(".kg-hw-session-ov svg line, .kg-hw-session-ov svg polyline").length,
      dbHas
    };
  });

  // 2) 再次打开同一题：画布应还原出笔迹
  await openPen(); await page.waitForTimeout(250);
  const inkOnReopen = await canvasInk(page);
  await closePen(); await page.waitForTimeout(200);
  const afterReopen = await page.evaluate(() => {
    const card = document.querySelector(".quiz-q[data-qi='0']");
    return { inlineOv: !!card.querySelector(".kg-hw-session-ov"), svgMarks: card.querySelectorAll(".kg-hw-session-ov svg line, .kg-hw-session-ov svg polyline").length };
  });

  // 3) 结束训练（作答两题后交卷）
  await page.evaluate(() => {
    document.querySelectorAll(".quiz-q[data-qi='0'] .opt")[1].click();
    document.querySelectorAll(".quiz-q[data-qi='1'] .opt")[2].click();
    const sb = document.querySelector("#showAns"); if (sb) sb.click();
  });
  await page.waitForTimeout(400);
  const afterFinish = await page.evaluate(() => {
    const subj = window.DB.state.notes && window.DB.state.notes["测试科"];
    return { dbHas: !!(subj && Object.keys(subj).length > 0) };
  });

  // 结束后再次打开该题：会话已清，画布应无墨迹
  await openPen(); await page.waitForTimeout(250);
  const inkAfterFinish = await canvasInk(page);
  await closePen(); await page.waitForTimeout(150);

  const pass =
    afterClose.penHas && afterClose.inlineOv && afterClose.svgMarks > 0 && !afterClose.dbHas &&
    inkOnReopen > 0 && afterReopen.inlineOv && afterReopen.svgMarks > 0 &&
    !afterFinish.dbHas && inkAfterFinish === 0;

  const verdict = { afterClose, inkOnReopen, afterReopen, afterFinish, inkAfterFinish, pageerrors: errors.length, pass };
  fs.writeFileSync(path.resolve(__dirname, "hw_session_result.json"), JSON.stringify(verdict, null, 2));
  console.log("VERDICT:", JSON.stringify(verdict, null, 2));
  await browser.close().catch(() => {});
  process.exitCode = pass ? 0 : 1;
}
main().catch(e => { fs.writeFileSync(path.resolve(__dirname, "hw_session_result.json"), "FATAL: " + (e && e.stack || e)); console.log("FATAL:", e && e.stack || e); process.exitCode = 1; });
