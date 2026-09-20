const fs = require('fs');
const V = new Function('window', fs.readFileSync('assets/data/verbal_5000.js', 'utf8') + '\nreturn window.VERBAL_5000;')({});
// PDF 抽取垃圾特征（出现在题干/选项里即视为污染；解析里出现“第X章”等也可能正常）
const BAD = [
  /第[一二三四五六七八九十]+[章节]/,
  /第[一二三四五六七八九十]+考点/,
  /考点\s*\d+/,
  /[A-E]{5,}/,
  /\d+\s*[—–-]\s*\d+\s*[A-E]{2,}/,
  /高难进阶/,
  /专项[\s\S]{0,4}练习/,
  /参考答案/,
  /答案速查/,
  /粉笔大数据：本题正确率为\d+%.{0,10}易错项为[A-E]。[【\[]?解析/,
];
let n = 0;
const hits = [];
function chk(field, val, where) {
  const s = String(val == null ? '' : val);
  if (!s) return;
  BAD.forEach(function (re) {
    if (re.test(s)) {
      hits.push({ where: where, field: field, re: String(re), ctx: s.slice(Math.max(0, s.search(re) - 20), s.search(re) + 60) });
    }
  });
}
function walk(o, path) {
  if (!o) return;
  if (Array.isArray(o)) { o.forEach(function (x, i) { walk(x, path + '[' + i + ']'); }); return; }
  if (typeof o !== 'object') return;
  if (o.q !== undefined && o.options !== undefined) {
    n++;
    chk('q', o.q, path);
    (o.options || []).forEach(function (op, oi) { chk('opt' + oi, op, path); });
    chk('e', o.e, path);
    return;
  }
  Object.keys(o).forEach(function (k) { walk(o[k], path + '.' + k); });
}
walk(V, '');
console.log('总题数:', n, '| 命中:', hits.length);
hits.forEach(function (h) { console.log(h.where, '|', h.field, '|', h.re, '|', JSON.stringify(h.ctx).slice(0, 140)); });
