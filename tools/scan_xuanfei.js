const fs = require('fs');
function loadVar(file, name) {
  const code = fs.readFileSync(file, 'utf8');
  const window = {};
  const fn = new Function('window', code + '\nreturn window.' + name + ';');
  return fn(window);
}
function scan(getter) {
  const found = [];
  getter((q, loc) => {
    if (!q || !q.q) return;
    const e = q.e || "";
    const xfByE = /本题为选非题|选非题[:：]|本题为.*选非/.test(e);
    const stemHasNeg = /不(正确|属于|能|选|相符|符合|恰当)|错误|没有|并非|无关|无需|未/.test(q.q);
    const isXf = q.xuanfei === true || xfByE || (!stemHasNeg && /不正确|错误|不属于|不能|不选|不相符|不符|无关|未/.test(q.q));
    if (isXf) found.push({loc, q: q.q.slice(0,46), xfFlag: !!q.xuanfei, xfByE, stemHasNeg});
  });
  return found;
}
const muti = loadVar('assets/data/muti.js', 'MUTI');
const mfound = scan((cb) => (muti.chapters||[]).forEach((c, ci) => (c.questions||[]).forEach((q, qi) => cb(q, 'ch'+ci+'.q'+qi))));
console.log('MUTI 选非候选:', mfound.length, '| 已标记xuanfei:', mfound.filter(f=>f.xfFlag).length);
mfound.forEach(f => console.log('  ', f.loc, '| flag='+f.xfFlag, 'e='+f.xfByE, 'stemNeg='+f.stemHasNeg, '|', f.q));
const pol = loadVar('assets/data/politics_kp.js', 'POLITICS_KP');
const pfound = scan((cb) => (pol.bank||[]).forEach((q, qi) => cb(q, 'q'+qi)));
console.log('POLITICS_KP bank 选非候选:', pfound.length, '| 已标记:', pfound.filter(f=>f.xfFlag).length);
pfound.forEach(f => console.log('  ', f.loc, '| flag='+f.xfFlag, 'e='+f.xfByE, 'stemNeg='+f.stemHasNeg, '|', f.q));
