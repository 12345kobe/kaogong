/* 模块：申论（小题/大作文进度 + 每日金句 + 生成PDF） */
(function () {
  window.MODULES = window.MODULES || {};
  window.MODULES.essay = {
    title: "申论", icon: "essay",
    render(body) {
      const DB = window.DB, UI = window.UI;
      UI.StudyPanel("essay", body);

      // 小题 / 大作文 进度
      const prog = UI.el(`<div class="card"><h3>✍ 练习进度</h3>
        <div class="grid g2">
          <div id="xt"></div><div id="dgw"></div>
        </div></div>`);
      body.appendChild(prog);

      function progEditor(key, label, mount) {
        const s = DB.state.essay[key] = DB.state.essay[key] || { done: 0, total: 0 };
        function render() {
          const pct = s.total ? Math.round(s.done / s.total * 100) : 0;
          mount.innerHTML = `<div class="muted small" style="margin-bottom:6px"><b>${label}</b></div>
            <div class="progress-bar" style="width:100%"><i style="width:${pct}%"></i></div>
            <div class="row" style="margin-top:8px">
              <span class="pct" style="font-size:18px">${pct}%</span>
              <span class="muted small">${s.done}/${s.total}</span>
              <button class="btn" data-act="total">设总量</button>
              <button class="btn" data-act="inc">＋完成</button>
            </div>`;
          mount.querySelector('[data-act="total"]').onclick = () => {
            const v = prompt("设置" + label + "总量：", s.total);
            if (v != null && !isNaN(+v)) { s.total = Math.max(0, +v); DB.save(); render(); }
          };
          mount.querySelector('[data-act="inc"]').onclick = () => {
            s.done = Math.min(s.total || 0, s.done + 1); DB.save(); render();
          };
        }
        render();
      }
      progEditor("xiaoti", "小题", prog.querySelector("#xt"));
      progEditor("dagongwen", "大作文", prog.querySelector("#dgw"));

      // 每日金句
      const quotesCard = UI.el(`<div class="card"><h3>🌟 每日金句（大作文素材）</h3>
        <div class="row" style="margin-bottom:8px">
          <button class="btn" id="swap">换一批</button>
          <button class="btn" id="pdf">生成PDF</button>
          <button class="btn" id="jinjuLearned">📅 已学过</button>
        </div>
        <div id="quotes"></div></div>`);
      body.appendChild(quotesCard);

      function daySeed() {
        const d = new Date(); const start = new Date(d.getFullYear(), 0, 0);
        return Math.floor((d - start) / 86400000);
      }
      function pick(n, seed) {
        const arr = window.BANKS.ESSAY_QUOTES.slice();
        let s = seed;
        for (let i = arr.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor(s / 233280 * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; }
        return arr.slice(0, n);
      }
      function renderQuotes(seed) {
        const qs = pick(5, seed);
        quotesCard.querySelector("#quotes").innerHTML = qs.map(q => `<div class="todo" style="flex-direction:column;align-items:flex-start">
          <div style="font-size:15px">“${UI.esc(q.t)}”</div>
          <span class="chip">适用主题：${UI.esc(q.theme)}</span></div>`).join("");
        window.LearnedHistory.record("essay_jinju", qs.map(q => q.t)); // 记录当天看过的金句（按先后、去重）
        return qs;
      }
      let curSeed = daySeed();
      let curQuotes = renderQuotes(curSeed);
      quotesCard.querySelector("#swap").onclick = () => { curSeed = Math.floor(Math.random() * 99999); curQuotes = renderQuotes(curSeed); };
      quotesCard.querySelector("#pdf").onclick = () => {
        const html = curQuotes.map(q => `<div class="item">“${UI.esc(q.t)}” <span class="chip">${UI.esc(q.theme)}</span></div>`).join("");
        window.PDF.exportHtml("申论 · 每日金句", html);
      };
      const jjMap = {};
      window.BANKS.ESSAY_QUOTES.forEach(q => { jjMap[q.t] = q; });
      quotesCard.querySelector("#jinjuLearned").onclick = () => {
        window.LearnedHistory.record("essay_jinju", curQuotes.map(q => q.t));
        window.LearnedHistory.open("essay_jinju", "申论 · 每日金句", (id) => {
          const q = jjMap[id]; if (!q) return null;
          return { primary: "“" + q.t + "”", secondary: "适用主题：" + q.theme };
        });
      };

      function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }

      // ========== 每日名言积累（11 主题 各 1 句，勾选完成） ==========
      const THEMED = window.ESSAY_QUOTES_THEMED || {};
      const themes = Object.keys(THEMED);
      const qdState = DB.state.essay.quoteDaily = DB.state.essay.quoteDaily || { date: null, seed: 0, picks: [], done: [] };
      const qdToday = DB.today();
      function dayNum() { const d = new Date(); const s = new Date(d.getFullYear(), 0, 0); return Math.floor((d - s) / 86400000); }
      function ensureQd() {
        const freshDay = qdState.date !== qdToday;
        const valid = qdState.picks && qdState.picks.length === themes.length && qdState.done && qdState.done.length === themes.length;
        if (!freshDay && valid) return;
        const seed = freshDay ? dayNum() : (qdState.seed || dayNum());
        const picks = [], done = [];
        themes.forEach((th, ti) => {
          const arr = THEMED[th] || [];
          const idx = arr.length ? ((seed + ti) % arr.length + arr.length) % arr.length : -1;
          picks.push(idx >= 0 ? arr[idx].id : null);
          done.push(false);
        });
        qdState.date = qdToday; qdState.seed = seed; qdState.picks = picks; qdState.done = done;
        DB.save();
      }
      const qdCard = UI.el(`<div class="card" style="margin-top:16px">
        <h3>🌟 每日名言积累（${themes.length} 主题 · 各 1 句）</h3>
        <div class="muted small">每天从各主题各抽取 1 句名言，逐句阅读积累；每读完一句点后面的 ✓ 勾选，全部勾选即完成今日积累任务。</div>
        <div class="row" style="margin:8px 0;gap:10px;align-items:center">
          <div style="flex:1;height:8px;background:#27345f;border-radius:6px;overflow:hidden"><span id="qdFill" style="display:block;height:100%;width:0;background:linear-gradient(90deg,#34e7e4,#ff5cf0)"></span></div>
          <span class="muted small" id="qdCount"></span>
          <button class="btn" id="qdSwap">换一批</button>
          <button class="btn" id="qdPdf">生成PDF</button>
          <button class="btn" id="qdLearned">📅 已学习</button>
        </div>
        <div id="qdList" style="display:flex;flex-direction:column;gap:10px;margin-top:6px"></div>
      </div>`);
      body.appendChild(qdCard);

      function renderQd() {
        ensureQd();
        window.LearnedHistory.record("essay_quotes", qdState.picks.filter(Boolean));
        const list = qdCard.querySelector("#qdList");
        list.innerHTML = "";
        let doneCount = 0;
        themes.forEach((th, ti) => {
          const id = qdState.picks[ti];
          const arr = THEMED[th] || [];
          const q = arr.find(x => x.id === id) || arr[0];
          const done = !!qdState.done[ti];
          if (done) doneCount++;
          const row = UI.el(`<div class="qd-row" style="display:flex;gap:10px;align-items:flex-start">
            <button class="qd-chk" data-i="${ti}" style="flex:0 0 auto;width:26px;height:26px;border-radius:50%;border:2px solid #9fb0d8;background:${done ? '#34e7e4' : 'transparent'};color:#0f1b3d;font-weight:800;cursor:pointer;margin-top:2px">${done ? '✓' : ''}</button>
            <div style="flex:1"><span class="chip">${UI.esc(th)}</span>
            <div class="qd-text ${done ? 'qd-done' : 'qd-undone'}">"${UI.esc(q ? q.t : '')}"</div>
            <div class="qd-author muted small">${q && q.author ? '——' + UI.esc(q.author) : ''}</div></div></div>`);
          row.querySelector(".qd-chk").onclick = () => {
            qdState.done[ti] = !qdState.done[ti];
            DB.save(); renderQd();
            if (qdState.done.length && qdState.done.every(Boolean)) UI.toast("🎉 今日 " + themes.length + " 句名言积累完成！");
          };
          list.appendChild(row);
        });
        const pct = themes.length ? Math.round(doneCount / themes.length * 100) : 0;
        qdCard.querySelector("#qdFill").style.width = pct + "%";
        qdCard.querySelector("#qdCount").textContent = `已完成 ${doneCount}/${themes.length}`;
      }
      qdCard.querySelector("#qdSwap").onclick = () => {
        qdState.seed = Math.floor(Math.random() * 100000);
        qdState.date = qdToday; qdState.picks = []; qdState.done = [];
        DB.save(); renderQd();
      };
      qdCard.querySelector("#qdPdf").onclick = () => {
        ensureQd();
        let html = "";
        themes.forEach((th, ti) => {
          const id = qdState.picks[ti]; const arr = THEMED[th] || []; const q = arr.find(x => x.id === id) || arr[0];
          html += `<div class="item"><span class="chip">${UI.esc(th)}</span> “${UI.esc(q ? q.t : '')}”${q && q.author ? ' <span class="muted small">——' + UI.esc(q.author) + '</span>' : ''}</div>`;
        });
        window.PDF.exportHtml("申论 · 每日名言积累（" + qdToday + "）", html);
      };
      renderQd();
      const qdMap = {};
      themes.forEach(th => (THEMED[th] || []).forEach(q => { if (q && q.id) qdMap[q.id] = { t: q.t, theme: th, author: q.author }; }));
      qdCard.querySelector("#qdLearned").onclick = () => {
        window.LearnedHistory.open("essay_quotes", "申论 · 每日名言", (id) => {
          const q = qdMap[id]; if (!q) return null;
          return { primary: "“" + q.t + "”", secondary: q.theme + (q.author ? " · " + q.author : "") };
        });
      };

      // ========== 规范词积累（学习浏览 + 闪卡：应用场景 → 规范词汇） ==========
      const NW = window.ESSAY_NORMWORDS || [];
      const NW_GROUP = "essay_norm";
      const EBe = window.Ebbinghaus;

      const nwCard = UI.el(`<div class="card" style="margin-top:16px">
        <h3>📝 规范词积累（学习浏览 · 闪卡 · 应用场景 → 规范词汇）</h3>
        <div class="muted small" style="margin:6px 0">「📖 学习」按板块浏览全部<b>应用场景 → 规范词汇</b>对照表（未复习的排在前）；「📇 普通 / ✍️ 困难」做闪卡背诵。忘记的进「申论」错题本并按艾宾浩斯复习。</div>
        <div id="nwStats" class="eb-stats" style="margin:10px 0"></div>
        <div id="nwSecs" style="display:flex;flex-wrap:wrap;gap:10px;margin:8px 0"></div>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">
          <button class="btn" id="nwStudyAll">📖 学习全部板块</button>
          <button class="btn primary" id="nwAllEasy">📇 跨板块抽查 · 普通</button>
          <button class="btn" id="nwAllHard">✍️ 跨板块抽查 · 困难</button>
          <button class="btn" id="nwNext">🔀 下一组</button>
          <button class="btn" id="nwExp">📄 导出PDF</button>
          <button class="btn" id="nwLearned">📅 已学习</button>
          <label class="row" style="gap:6px;align-items:center;font-size:13px;color:var(--txt2)"><input type="checkbox" id="nwShuffle" checked/> 打乱顺序</label>
        </div>
      </div>`);
      body.appendChild(nwCard);

      function nwSecStats(sec) {
        let seen = 0, due = 0;
        sec.items.forEach(x => {
          const r = EBe.getRecord(NW_GROUP, x.id);
          if (r && r.seen) { seen++; if (EBe.isDue(NW_GROUP, x.id)) due++; }
        });
        return { seen, due, total: sec.items.length };
      }
      function nwTag(id) {
        const r = EBe.getRecord(NW_GROUP, id);
        if (!r || !r.seen) return '<span class="eb-tag eb-tag-new">未复习</span>';
        if (EBe.isDue(NW_GROUP, id)) return '<span class="eb-tag eb-tag-acc">待复习</span>';
        return '<span class="eb-tag eb-tag-seen">已复习</span>';
      }

      function renderNwStats() {
        const st = EBe.getStats(NW_GROUP);
        const unrev = Math.max(0, st.total - st.seen);
        nwCard.querySelector("#nwStats").innerHTML = `
          <div class="eb-stat"><span class="n">${st.seen}/${st.total}</span><span class="l">已复习 / 总数</span></div>
          <div class="eb-stat"><span class="n">${unrev}</span><span class="l">未复习</span></div>
          <div class="eb-stat"><span class="n">${st.due}</span><span class="l">待复习(到期)</span></div>
          <div class="eb-stat"><span class="n">${st.mastered}</span><span class="l">已掌握</span></div>
          <div class="eb-stat"><span class="n">${st.accuracy}%</span><span class="l">正确率</span></div>`;
      }
      renderNwStats();

      /* ---- 学习浏览：展示某板块（或全部）的应用场景 → 规范词汇 ---- */
      function openNormStudy(sec) {
        const secs = sec ? [sec] : NW;
        window.LearnedHistory.record("essay_norm", secs.flatMap(s => s.items.map(x => x.id)));
        const box = UI.el(`<div></div>`);
        let html = `<div class="muted small" style="margin-bottom:10px">先看「应用场景」，回想对应的「规范词汇」。未复习的排在前面。</div>`;
        secs.forEach(s => {
          const sorted = s.items.slice().sort((a, b) => {
            const ra = EBe.getRecord(NW_GROUP, a.id), rb = EBe.getRecord(NW_GROUP, b.id);
            const sa = (ra && ra.seen) ? 1 : 0, sb = (rb && rb.seen) ? 1 : 0;
            return sa - sb;
          });
          html += `<div style="margin:12px 0 6px;font-weight:700">${UI.esc(s.section)}（${s.items.length}）</div>`;
          html += sorted.map(it => `<div class="todo" style="flex-direction:column;align-items:flex-start;gap:4px">
            <div><span class="chip">应用场景</span> ${UI.esc(it.scene)}</div>
            <div><span class="chip" style="background:#34e7e4;color:#0f1b3d">规范词汇</span> <b style="color:#34e7e4">${UI.esc(it.term)}</b> ${nwTag(it.id)}</div>
          </div>`).join("");
        });
        box.innerHTML = `<div style="max-height:60vh;overflow:auto;display:flex;flex-direction:column;gap:8px">${html}</div>`;
        UI.modal({
          title: sec ? ("规范词学习 · " + sec.section) : "规范词学习 · 全部板块",
          body: box, width: "760px",
          actions: [
            { label: "导出本页PDF", cls: "btn", onClick: () => {
                // 表格排版：序号 / 应用场景 / 规范词汇
                const eh = secs.map(s => `<div class="subhead">${UI.esc(s.section)}（${s.items.length} 条）</div>` +
                  `<table><thead><tr><th style="width:46px">序号</th><th>应用场景</th><th style="width:210px">规范词汇</th></tr></thead><tbody>` +
                  s.items.map((it, i) => `<tr><td class="idx">${i + 1}</td><td>${UI.esc(it.scene)}</td><td class="term">${UI.esc(it.term)}</td></tr>`).join("") +
                  `</tbody></table>`).join("");
                window.PDF.exportHtml("申论 · 规范词学习" + (sec ? "（" + sec.section + "）" : "（全部）"), eh);
              } },
            { label: "关闭", cls: "ghost", onClick: (m, c) => c() }
          ]
        });
      }

      const nwSecs = nwCard.querySelector("#nwSecs");
      NW.forEach(sec => {
        const ss = nwSecStats(sec);
        const pct = ss.total ? Math.round(ss.seen / ss.total * 100) : 0;
        const wrap = UI.el(`<div class="nw-sec" style="border:1px solid #27345f;border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;min-width:170px">
          <div style="font-weight:700">${UI.esc(sec.section)} <span class="muted small">(${sec.items.length})</span></div>
          <div style="height:6px;background:#27345f;border-radius:4px;overflow:hidden"><span style="display:block;height:100%;width:${pct}%;background:linear-gradient(90deg,#34e7e4,#ff5cf0)"></span></div>
          <div class="muted small">已复习 ${ss.seen}/${ss.total} · 待复习 ${ss.due}</div>
          <div class="row" style="gap:6px">
            <button class="btn sm" data-act="study">📖 学习</button>
            <button class="btn sm" data-mode="easy">📇 普通</button>
            <button class="btn sm" data-mode="hard">✍️ 困难</button>
          </div></div>`);
        wrap.querySelector("[data-act='study']").onclick = () => openNormStudy(sec);
        wrap.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => {
          const items = sec.items.map(x => ({ id: x.id, prompt: x.scene, answer: x.term }));
          window.LearnedHistory.record("essay_norm", sec.items.map(x => x.id));
          const shuf = nwCard.querySelector("#nwShuffle").checked;
          window.Flashcard.start({
            title: "申论 · 规范词 · " + sec.section, subtitle: "应用场景 → 规范词汇",
            group: NW_GROUP, subject: "申论", items,
            mode: b.dataset.mode, frontLabel: "应用场景", backLabel: "规范词汇", shuffle: shuf,
            onExit: () => { renderNwStats(); window.MODULES.essay.render(body); }
          });
        });
        nwSecs.appendChild(wrap);
      });

      function pickAllNorm() {
        const all = [];
        NW.forEach(s => s.items.forEach(x => all.push({ id: x.id, prompt: x.scene, answer: x.term })));
        // 优先抽「未复习 / 已到期」的，避免每天重复同一批
        const unrev = all.filter(x => { const r = EBe.getRecord(NW_GROUP, x.id); return !r || !r.seen || EBe.isDue(NW_GROUP, x.id); });
        const rest = all.filter(x => unrev.indexOf(x) < 0);
        let pool = shuffleArr(unrev);
        const n = 5 + Math.floor(Math.random() * 6);
        if (pool.length < n) pool = pool.concat(shuffleArr(rest));
        return pool.slice(0, n);
      }
      let nwLastMode = "easy";
      function startAllNorm(mode) {
        nwLastMode = mode;
        const items = pickAllNorm();
        window.LearnedHistory.record("essay_norm", items.map(x => x.id));
        const shuf = nwCard.querySelector("#nwShuffle").checked;
        window.Flashcard.start({
          title: "申论 · 规范词 · 跨板块抽查", subtitle: "应用场景 → 规范词汇",
          group: NW_GROUP, subject: "申论", items, mode,
          frontLabel: "应用场景", backLabel: "规范词汇", shuffle: shuf,
          onExit: () => { renderNwStats(); window.MODULES.essay.render(body); }
        });
      }
      nwCard.querySelector("#nwStudyAll").onclick = () => openNormStudy(null);
      nwCard.querySelector("#nwAllEasy").onclick = () => startAllNorm("easy");
      nwCard.querySelector("#nwAllHard").onclick = () => startAllNorm("hard");
      nwCard.querySelector("#nwNext").onclick = () => { startAllNorm(nwLastMode); UI.toast("已换一组"); };
      nwCard.querySelector("#nwExp").onclick = () => {
        // 表格排版：序号 / 应用场景 / 规范词汇
        let html = "";
        NW.forEach(s => {
          html += `<div class="subhead">${UI.esc(s.section)}（${s.items.length} 条）</div>`;
          html += `<table><thead><tr><th style="width:46px">序号</th><th>应用场景</th><th style="width:210px">规范词汇</th></tr></thead><tbody>`;
          s.items.forEach((it, i) => {
            html += `<tr><td class="idx">${i + 1}</td><td>${UI.esc(it.scene)}</td><td class="term">${UI.esc(it.term)}</td></tr>`;
          });
          html += `</tbody></table>`;
        });
        window.PDF.exportHtml("申论 · 各领域规范词（全 " + NW.reduce((a, s) => a + s.items.length, 0) + " 条）", html);
      };
      const nwMap = {};
      NW.forEach(s => s.items.forEach(x => nwMap[x.id] = { term: x.term, scene: x.scene, section: s.section }));
      nwCard.querySelector("#nwLearned").onclick = () => {
        window.LearnedHistory.open("essay_norm", "申论 · 规范词", (id) => {
          const it = nwMap[id]; if (!it) return null;
          return { primary: "应用场景：" + it.scene, secondary: "规范词汇：" + it.term + "（" + it.section + "）" };
        });
      };
    }
  };
})();
