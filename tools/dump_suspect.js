const fs = require('fs');
const V = new Function('window', fs.readFileSync('assets/data/verbal_5000.js', 'utf8') + '\nreturn window.VERBAL_5000;')({});
const paths = [
  "chapters[1].sections[17].questions[2]",
  "chapters[1].sections[17].questions[9]",
  "chapters[2].sections[1].questions[25]",
  "chapters[2].sections[1].questions[32]",
  "chapters[2].sections[1].questions[43]",
  "chapters[2].sections[1].questions[45]"
];
paths.forEach(function (p) {
  const parts = p.match(/[^.\[\]]+/g);
  let o = V;
  for (const pt of parts) { o = o[/^\d+$/.test(pt) ? parseInt(pt) : pt]; }
  console.log('=====', p, '=====');
  console.log('Q:', String(o.q));
  console.log('OPTS:', (o.options || []).map(function (x) { return String(x).slice(0, 50); }));
  console.log('A:', JSON.stringify(o.a));
  console.log('E:', String(o.e || '').slice(0, 200));
  console.log('');
});
