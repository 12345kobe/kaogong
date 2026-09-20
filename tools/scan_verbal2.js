const fs = require('fs');
const code = fs.readFileSync('assets/data/verbal_5000.js', 'utf8');
const window = {};
const V = new Function('window', code + '\nreturn window.VERBAL_5000;')(window);
let n = 0;
const issues = { truncated: [], noAsk: [], dots: [], dupOpt: [], dupStem: [], tinyOpt: [] };
const stemCount = {};
function walk(o, path) {
  if (!o) return;
  if (Array.isArray(o)) { o.forEach((x, i) => walk(x, path + '[' + i + ']')); return; }
  if (typeof o !== 'object') return;
  if (o.q !== undefined && o.options !== undefined) {
    n++;
    const q = String(o.q || '').trim();
    const opts = o.options || [];
    if (q && !/[：:。？？”"）)…—]$/.test(q) && !/[①-⑳]$/.test(q) && !/[0-9]$/.test(q)) {
      issues.truncated.push({ path: path, tail: q.slice(-28) });
    }
    if (q && !/[：?？]/.test(q) && !/依次|排序|最恰当|最准确|填入/.test(q)) {
      issues.noAsk.push({ path: path, head: q.slice(0, 36) });
    }
    if ((q.match(/……/g) || []).length >= 3) issues.dots.push({ path: path, head: q.slice(0, 36) });
    if (opts.length && opts.some(function (o2) { return String(o2).trim().length < 2; })) {
      issues.tinyOpt.push({ path: path, opts: opts.map(function (o2) { return String(o2).slice(0, 8); }) });
    }
    if (new Set(opts.map(function (o2) { return String(o2).trim(); })).size !== opts.length) {
      issues.dupOpt.push({ path: path, opts: opts.map(function (o2) { return String(o2).slice(0, 10); }) });
    }
    const key = q.slice(0, 60);
    (stemCount[key] = stemCount[key] || []).push(path);
    return;
  }
  Object.keys(o).forEach(function (k) { walk(o[k], path + '.' + k); });
}
walk(V, '');
Object.keys(stemCount).forEach(function (k) {
  if (stemCount[k].length > 1) issues.dupStem.push({ key: k.slice(0, 28), paths: stemCount[k] });
});
console.log('总题数:', n);
Object.keys(issues).forEach(function (k) { console.log(k + ':', issues[k].length); });
['truncated', 'noAsk', 'tinyOpt', 'dupOpt', 'dots'].forEach(function (k) {
  console.log('---' + k + ' 样例---');
  issues[k].slice(0, 6).forEach(function (s) { console.log('  ', JSON.stringify(s).slice(0, 160)); });
});
console.log('---dupStem 样例---');
issues.dupStem.slice(0, 8).forEach(function (s) { console.log('  ', JSON.stringify(s).slice(0, 160)); });
