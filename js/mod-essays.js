/* 范文积累模块：
   - 一次展示一篇（可切换上下篇），保留原标题加粗大字号、黄色高亮、红色画线排版；
   - 文末「好词好句」按文中出现顺序编号，支持**用户编辑（增/删/改）**；
   - 范文中可**手动框选好词好句**，弹出工具条选颜色与类型（高亮/横线/波浪线，默认红），应用后写入 userMarks；
   - 支持下载原文排版稿与好词好句（可指定字体：楷体/宋体/PingFang 等）；
   - 用户标记与好词好句编辑通过 localStorage + 云端 essaysEdit 持久化（按 essayIdx 存）。
*/
(function () {
  "use strict";
  const KEY_IDX = "kg_essay_idx";

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

  // ---------- 持久化 ----------
  function readEdits() {
    try {
      // 优先从 state 读（云端 pull 后立即可见），其次 localStorage
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

  // ---------- 把 userMarks 套到 baseHtml（DOM Range wrap） ----------
  function applyMarks(baseHtml, marks) {
    if (!marks || !marks.length) return baseHtml;
    const tmp = document.createElement("div");
    tmp.innerHTML = baseHtml;
    // 长 phrase 优先，避免被短 phrase 抢先消耗子串
    const sorted = marks.slice().sort((a, b) => (b.phrase || "").length - (a.phrase || "").length);
    sorted.forEach(m => {
      if (!m.phrase) return;
      const color = (COLORS.find(c => c.id === m.color) || COLORS[0]).hex;
      const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_TEXT, { acceptNode: n => /\S/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
      let node;
      while ((node = walker.nextNode())) {
        const txt = node.nodeValue;
        const i = txt.indexOf(m.phrase);
        if (i < 0) continue;
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + m.phrase.length);
        const wrap = document.createElement(m.type === "hl" ? "mark" : "u");
        wrap.className = m.type === "hl" ? "user-hl" : (m.type === "wavy" ? "user-wavy" : "user-line");
        wrap.setAttribute("data-user-mark", m.type);
        wrap.setAttribute("data-mark-id", m.id);
        wrap.style.setProperty("--um-c", color);
        wrap.style.setProperty("--um-bg", color);
        try { range.surroundContents(wrap); break; } catch (e) { /* 跨 element 边界，跳过本次 */ }
      }
    });
    return tmp.innerHTML;
  }

  // ---------- 把所有标记（原文 + 用户）转内联样式，供 PDF 导出保留 ----------
  function inlineMarksForExport(html, userMarks) {
    // 用户 mark 颜色表（id → hex）
    const cmap = {};
    COLORS.forEach(c => { cmap[c.id] = c.hex; });
    const umap = {};  // markId → color hex
    (userMarks || []).forEach(m => { umap[m.id] = cmap[m.color] || cmap[DEFAULT_COLOR]; });

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

    // 用户标记：把 class 替换成 class-i 同时插入 color 内联样式
    out = out.replace(/<mark class="user-hl"([^>]*)data-mark-id="([^"]+)"([^>]*)>/g,
      (m, a1, mid, a2) => {
        const c = umap[mid] || "#ffd542";
        return `<span class="user-hl-i" style="background:${c};padding:0 2px;border-radius:2px;font-weight:700" data-color="${c}">`;
      });
    out = out.replace(/<u class="user-line"([^>]*)data-mark-id="([^"]+)"([^>]*)>/g,
      (m, a1, mid, a2) => {
        const c = umap[mid] || "#ff3b3b";
        return `<span class="user-line-i" style="text-decoration:underline;text-decoration-color:${c};text-decoration-thickness:2.5px;text-underline-offset:3px;font-weight:700" data-color="${c}">`;
      });
    out = out.replace(/<u class="user-wavy"([^>]*)data-mark-id="([^"]+)"([^>]*)>/g,
      (m, a1, mid, a2) => {
        const c = umap[mid] || "#ff3b3b";
        return `<span class="user-wavy-i" style="text-decoration:underline wavy;text-decoration-color:${c};text-decoration-thickness:2.5px;text-underline-offset:3px;font-weight:700" data-color="${c}">`;
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
      const UI = window.UI;
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
      // 单选字体高亮
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

      // 渲染缓存（marks 应用后的 HTML）
      const renderCache = {};  // idx → html

      function go(i) {
        idx = (i % list.length + list.length) % list.length;
        try { localStorage.setItem(KEY_IDX, String(idx)); } catch (e) {}
        render();
      }

      function getRenderedHtml(e, i) {
        const ed = getEdit(i);
        if (renderCache[i] !== undefined) return renderCache[i];
        const html = ed.marks && ed.marks.length ? applyMarks(e.html, ed.marks) : e.html;
        renderCache[i] = html;
        return html;
      }

      function bustCache() {
        for (const k in renderCache) delete renderCache[k];
      }

      function persistAndRerender(patch) {
        setEdit(idx, patch);
        bustCache();
        render();
        if (window.UI && window.UI.toast) UI.toast("已保存");
      }

      // ===== 浮动选区工具条 =====
      let toolbar = null;
      let currentColor = DEFAULT_COLOR;
      let currentType = "line";
      function hideToolbar() { if (toolbar) { toolbar.remove(); toolbar = null; } }
      function showToolbar(rect, sel) {
        hideToolbar();
        toolbar = document.createElement("div");
        toolbar.className = "essay-toolbar";
        toolbar.innerHTML = `
          <span class="et-swatches" title="颜色（默认红）">
            ${COLORS.map(c => `<span class="et-sw ${c.id===currentColor?'active':''}" data-c="${c.id}" style="background:${c.hex}" title="${c.label}"></span>`).join("")}
          </span>
          <span class="et-sep"></span>
          <span class="et-btn ${currentType==='hl'?'active':''}" data-t="hl" title="黄色高亮">🖊 高亮</span>
          <span class="et-btn ${currentType==='line'?'active':''}" data-t="line" title="画横线">━ 横线</span>
          <span class="et-btn ${currentType==='wavy'?'active':''}" data-t="wavy" title="波浪线">〰 波浪</span>
          <span class="et-sep"></span>
          <span class="et-btn" data-act="addgw" title="把选中文本加入好词好句">+ 好词好句</span>
          <span class="et-btn" data-act="clear" title="清除选区">✕</span>
        `;
        // 定位
        const top = rect.bottom + window.scrollY + 6;
        const left = Math.max(8, rect.left + window.scrollX - 60);
        toolbar.style.top = top + "px";
        toolbar.style.left = left + "px";
        document.body.appendChild(toolbar);
        // 事件
        toolbar.querySelectorAll(".et-sw").forEach(sw => {
          sw.onclick = (e) => { e.stopPropagation(); currentColor = sw.dataset.c; toolbar.querySelectorAll(".et-sw").forEach(x => x.classList.toggle("active", x.dataset.c === currentColor)); };
        });
        toolbar.querySelectorAll(".et-btn[data-t]").forEach(b => {
          b.onclick = (e) => { e.stopPropagation(); currentType = b.dataset.t; toolbar.querySelectorAll(".et-btn[data-t]").forEach(x => x.classList.toggle("active", x === b)); };
        });
        toolbar.querySelector('[data-act="addgw"]').onclick = (e) => {
          e.stopPropagation();
          const text = sel.toString().trim();
          if (!text) return;
          const ed = getEdit(idx);
          const arr = (ed.phrases != null ? ed.phrases.slice() : list[idx].phrases.slice());
          if (!arr.includes(text)) arr.push(text);
          persistAndRerender({ phrases: arr });
          hideToolbar();
          try { sel.removeAllRanges(); } catch (e) {}
        };
        toolbar.querySelector('[data-act="clear"]').onclick = (e) => { e.stopPropagation(); hideToolbar(); try { sel.removeAllRanges(); } catch (e) {} };
        // 点击 toolbar 不消失
        toolbar.onmousedown = e => e.preventDefault();
      }

      function bindSelection(rootEl) {
        function onSelChange() {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed) { hideToolbar(); return; }
          if (!sel.rangeCount) { hideToolbar(); return; }
          const range = sel.getRangeAt(0);
          // 仅在 essay-body 内选择才显示
          if (!rootEl.contains(range.commonAncestorContainer)) { hideToolbar(); return; }
          const text = sel.toString().trim();
          if (!text || text.length < 1) { hideToolbar(); return; }
          const rect = range.getBoundingClientRect();
          if (!rect || (rect.width === 0 && rect.height === 0)) { hideToolbar(); return; }
          showToolbar(rect, sel);
        }
        rootEl.addEventListener("mouseup", () => setTimeout(onSelChange, 30));
        rootEl.addEventListener("touchend", () => setTimeout(onSelChange, 30));
        // 点击 essay-body 外（且不在 toolbar 内）关闭
        document.addEventListener("mousedown", (e) => {
          if (toolbar && (e.target === toolbar || toolbar.contains(e.target))) return;
          if (rootEl.contains(e.target)) return;
          hideToolbar();
        });
      }

      function render() {
        const e = list[idx];
        const ed = getEdit(idx);
        const phrases = getEffectivePhrases(idx, e.phrases);
        const renderedHtml = getRenderedHtml(e, idx);
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
              <br>※ 选中正文中的文字可手动加标记或加入好词好句
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

        // ---- 选区工具条 ----
        const eb = body.querySelector("#essayBody");
        bindSelection(eb);

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
            persistAndRerender({ phrases: arr });
          } else if (b.dataset.act === "edit") {
            const li = b.closest("li");
            const txt = li.querySelector(".gw-text").textContent;
            li.innerHTML = `<textarea class="gw-edit-input">${esc(txt)}</textarea>
              <span class="gw-actions" style="opacity:1"><button class="btn xs primary" data-act="save" data-i="${i}">保存</button><button class="btn xs ghost" data-act="cancel" data-i="${i}">取消</button></span>`;
            const ta = li.querySelector("textarea");
            ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
            li.querySelector('[data-act="save"]').onclick = () => {
              const v = ta.value.trim();
              if (v) arr[i] = v; persistAndRerender({ phrases: arr });
            };
            li.querySelector('[data-act="cancel"]').onclick = () => render();
          }
        });
        body.querySelector("#gwAddBtn").onclick = () => {
          const ta = body.querySelector("#gwAdd");
          const v = (ta.value || "").trim();
          if (!v) { UI.toast("请输入好词好句"); return; }
          const ed = getEdit(idx);
          const arr = (ed.phrases != null ? ed.phrases.slice() : list[idx].phrases.slice());
          v.split(/\n+/).forEach(line => { const t = line.trim(); if (t && !arr.includes(t)) arr.push(t); });
          persistAndRerender({ phrases: arr });
        };
        body.querySelector("#gwReset").onclick = () => {
          if (!confirm("确定还原成 PDF 原版好词好句？（你添加 / 修改 / 删除的都将丢失）")) return;
          persistAndRerender({ phrases: null });
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
            // 导出基线 = 当前页面渲染后的 html（含用户标记）
            let html = getRenderedHtml(e, idx);
            // 用户标记 + 原文标记 → 内联样式
            html = inlineMarksForExport(html, ed.marks);
            if (!opt.includeUserMarks) {
              // 移除 user-hl/user-line/user-wavy 标签但保留文字
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
          UI.toast("已生成" + (kind === "orig" ? "原文排版稿" : "好词好句") + "，请在打印窗口选择「另存为 PDF」");
        }
        body.querySelector("#dlOrig").onclick = () => doExport("orig");
        body.querySelector("#dlGw").onclick = () => doExport("gw");
      }

      render();
    }
  };
})();