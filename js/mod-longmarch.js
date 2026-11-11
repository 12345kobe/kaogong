/* 模块：长征专题（历史板块常识页入口）
   入口：常识页「进入长征专题 →」卡片 → LongMarch.open()
   流程：① 专题浮层（两个大按钮）  → ② 学习长征历史 / 学习长征90周年讲话
        - 历史：直接进入 CommonDoor 逐题学习（带 kp + 逐选项 why + 直接练/练习）
        - 讲话：先阅读「导语 + 讲话要点」，再进入逐题学习
   复用 CommonDoor.openStudyNode 获得与「学习常识」一致的学练体验。 */
(function () {
  const CSS = `
.lm-overlay{position:fixed;inset:0;z-index:99998;background:linear-gradient(160deg,#3a1d12,#5b2a18 50%,#241608);
  font-family:inherit;display:flex;flex-direction:column;color:#fff;overflow:auto;
  padding:env(safe-area-inset-top,0) 16px 24px;animation:lm-in .25s ease}
@keyframes lm-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.lm-top{display:flex;align-items:center;gap:10px;padding:14px 2px 6px}
.lm-top .x{margin-left:auto;background:rgba(255,255,255,.18);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:18px;cursor:pointer}
.lm-title{font-size:24px;font-weight:900;text-shadow:0 2px 8px rgba(0,0,0,.5)}
.lm-sub{color:#ffd98a;font-size:13px;margin-bottom:6px;text-shadow:0 1px 3px rgba(0,0,0,.5)}
.lm-hero{font-size:46px;text-align:center;margin:8px 0 16px;filter:drop-shadow(0 3px 8px rgba(0,0,0,.5))}
.lm-btns{display:flex;flex-direction:column;gap:14px;margin-top:6px}
.lm-btn{background:rgba(255,255,255,.95);border:none;border-radius:16px;padding:16px;font-size:17px;font-weight:800;color:#3a2400;
  cursor:pointer;text-align:left;box-shadow:0 8px 20px rgba(0,0,0,.3);transition:transform .12s;display:flex;align-items:center;gap:14px}
.lm-btn:active{transform:scale(.98)}
.lm-btn .em{font-size:32px;flex:none}
.lm-btn .t{display:flex;flex-direction:column}
.lm-btn .sm{font-size:12px;font-weight:600;color:#8a6a2a;margin-top:3px}
.lm-intro{flex:1;overflow:auto}
.lm-card{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);border-radius:16px;padding:16px;margin-bottom:14px;line-height:1.75;font-size:14px}
.lm-card h4{margin:0 0 8px;color:#ffd98a;font-size:15px}
.lm-card ol{margin:6px 0 0;padding-left:20px}
.lm-card li{margin:7px 0}
.lm-card b{color:#ffe6b0}
.lm-start{background:linear-gradient(135deg,#ffd98a,#f0a93a);color:#3a2400;border:none;border-radius:14px;padding:14px;font-size:16px;font-weight:800;cursor:pointer;margin-top:6px;width:100%;box-shadow:0 8px 20px rgba(0,0,0,.3)}`;

  function injectCSS() {
    if (document.getElementById("lm-css")) return;
    const s = document.createElement("style");
    s.id = "lm-css"; s.textContent = CSS; document.head.appendChild(s);
  }
  function el(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; }
  function esc(s) { return window.UI ? window.UI.esc(String(s == null ? "" : s)) : String(s); }

  const BG = "assets/img/door/hist.png";

  function close() {
    const o = document.getElementById("lm-overlay");
    if (o) o.remove();
  }

  function open() {
    injectCSS();
    close();
    const ov = el(`<div class="lm-overlay" id="lm-overlay">
      <div class="lm-top"><div class="lm-title">🏔️ 长征专题</div><button class="x" title="返回">✕</button></div>
      <div class="lm-sub">长征胜利 90 周年 · 历史与讲话精神学习</div>
      <div class="lm-hero">⭐</div>
      <div class="lm-btns">
        <button class="lm-btn" id="lm-hist"><span class="em">📜</span><span class="t">学习长征的历史<span class="sm">1934—1936 伟大远征 · 100 题逐题学练</span></span></button>
        <button class="lm-btn" id="lm-speech"><span class="em">🎤</span><span class="t">学习长征90周年·习主席讲话<span class="sm">讲话精神要点 + 100 题逐题学练</span></span></button>
      </div>
    </div>`);
    document.body.appendChild(ov);
    ov.querySelector(".x").onclick = close;
    ov.querySelector("#lm-hist").onclick = function () {
      close();
      if (window.CommonDoor && window.CommonDoor.openStudyNode)
        window.CommonDoor.openStudyNode({ name: "长征历史", bank: "lm_history", bg: BG });
      else toast("学习模块未就绪");
    };
    ov.querySelector("#lm-speech").onclick = function () { close(); openSpeechIntro(); };
  }

  /* 讲话导语 + 要点（基于习近平 2016 纪念红军长征胜利80周年大会讲话及公开论述，权威可查） */
  function openSpeechIntro() {
    injectCSS();
    const ov = el(`<div class="lm-overlay" id="lm-overlay">
      <div class="lm-top"><div class="lm-title">🎤 习主席长征讲话精神</div><button class="x" title="返回">✕</button></div>
      <div class="lm-sub">先读要点，再进入逐题学习</div>
      <div class="lm-intro">
        <div class="lm-card">
          <h4>📌 导语</h4>
          2026 年是红军长征胜利 <b>90 周年</b>。长征的伟大胜利，是中国共产党和红军谱写的壮丽史诗，是中华民族伟大复兴历史进程中的巍峨丰碑。习近平总书记在多个重要场合深刻阐释长征精神的丰富内涵，号召我们：<b>“每一代人有每一代人的长征路，每一代人都要走好自己的长征路。”</b>
        </div>
        <div class="lm-card">
          <h4>📖 长征精神的五个方面</h4>
          <ol>
            <li><b>坚定理想信念</b>：坚定革命的理想和信念，坚信正义事业必然胜利的精神（<b>“革命理想高于天”</b>）。</li>
            <li><b>不怕艰难牺牲</b>：为了救国救民，不怕任何艰难险阻，不惜付出一切牺牲的精神。</li>
            <li><b>独立自主、实事求是</b>：坚持独立自主、实事求是，一切从实际出发的精神。</li>
            <li><b>顾全大局、严守纪律</b>：顾全大局、严守纪律、紧密团结的精神。</li>
            <li><b>紧紧依靠人民</b>：紧紧依靠人民群众，同人民群众生死相依、患难与共、艰苦奋斗的精神。</li>
          </ol>
        </div>
        <div class="lm-card">
          <h4>💡 经典论断</h4>
          <ol>
            <li>长征是历史记录上的第一次，长征是<b>宣言书</b>，长征是<b>宣传队</b>，长征是<b>播种机</b>。</li>
            <li><b>“心中有信仰，脚下有力量。”</b></li>
            <li>弘扬伟大长征精神，<b>走好今天的长征路</b>；新长征、<b>长征永远在路上</b>。</li>
          </ol>
        </div>
      </div>
      <button class="lm-start" id="lm-start">🚀 开始学习习题（100 题）→</button>
    </div>`);
    document.body.appendChild(ov);
    ov.querySelector(".x").onclick = open; // 返回专题选择
    ov.querySelector("#lm-start").onclick = function () {
      close();
      if (window.CommonDoor && window.CommonDoor.openStudyNode)
        window.CommonDoor.openStudyNode({ name: "长征90周年讲话", bank: "lm_speech", bg: BG });
      else toast("学习模块未就绪");
    };
  }

  function toast(msg) {
    const n = el(`<div style="position:fixed;left:50%;bottom:30px;transform:translateX(-50%);background:rgba(0,0,0,.82);color:#fff;padding:9px 18px;border-radius:20px;font-size:13px;z-index:100001">${esc(msg)}</div>`);
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 1800);
  }

  window.LongMarch = { open };
})();
