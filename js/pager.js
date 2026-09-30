/* ===== 页面跳转框架：方格入口 + 内容区全屏子页 =====
   背景：原布局用 <details>（UI.section）做「点击展开/折叠」，用户要求全部改为
         「一个小方块 → 点进去跳到下一个页面」，且子页占满内容区（不是悬浮窗）。

   设计要点：
   1) UI.section 是全站展开/折叠的唯一入口。本框架不在模块内部改代码，而是在
      renderRoute 渲染完成后「后置吸收」：把 body 顶层的 .kg-det 抽走，
      内容 DOM 原样保留（事件监听随节点搬家，不失效），原地换成方格入口。
   2) 子路由：#/模块/序号（如 #/essay/3）。渲染子页后再次 absorb，因此嵌套的
      折叠块会被自动拆成更深层路由 #/模块/1/2，天然支持多级，无需模块配合。
   3) 手写入口：Pager.define() 供模块自定义子页（如「资料分析公式」），
      与自动吸收的页面共用同一套渲染与返回逻辑。
   返回的 DOM 由 Pager.render 挂载，内容区铺满宽度（body.kg-sub 去掉内边距）。 */
(function () {
  "use strict";

  /* route -> { title, parent, host:Element（原折叠块内容容器）| build:fn } */
  const pages = Object.create(null);
  let styled = false;

  function esc(s) { return (window.UI && window.UI.esc) ? window.UI.esc(s) : String(s == null ? "" : s); }

  /* 从标题里取emoji做图标；没有则用序号方块 */
  function iconOf(title, idx) {
    const m = String(title || "").match(/[\u2190-\u2BFF\u{1F000}-\u{1FAFF}\u2600-\u27BF]/u);
    if (m) return m[0];
    const DEF = ["📘", "📗", "📙", "📕", "📔", "📒", "📓", "📚", "🗂", "🧩", "✏️", "🎯"];
    return DEF[(idx - 1) % DEF.length];
  }

  function ensureStyle() {
    if (styled) return;
    styled = true;
    const s = document.createElement("style");
    s.textContent = `
/* 方格入口网格：一个一个小方块 */
.kg-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:12px;margin:14px 0}
.kg-tile{
  position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:6px;padding:14px 10px;min-height:118px;aspect-ratio:1/1;
  border:1px solid var(--line);border-radius:16px;background:var(--panel2);
  cursor:pointer;text-align:center;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease;
  -webkit-tap-highlight-color:transparent;user-select:none;
}
.kg-tile:hover{transform:translateY(-3px);border-color:#34e7e4;box-shadow:0 8px 22px rgba(52,231,228,.22)}
.kg-tile:active{transform:translateY(-1px) scale(.98)}
.kg-tile-ico{font-size:30px;line-height:1}
.kg-tile-t{font-size:14px;font-weight:700;line-height:1.35;color:var(--txt);word-break:break-word;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.kg-tile-arrow{position:absolute;right:8px;top:8px;color:var(--txt-dim);font-size:14px;opacity:.75}
body.light:not(.glass) .kg-tile{background:#fff}

/* 子页面：占满内容区，去掉外层留白 */
body.kg-sub #content{padding:0 0 60px}
body.kg-sub #pageBody{padding:0;margin:0}
.kg-subpage{padding:16px 14px}
/* 子页里直接承载原折叠块的内容容器，去掉其内边距使内容铺满 */
.kg-subpage > .kg-det-b{padding:0;margin:0}
.kg-subpage > .kg-det-b:empty::after{content:"暂无内容";display:block;color:var(--txt-dim)}
.kg-topbar{
  position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;
  padding:12px 14px;background:var(--bg);border-bottom:1px solid var(--line);padding-top:calc(12px + env(safe-area-inset-top));
}
.kg-topbar .kg-back{
  flex:0 0 auto;border:1px solid var(--line);background:var(--panel2);color:var(--txt);
  border-radius:10px;padding:7px 12px;font-size:14px;font-weight:700;cursor:pointer;
}
.kg-topbar .kg-back:active{transform:scale(.96)}
.kg-topbar h2{margin:0;font-size:17px;font-weight:800;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:520px){
  .kg-tiles{grid-template-columns:repeat(2,1fr);gap:10px}
  .kg-tile{min-height:104px;padding:12px 8px}
  .kg-tile-ico{font-size:26px}
  .kg-tile-t{font-size:13px}
}
`;
    document.head.appendChild(s);
  }

  /* ===== 注册：手写子页 =====
     Pager.define("data/formulas", {parent:"data", title:"资料分析公式", build:(box)=>{...}})
     build 里往 box 塞内容即可（不要再包 .kg-det）。 */
  function define(route, opt) {
    pages[route] = {
      title: opt.title || route,
      parent: opt.parent || String(route).split("/")[0],
      build: opt.build || null,
      nodes: null,
      depth: opt.depth || 1
    };
  }

  function has(route) { return !!(route && pages[route]); }

  /* 顶层「可收起块」收集（只看直接子节点）
     - .kg-det（原折叠块）恒定纳入
     - .card 仅在 opts.cards 时纳入：用于把整个模块首页全部收成方格
     跳过：方格网格自身、全局录入入口、标注 data-kg-keep="1" 的元素 */
  function findBlocks(container, opts) {
    const wantCards = !!(opts && opts.cards);
    return Array.prototype.filter.call(container.children, function (c) {
      if (!c || !c.classList) return false;
      if (c.dataset && c.dataset.kgKeep === "1") return false;
      if (c.classList.contains("kg-tiles")) return false;
      if (c.classList.contains("pdf-quick-entry")) return false;
      if (c.classList.contains("kg-det")) return true;
      if (c.classList.contains("card")) return wantCards;
      return false;
    });
  }

  /* ===== 吸收：把容器里的板块换成方格，并为每块生成子路由 =====
     内容一律保留为真实 DOM（卡片本体搬进子页容器），因此已绑定的事件、
     以及模块后续异步渲染的内容都不会丢失。 */
  function absorb(parentRoute, container, opts) {
    const blocks = findBlocks(container, opts);
    if (!blocks.length) return 0;

    ensureStyle();
    const grid = document.createElement("div");
    grid.className = "kg-tiles";
    container.insertBefore(grid, blocks[0]);

    let n = 0;
    blocks.forEach(function (b) {
      // 模块按数据主动隐藏的板块，不生成方格入口
      if (b.hidden) return;
      if (b.style && b.style.display === "none") return;

      let title = "", host = null;
      if (b.classList.contains("kg-det")) {
        const tEl = b.querySelector(".kg-det-t");
        title = (tEl && tEl.textContent || "").trim();
        host = b.querySelector(".kg-det-b");
      } else {
        const h = b.querySelector("h3, h2, .card-title");
        title = h ? (h.textContent || "").trim() : "";
        const wrap = document.createElement("div");
        wrap.className = "kg-host";
        wrap.appendChild(b);        // 卡片本体搬进子页容器
        host = wrap;
      }
      if (!title) title = "板块 " + (n + 1);
      n++;
      const route = parentRoute + "/" + n;

      pages[route] = {
        title: title,
        parent: parentRoute,
        host: host || null,
        build: null
      };

      const tile = document.createElement("div");
      tile.className = "kg-tile";
      tile.setAttribute("role", "button");
      tile.innerHTML = '<span class="kg-tile-ico">' + esc(iconOf(title, n)) + '</span>' +
        '<span class="kg-tile-t">' + esc(title) + '</span>' +
        '<span class="kg-tile-arrow">›</span>';
      tile.onclick = function () { location.hash = "#/" + route; };
      grid.appendChild(tile);

      // .kg-det 仍在 DOM 中，需摘掉；.card 已在上一步搬进 wrap（未挂载）
      if (b.classList.contains("kg-det") && b.parentNode) b.parentNode.removeChild(b);
    });
    return n;
  }

  /* ===== 渲染子页 ===== */
  function render(route) {
    const p = pages[route];
    if (!p) return false;
    ensureStyle();

    document.body.classList.add("kg-sub");

    // 导航高亮落在顶层模块；标题显示「子页标题」+ 返回到父级
    const root = String(route).split("/")[0];
    try { window.setActiveNav && window.setActiveNav(root); } catch (e) {}
    const pt = document.getElementById("pageTitle");
    if (pt) pt.innerHTML = '<span class="nav-txt">' + esc(p.title) + '</span>';

    const body = document.getElementById("pageBody");
    body.innerHTML = "";

    const bar = document.createElement("div");
    bar.className = "kg-topbar";
    const back = document.createElement("button");
    back.className = "kg-back";
    const parts = String(p.parent).split("/");
    const backLabel = (parts.length > 1) ? "← 返回" : ("← " + ((window.MODULES[parts[0]] && window.MODULES[parts[0]].title) || "返回"));
    back.textContent = backLabel;
    back.onclick = function () { location.hash = "#/" + p.parent; };
    bar.appendChild(back);
    const h2 = document.createElement("h2");
    h2.textContent = p.title;
    bar.appendChild(h2);
    body.appendChild(bar);

    const box = document.createElement("div");
    box.className = "kg-subpage";
    body.appendChild(box);

    if (p.build) { try { p.build(box); } catch (e) { console.error(e); box.innerHTML = '<div class="card empty">加载出错：' + esc(e.message) + '</div>'; } }
    else if (p.host) { try { box.appendChild(p.host); } catch (e) { console.error(e); } }
    else { box.innerHTML = '<div class="card empty">暂无内容</div>'; }

    // 递归：子页里若还有折叠块，继续拆成更深一级路由
    // 注意：吸收对象是「内容容器本身」而非 box，否则挂在 .kg-det-b 里的嵌套块抓不到
    try {
      let target = box;
      if (p.host && p.host.classList && p.host.classList.contains("kg-det-b")) target = p.host;
      absorb(route, target);
    } catch (e) { console.error(e); }

    return true;
  }

  /* 手写方格入口（模块自建时确保样式已注入）
     Pager.grid() 生成容器，Pager.tile(ico, 标题, "#/xxx/yyy") 生成方块 */
  function tile(ico, title, href) {
    ensureStyle();
    const t = document.createElement("div");
    t.className = "kg-tile";
    t.setAttribute("role", "button");
    t.innerHTML = '<span class="kg-tile-ico">' + esc(ico) + '</span>' +
      '<span class="kg-tile-t">' + esc(title) + '</span>' +
      '<span class="kg-tile-arrow">›</span>';
    t.onclick = function () { location.hash = href; };
    return t;
  }
  function grid() {
    ensureStyle();
    const g = document.createElement("div");
    g.className = "kg-tiles";
    return g;
  }

  window.Pager = {
    define: define,
    has: has,
    absorb: absorb,
    render: render,
    tile: tile,
    grid: grid,
    pages: pages,
    /* 进入非子页时清理标记 */
    exitSub() { document.body.classList.remove("kg-sub"); }
  };
})();
