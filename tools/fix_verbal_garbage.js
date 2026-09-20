const fs = require('fs');
const FILE = 'assets/data/verbal_5000.js';
const V = new Function('window', fs.readFileSync(FILE, 'utf8') + '\nreturn window.VERBAL_5000;')({});
let n = 0, fixed = [];
function cleanStr(s) {
  let out = String(s == null ? '' : s);
  const before = out;
  // 1) PDF 小节头「（二）高难进阶」及之后的所有垃圾（含下一章材料）
  const cut1 = out.search(/（[一二]）(高难进阶|夯实基础)/);
  if (cut1 > 0) out = out.slice(0, cut1);
  // 2) 答案速查页整页垃圾（如 ①②③第一章 片断阅读第一节…）
  const cut2 = out.search(/第[一二三四五六七八九十]+章\s+(片断阅读|片段阅读|语句表达|逻辑填空|篇章阅读|资料分析|数量关系|判断推理|常识)/);
  if (cut2 > 0) out = out.slice(0, cut2);
  // 3) 篇首垃圾「第一篇根据所给材料」
  const cut3 = out.search(/第[一二三四五六七八九十]+篇(?=根据|以下是|阅读)/);
  if (cut3 > 0) out = out.slice(0, cut3);
  out = out.replace(/\s+$/, '');
  if (out !== before) return out;
  return null; // 未变
}
function walk(o, path) {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) { o.forEach(function (x, i) { walk(x, path + '[' + i + ']'); }); return; }
  if (o.q !== undefined && o.options !== undefined) {
    n++;
    (o.options || []).forEach(function (op, oi) {
      const c = cleanStr(op);
      if (c != null && c.length >= 1) { fixed.push({ path: path + '.opt' + oi, from: String(op).slice(-40), to: c.slice(-20) }); o.options[oi] = c; }
    });
    const ce = cleanStr(o.e);
    if (ce != null && ce.length >= 10) { fixed.push({ path: path + '.e', from: String(o.e).slice(-40), to: ce.slice(-20) }); o.e = ce; }
    return;
  }
  Object.keys(o).forEach(function (k) { walk(o[k], path + '.' + k); });
}
walk(V, '');
console.log('扫描题数:', n, '| 修复字段数:', fixed.length);
fixed.forEach(function (f) { console.log(' ', f.path, '| …', JSON.stringify(f.from).slice(0, 60), '→ …', JSON.stringify(f.to).slice(0, 40)); });
V.updatedAt = '2026-09-18';
fs.writeFileSync(FILE, 'window.VERBAL_5000 = ' + JSON.stringify(V) + ';\n');
console.log('written', FILE);
