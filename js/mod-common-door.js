/* 模块：常识「开门刷题」沉浸式答题（注入常识模块内）
   交互：方块模块 → 放大全屏 → 中缝门推开 → 全屏主题背景图 + 居中半透明面板答题。
   支持 历史→中国/世界→古代/近代/现代→朝代 多级下钻；任意层级可「整段随机抽题」。
   样式参考：全屏古风/主题背景图，居中半透明白色圆角面板，问题白色描边大字、答案红色。 */
(function () {
  const TREE = window.COMMON_TREE;
  const CSS = `
.cd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:12px;margin-top:12px}
.cd-tile{position:relative;aspect-ratio:1/1;border-radius:16px;overflow:hidden;cursor:pointer;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
  color:#fff;font-weight:700;font-size:15px;text-shadow:0 2px 6px rgba(0,0,0,.5);
  box-shadow:0 6px 18px rgba(0,0,0,.25);transition:transform .15s,box-shadow .15s;border:1px solid rgba(255,255,255,.25)}
.cd-tile:hover{transform:translateY(-3px);box-shadow:0 10px 26px rgba(0,0,0,.35)}
.cd-tile .em{font-size:34px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))}
.cd-tile .ct{position:absolute;left:0;right:0;bottom:0;padding:4px 0;background:linear-gradient(transparent,rgba(0,0,0,.45));text-align:center;font-size:13px}
.cd-overlay{position:fixed;inset:0;z-index:99999;overflow:hidden;font-family:inherit;
  background:#0b0d12;will-change:transform,opacity}
.cd-scene{position:absolute;inset:0;background-size:cover;background-position:center;
  filter:brightness(.62) saturate(1.05);transition:background-image .3s}
.cd-scene::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,10,16,.30),rgba(8,10,16,.55))}
.cd-content{position:absolute;inset:0;display:flex;flex-direction:column;z-index:3;
  padding:env(safe-area-inset-top,0) 14px 18px;overflow:auto}
.cd-doors{position:absolute;inset:0;z-index:6;display:flex;pointer-events:none}
.cd-door{position:absolute;top:0;bottom:0;width:51%;background:
  linear-gradient(180deg,#2a1d12,#3d2a18 40%,#241608);
  box-shadow:inset 0 0 60px rgba(0,0,0,.6);transition:transform .8s cubic-bezier(.6,.02,.2,1)}
.cd-door.l{left:0;border-right:2px solid rgba(214,175,90,.5)}
.cd-door.r{right:0;border-left:2px solid rgba(214,175,90,.5)}
.cd-door .knob{position:absolute;top:50%;width:14px;height:46px;background:radial-gradient(circle at 40% 35%,#f3d27a,#a9802f);border-radius:7px;transform:translateY(-50%);box-shadow:0 2px 6px rgba(0,0,0,.5)}
.cd-door.l .knob{right:14px}.cd-door.r .knob{left:14px}
.cd-door .em{position:absolute;top:42%;left:0;right:0;text-align:center;font-size:60px;filter:drop-shadow(0 3px 8px rgba(0,0,0,.6))}
.cd-doors.open .cd-door.l{transform:translateX(-101%)}
.cd-doors.open .cd-door.r{transform:translateX(101%)}
.cd-top{display:flex;align-items:center;gap:10px;padding:12px 2px 6px;color:#fff;flex-wrap:wrap}
.cd-top .x{margin-left:auto;background:rgba(255,255,255,.18);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:18px;cursor:pointer}
.cd-crumb{font-size:13px;opacity:.92;text-shadow:0 1px 3px rgba(0,0,0,.6)}
.cd-crumb b{color:#ffd98a}
.cd-lvtitle{font-size:22px;font-weight:800;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.6);margin:6px 0 2px}
.cd-sub{color:#ffd98a;font-size:13px;margin-bottom:10px;text-shadow:0 1px 3px rgba(0,0,0,.6)}
.cd-btns{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-top:6px}
.cd-btn{background:rgba(255,255,255,.92);border:none;border-radius:14px;padding:14px 12px;font-size:15px;font-weight:700;color:#222;
  cursor:pointer;text-align:center;box-shadow:0 6px 16px rgba(0,0,0,.3);transition:transform .12s}
.cd-btn:active{transform:scale(.97)}
.cd-btn.rand{background:linear-gradient(135deg,#ffd98a,#f0a93a);color:#3a2400}
.cd-btn .sm{display:block;font-size:11px;font-weight:500;color:#666;margin-top:3px}
.cd-quizwrap{flex:1;display:flex;align-items:center;justify-content:center;padding:10px 0}
.cd-panel{width:100%;max-width:560px;background:rgba(255,255,255,.92);border-radius:20px;padding:20px 18px;
  box-shadow:0 14px 40px rgba(0,0,0,.45);backdrop-filter:blur(2px)}
.cd-q{font-size:19px;font-weight:800;line-height:1.5;color:#1a1a1a;margin-bottom:4px}
.cd-tag{display:inline-block;font-size:11px;color:#b8860b;background:#fff4dc;border-radius:8px;padding:2px 8px;margin-bottom:12px}
.cd-opt{display:block;width:100%;text-align:left;background:#fff;border:1.5px solid #e3e3e3;border-radius:12px;
  padding:12px 14px;margin:9px 0;font-size:15px;color:#222;cursor:pointer;transition:.12s}
.cd-opt:hover{border-color:#d9b25a}
.cd-opt .lab{display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:#f0f0f0;margin-right:8px;font-weight:700;font-size:13px}
.cd-opt.right{background:#e8f8ec;border-color:#34c759;color:#0a7a31}
.cd-opt.wrong{background:#fdecec;border-color:#ff3b30;color:#b00}
.cd-opt.dim{opacity:.55}
.cd-exp{margin-top:12px;font-size:14px;line-height:1.6;color:#444;background:#fbf6ea;border-left:4px solid #d9b25a;border-radius:8px;padding:10px 12px;display:none}
.cd-exp.show{display:block}
.cd-exp .ans{color:#c0392b;font-weight:700}
.cd-foot{display:flex;align-items:center;gap:12px;margin-top:14px}
.cd-next{background:linear-gradient(135deg,#ffd98a,#f0a93a);color:#3a2400;border:none;border-radius:12px;padding:11px 22px;font-size:15px;font-weight:800;cursor:pointer;display:none}
.cd-next.show{display:block}
.cd-prog{margin-left:auto;font-size:13px;color:#666;font-weight:600}
.cd-summary{text-align:center}
.cd-summary .big{font-size:46px;font-weight:900;color:#c0392b;margin:8px 0}
.cd-summary .row{font-size:15px;color:#333;margin:4px 0}
.cd-anno{margin-top:14px;font-size:14px;line-height:1.7;color:#333;background:#fff7e6;border-left:4px solid #f0a93a;border-radius:10px;padding:12px 14px;text-align:left}
.cd-anno.praise{background:#e8f8ec;border-left-color:#34c759;color:#0a7a31}
.cd-anno b{color:#c0392b}.cd-anno.praise b{color:#0a7a31}
.cd-img{width:100%;border-radius:14px;margin-bottom:12px;border:1px solid #e3e3e3}
.cd-note{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#fff;
  padding:8px 16px;border-radius:20px;font-size:13px;z-index:100000;opacity:0;transition:opacity .25s;pointer-events:none}
.cd-note.show{opacity:1}`;

  let overlay = null, scene = null, content = null, doors = null, noteEl = null;
  const stack = []; // 浏览栈：{node, bg, path}

  function injectCSS() {
    if (document.getElementById("cd-css")) return;
    const s = document.createElement("style");
    s.id = "cd-css"; s.textContent = CSS; document.head.appendChild(s);
  }
  function el(html) {
    const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild;
  }
  function esc(s) { return window.UI ? window.UI.esc(String(s == null ? "" : s)) : String(s); }

  function bankItems(bank) {
    const B = window.COMMON_BANK || {};
    const b = B[bank]; if (!b || !b.items) return [];
    return b.items.map(it => Object.assign({ _bank: bank }, it));
  }
  function collectBanks(node, out) {
    out = out || [];
    if (node.bank) out.push(node.bank);
    (node.children || []).forEach(c => collectBanks(c, out));
    return out;
  }
  function collectItems(node) {
    const bs = collectBanks(node);
    let arr = [];
    bs.forEach(b => { arr = arr.concat(bankItems(b)); });
    return arr;
  }
  function bgOf(node) {
    let n = node;
    while (n) { if (n.bg) return n.bg; n = n._parent; }
    return "assets/img/door/hist.png";
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
  function prep(it) {
    const opts = (it.options || []).slice();
    let a = it.a;
    const sh = shuffle(opts);
    a = sh.indexOf(it.options[it.a]);
    return { q: it.q, options: sh, a: a, e: it.e || "", tag: it.tag || "", img: it.img || "", _bank: it._bank, id: it.id };
  }
  function toast(msg) { noteEl.textContent = msg; noteEl.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => noteEl.classList.remove("show"), 1600); }

  /* ===== 开门动画 ===== */
  function buildOverlay() {
    injectCSS();
    overlay = el(`<div class="cd-overlay">
      <div class="cd-scene"></div>
      <div class="cd-doors"><div class="cd-door l"><div class="em">📜</div><div class="knob"></div></div>
        <div class="cd-door r"><div class="em">📜</div><div class="knob"></div></div></div>
      <div class="cd-content"></div>
    </div>`);
    document.body.appendChild(overlay);
    scene = overlay.querySelector(".cd-scene");
    doors = overlay.querySelector(".cd-doors");
    content = overlay.querySelector(".cd-content");
    noteEl = el(`<div class="cd-note"></div>`); document.body.appendChild(noteEl);
  }
  function openDoors() { requestAnimationFrame(() => doors.classList.add("open")); }
  function closeDoors() { doors.classList.remove("open"); }

  /* 背景图：先瞬间显示渐变底色，照片异步加载完成后淡入，避免大图加载空白等待 */
  const _bgState = {}; // 0/undefined=未加载 1=加载中 2=已加载
  function applySceneBg(bg) {
    if (_bgState[bg] === 2) {
      scene.style.backgroundColor = "#1a1208";
      scene.style.backgroundImage = `url("${bg}")`;
      return;
    }
    scene.style.backgroundColor = "#1a1208";
    scene.style.backgroundImage = "linear-gradient(135deg,#241608,#3d2a18 45%,#1a1208)";
    if (_bgState[bg] === 1) return; // 已在加载，避免重复请求
    _bgState[bg] = 1;
    const im = new Image();
    im.onload = function () {
      _bgState[bg] = 2;
      if (scene) { scene.style.backgroundColor = "#1a1208"; scene.style.backgroundImage = `url("${bg}")`; }
    };
    im.onerror = function () { _bgState[bg] = 0; };
    im.src = bg;
  }

  /* 从方块放大进入全屏，再推门 */
  function enterFromTile(tileEl, bg) {
    if (!overlay) buildOverlay();
    const r = tileEl.getBoundingClientRect();
    overlay.style.transition = "none";
    const sx = r.width / window.innerWidth, sy = r.height / window.innerHeight;
    overlay.style.transformOrigin = "top left";
    overlay.style.transform = `translate(${r.left}px,${r.top}px) scale(${sx},${sy})`;
    overlay.style.opacity = "0.5";
    applySceneBg(bg);
    overlay.style.display = "block";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      overlay.style.transition = "transform .42s cubic-bezier(.2,.7,.2,1), opacity .42s";
      overlay.style.transform = "translate(0,0) scale(1,1)";
      overlay.style.opacity = "1";
    }));
    setTimeout(openDoors, 460);
  }

  /* ===== 层级视图 ===== */
  function levelView(node) {
    const bg = bgOf(node);
    applySceneBg(bg);
    const path = node._path || [];
    const crumb = path.length
      ? path.map((p, i) => i === path.length - 1 ? `<b>${esc(p.name)}</b>` : `<span data-go="${i}">${esc(p.name)}</span>`).join(" › ")
      : `<b>${esc(node.name)}</b>`;
    const isLeaf = !node.children || node.children.length === 0;
    let html = `<div class="cd-top">
        <button class="x" title="退出">✕</button>
      </div>
      <div class="cd-crumb">${crumb}</div>
      <div class="cd-lvtitle">${esc(node.name)}</div>
      <div class="cd-sub">${isLeaf ? "共 " + bankItems(node.bank).length + " 题 · 点击下方开始" : "选择下一级，或整段抽题"}</div>
      <div class="cd-btns"></div>`;
    content.innerHTML = html;
    const btns = content.querySelector(".cd-btns");
    if (isLeaf) {
      const b = el(`<button class="cd-btn rand">开始练习（10 题）<span class="sm">本模块随机抽 10 道</span></button>`);
      b.onclick = () => { stack.push({ node }); startQuiz(node); };
      btns.appendChild(b);
    } else {
      node.children.forEach(ch => {
        ch._parent = node;
        const cnt = collectItems(ch).length;
        const b = el(`<button class="cd-btn">${esc(ch.name)}<span class="sm">${cnt} 题 →</span></button>`);
        b.onclick = () => goLevel(ch);
        btns.appendChild(b);
      });
      const all = el(`<button class="cd-btn rand">🎲 整段随机抽题<span class="sm">${collectItems(node).length} 题 · 全${esc(node.name)}混抽</span></button>`);
      all.onclick = () => { stack.push({ node }); startQuiz(node, true); };
      btns.appendChild(all);
    }
    // 面包屑跳转
    content.querySelectorAll(".cd-crumb [data-go]").forEach(s => {
      s.onclick = () => {
        const i = +s.dataset.go;
        while (stack.length > i + 1) stack.pop();
        const target = stack[i].node;
        goLevel(target, true);
      };
    });
    content.querySelector(".x").onclick = exitAll;
  }

  function goLevel(node, instant) {
    node._path = (node._parent ? (node._parent._path || []) : []).concat([{ name: node._parent ? node._parent.name : node.name }]);
    // 修正路径：用栈推导
    node._path = stackPath(node);
    if (instant) { levelView(node); return; }
    closeDoors();
    setTimeout(() => { levelView(node); openDoors(); }, 420);
  }
  function stackPath(node) {
    // 从 stack 找 node 的父链
    const names = [];
    let p = node;
    while (p) { names.unshift({ name: p.name }); p = p._parent; }
    return names;
  }

  /* ===== 答题 ===== */
  function startQuiz(node, isRandom) {
    const items = shuffle(collectItems(node)).slice(0, 10);
    if (!items.length) { toast("该模块暂无题目"); return; }
    const qs = items.map(prep);
    let idx = 0, correct = 0, answered = 0;
    const wrongTags = {};   // 答错题目的知识点(tag)统计，用于练后批注
    const bg = bgOf(node);

    // 练后批注：全对表扬，否则指出薄弱知识点
    function buildAnno() {
      const total = qs.length;
      const pct = total ? Math.round(correct / total * 100) : 0;
      if (total && correct === total)
        return { praise: true, html: "🎉 太棒了！本次 <b>" + esc(node.name) + "</b> 共 " + total + " 题全部答对，基础非常扎实，继续保持！" };
      const tags = Object.keys(wrongTags);
      if (!tags.length)
        return { praise: false, html: "本次 <b>" + esc(node.name) + "</b> 完成，正确率 " + pct + "%，再接再厉～" };
      const list = tags.slice(0, 4).map(t => "【" + esc(t) + "】").join("");
      return { praise: false, html: "本次 <b>" + esc(node.name) + "</b> 练习，你在 " + list + " 等知识点上答错，较为薄弱，需要多加巩固。" };
    }

    function render() {
      const q = qs[idx];
      const total = qs.length;
      applySceneBg(bg);
      const opts = q.options.map((o, i) => `<button class="cd-opt" data-i="${i}"><span class="lab">${String.fromCharCode(65 + i)}</span>${esc(o)}</button>`).join("");
      const imgHtml = q.img ? `<img class="cd-img" src="${esc(q.img)}" alt="">` : "";
      content.innerHTML = `<div class="cd-top"><button class="x">✕</button></div>
        <div class="cd-quizwrap"><div class="cd-panel">
          ${imgHtml}
          <span class="cd-tag">${esc(q.tag || node.name)}</span>
          <div class="cd-q">${idx + 1}. ${esc(q.q)}</div>
          ${opts}
          <div class="cd-exp" id="exp"></div>
          <div class="cd-foot">
            <button class="cd-next" id="next">下一题 →</button>
            <span class="cd-prog">${idx + 1} / ${total}</span>
          </div>
        </div></div>`;
      const exp = content.querySelector("#exp");
      const next = content.querySelector("#next");
      content.querySelector(".x").onclick = exitAll;
      content.querySelectorAll(".cd-opt").forEach(b => {
        b.onclick = () => {
          if (b.disabled) return;
          answered++;
          const ui = +b.dataset.i;
          const right = ui === q.a;
          if (right) correct++;
          else { const t = q.tag || node.name; wrongTags[t] = (wrongTags[t] || 0) + 1; }
          content.querySelectorAll(".cd-opt").forEach(x => {
            x.disabled = true;
            const xi = +x.dataset.i;
            if (xi === q.a) x.classList.add("right");
            else if (xi === ui) x.classList.add("wrong");
            else x.classList.add("dim");
          });
          exp.innerHTML = `解析：正确答案 <span class="ans">${String.fromCharCode(65 + q.a)}. ${esc(q.options[q.a])}</span>。<br>${esc(q.e)}`;
          exp.classList.add("show");
          next.classList.add("show");
        };
      });
      next.onclick = () => {
        if (idx + 1 < total) { idx++; render(); }
        else finish();
      };
    }
    function finish() {
      const total = qs.length;
      const pct = total ? Math.round(correct / total * 100) : 0;
      applySceneBg(bg);
      const anno = buildAnno();
      content.innerHTML = `<div class="cd-top"><button class="x">✕</button></div>
        <div class="cd-quizwrap"><div class="cd-panel cd-summary">
          <div class="lvtitle" style="font-size:20px;font-weight:800;color:#222">${esc(node.name)} · 练习完成</div>
          <div class="big">${correct}/${total}</div>
          <div class="row">正确率 <b style="color:#c0392b">${pct}%</b></div>
          <div class="cd-anno ${anno.praise ? "praise" : ""}">${anno.html}</div>
          <div class="row" style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <button class="cd-next show" id="again" style="position:static">🔄 再来一组（10道）</button>
            <button class="cd-btn" id="backHome" style="width:auto;padding:11px 18px">返回常识板块页面</button>
          </div>
        </div></div>`;
      // ★ 计入常识模块正确率（累计 + 当天各模块 + 全局 qTotal）
      try { window.DB.recordAccuracy("常识", correct, total); } catch (e) { console.error("记录常识正确率失败", e); }
      content.querySelector(".x").onclick = exitAll;
      content.querySelector("#again").onclick = () => { stack.push({ node }); startQuiz(node, isRandom); };
      content.querySelector("#backHome").onclick = exitToCommon;
    }
    render();
    openDoors();
  }

  function exitAll() {
    closeDoors();
    stack.length = 0;
    setTimeout(() => {
      if (overlay) { overlay.remove(); overlay = null; }
      if (noteEl) { noteEl.remove(); noteEl = null; }
    }, 500);
  }

  // 返回常识板块页面：关闭全屏并触发外部(常识模块)重新渲染
  function exitToCommon() {
    closeDoors();
    stack.length = 0;
    setTimeout(() => {
      if (overlay) { overlay.remove(); overlay = null; }
      if (noteEl) { noteEl.remove(); noteEl = null; }
      if (window.CommonDoor.onExit) { try { window.CommonDoor.onExit(); } catch (e) {} }
    }, 500);
  }

  /* ===== 入口：渲染顶层方块网格 ===== */
  function renderGrid(host) {
    if (!TREE) { host.innerHTML = `<div class="empty">分类树未加载</div>`; return; }
    injectCSS();
    host.innerHTML = "";
    TREE.cats.forEach(cat => {
      cat._parent = null;
      const tile = el(`<div class="cd-tile" style="background:linear-gradient(135deg,#3a2c1c,#5b4326)">
        <div class="em">${cat.icon || "📚"}</div>
        <div class="ct">${esc(cat.name)}</div></div>`);
      // 先显示渐变底色（即时），主题照片异步加载完成后叠加淡入
      tile.style.backgroundImage = "linear-gradient(135deg,#3a2c1c,#5b4326)";
      tile.style.backgroundSize = "cover";
      tile.style.backgroundPosition = "center";
      (function (t, b) {
        const im = new Image();
        im.onload = function () { t.style.backgroundImage = `url("${b}"), linear-gradient(135deg,#3a2c1c,#5b4326)`; };
        im.src = b;
      })(tile, cat.bg);
      tile.onclick = () => {
        stack.length = 0;
        stack.push({ node: cat });
        cat._path = [{ name: cat.name }];
        enterFromTile(tile, cat.bg);
        setTimeout(() => { levelView(cat); }, 480);
      };
      host.appendChild(tile);
    });
  }

  window.CommonDoor = { renderGrid };
})();
