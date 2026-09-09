/* 范文积累模块：
   - 一次展示一篇（可切换上下篇），保留原标题加粗大字号、黄色高亮、红色画线排版；
   - 文末「好词好句」按文中出现顺序编号，支持**用户编辑（增/删/改）**；
   - 范文中可**手动框选好词好句**，弹出工具条选颜色与类型（高亮/横线/波浪线，默认红），点「✓ 确定」生效；
   - 已加的标记可点一下再改颜色/类型/删除；
   - 支持下载原文排版稿与好词好句（可指定字体：楷体/宋体/PingFang 等）；
   - 用户标记与好词好句编辑通过 localStorage + 云端 essaysEdit 持久化（按 essayIdx 存）。

   标记存储模型（跨设备同步友好，不存 DOM 位置）：
     marks: [{ id, phrase, bIdx, nth, type:'hl'|'line'|'wavy', color }]
     bIdx = 第几个块（p / div.essay-sec），nth = 该 phrase 在块内第几次出现
*/
(function () {
  "use strict";
  const KEY_IDX = "kg_essay_idx";
  const BLOCK_SEL = "p, div.essay-sec, h1, h2, h3, li";

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // ---------- 颜色面板 ----------
  const COLORS = [
    { id: "red",    label: "红", hex: "#ff3b3b", hl: "#ffaaaa" },
    { id: "yellow", label: "黄", hex: "#ffd542", hl: "#ffd542" },
    { id: "blue",   label: "蓝", hex: "#3b82f6", hl: "#9ec3ff" },
    { id: "green",  label: "绿", hex: "#22c55e", hl: "#9ee5b3" },
    { id: "purple", label: "紫", hex: "#a855f7", hl: "#d8b8ff" }
  ];
  const DEFAULT_COLOR = "red";
  const TYPE_LABEL = { hl: "高亮", line: "横线", wavy: "波浪线" };

  // ---------- 持久化 ----------
  function readEdits() {
    try {
      if (window.DB && window.DB.state && window.DB.state.essay) {
        return window.DB.state.essay.essaysEdit || {};
      }
    } catch (e) {}
    try { return JSON.parse(localStorage.getItem("kg_essay_edit_v1") || "{}"); } catch (e) { return {}; }
  }
  function persistEdits(all) {
    try { localStorage.setItem("kg_essay_edit_v1", JSON.stringify(all)); } catch (e) {}
    if (window.DB && window.DB.state) {
      window.DB.state.essay = window.DB.state.essay || {};
      window.DB.state.essay.essaysEdit = all;
      try { window.DB.save(); } catch (e) {}
    }
  }
  function getEdit(idx) {
    const all = readEdits();
    return all[idx] || { phrases: null, marks: [] };
  }
  function setEdit(idx, patch) {
    const all = readEdits();
    all[idx] = Object.assign({ phrases: null, marks: [] }, getEdit(idx), patch);
    persistEdits(all);
  }
  function getEffectivePhrases(idx, original) {
    const ed = getEdit(idx);
    return ed.phrases != null ? ed.phrases.slice() : original.slice();
  }

  // ---------- 文本偏移工具（跨节点安全） ----------
  function textOffsetOf(root, node, offset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let total = 0, n;
    while ((n = walker.nextNode())) {
      if (n === node) return total + offset;
      total += n.nodeValue.length;
    }
    return -1;
  }
  function nodeAtOffset(root, g) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let total = 0, n;
    while ((n = walker.nextNode())) {
      const len = n.nodeValue.length;
      if (g <= total + len) return { node: n, offset: Math.max(0, g - total) };
      total += len;
    }
    return null;
  }
  function nthIndexOf(str, sub, n) {
    let i = -1;
    for (let k = 0; k <= (n || 0); k++) {
      i = str.indexOf(sub, i + 1);
      if (i < 0) return -1;
    }
    return i;
  }
  function countBefore(str, sub, pos) {
    if (!sub) return 0;
    let c = 0, i = str.indexOf(sub);
    while (i >= 0 && i < pos) { c++; i = str.indexOf(sub, i + 1); }
    return c;
  }
  // 用「块内纯文本偏移」包裹，surroundContents 失败时退回 extractContents（不会静默丢失标记）
  function wrapGlobal(root, gStart, gEnd, makeEl) {
    const a = nodeAtOffset(root, gStart), b = nodeAtOffset(root, gEnd);
    if (!a || !b) return false;
    const range = document.createRange();
    try { range.setStart(a.node, a.offset); range.setEnd(b.node, b.offset); } catch (e) { return false; }
    if (range.collapsed) return false;
    const el = makeEl();
    try { range.surroundContents(el); return true; } catch (e) {}
    try {
      const frag = range.extractContents();
      el.appendChild(frag);
      range.insertNode(el);
      return true;
    } catch (e) { return false; }
  }

  // ---------- 把 userMarks 套到 baseHtml ----------
  function applyMarks(baseHtml, marks) {
    if (!marks || !marks.length) return baseHtml;
    const tmp = document.createElement("div");
    tmp.innerHTML = baseHtml;
    const blocks = Array.prototype.slice.call(tmp.querySelectorAll(BLOCK_SEL));
    // 长 phrase 优先，避免短 phrase 抢先占位
    const sorted = marks.slice().sort((a, b) => (b.phrase || "").length - (a.phrase || "").length);
    let applied = 0;
    sorted.forEach(m => {
      if (!m.phrase) return;
      const color = (COLORS.find(c => c.id === m.color) || COLORS[0]).hex;
      const root = (typeof m.bIdx === "number" && blocks[m.bIdx]) ? blocks[m.bIdx] : tmp;
      const str = root.textContent || "";
      let g = nthIndexOf(str, m.phrase, m.nth || 0);
      if (g < 0) g = str.indexOf(m.phrase);
      if (g < 0) return;
      const ok = wrapGlobal(root, g, g + m.phrase.length, () => {
        const wrap = document.createElement(m.type === "hl" ? "mark" : "u");
        wrap.className = m.type === "hl" ? "user-hl" : (m.type === "wavy" ? "user-wavy" : "user-line");
        wrap.setAttribute("data-user-mark", m.type);
        wrap.setAttribute("data-mark-id", m.id);
        wrap.style.setProperty("--um-c", color);
        wrap.style.setProperty("--um-bg", color);
        return wrap;
      });
      if (ok) applied++;
    });
    return tmp.innerHTML;
  }

  // ---------- 把所有标记（原文 + 用户）转内联样式，供 PDF 导出保留 ----------
  function inlineMarksForExport(html, userMarks) {
    const cmap = {};
    COLORS.forEach(c => { cmap[c.id] = c.hex; });
    const umap = {};
    (userMarks || []).forEach(m => { umap[m.id] = cmap[m.color] || cmap[DEFAULT_COLOR]; });
    function pick(attrs) {
      const mm = /data-mark-id="([^"]+)"/.exec(attrs || "");
      return (mm && umap[mm[1]]) || null;
    }

    let out = html
      .replace(/<mark class="essay-hl">/g, '<span class="essay-hl-i">')
      .replace(/<mark>/g, '<span class="essay-blue-i">')
      .replace(/<\/mark>/g, "</span>")
      .replace(/<u class="essay-line">/g, '<span class="essay-line-i">')
      .replace(/<u>/g, '<span class="essay-u-i">')
      .replace(/<\/u>/g, "</span>")
      .replace(/<b class="essay-red">/g, '<b class="essay-red-i">')
      .replace(/<p class="essay-p">/g, '<p class="essay-p-i">')
      .replace(/<p>/g, '<p class="essay-p-i">');

    out = out.replace(/<mark class="user-hl"([^>]*)>/g, (m0, attrs) => {
      const c = pick(attrs) || "#ffd542";
      return `<span style="background:${c};padding:0 2px;border-radius:2px;font-weight:700">`;
    });
    out = out.replace(/<u class="user-line"([^>]*)>/g, (m0, attrs) => {
      const c = pick(attrs) || "#ff3b3b";
      return `<span style="text-decoration:underline;text-decoration-color:${c};text-decoration-thickness:2.5px;text-underline-offset:3px;font-weight:700">`;
    });
    out = out.replace(/<u class="user-wavy"([^>]*)>/g, (m0, attrs) => {
      const c = pick(attrs) || "#ff3b3b";
      return `<span style="text-decoration:underline wavy;text-decoration-color:${c};text-decoration-thickness:2.5px;text-underline-offset:3px;font-weight:700">`;
    });
    return out;
  }

  // ---------- 字体选择 ----------
  const FONTS = [
    { id: "kai",   label: "楷体",   stack: '"Kaiti SC","STKaiti","KaiTi","华文楷体","楷体",serif' },
    { id: "song",  label: "宋体",   stack: '"SimSun","NSimSun","宋体","Songti SC","STSong",serif' },
    { id: "hei",   label: "黑体",   stack: '"SimHei","STHeiti","黑体","Heiti SC",sans-serif' },
    { id: "yahei", label: "微软雅黑", stack: '"Microsoft YaHei","微软雅黑",sans-serif' },
    { id: "pingfang", label: "苹方（iOS）", stack: '"PingFang SC","苹方",sans-serif' },
    { id: "fangsong", label: "仿宋", stack: '"FangSong","STFangsong","仿宋",serif' }
  ];
  function pickFont() {
    return new Promise(resolve => {
      const overlay = document.createElement("div");
      overlay.className = "modal-mask";
      overlay.innerHTML = `<div class="modal" style="max-width:520px">
        <h3 style="margin:0 0 8px">📄 导出 PDF 选项</h3>
        <div class="muted small" style="margin-bottom:14px">选择字体；标记与好词好句可勾选是否包含</div>
        <div style="margin:8px 0">
          <div class="muted small" style="margin-bottom:6px;font-weight:700">字体</div>
          <div class="font-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            ${FONTS.map((f, i) => `<label class="font-opt" data-font="${f.id}" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:2px solid ${i===0?'#9b6cff':'#d6dce6'};border-radius:8px;cursor:pointer;font-family:${f.stack}">
              <input type="radio" name="essay-font" value="${f.id}" ${i===0?'checked':''} style="margin:0">
              <span>${f.label}</span>
            </label>`).join("")}
          </div>
        </div>
        <div style="margin:14px 0 6px">
          <label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="ex-marks" checked> 包含文中标记（高亮/画线/红字/蓝字）</label>
          <label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="ex-user" checked> 包含我的自定义标记</label>
          <label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="ex-gw" checked> 文末附好词好句</label>
        </div>
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:18px">
          <button class="btn ghost" id="ex-cancel">取消</button>
          <button class="btn primary" id="ex-ok">生成 PDF</button>
        </div>
      </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector("#ex-cancel").onclick = () => { overlay.remove(); resolve(null); };
      overlay.querySelector("#ex-ok").onclick = () => {
        const fontId = overlay.querySelector("input[name=essay-font]:checked").value;
        const marks = overlay.querySelector("#ex-marks").checked;
        const user = overlay.querySelector("#ex-user").checked;
        const gw = overlay.querySelector("#ex-gw").checked;
        overlay.remove();
        resolve({ fontId, includeMarks: marks, includeUserMarks: user, includeGw: gw });
      };
      overlay.addEventListener("click", e => { if (e.target === overlay) { overlay.remove(); resolve(null); } });
      overlay.querySelectorAll(".font-opt").forEach(el => {
        el.addEventListener("click", () => {
          overlay.querySelectorAll(".font-opt").forEach(o => o.style.borderColor = "#d6dce6");
          el.style.borderColor = "#9b6cff";
        });
      });
    });
  }

  // ---------- 模块主体 ----------
  window.MODULES.essays = {
    title: "📝 范文积累",
    icon: "essays",
    render(body) {
      const UI = window.UI, DB = window.DB, list = (window.MODEL_ESSAYS || []);
      if (!list.length) { body.innerHTML = `<div class="card empty">暂无范文数据。请把范文 PDF 放入本地 essays_raw/ 后运行提取脚本，或在「账号/同步」中同步已有数据。</div>`; return; }

      let idx = 0;
      try { idx = Math.max(0, Math.min(list.length - 1, parseInt(localStorage.getItem(KEY_IDX) || "0", 10) || 0)); } catch (e) {}

      const renderCache = {};

      function go(i) {
        idx = (i % list.length + list.length) % list.length;
        try { localStorage.setItem(KEY_IDX, String(idx)); } catch (e) {}
        render();
      }
      function getRenderedHtml(e, i) {
        if (renderCache[i] !== undefined) return renderCache[i];
        const ed = getEdit(i);
        const html = ed.marks && ed.marks.length ? applyMarks(e.html, ed.marks) : e.html;
        renderCache[i] = html;
        return html;
      }
      function bustCache() { for (const k in renderCache) delete renderCache[k]; }
      function persistAndRerender(patch, tip) {
        setEdit(idx, patch);
        bustCache();
        hideToolbar();
        render();
        if (window.UI && window.UI.toast && tip) UI.toast(tip);
      }

      // ===== 浮动工具条 =====
      let toolbar = null;
      let currentColor = DEFAULT_COLOR;
      let currentType = "line";
      let pendingCap = null;   // 选区快照（iOS 上选区可能已被系统清掉，用快照兜底）
      let editingId = null;    // 正在编辑的已有标记 id
      let selTimer = null;

      // keepPending=true：重绘工具条时保留选区快照（showToolbar 内部复用）
      function hideToolbar(keepPending) {
        if (toolbar) { toolbar.remove(); toolbar = null; }
        editingId = null;
        if (!keepPending) pendingCap = null;
      }

      function placeToolbar(rect) {
        if (!toolbar) return;
        const vw = window.innerWidth || document.documentElement.clientWidth || 360;
        const vh = window.innerHeight || document.documentElement.clientHeight || 640;
        requestAnimationFrame(() => {
          if (!toolbar) return;
          const tw = toolbar.offsetWidth || 280, th = toolbar.offsetHeight || 48;
          let left = rect.left + rect.width / 2 - tw / 2;
          left = Math.max(8, Math.min(left, vw - tw - 8));
          let top = rect.bottom + 10, above = false;
          if (top + th > vh - 12) { top = rect.top - th - 10; above = true; }
          if (top < 8) { top = Math.max(8, Math.min(vh - th - 12, rect.bottom + 10)); above = false; }
          toolbar.style.left = left + "px";
          toolbar.style.top = top + "px";
          toolbar.classList.toggle("tb-above", above);
          toolbar.classList.toggle("tb-below", !above);
        });
      }

      function showToolbar(rect, mode, editId) {
        hideToolbar(true);
        editingId = editId || null;
        const isEdit = mode === "edit";
        toolbar = document.createElement("div");
        toolbar.className = "essay-toolbar";
        toolbar.innerHTML = `
          <span class="et-swatches" title="选颜色">
            ${COLORS.map(c => `<span class="et-sw ${c.id===currentColor?'active':''}" data-c="${c.id}" style="background:${c.hex}" title="${c.label}"></span>`).join("")}
          </span>
          <span class="et-sep"></span>
          <span class="et-btn ${currentType==='hl'?'active':''}" data-t="hl">🖊 高亮</span>
          <span class="et-btn ${currentType==='line'?'active':''}" data-t="line">━ 横线</span>
          <span class="et-btn ${currentType==='wavy'?'active':''}" data-t="wavy">〰 波浪</span>
          <span class="et-sep"></span>
          <span class="et-btn apply" data-act="apply">✓ 确定</span>
          <span class="et-sep"></span>
          ${isEdit ? `<span class="et-btn danger" data-act="del">🗑 删除</span><span class="et-sep"></span>` : ""}
          <span class="et-btn" data-act="addgw" title="加入好词好句">+ 好句</span>
          <span class="et-close" data-act="close">✕</span>
        `;
        document.body.appendChild(toolbar);
        placeToolbar(rect);

        function syncTypeUI() {
          toolbar.querySelectorAll(".et-btn[data-t]").forEach(x => x.classList.toggle("active", x.dataset.t === currentType));
        }
        function syncColorUI() {
          toolbar.querySelectorAll(".et-sw").forEach(x => x.classList.toggle("active", x.dataset.c === currentColor));
        }
        // 颜色：仅切换；若是「改已有标记」模式则立即生效
        toolbar.querySelectorAll(".et-sw").forEach(sw => {
          sw.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            currentColor = sw.dataset.c; syncColorUI();
            if (isEdit && editingId) { updateMark(editingId, { color: currentColor }); }
          };
        });
        // 类型：选区模式仅切换（点「✓ 确定」生效）；编辑模式立即生效
        toolbar.querySelectorAll(".et-btn[data-t]").forEach(b => {
          b.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            currentType = b.dataset.t; syncTypeUI();
            if (isEdit && editingId) { updateMark(editingId, { type: currentType }); }
          };
        });
        toolbar.querySelector('[data-act="apply"]').onclick = (e) => { e.preventDefault(); e.stopPropagation(); doApply(); };
        toolbar.querySelector('[data-act="close"]').onclick = (e) => { e.preventDefault(); e.stopPropagation(); hideToolbar(); try { window.getSelection().removeAllRanges(); } catch (err) {} };
        toolbar.querySelector('[data-act="addgw"]').onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          const text = isEdit ? (pendingCap && pendingCap.text) : (pendingCap && pendingCap.text);
          if (!text) { hideToolbar(); return; }
          addGoodWord(text);
        };
        if (isEdit) {
          toolbar.querySelector('[data-act="del"]').onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            if (!editingId) return;
            const marks = (getEdit(idx).marks || []).filter(m => m.id !== editingId);
            persistAndRerender({ marks }, "已删除标记");
          };
        }
        // 按住工具条时不让选区丢失（iOS 上选区被清也没关系：已存快照 pendingCap）
        toolbar.addEventListener("mousedown", e => e.preventDefault());
      }

      // ---- 选区快照：按块切分，记录块索引 + 块内第几次出现 ----
      function rangeIntersect(a, b) {
        try {
          if (a.compareBoundaryPoints(Range.END_TO_START, b) >= 0) return null;
          if (a.compareBoundaryPoints(Range.START_TO_END, b) <= 0) return null;
          const r = document.createRange();
          if (a.compareBoundaryPoints(Range.START_TO_START, b) >= 0) r.setStart(a.startContainer, a.startOffset);
          else r.setStart(b.startContainer, b.startOffset);
          if (a.compareBoundaryPoints(Range.END_TO_END, b) <= 0) r.setEnd(a.endContainer, a.endOffset);
          else r.setEnd(b.endContainer, b.endOffset);
          return r;
        } catch (e) { return null; }
      }
      function captureSelection(rootEl, range) {
        let containers = Array.prototype.slice.call(rootEl.querySelectorAll(BLOCK_SEL));
        if (!containers.length) containers = [rootEl];
        const segs = [];
        containers.forEach((bl, bIdx) => {
          const br = document.createRange();
          try { br.selectNodeContents(bl); } catch (e) { return; }
          const ir = rangeIntersect(range, br);
          if (!ir) return;
          const raw = ir.toString() || "";
          const lead = raw.length - raw.replace(/^\s+/, "").length;
          const phrase = raw.trim();
          if (!phrase) return;
          const str = bl.textContent || "";
          const g0 = textOffsetOf(bl, ir.startContainer, ir.startOffset) + lead;
          if (g0 < 0) return;
          segs.push({ phrase, bIdx, nth: countBefore(str, phrase, g0) });
        });
        const text = (range.toString() || "").trim();
        if (!segs.length || !text) return null;
        return { text, segs };
      }

      function newId() { return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

      function doApply() {
        if (!pendingCap || !pendingCap.segs.length) { if (window.UI && UI.toast) UI.toast("请先选中文字"); return; }
        const marks = (getEdit(idx).marks || []).slice();
        pendingCap.segs.forEach(sg => {
          const hit = marks.findIndex(m => m.phrase === sg.phrase && m.bIdx === sg.bIdx && m.nth === sg.nth);
          if (hit >= 0) { marks[hit].type = currentType; marks[hit].color = currentColor; }
          else marks.push({ id: newId(), phrase: sg.phrase, bIdx: sg.bIdx, nth: sg.nth, type: currentType, color: currentColor });
        });
        const first = pendingCap.segs[0].phrase;
        const extra = pendingCap.segs.length > 1 ? ` 等 ${pendingCap.segs.length} 段` : "";
        persistAndRerender({ marks }, `已加${TYPE_LABEL[currentType] || "标记"}：${first.slice(0, 10)}${first.length > 10 ? "…" : ""}${extra}`);
      }

      function updateMark(id, patch) {
        const marks = (getEdit(idx).marks || []).map(m => m.id === id ? Object.assign({}, m, patch) : m);
        editingId = id;
        persistAndRerender({ marks }, "已更新标记");
        editingId = null;
      }

      function addGoodWord(text) {
        if (!text) return;
        const ed = getEdit(idx);
        const arr = (ed.phrases != null ? ed.phrases.slice() : list[idx].phrases.slice());
        if (!arr.includes(text)) arr.push(text);
        persistAndRerender({ phrases: arr }, "已加入好词好句");
      }

      // 取选区可视位置（不同浏览器支持度不一，逐级兜底）
      function getSelRect(range) {
        let rect = null;
        try { rect = range.getBoundingClientRect && range.getBoundingClientRect(); } catch (e) {}
        if (rect && (rect.width || rect.height)) return rect;
        if (range.getClientRects) {
          try {
            const rs = range.getClientRects();
            if (rs && rs.length) return rs[rs.length - 1];
          } catch (e) {}
        }
        const el = range.commonAncestorContainer;
        const ref = el && el.nodeType === 3 ? el.parentNode : el;
        if (ref && ref.getBoundingClientRect) {
          try { return ref.getBoundingClientRect(); } catch (e) {}
        }
        return null;
      }

      function bindSelection(rootEl) {
        function onSelChange() {
          if (toolbar) return; // 已弹出工具条时不再刷新，避免点按钮瞬间被系统清选区导致抖动
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed || !sel.rangeCount) return;
          const range = sel.getRangeAt(0);
          if (!rootEl.contains(range.commonAncestorContainer)) return;
          if (!(sel.toString() || "").trim()) return;
          const rect = getSelRect(range);
          if (!rect) return;
          const cap = captureSelection(rootEl, range);
          if (!cap) return;
          pendingCap = cap;
          showToolbar(rect, "sel");
        }
        function schedule() { clearTimeout(selTimer); selTimer = setTimeout(onSelChange, 260); }
        // iOS Safari 主要靠 selectionchange；桌面靠 mouseup
        document.addEventListener("selectionchange", schedule);
        rootEl.addEventListener("mouseup", schedule);
        rootEl.addEventListener("touchend", schedule);
        // 点已有标记 → 编辑（click 兼容桌面；pointerup 兼容 iOS 触摸）
        let lastTapAt = 0, lastTapId = "";
        function handleMarkTap(target) {
          const el = target && target.closest ? target.closest("[data-mark-id]") : null;
          if (!el || !rootEl.contains(el)) return;
          const id = el.getAttribute("data-mark-id");
          const now = Date.now();
          if (id === lastTapId && now - lastTapAt < 600) return;  // 防 iOS touch+click 双触发
          lastTapId = id; lastTapAt = now;
          const mk = (getEdit(idx).marks || []).find(m => m.id === id);
          if (!mk) return;
          currentColor = mk.color || DEFAULT_COLOR;
          currentType = mk.type || "line";
          pendingCap = { text: mk.phrase, segs: [] };
          let r = null;
          try { const rg = document.createRange(); rg.selectNodeContents(el); r = getSelRect(rg); } catch (err) {}
          try { if (!r) r = el.getBoundingClientRect(); } catch (err) {}
          showToolbar(r || { left: 20, top: 80, bottom: 100, width: 60, height: 20 }, "edit", id);
        }
        rootEl.addEventListener("click", (ev) => handleMarkTap(ev.target));
        rootEl.addEventListener("pointerup", (ev) => { if (ev.pointerType && ev.pointerType !== "mouse") handleMarkTap(ev.target); });
        // 点别处收起
        document.addEventListener("mousedown", (e) => {
          if (toolbar && (e.target === toolbar || toolbar.contains(e.target))) return;
          if (rootEl.contains(e.target)) return;
          hideToolbar();
        });
      }

      function render() {
        hideToolbar();
        const e = list[idx];
        const ed = getEdit(idx);
        const phrases = getEffectivePhrases(idx, e.phrases);
        const renderedHtml = getRenderedHtml(e, idx);
        const markCount = (ed.marks || []).length;
        body.innerHTML = `<div class="card essay-reader">
          <div class="row spread essay-meta">
            <span class="muted small">范文 ${idx + 1} / ${list.length} · 🏷 ${esc(e.category || "")}</span>
            <span class="muted small">来源：${esc(e.src || "袁东版人民日报范文")}</span>
          </div>
          <h1 class="essay-title">${esc(e.title)}</h1>
          <div class="essay-body" id="essayBody">${renderedHtml}</div>
          <div class="good-words">
            <h3>🌟 好词好句（按文中出现顺序）</h3>
            <div class="muted small" style="margin-bottom:8px">
              <span class="lg-hl">黄色高亮</span> ·
              <span class="lg-u">红色画线</span> ·
              <span class="lg-mark">蓝色字</span> ·
              <span style="color:#e23b54;font-weight:700">红色字</span>＝段落小标题
              <br>※ <b>选中正文文字</b> → 弹出工具条 → 选颜色 → 点「✓ 确定」；点已加的标记可改色 / 换样式 / 删除
            </div>
            <ol class="gw-list" id="gwList">
              ${phrases.map((p, i) => `<li data-i="${i}"><span class="gw-text">${esc(p)}</span><span class="gw-actions"><button class="btn xs" data-act="edit" data-i="${i}" title="编辑">✏️</button><button class="btn xs ghost" data-act="del" data-i="${i}" title="删除">🗑</button></span></li>`).join("")}
            </ol>
            <div class="gw-add-row">
              <textarea id="gwAdd" placeholder="自己加好词好句（可粘贴或手写）"></textarea>
              <button class="btn primary" id="gwAddBtn">＋ 添加</button>
            </div>
            <div class="gw-tools">
              <button class="btn xs ghost" id="gwReset" title="还原成 PDF 提取的原版好词好句">↺ 还原原版好词好句</button>
              ${markCount ? `<button class="btn xs ghost" id="mkClear" title="清除本篇所有自定义标记">🧹 清除本篇标记（${markCount}）</button>` : ""}
              <span class="muted small">${ed.phrases != null ? "已编辑 · " + phrases.length + " 条" : "原版 · " + phrases.length + " 条"}</span>
            </div>
          </div>
          <div class="row essay-nav">
            <button class="btn" id="prev">← 上一篇</button>
            <button class="btn primary" id="next">下一篇 →</button>
            <button class="btn ghost" id="dlOrig">⬇ 下载原文PDF</button>
            <button class="btn ghost" id="dlGw">⬇ 下载好词好句</button>
          </div>
        </div>`;

        body.querySelector("#prev").onclick = () => go(idx - 1);
        body.querySelector("#next").onclick = () => go(idx + 1);

        const eb = body.querySelector("#essayBody");
        bindSelection(eb);

        const mkClear = body.querySelector("#mkClear");
        if (mkClear) mkClear.onclick = () => {
          if (!confirm("确定清除本篇所有自定义标记？（正文里的黄底/红线等原文标记不受影响）")) return;
          persistAndRerender({ marks: [] }, "已清除本篇标记");
        };

        // ---- 好词好句编辑 ----
        const gwList = body.querySelector("#gwList");
        gwList.addEventListener("click", (ev) => {
          const b = ev.target.closest("button");
          if (!b) return;
          const i = parseInt(b.dataset.i, 10);
          const ed = getEdit(idx);
          const arr = (ed.phrases != null ? ed.phrases.slice() : list[idx].phrases.slice());
          if (b.dataset.act === "del") {
            arr.splice(i, 1);
            persistAndRerender({ phrases: arr }, "已删除");
          } else if (b.dataset.act === "edit") {
            const li = b.closest("li");
            const txt = li.querySelector(".gw-text").textContent;
            li.innerHTML = `<textarea class="gw-edit-input">${esc(txt)}</textarea>
              <span class="gw-actions" style="opacity:1"><button class="btn xs primary" data-act="save" data-i="${i}">保存</button><button class="btn xs ghost" data-act="cancel" data-i="${i}">取消</button></span>`;
            const ta = li.querySelector("textarea");
            ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
            li.querySelector('[data-act="save"]').onclick = () => {
              const v = ta.value.trim();
              if (v) arr[i] = v;
              persistAndRerender({ phrases: arr }, "已保存");
            };
            li.querySelector('[data-act="cancel"]').onclick = () => render();
          }
        });
        body.querySelector("#gwAddBtn").onclick = () => {
          const ta = body.querySelector("#gwAdd");
          const v = (ta.value || "").trim();
          if (!v) { if (UI.toast) UI.toast("请输入好词好句"); return; }
          const ed = getEdit(idx);
          const arr = (ed.phrases != null ? ed.phrases.slice() : list[idx].phrases.slice());
          v.split(/\n+/).forEach(line => { const t = line.trim(); if (t && !arr.includes(t)) arr.push(t); });
          persistAndRerender({ phrases: arr }, "已添加");
        };
        body.querySelector("#gwReset").onclick = () => {
          if (!confirm("确定还原成 PDF 原版好词好句？（你添加 / 修改 / 删除的都将丢失）")) return;
          persistAndRerender({ phrases: null }, "已还原原版");
        };

        // ---- 导出（弹字体 + 选项） ----
        async function doExport(kind) {
          const opt = await pickFont();
          if (!opt) return;
          const font = (FONTS.find(f => f.id === opt.fontId) || FONTS[0]);
          let bodyHtml = "";
          let exportTitle = e.title;
          if (kind === "orig") {
            exportTitle = e.title + "（原文排版稿）";
            let html = getRenderedHtml(e, idx);
            html = inlineMarksForExport(html, ed.marks);
            if (!opt.includeUserMarks) {
              html = html.replace(/<mark class="user-hl"[^>]*>([\s\S]*?)<\/mark>/g, "$1")
                         .replace(/<u class="user-line"[^>]*>([\s\S]*?)<\/u>/g, "$1")
                         .replace(/<u class="user-wavy"[^>]*>([\s\S]*?)<\/u>/g, "$1");
            }
            if (!opt.includeMarks) {
              html = html.replace(/<span class="essay-hl-i">([\s\S]*?)<\/span>/g, "$1")
                         .replace(/<span class="essay-blue-i">([\s\S]*?)<\/span>/g, "$1")
                         .replace(/<span class="essay-line-i">([\s\S]*?)<\/span>/g, "$1")
                         .replace(/<span class="essay-u-i">([\s\S]*?)<\/span>/g, "$1")
                         .replace(/<b class="essay-red-i">([\s\S]*?)<\/b>/g, "$1");
            }
            bodyHtml = `<h1 style="text-align:center;font-size:22px;border-bottom:3px solid #34e7e4;padding-bottom:10px">${esc(e.title)}</h1>
              <div class="meta" style="color:#666;font-size:12px;margin:6px 0 14px">来源：${esc(e.src || "")}</div>
              ${html}`;
            if (opt.includeGw) {
              const ph = getEffectivePhrases(idx, e.phrases);
              bodyHtml += `<h2 style="margin-top:24px;font-size:17px;border-bottom:2px solid #9b6cff;padding-bottom:4px">🌟 好词好句</h2><ol style="line-height:2;font-size:15px">${ph.map(p => `<li>${esc(p)}</li>`).join("")}</ol>`;
            }
          } else if (kind === "gw") {
            exportTitle = "好词好句 · " + e.title;
            const ph = getEffectivePhrases(idx, e.phrases);
            bodyHtml = `<h2 style="text-align:center;border-bottom:2px solid #9b6cff;padding-bottom:6px">好词好句 · ${esc(e.title)}</h2>
              <div class="meta" style="color:#666;font-size:12px;margin:6px 0 12px">共 ${ph.length} 条</div>
              <ol style="line-height:2;font-size:15px">${ph.map(p => `<li>${esc(p)}</li>`).join("")}</ol>`;
          }
          window.PDF.exportHtml(exportTitle, bodyHtml, { font: font.stack, fontLabel: font.label });
          if (UI.toast) UI.toast("已生成" + (kind === "orig" ? "原文排版稿" : "好词好句") + "，请在打印窗口选择「另存为 PDF」");
        }
        body.querySelector("#dlOrig").onclick = () => doExport("orig");
        body.querySelector("#dlGw").onclick = () => doExport("gw");
      }

      render();
    }
  };
})();
