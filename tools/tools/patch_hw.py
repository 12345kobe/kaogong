import re, pathlib
p = pathlib.Path(r"C:\Users\28621\Desktop\考公工作台\js\ui.js")
text = p.read_text(encoding="utf-8")

start = text.find("    /* ===== 全屏手写 / 荧光笔 / 橡皮擦 标注覆盖层 =====")
end = text.find("\n    /* ===== 通用笔记：存取手写矢量 + 导出 SVG + 附件（图片/PDF） =====")
if start == -1 or end == -1:
    raise SystemExit(f"markers not found start={start} end={end}")

new = r'''    /* ===== 全屏手写板（截图同款） =====
       UI.Handwriting.open({subject, id, title, anchor, onChange})
         - 工具栏：✕ 关闭 | ✎ 钢笔（默认） | 橡皮擦 | ↶ 撤回 | ↷ 重做 | 🗑 清空
         - 笔迹按 normalized 坐标存 DB.state.notes[subject][id]，跨设备还原
       UI.Notes.get/set/has/overlayHtml  —— 通用存取与导出 SVG */
    Handwriting: {
      open(opts) {
        const subject = opts.subject, id = opts.id, anchor = opts.anchor || null;
        const onChange = opts.onChange;
        const DB = window.DB;
        const notesRoot = DB.state.notes = DB.state.notes || {};
        notesRoot[subject] = notesRoot[subject] || {};
        let notes = notesRoot[subject][id] ? JSON.parse(JSON.stringify(notesRoot[subject][id])) : null;
        if (!notes) notes = { vw: 0, vh: 0, strokes: [] };
        if (!notes.strokes) notes.strokes = [];
        let redo = [];
        let tool = "pen";                 // pen | erase
        let cur = null, drawing = false;  // cur.points 为屏幕像素坐标
        const color = "#ff6b4a", penW = 3.4, eraseW = 24;

        const overlay = el(`<div class="hw-overlay">
          <div class="hw-tools">
            <button class="hw-tool close" title="关闭并保存">✕</button>
            <button class="hw-tool t-pen active" data-tool="pen" title="手写笔">✎</button>
            <button class="hw-tool t-erase" data-tool="erase" title="橡皮擦">🧽</button>
            <button class="hw-tool undo" title="撤回上一笔">↶</button>
            <button class="hw-tool redo" title="重做上一笔">↷</button>
            <button class="hw-tool clear" title="清空全部">🗑</button>
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
          return { x: e.clientX - r.left, y: e.clientY - r.top };
        }
        function drawStroke(ctx, st) {
          if (!st.points || st.points.length < 2) return;
          ctx.strokeStyle = st.color || color; ctx.lineWidth = st.width || penW;
          ctx.lineCap = "round"; ctx.lineJoin = "round";
          ctx.beginPath();
          st.points.forEach((p, idx) => { const s = toScreen(p.x, p.y); idx === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y); });
          ctx.stroke();
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
            ctx.strokeStyle = color; ctx.lineWidth = penW; ctx.lineCap = "round"; ctx.lineJoin = "round";
            ctx.beginPath();
            cur.points.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
            ctx.stroke();
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
            notes.strokes.push({ type: "pen", color: color, width: penW, points: cur.points.map(p => toNorm(p.x, p.y)) });
          } else if (tool === "erase" && cur.points.length >= 2) {
            eraseByPoints(cur.points);
          }
          redo = []; cur = null; drawing = false;
          renderToOffscreen(); blit();
        }

        canvas.addEventListener("pointerdown", e => {
          e.preventDefault();
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
          if (notes.strokes.length) notesRoot[subject][id] = notes; else delete notesRoot[subject][id];
          DB.save(); if (onChange) onChange();
          document.body.style.overflow = prevBodyOverflow;
          window.removeEventListener("resize", sizeCanvas);
          if (window.visualViewport) window.visualViewport.removeEventListener("resize", sizeCanvas);
          overlay.remove();
        }

        overlay.querySelector(".hw-tool.close").onclick = saveAndClose;
        overlay.querySelector(".hw-tool.undo").onclick = () => {
          if (!notes.strokes.length) return;
          redo.push(notes.strokes.pop());
          renderToOffscreen(); blit();
        };
        overlay.querySelector(".hw-tool.redo").onclick = () => {
          if (!redo.length) return;
          notes.strokes.push(redo.pop());
          renderToOffscreen(); blit();
        };
        overlay.querySelector(".hw-tool.clear").onclick = () => {
          if (!notes.strokes.length) { UI.toast("没有笔迹可清空"); return; }
          UI.confirm("确定清空全部手写笔迹？").then(ok => { if (!ok) return; notes.strokes = []; redo = []; renderToOffscreen(); blit(); });
        };
        overlay.querySelectorAll("[data-tool]").forEach(b => b.onclick = () => setTool(b.dataset.tool));

        sizeCanvas();
        window.addEventListener("resize", sizeCanvas);
        if (window.visualViewport) window.visualViewport.addEventListener("resize", sizeCanvas);
      }
    },'''

p.write_text(text[:start] + new + text[end:], encoding="utf-8")
print("patched")
