const fs=require('fs');
const code=fs.readFileSync('assets/data/verbal_5000.js','utf8');
const window={};
let V;
try{ V=new Function('window',code+'\nreturn window.VERBAL_5000;')(window);}catch(e){console.log('load err',e.message);process.exit(1);}
console.log('顶层键:',Object.keys(V).slice(0,10));
function walk(o,path,out){ if(!o)return; if(Array.isArray(o)){o.forEach((x,i)=>walk(x,path+'['+i+']',out));return;} if(typeof o!=='object')return; if(o.q!==undefined||o.options!==undefined){out.push({path,...o});return;} Object.keys(o).forEach(k=>walk(o[k],path+'.'+k,out)); }
const qs=[]; walk(V,'',qs);
console.log('题目总数:',qs.length);
let badQ=0,badOpt=0,badAns=0,noExp=0,shortQ=0;
const samples={badQ:[],badOpt:[],badAns:[],noExp:[],shortQ:[]};
qs.forEach((q,i)=>{
  const stem=(q.q||'').trim();
  if(!stem){badQ++; if(samples.badQ.length<5)samples.badQ.push({i,raw:JSON.stringify(q).slice(0,120)});}
  else if(stem.length<12){shortQ++; if(samples.shortQ.length<8)samples.shortQ.push({i,stem});}
  const opts=q.options||[];
  if(!opts.length||opts.some(o=>!o||!String(o).trim())){badOpt++; if(samples.badOpt.length<5)samples.badOpt.push({i,opts:JSON.stringify(opts).slice(0,120)});}
  const a=q.a;
  if(a===undefined||a===null||(typeof a==='number'&&(a<0||a>=opts.length))){badAns++; if(samples.badAns.length<5)samples.badAns.push({i,a,olen:opts.length});}
  if(!q.e||!String(q.e).trim()){noExp++;}
});
console.log('空题干:',badQ,'| 题干过短(<12):',shortQ,'| 选项缺失/空:',badOpt,'| 答案越界:',badAns,'| 无解析:',noExp);
Object.keys(samples).forEach(k=>{ if(samples[k].length){console.log('--'+k+'--');samples[k].forEach(s=>console.log('   ',JSON.stringify(s)));}});
const one=qs[0];console.log('样本题:',JSON.stringify(one).slice(0,400));
