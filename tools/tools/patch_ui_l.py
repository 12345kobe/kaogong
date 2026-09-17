import re, pathlib
p = pathlib.Path(r"C:\Users\28621\Desktop\考公工作台\js\ui.js")
text = p.read_text(encoding="utf-8")

start = text.find("    /* ===== 全屏手写板（截图同款） =====")
end = text.find("\n    /* ===== 通用附件（图片 / PDF）笔记 =====")
if start == -1 or end == -1:
    raise SystemExit(f"markers not found start={start} end={end}")

new = r'''    /* ===== 全屏手写板（截图同款）+ 压感 + 色卡 =====
       UI.Handwriting.open({subject, id, title, anchor, onChange, fresh})
         - fresh：打开时清空已有笔迹（刷题每题独立）
         - 工具栏：✕ 关闭 | ✎ 钢笔 | 橡皮擦 | ↶ 撤回 | ↷ 重做 | 🗑 清空
         - 点击钢笔按钮弹出「色卡 + 笔迹粗细滑块」，默认红色/50%
         - 压感：Apple Pencil / pointer pressure 动态线宽
       UI.Notes.get/set/has/overlayHtml/inlineOverlay  —— 通用存取、导出 SVG、页内笔迹覆盖 */
    Handwriting: {
      open(opts) {
        const subject = opts.subject, id = opts.id, anchor = opts.anchor || null;
        const onChange = opts.onChange, fresh = opts.fresh;
        const DB = window.DB;
        const notesRoot = DB.state.notes = DB.state.notes || {};
        notesRoot[subject] = notesRoot[subject] || {};
        const saved = notesRoot[subject][id];
        let notes = fresh ? { vw: 0, vh: 0, strokes: [] }
          : (saved ? JSON.parse(JSON.stringify(saved)) : { vw: 0, vh: 0, strokes: [] });
        if (!notes.strokes) notes.strokes = [];
        let dirty = false, redo = [];
        let tool = "pen";                 // pen | erase
        let cur = null, drawing = false;  // cur.points 为屏幕像素坐标，含压感 p
        let color = "#ff6b4a";
        let widthPct = 50;
        const minW = 1, maxW = 10;
        let penW = minW + (maxW - minW) * widthPct / 100;
        const eraseW = 24;

        const overlay = el(`<div class="hw-overlay">
          <div class="hw-tools">
            <button class="hw-tool close" title="关闭并保存">✕</button>
            <button class="hw-tool t-pen active" data-tool="pen" title="钢笔（点我选色/调粗细）">✎</button>
            <button class="hw-tool t-erase" data-tool="erase" title="橡皮擦">🧽</button>
            <button class="hw-tool undo" title="撤回上一笔">↶</button>
            <button class="hw-tool redo" title="重做上一笔">↷</button>
            <button class="hw-tool clear" title="清空全部">🗑</button>
          </div>
          <div class="hw-palette" style="display:none">
            <div class="hw-palette-colors">
              <span data-c="#ff6b4a" style="background:#ff6b4a" class="active"></span>
              <span data-c="#34e7e4" style="background:#34e7e4"></span>
              <span data-c="#3ddc97" style="background:#3ddc97"></span>
              <span data-c="#ffd166" style="background:#ffd166"></span>
              <span data-c="#9b6cff" style="background:#9b6cff"></span>
              <span data-c="#111111" style="background:#111111"></span>
              <span data-c="#ffffff" style="background:#ffffff;border:1px solid var(--line)"></span>
            </div>
            <div class="hw-palette-width">
              <label>笔迹粗细</label>
              <input type="range" min="10" max="100" value="50">
              <span class="hw-palette-pct">50%</span>
            </div>
          </div>
          <canvas class="hw-layer"></canvas>
        </div>`);
        document.body.appendChild(overlay);

        const prevBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const canvas = overlay.querySelector(".hw-layer");
        const mainCtx = canvas.getContext("2d", { alpha: true });
        const offCanvas = document.createElement("canvas");
        const offCtx = offCanvas.getContext("2d", { alpha: true });

        let screenW = 0, screenH = 0, normW = 1, normH = 1;
        let anchorRect = null;
        function refreshMetrics() {
          const r = canvas.getBoundingClientRect();
          screenW = r.width; screenH = r.height;
          if (anchor) {
            anchorRect = anchor.getBoundingClientRect();
            normW = Math.max(1, anchor.clientWidth || screenW);
            normH = Math.max(1, (anchor.scrollHeight || anchor.clientHeight || screenH));
          } else {
            anchorRect = null; normW = Math.max(1, screenW); normH = Math.max(1, screenH);
          }
          notes.vw = normW; notes.vh = normH;
        }
        function toNorm(px, py) {
          if (anchorRect) return { x: (px - anchorRect.left) / normW, y: (py - anchorRect.top + (anchor ? anchor.scrollTop : 0)) / normH };
          return { x: px / normW, y: py / normH };
        }
        function toScreen(nx, ny) {
          if (anchorRect) return { x: nx * normW + anchorRect.left, y: ny * normH + anchorRect.top - (anchor ? anchor.scrollTop : 0) };
          return { x: nx * normW, y: ny * normH };
        }
        function widthFromPct(p) { return Math.max(minW, minW + (maxW - minW) * (p / 100)); }
        function pressureMul(p) {
          const v = 0.35 + (p == null ? 0.5 : p) * 1.25;
          return Math.max(0.35, Math.min(1.8, v));
        }

        function sizeCanvas() {
          refreshMetrics();
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.max(1, Math.round(screenW * dpr));
          canvas.height = Math.max(1, Math.round(screenH * dpr));
          canvas.style.width = screenW + "px";
          canvas.style.height = screenH + "px";
          offCanvas.width = canvas.width; offCanvas.height = canvas.height;
          mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          renderToOffscreen(); blit();
        }
        function absolute(e) {
          const r = canvas.getBoundingClientRect();
          return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure == null ? 0.5 : e.pressure };
        }
        function drawLine(ctx, a, b, w, col) {
          ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round";
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        function drawStroke(ctx, st) {
          if (!st.points || st.points.length < 2) return;
          const base = st.width || penW;
          const col = st.color || color;
          for (let i = 1; i < st.points.length; i++) {
            const a = st.points[i - 1], b = st.points[i];
            const s0 = toScreen(a.x, a.y), s1 = toScreen(b.x, b.y);
            const mul = (a.p != null || b.p != null) ? pressureMul(((a.p == null ? 0.5 : a.p) + (b.p == null ? 0.5 : b.p)) / 2) : 1;
            drawLine(ctx, s0, s1, base * mul, col);
          }
        }
        function renderToOffscreen() {
          offCtx.clearRect(0, 0, screenW, screenH);
          notes.strokes.forEach(st => drawStroke(offCtx, st));
        }
        function blit() {
          mainCtx.clearRect(0, 0, screenW, screenH);
          mainCtx.drawImage(offCanvas, 0, 0, screenW, screenH);
        }
        function drawCurrent(ctx) {
          if (!cur || cur.points.length < 2) return;
          if (tool === "pen") {
            for (let i = 1; i < cur.points.length; i++) {
              const a = cur.points[i - 1], b = cur.points[i];
              const mul = pressureMul(b.p == null ? 0.5 : b.p);
              drawLine(ctx, a, b, penW * mul, color);
            }
          } else if (tool === "erase") {
            ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = eraseW; ctx.lineCap = "round"; ctx.lineJoin = "round";
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            cur.points.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
            ctx.stroke(); ctx.setLineDash([]);
          }
        }
        function distToSeg(P, A, B) {
          const l2 = (A.x - B.x) ** 2 + (A.y - B.y) ** 2;
          if (l2 === 0) return Math.hypot(P.x - A.x, P.y - A.y);
          let t = ((P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y)) / l2;
          t = Math.max(0, Math.min(1, t));
          return Math.hypot(P.x - (A.x + t * (B.x - A.x)), P.y - (A.y + t * (B.y - A.y)));
        }
        function eraseByPoints(pts) {
          if (!pts || pts.length < 2) return;
          const threshold = eraseW * 0.55;
          notes.strokes = notes.strokes.filter(st => {
            if (!st.points || st.points.length < 2) return false;
            const spts = st.points.map(p => toScreen(p.x, p.y));
            for (let i = 0; i < pts.length; i++) {
              for (let j = 0; j < spts.length - 1; j++) {
                if (distToSeg(pts[i], spts[j], spts[j + 1]) < threshold) return false;
              }
            }
            return true;
          });
        }
        function commitStroke() {
          if (!cur) { drawing = false; return; }
          if (tool === "pen" && cur.points.length >= 2) {
            notes.strokes.push({ type: "pen", color: color, width: penW, points: cur.points.map(p => ({ ...toNorm(p.x, p.y), p: p.p })) });
          } else if (tool === "erase" && cur.points.length >= 2) {
            eraseByPoints(cur.points);
          }
          dirty = true; redo = []; cur = null; drawing = false;
          renderToOffscreen(); blit();
        }

        function hidePalette() { overlay.querySelector(".hw-palette").style.display = "none"; }
        function showPalette() {
          const pal = overlay.querySelector(".hw-palette");
          pal.style.display = (pal.style.display === "none" ? "" : "none");
        }

        canvas.addEventListener("pointerdown", e => {
          e.preventDefault();
          hidePalette();
          if (e.button > 0) return;
          drawing = true; cur = { points: [absolute(e)] };
          try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        }, { passive: false });
        canvas.addEventListener("pointermove", e => {
          e.preventDefault();
          if (!drawing || !cur) return;
          cur.points.push(absolute(e));
          blit(); drawCurrent(mainCtx);
        }, { passive: false });
        const endStroke = e => {
          if (e) e.preventDefault();
          if (!drawing) return;
          commitStroke();
        };
        canvas.addEventListener("pointerup", endStroke, { passive: false });
        canvas.addEventListener("pointercancel", endStroke, { passive: false });

        function setTool(name) {
          tool = name;
          overlay.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("active", b.dataset.tool === name));
          canvas.style.cursor = name === "erase" ? "cell" : "crosshair";
        }
        function saveAndClose() {
          if (dirty) {
            if (notes.strokes.length) notesRoot[subject][id] = notes; else if (saved) delete notesRoot[subject][id];
            DB.save(); if (onChange) onChange();
          }
          document.body.style.overflow = prevBodyOverflow;
          window.removeEventListener("resize", sizeCanvas);
          if (window.visualViewport) window.visualViewport.removeEventListener("resize", sizeCanvas);
          overlay.remove();
        }

        overlay.querySelector(".hw-tool.close").onclick = saveAndClose;
        overlay.querySelector(".hw-tool.undo").onclick = () => {
          if (!notes.strokes.length) return;
          redo.push(notes.strokes.pop()); dirty = true;
          renderToOffscreen(); blit();
        };
        overlay.querySelector(".hw-tool.redo").onclick = () => {
          if (!redo.length) return;
          notes.strokes.push(redo.pop()); dirty = true;
          renderToOffscreen(); blit();
        };
        overlay.querySelector(".hw-tool.clear").onclick = () => {
          if (!notes.strokes.length) return;
          notes.strokes = []; redo = []; dirty = true;
          renderToOffscreen(); blit();
        };
        overlay.querySelectorAll("[data-tool]").forEach(b => {
          b.onclick = () => {
            if (b.dataset.tool === "pen") { if (tool === "pen") showPalette(); else { setTool("pen"); showPalette(); } }
            else { hidePalette(); setTool(b.dataset.tool); }
          };
        });
        overlay.querySelectorAll(".hw-palette-colors span").forEach(span => {
          span.onclick = () => {
            color = span.dataset.c;
            overlay.querySelectorAll(".hw-palette-colors span").forEach(s => s.classList.remove("active"));
            span.classList.add("active");
            const penBtn = overlay.querySelector(".hw-tool.t-pen");
            if (penBtn) penBtn.style.color = color;
          };
        });
        const widthRange = overlay.querySelector(".hw-palette-width input");
        const widthPctLabel = overlay.querySelector(".hw-palette-pct");
        widthRange.oninput = () => {
          widthPct = parseInt(widthRange.value, 10);
          penW = widthFromPct(widthPct);
          widthPctLabel.textContent = widthPct + "%";
        };

        sizeCanvas();
        window.addEventListener("resize", sizeCanvas);
        if (window.visualViewport) window.visualViewport.addEventListener("resize", sizeCanvas);
      }
    },

    /* ===== 通用笔记：存取手写矢量 + 页内覆盖 + 导出 SVG + 附件（图片/PDF） ===== */
    Notes: {
      get(subject, id) {
        const n = (window.DB.state.notes || {})[subject];
        return n && n[id] ? n[id] : null;
      },
      has(subject, id) {
        const n = this.get(subject, id);
        return !!(n && n.strokes && n.strokes.length);
      },
      _svgInner(notes, W, H) {
        if (!notes || !notes.strokes || !notes.strokes.length) return "";
        let inner = "";
        notes.strokes.forEach(st => {
          if (st.type === "hl") {
            inner += `<rect x="${(st.x * W).toFixed(1)}" y="${(st.y * H).toFixed(1)}" width="${(st.w * W).toFixed(1)}" height="${(st.h * H).toFixed(1)}" fill="${st.color || "#ffd166"}" opacity="0.42"/>`;
          } else if (st.points && st.points.length >= 2) {
            const base = st.width || 3.2, col = st.color || "#ff6b4a";
            if (st.points[0].p != null) {
              for (let i = 1; i < st.points.length; i++) {
                const a = st.points[i - 1], b = st.points[i];
                const w = base * (0.35 + (((a.p == null ? 0.5 : a.p) + (b.p == null ? 0.5 : b.p)) / 2) * 1.25);
                inner += `<line x1="${(a.x * W).toFixed(1)}" y1="${(a.y * H).toFixed(1)}" x2="${(b.x * W).toFixed(1)}" y2="${(b.y * H).toFixed(1)}" stroke="${col}" stroke-width="${w.toFixed(2)}" stroke-linecap="round"/>`;
              }
            } else {
              const pts = st.points.map(p => `${(p.x * W).toFixed(1)},${(p.y * H).toFixed(1)}`).join(" ");
              inner += `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="${base}" stroke-linecap="round" stroke-linejoin="round"/>`;
            }
          }
        });
        return inner;
      },
      /* 返回绝对定位的覆盖层（含 SVG），用于导出 PDF：需放进 position:relative 且宽度 = notes.vw 的容器里 */
      overlayHtml(notes) {
        if (!notes || !notes.strokes || !notes.strokes.length) return "";
        const W = notes.vw || 720, H = notes.vh || 800;
        return `<div class="kg-anno-ov" style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;z-index:5"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${this._svgInner(notes, W, H)}</svg></div>`;
      },
      /* 在页面上直接显示/隐藏已存笔迹覆盖层（双击隐藏/显示） */
      inlineOverlay(container, subject, id) {
        const notes = this.get(subject, id);
        const existing = container.querySelector(".kg-inline-ov");
        if (existing) existing.remove();
        if (!notes || !notes.strokes || !notes.strokes.length) return;
        const W = notes.vw || container.clientWidth || 720;
        const H = notes.vh || container.scrollHeight || 800;
        const ov = el(`<div class="kg-inline-ov" title="双击隐藏/显示笔迹"><svg width="100%" height="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${this._svgInner(notes, W, H)}</svg></div>`);
        container.style.position = "relative";
        container.appendChild(ov);
        ov.ondblclick = () => ov.classList.toggle("kg-inline-ov-hidden");
      },
      toggleInlineOverlay(container) {
        const ov = container.querySelector(".kg-inline-ov");
        if (ov) ov.classList.toggle("kg-inline-ov-hidden");
      }
    },'''

p.write_text(text[:start] + new + text[end:], encoding="utf-8")
print("patched ui")
