// 真机浏览器验证：AI 对话里的 Markdown（**加粗** / *斜体* / `代码`）被渲染为样式，而非符号
const { chromium } = require("playwright");
const path = require("path");

async function main() {
  const url = "file://" + path.resolve(__dirname, "..", "index.html");
  console.log("url:", url);
  const browser = await chromium.launch();
  console.log("browser launched");
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));

  await page.addInitScript(() => {
    localStorage.setItem("kg_ai_log", JSON.stringify([
      { role: "user", content: "请解释一下" },
      { role: "assistant", content: "**用法**：这是重点。\n还有 *斜体强调*、`行内代码`、以及：\n- 列表项一\n- 列表项二\n> 引用一句" }
    ]));
  });

  await page.goto(url);
  await page.waitForTimeout(500);
  console.log("page loaded");

  const clicked = await page.evaluate(() => {
    const t = document.querySelector('#nav .nav-item[data-key="ai"]');
    if (t) { t.click(); return true; }
    return false;
  });
  console.log("ai nav clicked:", clicked);
  if (!clicked) throw new Error("未找到 AI 导航按钮");
  await page.waitForTimeout(600);

  const info = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll(".ai-text"));
    if (!all.length) return { found: false };
    const el = all[all.length - 1]; // 最后一条 = AI 回复
    return { found: true, count: all.length, html: el.innerHTML, hasRaw: el.textContent.includes("**") };
  });
  console.log("info:", JSON.stringify(info).slice(0, 400));

  const okStrong = info.html.includes("<strong>用法</strong>");
  const okEm = info.html.includes("<em>斜体强调</em>");
  const okCode = info.html.includes("<code>行内代码</code>");
  const okList = info.html.includes("<ul>") && info.html.includes("<li>列表项一</li>");
  const okQuote = info.html.includes("<blockquote>引用一句</blockquote>");
  const okNoRaw = !info.hasRaw;
  const pass = info.found && okStrong && okEm && okCode && okList && okQuote && okNoRaw && errors.length === 0;
  const verdict = {
    found: info.found, count: info.count, okStrong, okEm, okCode, okList, okQuote, okNoRaw,
    pageerrors: errors.length, html: info.html, pass
  };
  require("fs").writeFileSync(path.resolve(__dirname, "aimd_result.json"), JSON.stringify(verdict, null, 2));
  console.log("VERDICT:", JSON.stringify(verdict));
  await browser.close().catch(() => {});
  process.exitCode = pass ? 0 : 1;
}

main().catch(e => { require("fs").writeFileSync(path.resolve(__dirname, "aimd_result.json"), "FATAL: " + (e && e.stack || e)); console.log("FATAL:", e && e.stack || e); process.exitCode = 1; });
