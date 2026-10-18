/* 模块：分栏刷题视图（v20261018d 用户需求）
   资料分析/数量关系：上面是材料原文面板（可独立上下滑动），下面是题目面板（可上下滑动），
   中间一条分隔杠可上下拖动调整两栏比例（比例记住，下次保持）。
   横屏自动变左右分栏：左=材料，右=题目。
   材料/题目面板都有「✍ 书写」：全屏手写，写完关闭后笔迹固定显示在材料/题目上（会话级）。
   用法：SplitQuiz.start(host, mat, questions, subject, opts)
     mat = { t:"材料文字", img:"材料图路径", id:"材料唯一id" }（可只给一项）
     opts 同 Quiz.start 的 opts（returnLabel/returnAction/onAnswer/onDone...） */
(function () {
  "use strict";
  function esc(s) { return (window.UI && UI.esc) ? UI.esc(s == null ? "" : s) : String(s == null ? "" : s); }
  function hash(s) { s = String(s || ""); let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return h.toString(36); }

  function getSplit(mode) {
    try { const v = parseFloat(localStorage.getItem("kg_sq_split_" + mode)); if (v >= 12 && v <= 88) return v; } catch (e) {}
    return 45;
  }
  function setSplit(mode, v) { try { localStorage.setItem("kg_sq_split_" + mode, String(Math.round(v))); } catch (e) {} }

  function start(host, mat, questions, subject, opts) {
    opts = opts || {};
    mat = mat || {};
    const matId = mat.id || ("m" + hash((mat.t || "") + (mat.img || "")));
    const hwSubject = "sqmat|" + subject;

    host.innerHTML = "";
    const wrap = UI.el('<div class="sq-wrap sq-v"></div>');
    host.appendChild(wrap);

    /* ---- 材料面板 ---- */
    const matPane = UI.el('<div class="sq-mat"></div>');
    const matHead = UI.el('<div class="sq-mat-head"><span class="sq-badge">材料</span>' +
      (mat.img ? '<button class="btn xs ghost sq-bigimg" title="看大图">⛶ 大图</button>' : '') +
      '<button class="btn xs ghost sq-pen" title="全屏手写，笔迹固定在材料上">✍ 书写</button></div>');
    matPane.appendChild(matHead);
    const matBody = UI.el('<div class="sq-mat-body"></div>');
    if (mat.t) matBody.appendChild(UI.el('<div class="sq-mat-t">' + esc(mat.t).replace(/\n/g, "<br>") + "</div>"));
    if (mat.img) {
      const im = UI.el('<img class="sq-mat-img" src="' + esc(mat.img) + '" alt="材料图"/>');
      im.onclick = () => { try { UI.viewImage(mat.img, "材料图.jpg"); } catch (e) {} };
      matBody.appendChild(im);
    }
    matPane.appendChild(matBody);
    wrap.appendChild(matPane);

    /* ---- 分隔杠 ---- */
    const bar = UI.el('<div class="sq-bar" title="拖动调整材料/题目比例"><i></i></div>');
    wrap.appendChild(bar);

    /* ---- 题目面板 ---- */
    const quizPane = UI.el('<div class="sq-quiz"></div>');
    wrap.appendChild(quizPane);

    /* ---- 布局与拖动 ---- */
    let mode = "v";
    function applyLayout() {
      const land = window.innerWidth > window.innerHeight * 1.2;
      const nm = land ? "h" : "v";
      if (nm !== mode) { mode = nm; wrap.classList.toggle("sq-h", land); wrap.classList.toggle("sq-v", !land); }
      matPane.style.flexBasis = getSplit(mode) + "%";
    }
    applyLayout();
    window.addEventListener("resize", applyLayout);

    let dragging = false, startPt = 0, startBasis = 45;
    function pt(e) { return mode === "v" ? (e.touches ? e.touches[0].clientY : e.clientY) : (e.touches ? e.touches[0].clientX : e.clientX); }
    function onDown(e) {
      dragging = true; startPt = pt(e); startBasis = parseFloat(matPane.style.flexBasis) || 45;
      try { matBody.setPointerCapture && e.pointerId != null && matBody.releasePointerCapture && 0; } catch (er) {}
      e.preventDefault();
    }
    function onMove(e) {
      if (!dragging) return;
      const total = mode === "v" ? wrap.clientHeight : wrap.clientWidth;
      if (!total) return;
      const delta = (pt(e) - startPt) / total * 100 * (mode === "v" ? 1 : 1);
      let v = Math.max(12, Math.min(88, startBasis + delta));
      matPane.style.flexBasis = v + "%";
      e.preventDefault();
    }
    function onUp() { if (!dragging) return; dragging = false; setSplit(mode, parseFloat(matPane.style.flexBasis) || 45); }
    bar.addEventListener("mousedown", onDown); bar.addEventListener("touchstart", onDown, { passive: false });
    window.addEventListener("mousemove", onMove); window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp); window.addEventListener("touchend", onUp);

    /* ---- 材料「书写」：全屏手写（笔迹定在材料上） ---- */
    matHead.querySelector(".sq-pen").onclick = () => {
      UI.Handwriting.open({
        subject: hwSubject, id: matId, title: "材料手写标注",
        anchor: matBody, session: true, fresh: false,
        onChange: () => { try { UI.Handwriting.renderInline(matBody, hwSubject, matId); } catch (e) {} }
      });
      /* 关闭手写板后立刻把笔迹覆盖到材料上（onChange 在关闭时也会触发；兜底再补一次） */
      setTimeout(() => { try { UI.Handwriting.renderInline(matBody, hwSubject, matId); } catch (e) {} }, 400);
    };
    const bigBtn = matHead.querySelector(".sq-bigimg");
    if (bigBtn) bigBtn.onclick = () => { try { UI.viewImage(mat.img, "材料图.jpg"); } catch (e) {} };
    /* 之前写过的笔迹直接显示 */
    setTimeout(() => { try { UI.Handwriting.renderInline(matBody, hwSubject, matId); } catch (e) {} }, 60);

    /* ---- 题目区交给现有 Quiz 引擎（收藏/错题本/多选/计时全保留） ---- */
    window.Quiz.start(quizPane, questions, subject, opts);
  }

  /* ===== 多组「材料+5题」逐组刷（v20261018d 用户要求：选 10 题＝2 篇材料，一组一组来） =====
     groups = [{ mat:{t,img,id}, qs:[...] }, ...]
     答完当前组的全部题目 → 材料面板换成下一组，题目区重建；最后一组答完才调 opts.onDone。 */
  function startGroups(host, groups, subject, opts) {
    opts = opts || {};
    groups = (groups || []).filter(g => g && g.qs && g.qs.length);
    if (!groups.length) { UI.toast("该目录暂无题目"); return; }
    host.innerHTML = "";
    const wrap = UI.el('<div class="sq-wrap sq-v"></div>');
    host.appendChild(wrap);

    const matPane = UI.el('<div class="sq-mat"></div>');
    const matHead = UI.el('<div class="sq-mat-head"><span class="sq-badge">材料</span>' +
      '<span class="sq-midx muted small"></span>' +
      '<button class="btn xs ghost sq-bigimg" title="看大图">⛶ 大图</button>' +
      '<button class="btn xs ghost sq-pen" title="全屏手写，笔迹固定在材料上">✍ 书写</button></div>');
    matPane.appendChild(matHead);
    const matBody = UI.el('<div class="sq-mat-body"></div>');
    matPane.appendChild(matBody);
    wrap.appendChild(matPane);

    const bar = UI.el('<div class="sq-bar" title="拖动调整材料/题目比例"><i></i></div>');
    wrap.appendChild(bar);
    const quizPane = UI.el('<div class="sq-quiz"></div>');
    wrap.appendChild(quizPane);

    /* 布局 + 拖动（同单组） */
    let mode = "v";
    function applyLayout() {
      const land = window.innerWidth > window.innerHeight * 1.2;
      const nm = land ? "h" : "v";
      if (nm !== mode) { mode = nm; wrap.classList.toggle("sq-h", land); wrap.classList.toggle("sq-v", !land); }
      matPane.style.flexBasis = getSplit(mode) + "%";
    }
    applyLayout();
    window.addEventListener("resize", applyLayout);
    let dragging = false, startPt = 0, startBasis = 45, mv, mu;
    function pt(e) { return mode === "v" ? (e.touches ? e.touches[0].clientY : e.clientY) : (e.touches ? e.touches[0].clientX : e.clientX); }
    function onDown(e) { dragging = true; startPt = pt(e); startBasis = parseFloat(matPane.style.flexBasis) || 45; e.preventDefault(); }
    function onMove(e) {
      if (!dragging) return;
      const total = mode === "v" ? wrap.clientHeight : wrap.clientWidth;
      if (!total) return;
      matPane.style.flexBasis = Math.max(12, Math.min(88, startBasis + (pt(e) - startPt) / total * 100)) + "%";
      e.preventDefault();
    }
    function onUp() { if (!dragging) return; dragging = false; setSplit(mode, parseFloat(matPane.style.flexBasis) || 45); }
    bar.addEventListener("mousedown", onDown); bar.addEventListener("touchstart", onDown, { passive: false });
    mv = onMove; mu = onUp;
    window.addEventListener("mousemove", mv); window.addEventListener("touchmove", mv, { passive: false });
    window.addEventListener("mouseup", mu); window.addEventListener("touchend", mu);

    let gi = 0, hwSubject = "sqmat|" + subject;
    const bigBtn = matHead.querySelector(".sq-bigimg");
    const idxLabel = matHead.querySelector(".sq-midx");
    let curMatId = "";

    function paintMat(g) {
      const mat = (g && g.mat) || {};
      curMatId = mat.id || ("m" + hash((mat.t || "") + (mat.img || "")));
      matBody.innerHTML = "";
      if (mat.t) matBody.appendChild(UI.el('<div class="sq-mat-t">' + esc(mat.t).replace(/\n/g, "<br>") + "</div>"));
      if (mat.img) {
        const im = UI.el('<img class="sq-mat-img" src="' + esc(mat.img) + '" alt="材料图"/>');
        im.onclick = () => { try { UI.viewImage(mat.img, "材料图.jpg"); } catch (e) {} };
        matBody.appendChild(im);
      }
      bigBtn.style.display = mat.img ? "" : "none";
      bigBtn.onclick = () => { try { UI.viewImage(mat.img, "材料图.jpg"); } catch (e) {} };
      idxLabel.textContent = "第 " + (gi + 1) + "/" + groups.length + " 篇";
      setTimeout(() => { try { UI.Handwriting.renderInline(matBody, hwSubject, curMatId); } catch (e) {} }, 60);
    }
    matHead.querySelector(".sq-pen").onclick = () => {
      UI.Handwriting.open({
        subject: hwSubject, id: curMatId, title: "材料手写标注",
        anchor: matBody, session: true, fresh: false,
        onChange: () => { try { UI.Handwriting.renderInline(matBody, hwSubject, curMatId); } catch (e) {} }
      });
      setTimeout(() => { try { UI.Handwriting.renderInline(matBody, hwSubject, curMatId); } catch (e) {} }, 400);
    };

    function runGroup(i) {
      gi = i;
      paintMat(groups[i]);
      const g = groups[i];
      let done = 0;
      window.Quiz.start(quizPane, g.qs, subject, Object.assign({}, opts, {
        onAnswer: (qq, right) => {
          try { if (opts.onAnswer) opts.onAnswer(qq, right); } catch (e) {}
          done++;
          if (done >= g.qs.length) nextBtn();      // 本组答完 → 出现「下一组」
        },
        onDone: () => {
          try { if (opts.onDone) opts.onDone(); } catch (e) {}
          if (i >= groups.length - 1) { /* 全部完成 */ }
        }
      }));
    }
    function nextBtn() {
      const old = quizPane.querySelector(".sq-next-wrap");
      if (old) old.remove();
      if (gi >= groups.length - 1) {
        quizPane.appendChild(UI.el('<div class="sq-next-wrap"><div class="card" style="text-align:center">' +
          '<b>🎉 本批材料已全部刷完</b><div class="muted small" style="margin:6px 0">共 ' + groups.length + ' 篇材料</div></div></div>'));
        return;
      }
      const nx = UI.el('<div class="sq-next-wrap"><button class="btn primary">➡ 下一篇材料（' + (gi + 2) + '/' + groups.length + '）</button>' +
        '<div class="muted small" style="margin-top:6px">本篇已答完，点此切换上方材料面板</div></div>');
      nx.querySelector("button").onclick = () => { quizPane.scrollTop = 0; runGroup(gi + 1); };
      quizPane.appendChild(nx);
    }
    runGroup(0);
  }

  window.SplitQuiz = { start: start, startGroups: startGroups };
})();
