// 独立校验 UI.md 的渲染逻辑（与 ui.js 内实现保持一致）
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function md(src) {
  const raw = String(src == null ? "" : src).replace(/\r\n/g, "\n");
  const lines = raw.split("\n");
  const out = [];
  let listType = null, listBuf = [];
  function flushList() {
    if (listType) {
      out.push(`<${listType}>` + listBuf.map(li => `<li>${inline(li)}</li>`).join("") + `</${listType}>`);
      listType = null; listBuf = [];
    }
  }
  function inline(t) {
    t = esc(t);
    t = t.replace(/`([^`]+)`/g, (m, c) => `<code>${c}</code>`);
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    t = t.replace(/\*([^*\s][^*]*?)\*/g, "<em>$1</em>");
    t = t.replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?]|$)/g, "$1<em>$2</em>");
    t = t.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*|#[^\s)]*)\)/g, (m, txt, url) =>
      `<a href="${url}" target="_blank" rel="noopener">${txt}</a>`);
    return t;
  }
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^```(.*)$/.exec(line);
    if (fence) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; flushList();
      out.push(`<pre><code>${buf.map(esc).join("\n")}</code></pre>`);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flushList(); const lv = h[1].length; out.push(`<h${lv}>${inline(h[2])}</h${lv}>`); i++; continue; }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { flushList(); out.push("<hr>"); i++; continue; }
    const bq = /^>\s?(.*)$/.exec(line);
    if (bq) {
      flushList();
      const buf = [];
      while (i < lines.length) { const m = /^>\s?(.*)$/.exec(lines[i]); if (!m) break; buf.push(m[1]); i++; }
      out.push(`<blockquote>${inline(buf.join("<br>"))}</blockquote>`);
      continue;
    }
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ul || ol) {
      const ty = ul ? "ul" : "ol";
      if (listType && listType !== ty) flushList();
      listType = ty; listBuf.push(ul ? ul[1] : ol[1]); i++; continue;
    }
    if (/^\s*$/.test(line)) { flushList(); i++; continue; }
    flushList();
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  flushList();
  return out.join("");
}

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; console.log("✅ " + name); }
  else { fail++; console.log("❌ " + name + "\n   got:  " + got + "\n   want: " + want); }
}
eq("加粗", md("**用法**"), "<p><strong>用法</strong></p>");
eq("斜体", md("*强调*"), "<p><em>强调</em></p>");
eq("行内代码", md("用 `code` 表示"), "<p>用 <code>code</code> 表示</p>");
eq("无序列表", md("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
eq("有序列表", md("1. 一\n2. 二"), "<ol><li>一</li><li>二</li></ol>");
eq("标题", md("## 小标题"), "<h2>小标题</h2>");
eq("引用", md("> 这是引用"), "<blockquote>这是引用</blockquote>");
eq("删除线", md("~~删掉~~"), "<p><del>删掉</del></p>");
eq("链接", md("[百度](https://baidu.com)"), '<p><a href="https://baidu.com" target="_blank" rel="noopener">百度</a></p>');
eq("XSS转义", md("<script>alert(1)</script>"), "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
eq("混合", md("**粗** 和 *斜*，还有 `x`"), "<p><strong>粗</strong> 和 <em>斜</em>，还有 <code>x</code></p>");
eq("多段", md("第一段\n\n第二段"), "<p>第一段</p><p>第二段</p>");
eq("代码块", md("```\nlet a=1\n```"), "<pre><code>let a=1</code></pre>");
console.log(`\n通过 ${pass} / ${pass + fail}`);
process.exit(fail ? 1 : 0);
