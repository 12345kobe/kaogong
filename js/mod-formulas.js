/* 模块：资料分析 / 数量关系 —— 公式板块 + 百化分闪卡
   - 资料分析：原有公式板块保留
   - 新增「百化分闪卡」：覆盖 百化分 / 平方数 / 三次方 / 四次方 / 开根号 五类
     普通模式（闪卡：点击翻转）+ 困难模式（填空：百化分允许 0.3% 误差，其余精确）
     按艾宾浩斯曲线调度；错题靠后重做；连续答对2次消除
     每次直接开始所有题；含计时 + 正确率
*/
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};
  function FormulaBoard(moduleKey, storeKey, title, defFormulas, intro) {
    return {
      title, icon: moduleKey,
      render(body) {
        const DB = window.DB, UI = window.UI;
        UI.StudyPanel(moduleKey, body);
        const card = UI.el(`<div class="card"><h3>📐 ${UI.esc(title)} · 公式板块</h3>
          <div class="muted small">${UI.esc(intro)}</div>
          <div class="row" style="margin:10px 0"><button class="btn primary" id="addF">＋ 添加公式</button></div>
          <div id="fList" style="display:flex;flex-direction:column;gap:10px"></div></div>`);
        body.appendChild(card);
        function renderList() {
          const arr = DB.state.formulas[storeKey] = DB.state.formulas[storeKey] && DB.state.formulas[storeKey].length ? DB.state.formulas[storeKey] : defFormulas.slice();
          DB.state.formulas[storeKey] = arr;
          const list = card.querySelector("#fList"); list.innerHTML = "";
          if (!arr.length) list.innerHTML = `<div class="empty">暂无公式，点击添加</div>`;
          arr.forEach((f, i) => {
            const row = UI.el(`<div class="todo" style="align-items:flex-start">
              <div style="flex:1"><b>${UI.esc(f.name)}</b>
              <div style="font-family:monospace;color:#34e7e4;margin:4px 0">${UI.esc(f.f)}</div>
              ${f.note ? `<div class="muted small">${UI.esc(f.note)}</div>` : ""}</div>
              <button class="del" data-edit="${i}" style="border:none;background:none;color:#9fb0d8;font-size:14px">✎</button>
              <button class="del" data-del="${i}" style="border:none;background:none;color:#ff6b81;font-size:16px">✕</button></div>`);
            row.querySelector("[data-del]").onclick = () => { arr.splice(i, 1); DB.save(); renderList(); };
            row.querySelector("[data-edit]").onclick = () => editF(i);
            list.appendChild(row);
          });
        }
        function editF(i) {
          const arr = DB.state.formulas[storeKey];
          const cur = arr[i] || { name: "", f: "", note: "" };
          const box = UI.el(`<div></div>`);
          box.innerHTML = `<label class="fld">名称</label><input id="fn" value="${UI.esc(cur.name)}"/>
            <label class="fld">公式</label><input id="ff" value="${UI.esc(cur.f)}"/>
            <label class="fld">备注</label><input id="fnote" value="${UI.esc(cur.note || "")}"/>`;
          UI.modal({
            title: i == null ? "添加公式" : "编辑公式", body: box,
            actions: [
              { label: "取消", cls: "ghost", onClick: (m, c) => c() },
              { label: "保存", cls: "primary", onClick: (m, c) => {
                const obj = { name: box.querySelector("#fn").value.trim(), f: box.querySelector("#ff").value.trim(), note: box.querySelector("#fnote").value.trim() };
                if (!obj.name || !obj.f) { UI.toast("名称和公式必填"); return; }
                if (i == null) arr.push(obj); else arr[i] = obj;
                DB.save(); c(); renderList();
              } }
            ]
          });
        }
        card.querySelector("#addF").onclick = () => editF(null);
        renderList();
      }
    };
  }

  /* ===== 百化分闪卡 ===== */
  function shuffleArr(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* cat: 只练某一模块（baihuafen/squaring/cubing/fourth/rooting）；null=全部
     shuffle: 是否打乱顺序（默认打乱） */
  function startFlashcards(body, mode /*"easy"|"hard"*/, cat, shuffle) {
    const UI = window.UI, DB = window.DB;
    const EB = window.Ebbinghaus;
    const ALL = window.FORMULA_ITEMS || [];
    const items = cat ? ALL.filter(x => x.cat === cat) : ALL;
    if (!items.length) { UI.toast("无速算表数据"); return; }
    const CATS = { baihuafen: "百化分", squaring: "平方数", cubing: "三次方", fourth: "四次方", rooting: "开根号" };
    const isBai = (it) => it.cat === "baihuafen";
    const shuffleOn = !!shuffle;

    // 该模块全部条目都要练完，才算完成一轮
    function pickForToday() {
      let list = items.slice();
      if (shuffleOn) list = shuffleArr(list);
      return list;
    }

    // 状态：当前队列（答错的会插入到靠后位置再次出现）
    const host = document.createElement("div");
    host.className = "modal-mask";
    const m = document.createElement("div");
    m.className = "modal";
    m.style.cssText = "width:min(720px,96vw);max-height:92vh;overflow:auto";
    m.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">📇 速算背诵练习（${mode === "hard" ? "困难模式 · 自行填写" : "普通模式 · 闪卡"}）</h2>
        <button class="btn ghost" id="goHome">← 返回主页面</button>
      </div>
      <div class="muted small" style="margin:8px 0">模块：<b>${UI.esc(CATS[cat] || "全部")}</b> · 共 ${items.length} 条${shuffleOn ? "（已打乱）" : "（原顺序）"} · <b>全部练完才算一轮</b> · 答错的题目会自动靠后重做 · 累计答对2次自动消除</div>
      <div id="fcStats" class="eb-stats"></div>
      <div id="fcCard" class="fc-card"></div>
    `;
    host.appendChild(m);
    document.getElementById("modalRoot").appendChild(host);
    host.querySelector("#goHome").onclick = () => goHome();
    host.onclick = e => { if (e.target === host) { endSession(); } };

    let cur = 0, correctN = 0, totalN = 0;
    let queue = pickForToday().map(x => ({ ...x, _fbStreak: EB.getRecord("formula", x.prompt)?.correctStreak || 0 }));
    const startTime = Date.now();
    const wrongIndices = [];   // 当前 session 内曾答错的题位
    const seenStreaks = {};    // 某条 prompt 本 session 内累计答对次数

    function showTimer() {
      const sec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      const m2 = Math.floor(sec / 60), s = sec % 60;
      return `${String(m2).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    }

    function renderStats() {
      const total = queue.length;
      const acc = totalN ? Math.round(correctN / totalN * 100) : 0;
      host.querySelector("#fcStats").innerHTML = `
        <div class="eb-stat"><span class="n">${total}</span><span class="l">本轮题目</span></div>
        <div class="eb-stat"><span class="n">${correctN}/${totalN}</span><span class="l">正确数 / 已答</span></div>
        <div class="eb-stat"><span class="n">${acc}%</span><span class="l">正确率</span></div>
        <div class="eb-stat"><span class="n">${showTimer()}</span><span class="l">用时</span></div>
        <div class="eb-stat"><span class="n">${wrongIndices.length}</span><span class="l">本轮错题</span></div>
      `;
    }

    function next() {
      // 取下一条未答对的（仍在队列里、且未达 streak>=2）
      while (cur < queue.length) {
        const it = queue[cur];
        const streak = seenStreaks[it.prompt] || 0;
        if (streak >= 2) { cur++; continue; }
        return renderCard(it);
      }
      // 队列已耗尽；若仍有错题，靠后再次出现
      const remain = wrongIndices.filter(idx => idx < queue.length);
      if (remain.length) {
        // 把错题复制一份追加到队尾
        const toAdd = remain.map(idx => ({ ...queue[idx] }));
        queue.push(...toAdd);
        wrongIndices.length = 0;
        cur = queue.length - toAdd.length;
        return next();
      }
      // 全部完成
      endSession();
    }

    function renderCard(it) {
      const cardEl = host.querySelector("#fcCard");
      renderStats();
      const cat = CATS[it.cat] || it.cat;
      const hint = isBai(it) ? "百化分" : (
        it.cat === "squaring" ? "平方数" : (
        it.cat === "cubing" ? "三次方" : (
        it.cat === "fourth" ? "四次方" : "开根号" )));

      if (mode === "easy") {
        // 闪卡：默认显示 prompt，翻转后看 answer
        cardEl.innerHTML = `
          <div class="fc-face fc-front">
            <div class="muted small">第 ${cur + 1} / ${queue.length} 题 · ${cat}</div>
            <div class="fc-big">${UI.esc(it.prompt)}</div>
            <div class="muted small">点击卡片看答案</div>
          </div>
          <div class="fc-actions">
            <button class="btn" id="flip">🔄 翻转看答案</button>
          </div>
          <div class="fc-judge" style="display:none">
            <button class="btn" data-judge="forgot">😵 忘记（错的）</button>
            <button class="btn primary" data-judge="remember">😊 记得（对的）</button>
          </div>
        `;
        cardEl.querySelector("#flip").onclick = () => {
          cardEl.querySelector(".fc-face").classList.add("flipped");
          cardEl.querySelector(".fc-face").innerHTML = `
            <div class="muted small">第 ${cur + 1} / ${queue.length} 题 · ${cat} · 答案</div>
            <div class="fc-big fc-ans">${UI.esc(it.answer)}</div>
            <div class="muted small">如百化分可视为近似值，请按实际能记住的精度记忆</div>
          `;
          cardEl.querySelector("#flip").style.display = "none";
          cardEl.querySelector(".fc-judge").style.display = "flex";
        };
        cardEl.querySelectorAll("[data-judge]").forEach(b => b.onclick = () => {
          const ok = b.dataset.judge === "remember";
          recordAnswer(it, ok);
          cur++;
          next();
        });
      } else {
        // 困难模式：自带 prompt，用户输入 → 校验
        cardEl.innerHTML = `
          <div class="fc-face">
            <div class="muted small">第 ${cur + 1} / ${queue.length} 题 · ${cat} · 自行填写</div>
            <div class="fc-big">${UI.esc(it.prompt)}</div>
            <div class="muted small" style="margin-top:8px">${isBai(it) ? "输入形如 1/12 或 1/12.5（按截图原样）；百化分允许 0.3% 误差" : "请精确输入答案（如 169 / 1.732 / 121）"}</div>
            <input id="fcIn" class="fc-input" autocomplete="off" inputmode="decimal" placeholder="${isBai(it) ? "1/x 形式" : "数值"}" />
            <div class="row" style="margin-top:8px;gap:8px">
              <button class="btn primary" id="fcSubmit">提交</button>
              <button class="btn ghost" id="fcShowAns">提示</button>
            </div>
            <div id="fcVerdict" class="fc-verdict" style="display:none"></div>
          </div>
        `;
        const inp = cardEl.querySelector("#fcIn");
        const sub = cardEl.querySelector("#fcSubmit");
        const showAns = cardEl.querySelector("#fcShowAns");
        const verdict = cardEl.querySelector("#fcVerdict");
        inp.focus();
        function checkAnswer() {
          const v = inp.value.trim();
          if (!v) return;
          const ok = isBai(it) ? checkBai(v, it.answer) : normalizeNum(v) === normalizeNum(it.answer);
          // 显示判定
          verdict.style.display = "block";
          verdict.className = "fc-verdict " + (ok ? "ok" : "ng");
          verdict.innerHTML = `<b>${ok ? "✅ 正确" : "❌ 错误"}</b> · 标准答案：<code>${UI.esc(it.answer)}</code> · 你的答案：<code>${UI.esc(v)}</code>`;
          sub.disabled = true; inp.disabled = true;
          // 下一题按钮
          const nx = document.createElement("div");
          nx.className = "row"; nx.style = "margin-top:8px;gap:8px";
          nx.innerHTML = `<button class="btn primary" id="fcNext">下一题 →</button>`;
          verdict.appendChild(nx);
          nx.querySelector("#fcNext").onclick = () => { recordAnswer(it, ok); cur++; next(); };
        }
        sub.onclick = checkAnswer;
        inp.addEventListener("keydown", e => { if (e.key === "Enter") checkAnswer(); });
        showAns.onclick = () => { inp.value = it.answer; sub.disabled = false; };
      }
    }

    // 百化分答案比较（容差 0.3%）
    function checkBai(got, expected) {
      const g = parseFraction(got), e = parseFraction(expected);
      if (g == null || e == null) return false;
      // 容差：分数值（= 1/x 中 x 的差 <= 0.03）即允许 0.3% 误差（≈1/300）
      return Math.abs(g - e) <= 0.03;
    }
    function parseFraction(s) {
      s = String(s || "").trim();
      let m = s.match(/^1\s*\/\s*(\d+(?:\.\d+)?)$/);
      if (m) return parseFloat(m[1]);
      return null;
    }
    function normalizeNum(s) {
      s = String(s || "").trim();
      // 1/2.5 → 0.4
      if (/^1\s*\/\s*\d+/.test(s)) { const v = parseFraction(s); return v != null ? (1 / v).toString() : s; }
      // 数字（含小数）
      const n = parseFloat(s);
      return isNaN(n) ? s : String(parseFloat(n.toFixed(6)));
    }

    function recordAnswer(it, ok) {
      totalN++;
      if (ok) { correctN++; seenStreaks[it.prompt] = (seenStreaks[it.prompt] || 0) + 1; }
      else { seenStreaks[it.prompt] = 0; wrongIndices.push(cur); }
      // 调用 Ebbinghaus 调度
      EB.updateAfterReview("formula", it.prompt, ok);
    }

    function endSession() {
      const sec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
      const mins = Math.max(1, Math.round(sec / 60));
      // 学习时长 + 累计正确率
      try {
        DB.addTimerMinutes("data", mins);
        DB.addSubjectSession("data", mins);
        const ac = DB.state.accuracyCumulative = DB.state.accuracyCumulative || {};
        ac["资料"] = ac["资料"] || { correct: 0, total: 0 };
        ac["资料"].correct += correctN;
        ac["资料"].total += totalN;
        DB.save();
      } catch (e) {}
      const cardEl = host.querySelector("#fcCard");
      const acc = totalN ? Math.round(correctN / totalN * 100) : 0;
      cardEl.innerHTML = `
        <div class="card center">
          <div style="font-size:22px">🎯 本次正确率 <b>${acc}%</b>（${correctN}/${totalN}）</div>
          <div class="muted small">用时 ${showTimer()} · 已记录到「资料分析」学习时长与累计正确率。</div>
          <div class="row" style="justify-content:center;margin-top:12px;gap:8px">
            <button class="btn primary" id="restart">再来一轮</button>
            <button class="btn ghost" id="exit">完成</button>
          </div>
        </div>`;
      renderStats();
      cardEl.querySelector("#restart").onclick = () => {
        const fresh = pickForToday().map(x => ({ ...x }));
        // 替换 host 中的 #fcCard 内容
        cardEl.outerHTML = `<div id="fcCard" class="fc-card"></div>`;
        // 重置内部状态并 next
        cur = 0; correctN = 0; totalN = 0;
        wrongIndices.length = 0;
        Object.keys(seenStreaks).forEach(k => delete seenStreaks[k]);
        queue = fresh.map(x => ({ ...x, _fbStreak: EB.getRecord("formula", x.prompt)?.correctStreak || 0 }));
        // 重置计时器
        const newStart = Date.now();
        // 用闭包替换 showTimer
        const _t = window.__fcStart = { time: newStart };
        // next();
        const __origStart = startTime;
        Object.defineProperty(window, '__sh', { value: newStart });
        setTimeout(() => next(), 50);
      };
      cardEl.querySelector("#exit").onclick = () => { host.remove(); };
    }

    next();
  }

  function goHome() {
    document.querySelectorAll(".modal-mask").forEach(m => m.remove());
    if (location.hash !== "#/countdown") location.hash = "#/countdown";
  }

  /* ===== 资料分析入口 ===== */
  window.MODULES.data = {
    title: "资料分析", icon: "data",
    render(body) {
      const UI = window.UI;
      UI.StudyPanel("data", body);
      // 公式板块
      FormulaBoard("data", "data", "资料分析", window.BANKS.FORMULAS_DATA, "列出资料分析常用公式，支持自定义编辑、增删。").render(body);
      // 五个速算模块入口
      const CATS = [
        { key: "baihuafen", name: "百化分" },
        { key: "squaring", name: "平方数" },
        { key: "cubing", name: "三次方" },
        { key: "fourth", name: "四次方" },
        { key: "rooting", name: "开根号" }
      ];
      const ALL_ITEMS = window.FORMULA_ITEMS || [];

      const fcCard = UI.el(`<div class="card" style="margin-top:16px">
        <h3>📇 速算背诵练习（分模块 · 学习 / 测试）</h3>
        <div class="muted small">共 5 个模块，点击任一模块进入。进入后有两个按钮：<b>📖 学习</b>（直接展示「题目 = 答案」对照表，如 50% = 1/2）与 <b>📇 测试</b>（闪卡作答，默认打乱顺序，也可选原顺序；<b>该模块全部知识点练完才算一轮</b>）。</div>
        <div id="fcStats" class="eb-stats" style="margin:10px 0"></div>
        <div id="fcMods" style="display:flex;flex-wrap:wrap;gap:10px;margin:8px 0"></div>
      </div>`);
      body.appendChild(fcCard);

      const EBf = window.Ebbinghaus;
      function renderFcStats() {
        const st = EBf.getStats("formula");
        const unrev = Math.max(0, st.total - st.seen);
        fcCard.querySelector("#fcStats").innerHTML = `
          <div class="eb-stat"><span class="n">${st.seen}/${st.total}</span><span class="l">已复习 / 总数</span></div>
          <div class="eb-stat"><span class="n">${unrev}</span><span class="l">未复习</span></div>
          <div class="eb-stat"><span class="n">${st.due}</span><span class="l">待复习(到期)</span></div>
          <div class="eb-stat"><span class="n">${st.mastered}</span><span class="l">已掌握</span></div>
          <div class="eb-stat"><span class="n">${st.accuracy}%</span><span class="l">正确率</span></div>`;
      }

      /* 学习：展示该模块全部「题目 = 答案」 */
      function openStudy(cat, name) {
        const list = ALL_ITEMS.filter(x => x.cat === cat);
        if (!list.length) { UI.toast("该模块暂无数据"); return; }
        const box = UI.el(`<div></div>`);
        box.innerHTML = `<div style="max-height:60vh;overflow:auto;display:flex;flex-direction:column;gap:6px">
          ${list.map(it => `<div class="todo"><div style="flex:1"><b>${UI.esc(it.prompt)}</b>
            <span style="color:#34e7e4;font-family:monospace"> = ${UI.esc(it.answer)}</span></div></div>`).join("")}
        </div>`;
        UI.modal({
          title: `${name} · 学习（${list.length} 条）`, body: box, width: "560px",
          actions: [
            { label: "导出PDF", cls: "btn", onClick: () => {
                window.PDF.exportHtml(`资料分析 · ${name}（${list.length} 条）`,
                  list.map(it => `<div class="item">${UI.esc(it.prompt)} = <b>${UI.esc(it.answer)}</b></div>`).join(""));
              } },
            { label: "关闭", cls: "ghost", onClick: (m, c) => c() }
          ]
        });
      }

      /* 测试：先选顺序，再开始该模块全部条目 */
      function openTest(cat, name) {
        const list = ALL_ITEMS.filter(x => x.cat === cat);
        if (!list.length) { UI.toast("该模块暂无数据"); return; }
        const box = UI.el(`<div></div>`);
        box.innerHTML = `<div class="muted small" style="margin-bottom:10px">该模块共 <b>${list.length}</b> 条，全部练完才算完成一轮。</div>
          <label class="row" style="gap:8px;align-items:center"><input type="radio" name="ord" value="shuffle" checked/> 打乱顺序（默认）</label>
          <label class="row" style="gap:8px;align-items:center"><input type="radio" name="ord" value="order"/> 原顺序</label>`;
        UI.modal({
          title: `${name} · 测试`, body: box, width: "460px",
          actions: [
            { label: "取消", cls: "ghost", onClick: (m, c) => c() },
            { label: "困难模式（自填）", cls: "btn", onClick: (m, c) => { c(); startFlashcards(body, "hard", cat, box.querySelector('input[name=ord]:checked').value === "shuffle"); } },
            { label: "普通模式（闪卡）", cls: "primary", onClick: (m, c) => { c(); startFlashcards(body, "easy", cat, box.querySelector('input[name=ord]:checked').value === "shuffle"); } }
          ]
        });
      }

      const fcMods = fcCard.querySelector("#fcMods");
      CATS.forEach(c => {
        const list = ALL_ITEMS.filter(x => x.cat === c.key);
        if (!list.length) return;
        let seen = 0;
        list.forEach(x => { const r = EBf.getRecord("formula", x.prompt); if (r && r.seen) seen++; });
        const pct = list.length ? Math.round(seen / list.length * 100) : 0;
        const card = UI.el(`<div class="nw-sec" style="border:1px solid #27345f;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px;min-width:180px">
          <div style="font-weight:700">${UI.esc(c.name)} <span class="muted small">(${list.length} 条)</span></div>
          <div style="height:6px;background:#27345f;border-radius:4px;overflow:hidden"><span style="display:block;height:100%;width:${pct}%;background:linear-gradient(90deg,#34e7e4,#ff5cf0)"></span></div>
          <div class="muted small">已复习 ${seen}/${list.length}（${pct}%）</div>
          <div class="row" style="gap:6px">
            <button class="btn sm" data-act="study">📖 学习</button>
            <button class="btn sm primary" data-act="test">📇 测试</button>
          </div></div>`);
        card.querySelector("[data-act='study']").onclick = () => openStudy(c.key, c.name);
        card.querySelector("[data-act='test']").onclick = () => openTest(c.key, c.name);
        fcMods.appendChild(card);
      });

      renderFcStats();
    }
  };

  window.MODULES.quantity = FormulaBoard("quantity", "quantity", "数量关系", window.BANKS.FORMULAS_QUANTITY, "列出数量关系常用公式，支持自定义编辑、增删。");
})();
