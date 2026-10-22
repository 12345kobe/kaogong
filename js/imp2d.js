/* 模块：科举书房 2D 三渲二立绘（Imp2D）
   ★v20261024 弃 three.js 改纯 Canvas2D：参考图①「古风动漫少女」形象 + 图②「暖暖」比例，
     半身人像、书房背景、「天道酬勤」大匾额挂后墙；眨眼/呼吸/四肢摆动/发丝飘动全程序化。
   用法：window.Imp2D.render(ctx, sk) —— sk 由 mod-imperial.js 每帧更新（无内部状态）。
   逻辑画布固定 900×1200（竖幅半身人像），render 内部按 dpr 缩放。 */
(function () {
  "use strict";
  window.Imp2D = (function () {

    const LW = 900, LH = 1150;

    /* ================= 调色板 ================= */
    const P = {
      wallD: "#f3e3c3", wallN: "#2b3757", floorD: "#e2c79c", floorN: "#3c3352",
      woodD: "#6e4222", woodM: "#a5693a", woodL: "#c88a4e",
      paper: "#f8f1de", ink: "#2b2118",
      skinL: "#fff5ea", skinM: "#fbdcc3", skinS: "#f0c3a3", skinDeep: "#e0a382",
      blush: "244,150,128",
      hairD: "#221812", hairM: "#382819", hairL: "#6d5138", hairRim: "#a3855f",
      clothL: "#fcf7ec", clothM: "#efe3cb", clothS: "#dbcbab",
      sash: "#8fb9d8", sashD: "#5d89ad", gold: "#dcb45f", goldD: "#ab8440",
      skirtL: "#f4f8fa", skirtS: "#d3dfe7", skirtV: "#b9cdda",
      veil: "255,255,255",
      iris1: "#9c6622", iris2: "#dda04e", iris3: "#f4d8a4", irisRim: "#6b4320",
      pupil: "#1b1006", eyeLine: "#4a2f1e", eyeLash: "#2e1c10",
      lip: "#e89590", lipD: "#c96a6e",
      robe: "#527f95", robeL: "#74a0b5", robeD: "#3a6478",
      zzz: "#7a8fc0"
    };

    /* ================= 工具 ================= */
    const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
    function mixc(c1, c2, t) {           // hex → hex 插值
      const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
      const r = Math.round((a >> 16) + ((b >> 16) - (a >> 16)) * t);
      const g = Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t);
      const bl = Math.round((a & 255) + ((b & 255) - (a & 255)) * t);
      return "rgb(" + r + "," + g + "," + bl + ")";
    }
    function lg(ctx, x0, y0, x1, y1, stops) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      stops.forEach(s => g.addColorStop(s[0], s[1]));
      return g;
    }
    function rg(ctx, x, y, r, stops) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      stops.forEach(s => g.addColorStop(s[0], s[1]));
      return g;
    }
    function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, Math.PI * 2); }
    function rr(ctx, x, y, w, h, r) {          // 圆角矩形
      r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function smooth(ctx, pts, close) {   // 过控制点的平滑曲线
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const xc = (pts[i][0] + pts[i + 1][0]) / 2, yc = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], xc, yc);
      }
      ctx.quadraticCurveTo(pts[pts.length - 2][0], pts[pts.length - 2][1], pts[pts.length - 1][0], pts[pts.length - 1][1]);
      if (close) ctx.closePath();
    }
    /* 变宽发束/纱带：三次贝塞尔，沿程宽度 w0→w1 */
    function strand(ctx, pts, w0, w1, col, hi) {
      const [p0, p1, p2, p3] = pts;
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
      ctx.lineWidth = w0; ctx.lineCap = "round";
      ctx.strokeStyle = col; ctx.stroke();
      if (hi && w0 > 3) {
        ctx.save();
        ctx.lineWidth = Math.max(0.8, w0 * 0.34);
        ctx.strokeStyle = hi; ctx.globalAlpha = 0.55;
        ctx.translate(-w0 * 0.16, -w0 * 0.18);
        ctx.stroke();
        ctx.restore();
      }
    }
    /* 珠串 */
    function beads(ctx, pts, r0, r1, col, colD) {
      for (let i = 0; i < pts.length; i++) {
        const t = i / (pts.length - 1), r = r0 + (r1 - r0) * t;
        ell(ctx, pts[i][0], pts[i][1], r, r);
        ctx.fillStyle = rg(ctx, pts[i][0] - r * .3, pts[i][1] - r * .3, r * 1.4,
          [[0, "#ffffff"], [.55, col], [1, colD]]);
        ctx.fill();
      }
    }

    /* ================= 书房背景 ================= */
    function drawRoom(ctx, sk) {
      const L = sk.light, nightK = clamp(1 - L.amb / 0.85, 0, 1);
      const wallC = t => mixc(P.wallD, P.wallN, t);
      /* 墙 */
      ctx.fillStyle = lg(ctx, 0, 0, 0, LH, [[0, wallC(nightK * 0.9)], [1, wallC(nightK * 0.55)]]);
      ctx.fillRect(0, 0, LW, LH);
      /* 顶部藻井暗纹 */
      ctx.fillStyle = "rgba(120,90,60," + (0.10 - nightK * 0.05) + ")";
      ctx.fillRect(0, 0, LW, 40);
      /* 窗（右） */
      const winG = lg(ctx, 660, 520, 860, 860, [
        [0, mixc("#fff3d8", "#3d4a78", nightK)], [1, mixc("#dfe8f2", "#2c3656", nightK)]]);
      ctx.fillStyle = winG; ctx.fillRect(660, 520, 200, 340);
      ctx.strokeStyle = mixc(P.woodD, "#3a2c48", nightK); ctx.lineWidth = 12;
      ctx.strokeRect(660, 520, 200, 340);
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(760, 520); ctx.lineTo(760, 860);
      ctx.moveTo(660, 690); ctx.lineTo(860, 690); ctx.stroke();
      ctx.fillStyle = mixc("#c9a05e", "#5a4a6a", nightK);               // 窗纸扣
      [[660, 520], [860, 520], [660, 860], [860, 860]].forEach(p => { ell(ctx, p[0], p[1], 9, 9); ctx.fill(); });
      /* 天道酬勤大匾额（★用户死令：手机端必须清晰可见 → 字大 + 墨色压深） */
      drawPlaque(ctx, nightK);
      /* 书架（左） */
      drawShelf(ctx, nightK);
      /* 案几（底部横贯） */
      drawDesk(ctx, sk, nightK);
      /* 灯笼（左上，夜微光） */
      ctx.save();
      ctx.strokeStyle = "rgba(70,50,30,.55)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(120, 0); ctx.lineTo(120, 86); ctx.stroke();
      const lg2 = rg(ctx, 120, 130, 60, [[0, "#ffd98a"], [.6, "#e8543f"], [1, "#b03028"]]);
      ell(ctx, 120, 130, 34, 30); ctx.fillStyle = lg2; ctx.fill();
      ctx.fillStyle = mixc("#d8b25e", "#8a7440", nightK);
      ctx.fillRect(108, 100, 24, 7); ctx.fillRect(108, 156, 24, 7);
      if (nightK > 0.2) {
        ell(ctx, 120, 130, 66, 60);
        ctx.fillStyle = rg(ctx, 120, 130, 66, [[0, "rgba(255,170,90," + 0.30 * nightK + ")"], [1, "rgba(255,170,90,0)"]]);
        ctx.fill();
      }
      ctx.restore();
      /* 夜色统一罩层 */
      if (nightK > 0.01) {
        ctx.fillStyle = "rgba(34,44,80," + 0.26 * nightK + ")";
        ctx.fillRect(0, 0, LW, LH);
      }
    }

    function drawPlaque(ctx, nightK) {
      const bx = 450, by = 112, bw = 384, bh = 108;
      ctx.save();
      /* 挂绳钉 */
      ctx.fillStyle = mixc("#5a4326", "#2c2c44", nightK);
      ell(ctx, bx - bw / 2 + 8, by - bh / 2, 7, 7); ctx.fill();
      ell(ctx, bx + bw / 2 - 8, by - bh / 2, 7, 7); ctx.fill();
      /* 木框 */
      ctx.fillStyle = lg(ctx, bx - bw / 2, by - bh / 2, bx + bw / 2, by + bh / 2,
        [[0, mixc("#8a5a30", "#3a3050", nightK)], [.5, mixc(P.woodM, "#4a4060", nightK)], [1, mixc("#7a4a28", "#332c48", nightK)]]);
      rr(ctx, bx - bw / 2 - 14, by - bh / 2 - 14, bw + 28, bh + 28, 12); ctx.fill();
      ctx.strokeStyle = mixc("#5a3818", "#241f38", nightK); ctx.lineWidth = 3;
      rr(ctx, bx - bw / 2 - 14, by - bh / 2 - 14, bw + 28, bh + 28, 12); ctx.stroke();
      /* 卡纸 */
      ctx.fillStyle = mixc(P.paper, "#4a4a68", nightK * 0.7);
      rr(ctx, bx - bw / 2, by - bh / 2, bw, bh, 6); ctx.fill();
      /* 四字浓墨（楷体，竖笔带飞白） */
      const chars = ["天", "道", "酬", "勤"];
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = 'bold 72px "KaiTi","STKaiti","DFKai-SB","SimKai","Noto Serif SC",serif';
      chars.forEach((ch, i) => {
        const x = bx - 141 + i * 94;
        ctx.fillStyle = "rgba(255,255,255," + 0.55 * (1 - nightK) + ")";
        ctx.fillText(ch, x + 2, by + 3);
        ctx.fillStyle = mixc(P.ink, "#59648c", nightK * 0.55);
        ctx.fillText(ch, x, by);
        /* 飞白：随机轻扫（种子固定，避免每帧抖动） */
        ctx.save(); ctx.globalAlpha = 0.5;
        ctx.fillStyle = mixc("#f8f1de", "#4a4a68", nightK * 0.7);
        const s = (i * 37) % 5;
        ctx.fillRect(x - 26, by - 24 + s * 8, 52, 2);
        ctx.fillRect(x - 21, by + 14 + s * 5, 42, 2);
        ctx.restore();
      });
      ctx.restore();
    }

    function drawShelf(ctx, nightK) {
      const x0 = 36, y0 = 585, w = 180, h = 545;
      ctx.save();
      ctx.fillStyle = "rgba(80,50,28,.18)"; rr(ctx, x0, y0, w, h, 8); ctx.fill();
      ctx.strokeStyle = mixc(P.woodD, "#2e2844", nightK); ctx.lineWidth = 9;
      rr(ctx, x0, y0, w, h, 8); ctx.stroke();
      /* 三层 */
      for (let f = 0; f < 3; f++) {
        const fy = y0 + 30 + f * ((h - 60) / 3);
        ctx.fillStyle = lg(ctx, x0, fy + 62, x0 + w, fy + 62,
          [[0, mixc(P.woodM, "#3c3454", nightK)], [1, mixc("#8a5528", "#2e2844", nightK)]]);
        ctx.fillRect(x0 + 6, fy + 66, w - 12, 9);
        /* 书册（稳定伪随机） */
        let bx = x0 + 16;
        for (let b = 0; b < 8 + ((f * 3 + 1) % 3); b++) {
          const bw2 = 11 + ((f * 7 + b * 13) % 9);
          const bh2 = 44 + ((f * 5 + b * 11) % 14);
          if (bx + bw2 > x0 + w - 14) break;
          const tilt = (b === 2 + f) ? 0.12 : 0;
          const hue = ["#a8563c", "#3c6e8e", "#7a6a3c", "#8e5a7c", "#4c7a52", "#b08440"][(f * 3 + b) % 6];
          ctx.save(); ctx.translate(bx + bw2 / 2, fy + 66); ctx.rotate(tilt);
          ctx.fillStyle = mixc(hue, "#232038", nightK * 0.6);
          ctx.fillRect(-bw2 / 2, -bh2, bw2, bh2);
          ctx.fillStyle = "rgba(255,255,255,.35)";
          ctx.fillRect(-bw2 / 2 + 2, -bh2 + 8, bw2 - 4, 3);
          ctx.fillRect(-bw2 / 2 + 2, -bh2 + 16, bw2 - 4, 2);
          ctx.restore();
          bx += bw2 + 2;
        }
        /* 小瓷瓶 */
        if (f === 1) {
          ell(ctx, x0 + w - 34, fy + 40, 13, 20);
          ctx.fillStyle = mixc("#dfe8ee", "#3a4260", nightK); ctx.fill();
          ell(ctx, x0 + w - 34, fy + 20, 5, 8); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,.5)"; ell(ctx, x0 + w - 38, fy + 32, 4, 8); ctx.fill();
        }
      }
      ctx.restore();
    }

    function drawDesk(ctx, sk, nightK) {
      /* 桌面 */
      ctx.fillStyle = lg(ctx, 0, 1050, 0, 1200,
        [[0, mixc("#b5793f", "#332a4c", nightK)], [.12, mixc(P.woodL, "#453a5e", nightK)], [.35, mixc("#9c6530", "#2e2748", nightK)], [1, mixc("#7a4a24", "#221e3a", nightK)]]);
      ctx.fillRect(0, 1050, LW, 150);
      /* 木纹 */
      ctx.strokeStyle = "rgba(70,40,18,.20)"; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.moveTo(0, 1062 + i * 26 + (i % 2) * 8);
        ctx.bezierCurveTo(300, 1058 + i * 26, 600, 1072 + i * 26, 900, 1060 + i * 26);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,235,200,.14)"; ctx.fillRect(0, 1050, LW, 5);
    }

    /* 桌面物品 + 灯（★前景层：drawFigure 之后调用，避免被裙摆盖住） */
    function drawDeskFront(ctx, sk, nightK) {
      /* 纸卷（左） */
      ctx.save(); ctx.translate(180, 1076); ctx.rotate(-0.05);
      ctx.fillStyle = mixc("#fbf6e6", "#8f92a8", nightK * 0.8);
      rr(ctx, -78, -34, 156, 62, 3); ctx.fill();
      ctx.strokeStyle = "rgba(120,100,70,.30)"; ctx.lineWidth = 1.4;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-64, -22 + i * 13); ctx.lineTo(64, -22 + i * 13); ctx.stroke(); }
      ctx.fillStyle = "rgba(43,33,24,.75)";
      for (let i = 0; i < 4; i++) {           // 几行墨字
        for (let j = 0; j < 9; j++) ctx.fillRect(-62 + j * 14, -24 + i * 13, 9, 3);
      }
      ctx.restore();
      /* 笔架 + 毛笔 */
      ctx.save(); ctx.translate(300, 1090);
      ctx.fillStyle = mixc(P.woodD, "#2e2440", nightK);
      rr(ctx, -16, 6, 32, 30, 4); ctx.fill();
      ctx.strokeStyle = mixc("#8a5a28", "#2e2440", nightK); ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-10, 10); ctx.quadraticCurveTo(4, -34, 12, -52); ctx.stroke();
      ctx.strokeStyle = mixc("#d8b25e", "#6a5a40", nightK); ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(12, -52); ctx.quadraticCurveTo(14, -60, 18, -64); ctx.stroke();
      ctx.strokeStyle = mixc(P.ink, "#1a1830", nightK); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(18, -64); ctx.quadraticCurveTo(22, -72, 20, -78); ctx.stroke();
      ctx.restore();
      /* 砚台 */
      ctx.save(); ctx.translate(430, 1092);
      ell(ctx, 0, 4, 34, 16); ctx.fillStyle = mixc("#3c3a3e", "#22202e", nightK); ctx.fill();
      ell(ctx, 0, -4, 24, 10); ctx.fillStyle = mixc("#1a1820", "#12101c", nightK); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.10)"; ell(ctx, -8, -6, 7, 3); ctx.fill();
      ctx.restore();
      /* 蓝布书（右） */
      ctx.save(); ctx.translate(610, 1084); ctx.rotate(0.06);
      ctx.fillStyle = mixc(P.sashD, "#2c3854", nightK);
      rr(ctx, -52, -30, 104, 58, 4); ctx.fill();
      ctx.strokeStyle = mixc("#e8d9a8", "#4a4468", nightK); ctx.lineWidth = 2;
      rr(ctx, -44, -22, 88, 42, 3); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.fillRect(-52, -30, 12, 58);
      ctx.restore();
      /* 煤油灯（右角）+ 火苗 */
      drawLamp(ctx, sk, nightK);
    }

    function drawLamp(ctx, sk, nightK) {
      const lx = 742, ly = 1078;
      ctx.save(); ctx.translate(lx, ly);
      ctx.fillStyle = mixc("#c9973f", "#4a3f5c", nightK);
      rr(ctx, -34, 4, 68, 12, 5); ctx.fill();
      ctx.fillStyle = lg(ctx, 0, 0, 0, 46, [[0, mixc("#e8b860", "#5a4e6c", nightK)], [1, mixc("#a5762e", "#3a3450", nightK)]]);
      ctx.beginPath(); ctx.moveTo(-16, 4); ctx.quadraticCurveTo(-21, -14, 0, -22);
      ctx.quadraticCurveTo(21, -14, 16, 4); ctx.closePath(); ctx.fill();
      /* 玻璃罩 */
      ell(ctx, 0, -52, 22, 26);
      ctx.fillStyle = "rgba(220,235,250," + (0.22 + nightK * 0.18) + ")"; ctx.fill();
      ctx.strokeStyle = "rgba(180,200,225,.5)"; ctx.lineWidth = 2; ctx.stroke();
      /* 火苗 */
      const fl = Math.sin(sk.t * 9.3) * 0.06 + Math.sin(sk.t * 23.7) * 0.04;
      ctx.save(); ctx.translate(0, -46); ctx.scale(1 + fl, 1 - fl);
      ctx.beginPath(); ctx.moveTo(0, -26); ctx.quadraticCurveTo(9, -8, 5, 0);
      ctx.quadraticCurveTo(-6, 6, -5, 0); ctx.quadraticCurveTo(-9, -8, 0, -26);
      ctx.fillStyle = rg(ctx, 0, -10, 22, [[0, "#fff3c0"], [.45, "#ffb03c"], [1, "rgba(255,120,30,0)"]]);
      ctx.fill(); ctx.restore();
      ctx.fillStyle = mixc("#c9973f", "#4a3f5c", nightK);
      rr(ctx, -8, -84, 16, 8, 3); ctx.fill();
      /* 灯光晕 */
      if (sk.light.lamp > 0.02) {
        ell(ctx, 0, -50, 130, 120);
        ctx.fillStyle = rg(ctx, 0, -50, 130, [[0, "rgba(255,170,80," + 0.30 * sk.light.lamp + ")"], [1, "rgba(255,170,80,0)"]]);
        ctx.fill();
      }
      ctx.restore();
    }

    /* ================= 人物 ================= */
    const FACE = { cx: 450, cy: 402, top: 306, jaw: 520 };

    function drawFigure(ctx, sk) {
      const g = sk.gender;
      const t = sk.t;
      /* 全身轻晃 + 趴睡前倾（绕腰） */
      ctx.save();
      ctx.translate(FACE.cx + Math.sin(t * 0.5) * 4, 700 + sk.sleep * 18);
      ctx.scale(1.14, 1.14);                    // ★半身人像：人物放大（头占画面 ~1/4）
      ctx.rotate(Math.sin(t * 0.5) * 0.010 + sk.sleep * 0.05);   // 睡姿仅微倾（低头由 headRot 驱动）
      ctx.translate(-FACE.cx, -700);

      if (g === "女") drawGirl(ctx, sk);
      else drawBoy(ctx, sk);

      ctx.restore();
    }

    /* ---------- 通用：发丝飘动相位 ---------- */
    const flow = (t, ph) => Math.sin(t * 1.4 + ph) * 0.5 + Math.sin(t * 0.9 + ph * 1.7) * 0.5;

    /* ---------- 女版 ---------- */
    function drawGirl(ctx, sk) {
      const t = sk.t;
      drawBackHair(ctx, sk);
      drawBody(ctx, sk, true);
      drawArms(ctx, sk, true);
      drawHead(ctx, sk, true);
      drawFace(ctx, sk, true);
      drawHairFront(ctx, sk, true);
      drawHairOrn(ctx, sk, true);
      drawJewelry(ctx, sk, true);
    }

    /* ---------- 男版 ---------- */
    function drawBoy(ctx, sk) {
      const t = sk.t;
      drawBackHairM(ctx, sk);
      drawBody(ctx, sk, false);
      drawArms(ctx, sk, false);
      drawHead(ctx, sk, false);
      drawFace(ctx, sk, false);
      drawHairFrontM(ctx, sk);
    }

    /* ========== 后发（女：垂腰长发 + 大发髻） ========== */
    function drawBackHair(ctx, sk) {
      const t = sk.t, f1 = flow(t, 0), f2 = flow(t, 1.3);
      /* 背后垂发大块 */
      ctx.save();
      smooth(ctx, [
        [372, 330], [352, 560], [356, 780], [330, 960], [352, 1030],
        [420, 1040], [436, 800], [450, 620],
        [464, 800], [480, 1040], [548, 1030], [570, 960], [544, 780], [548, 560], [528, 330]
      ], true);
      ctx.fillStyle = lg(ctx, 450, 320, 450, 1040, [
        [0, P.hairM], [.55, P.hairD], [1, "#1c130c"]]);
      ctx.fill();
      /* 发片分组 + 高光滑 */
      ctx.clip();
      for (let i = 0; i < 7; i++) {
        const px = 366 + i * 28, ph = i * 0.9;
        const sway = flow(t, ph) * (3 + i);
        smooth(ctx, [
          [px, 336], [px - 4 + sway, 600], [px + 6 + sway * 1.6, 830], [px + 2 + sway * 2, 1035]
        ]);
        ctx.strokeStyle = i % 2 ? "rgba(255,225,190,.10)" : "rgba(0,0,0,.35)";
        ctx.lineWidth = 9 + (i % 3) * 4; ctx.stroke();
      }
      /* 发尾内卷光泽 */
      for (let i = 0; i < 3; i++) {
        smooth(ctx, [[400 + i * 50, 1010], [410 + i * 50, 1030], [390 + i * 50, 1042]]);
        ctx.strokeStyle = "rgba(255,230,195,.14)"; ctx.lineWidth = 7; ctx.stroke();
      }
      ctx.restore();
      /* 大发髻 */
      ctx.save();
      ell(ctx, 450, 292, 76, 58);
      ctx.fillStyle = lg(ctx, 430, 254, 470, 342, [
        [0, P.hairL], [.4, P.hairM], [1, P.hairD]]);
      ctx.fill();
      ctx.clip();
      for (let i = 0; i < 6; i++) {           // 发丝同心纹理
        smooth(ctx, [[378, 272 + i * 10], [450, 264 + i * 11], [522, 272 + i * 10]]);
        ctx.strokeStyle = i % 2 ? "rgba(255,225,190,.10)" : "rgba(0,0,0,.30)";
        ctx.lineWidth = 6; ctx.stroke();
      }
      ctx.restore();
      ell(ctx, 450, 292, 76, 58);
      ctx.strokeStyle = "rgba(20,12,6,.45)"; ctx.lineWidth = 2.5; ctx.stroke();
      /* 髻顶高光 */
      ell(ctx, 430, 262, 30, 13, -0.3);
      ctx.fillStyle = "rgba(255,236,205,.20)"; ctx.fill();
    }

    function drawBackHairM(ctx, sk) {
      /* 男：束发 + 脑后短发 */
      ell(ctx, 450, 400, 70, 82);
      ctx.fillStyle = lg(ctx, 450, 330, 450, 480, [[0, P.hairM], [1, P.hairD]]);
      ctx.fill();
      ctx.save(); ctx.clip();
      for (let i = 0; i < 5; i++) {
        smooth(ctx, [[392 + i * 28, 340 + flow(sk.t, i) * 3], [396 + i * 28, 440], [390 + i * 28, 480]]);
        ctx.strokeStyle = i % 2 ? "rgba(255,225,190,.08)" : "rgba(0,0,0,.28)";
        ctx.lineWidth = 8; ctx.stroke();
      }
      ctx.restore();
    }

    /* ========== 身体（上襦 + 腰封 + 裙 + 披帛） ========== */
    function drawBody(ctx, sk, female) {
      const t = sk.t, br = sk.breath;
      const rise = br * 4;                    // 呼吸肩胸起伏
      ctx.save();
      ctx.translate(450, 0); ctx.scale(1 + br * 0.006, 1 + br * 0.004); ctx.translate(-450, 0);
      /* 颈 */
      ell(ctx, 450, 532, 24, (female ? 31 : 27) * (1 - sk.sleep * 0.45));
      ctx.fillStyle = lg(ctx, 450, 508, 450, 560, [[0, P.skinS], [1, P.skinM]]);
      ctx.fill();
      ctx.fillStyle = "rgba(190,130,100,.22)";   // 颌下影
      ell(ctx, 450, 510, 21, 8); ctx.fill();
      /* 锁骨 */
      ctx.strokeStyle = "rgba(190,130,100,.30)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(420, 566); ctx.quadraticCurveTo(436, 578, 448, 572); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(480, 566); ctx.quadraticCurveTo(464, 578, 452, 572); ctx.stroke();

      if (female) {
        /* 上襦（月白，收腰） */
        smooth(ctx, [
          [314, 598 + rise], [306, 700], [358, 800], [378, 838],
          [522, 838], [542, 800], [594, 700], [586, 598 + rise]
        ], true);
        ctx.fillStyle = lg(ctx, 450, 590, 450, 850, [
          [0, P.clothL], [.5, P.clothM], [1, P.clothS]]);
        ctx.fill();
        /* 衣褶 */
        ctx.save(); ctx.clip();
        for (let i = 0; i < 9; i++) {
          const px = 352 + i * 22;
          smooth(ctx, [[px, 620], [px - 8, 740], [px + 4, 840]]);
          ctx.strokeStyle = "rgba(150,130,100," + (i % 2 ? .22 : .13) + ")";
          ctx.lineWidth = 5; ctx.stroke();
        }
        /* 侧腰阴影 */
        ctx.fillStyle = "rgba(150,110,70,.16)";
        ctx.fillRect(326, 700, 24, 150); ctx.fillRect(550, 700, 24, 150);
        ctx.restore();
        /* 交领右衽（金线滚边） */
        smooth(ctx, [[340, 606 + rise], [398, 700], [470, 726], [508, 706], [520, 690]]);
        ctx.strokeStyle = P.gold; ctx.lineWidth = 5; ctx.stroke();
        smooth(ctx, [[340, 612 + rise], [396, 706], [464, 732], [502, 712], [514, 696]]);
        ctx.strokeStyle = "rgba(120,95,50,.35)"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = "rgba(240,230,205,.55)";    // 衽内衬
        smooth(ctx, [[340, 606 + rise], [398, 700], [470, 726], [508, 706], [520, 690], [516, 712], [452, 748], [384, 716], [346, 642]], true);
        ctx.fill();
        /* 腰封（蓝 + 金牡丹刺绣） */
        ctx.save();
        rr(ctx, 358, 726, 184, 62, 10);
        ctx.fillStyle = lg(ctx, 450, 726, 450, 788, [[0, P.sash], [.55, "#7ba7cc"], [1, P.sashD]]);
        ctx.fill();
        ctx.strokeStyle = P.goldD; ctx.lineWidth = 3; rr(ctx, 358, 726, 184, 62, 10); ctx.stroke();
        /* 牡丹 */
        ctx.save(); ctx.translate(450, 757);
        for (let l = 0; l < 2; l++) {
          for (let i = 0; i < 6; i++) {
            const a = i / 6 * Math.PI * 2 + l * 0.5;
            ell(ctx, Math.cos(a) * (l ? 8 : 14), Math.sin(a) * (l ? 8 : 14), 9 - l * 3, 7 - l * 2, a);
            ctx.fillStyle = l ? P.gold : "#e8cf8a"; ctx.fill();
          }
        }
        ell(ctx, 0, 0, 5, 5); ctx.fillStyle = "#b03028"; ctx.fill();
        ctx.restore();
        /* 腰封垂带（双飘带，飘动） */
        const fw = flow(t, 2) * 6;
        strand(ctx, [[426, 788], [424, 850], [418 + fw, 920], [416 + fw * 1.6, 1000]], 11, 7, P.sash, "rgba(255,255,255,.25)");
        strand(ctx, [[474, 788], [476, 850], [482 + fw, 920], [484 + fw * 1.6, 1000]], 11, 7, P.sash, "rgba(255,255,255,.25)");
        ctx.restore();
        /* 裙 */
        smooth(ctx, [
          [362, 786], [330, 900], [308, 1000], [296, 1050],
          [604, 1050], [592, 1000], [570, 900], [538, 786]
        ], true);
        ctx.fillStyle = lg(ctx, 450, 790, 450, 1060, [
          [0, P.skirtL], [.6, "#e6edf2"], [1, P.skirtS]]);
        ctx.fill();
        ctx.save(); ctx.clip();
        for (let i = 0; i < 12; i++) {          // 裙褶
          const px = 320 + i * 22;
          smooth(ctx, [[px, 800], [px - 14, 930], [px + 4, 1050]]);
          ctx.strokeStyle = i % 2 ? "rgba(140,160,180,.30)" : "rgba(140,160,180,.16)";
          ctx.lineWidth = 6; ctx.stroke();
        }
        /* 裙腰淡青暗纹 */
        ctx.strokeStyle = "rgba(120,160,190,.30)"; ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(340, 810 + i * 12); ctx.bezierCurveTo(450, 826 + i * 12, 560, 810 + i * 12, 566, 810 + i * 12); ctx.stroke();
        }
        ctx.restore();
        /* 裙头边 */
        ctx.strokeStyle = "rgba(120,150,175,.5)"; ctx.lineWidth = 4;
        smooth(ctx, [[362, 792], [450, 800], [538, 792]]); ctx.stroke();
        /* 披帛（白纱，绕臂垂落） */
        drawVeil(ctx, sk);
      } else {
        /* 男：深青交领长衫 */
        smooth(ctx, [
          [336, 596 + rise], [326, 720], [358, 860], [372, 900],
          [528, 900], [542, 860], [574, 720], [564, 596 + rise]
        ], true);
        ctx.fillStyle = lg(ctx, 450, 590, 450, 920, [
          [0, P.robeL], [.5, P.robe], [1, P.robeD]]);
        ctx.fill();
        ctx.save(); ctx.clip();
        for (let i = 0; i < 8; i++) {
          const px = 360 + i * 24;
          smooth(ctx, [[px, 640], [px - 10, 780], [px + 6, 910]]);
          ctx.strokeStyle = i % 2 ? "rgba(20,50,70,.28)" : "rgba(20,50,70,.15)";
          ctx.lineWidth = 6; ctx.stroke();
        }
        ctx.restore();
        /* 交领 */
        smooth(ctx, [[366, 604 + rise], [410, 720], [472, 748], [512, 726], [524, 706]]);
        ctx.strokeStyle = "#d8cba0"; ctx.lineWidth = 5; ctx.stroke();
        ctx.fillStyle = "rgba(230,225,200,.6)";
        smooth(ctx, [[366, 604 + rise], [410, 720], [472, 748], [512, 726], [524, 706], [518, 730], [462, 770], [394, 736], [370, 640]], true);
        ctx.fill();
        /* 玉带 */
        rr(ctx, 360, 812, 180, 40, 8);
        ctx.fillStyle = lg(ctx, 450, 812, 450, 852, [[0, "#e8e0c8"], [1, "#b8ac8c"]]);
        ctx.fill();
        ctx.strokeStyle = "#8a7a50"; ctx.lineWidth = 3; rr(ctx, 360, 812, 180, 40, 8); ctx.stroke();
        ell(ctx, 450, 832, 12, 12); ctx.fillStyle = "#7a6a3c"; ctx.fill();
        /* 袍下摆没入桌面 */
        ctx.fillStyle = lg(ctx, 450, 880, 450, 1060, [[0, P.robeD], [1, "#2a4c60"]]);
        ctx.fillRect(340, 890, 220, 170);
      }
      ctx.restore();
    }

    function drawVeil(ctx, sk) {
      const t = sk.t;
      const w1 = flow(t, 0.8) * 10, w2 = flow(t, 2.1) * 14;
      /* 主纱带：右肩 → 左臂前 → 垂落 */
      ctx.save();
      ctx.globalAlpha = 0.94;
      strand(ctx, [[566, 636], [520, 700 + w1 * .3], [420, 760 + w1 * .5], [372, 880 + w1]], 17, 11,
        "rgba(255,255,255,.94)", "rgba(190,210,225,.5)");
      strand(ctx, [[556, 648], [516, 716 + w2 * .3], [430, 780 + w2 * .5], [398, 920 + w2]], 10, 6,
        "rgba(248,251,253,.8)", "rgba(190,210,225,.45)");
      ctx.restore();
      /* 纱缘金线 */
      ctx.save(); ctx.globalAlpha = 0.55;
      strand(ctx, [[560, 642], [514, 708], [420, 764], [380, 884]], 3, 2, P.gold, null);
      ctx.restore();
      /* 末端流苏（飘动） */
      ctx.save(); ctx.globalAlpha = 0.9;
      const ex = 372 + w1 * 1.2, ey = 880 + w1;
      for (let i = 0; i < 3; i++) {
        smooth(ctx, [[ex - 8 + i * 8, ey], [ex - 10 + i * 8 + w2 * .3, ey + 26], [ex - 6 + i * 8 + w2 * .6, ey + 52]]);
        ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.stroke();
      }
      ctx.restore();
    }

    /* ========== 手臂 + 手 ========== */
    function drawArms(ctx, sk, female) {
      const t = sk.t;
      /* 右臂（画面左）：抬手执笔写字 —— 上臂 + 小臂 + 袖 + 手 */
      const rSw = Math.sin(t * 1.1) * 0.05 + Math.sin(t * 0.43) * 0.03;
      ctx.save();
      ctx.translate(318, 608); ctx.rotate(-0.62 + rSw * 0.5 + sk.sleep * 0.9);
      /* 上臂（袖内） */
      ell(ctx, 0, 44, 20, 46); ctx.fillStyle = P.skinM; ctx.fill();
      /* 小臂（纱袖） */
      ctx.translate(0, 88); ctx.rotate(0.68 + rSw + sk.sleep * 0.5);
      strand(ctx, [[0, 0], [16, 40], [22, 78], [30, 108]], 26, 19,
        female ? "rgba(252,247,236,.96)" : P.robeL, "rgba(255,255,255,.4)");
      ell(ctx, 0, 6, 15, 16); ctx.fillStyle = P.skinM; ctx.fill();   // 袖口手臂
      /* 袖摆纱边 + 金线滚边 */
      smooth(ctx, [[-2, 92], [14, 108], [32, 116], [46, 108], [38, 96], [20, 88]], true);
      ctx.fillStyle = female ? "rgba(252,247,236,.92)" : P.robeL; ctx.fill();
      smooth(ctx, [[-2, 92], [14, 108], [32, 116], [46, 108]]);
      ctx.strokeStyle = P.gold; ctx.lineWidth = 2.4; ctx.stroke();
      /* 手 */
      ctx.translate(34, 102);
      ctx.save(); ctx.rotate(-0.5);
      ell(ctx, 0, 0, 13, 16); ctx.fillStyle = P.skinM; ctx.fill();
      ell(ctx, -2, -3, 5, 7, -0.4); ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fill();
      ctx.restore();
      /* 执笔 */
      ctx.save(); ctx.rotate(0.9 + Math.sin(t * 5.2) * 0.16);
      ctx.strokeStyle = "#c9a35e"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(4, 2); ctx.quadraticCurveTo(16, -12, 30, -34); ctx.stroke();
      ctx.strokeStyle = P.ink; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(30, -34); ctx.quadraticCurveTo(38, -46, 44, -52); ctx.stroke();
      ctx.restore();
      ctx.restore();

      /* 左臂（画面右）：垂落轻按裙面 */
      const lSw = Math.sin(t * 0.9 + 1.4) * 0.04;
      ctx.save();
      ctx.translate(556, 610); ctx.rotate(0.42 + lSw * 0.5 + sk.sleep * 0.4);
      ell(ctx, 0, 44, 19, 44); ctx.fillStyle = P.skinM; ctx.fill();
      ctx.translate(0, 86); ctx.rotate(-0.36 + lSw);
      strand(ctx, [[0, 0], [-12, 40], [-16, 78], [-22, 104]], 25, 18,
        female ? "rgba(252,247,236,.96)" : P.robeL, "rgba(255,255,255,.4)");
      ell(ctx, 0, 6, 14, 15); ctx.fillStyle = P.skinM; ctx.fill();
      smooth(ctx, [[2, 90], [-12, 104], [-30, 112], [-44, 104], [-32, 92], [-14, 86]], true);
      ctx.fillStyle = female ? "rgba(252,247,236,.92)" : P.robeL; ctx.fill();
      smooth(ctx, [[2, 90], [-12, 104], [-30, 112], [-44, 104]]);
      ctx.strokeStyle = P.gold; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.translate(-22, 104);
      ctx.save(); ctx.rotate(0.4);
      ell(ctx, 0, 0, 12, 15); ctx.fillStyle = P.skinM; ctx.fill();
      ctx.fillStyle = "rgba(190,130,100,.25)"; ell(ctx, 2, 4, 8, 9); ctx.fill();
      ctx.restore();
      ctx.restore();
    }

    /* ========== 头 ========== */
    function drawHead(ctx, sk, female) {
      const t = sk.t;
      const hr = sk.headRot + Math.sin(t * 0.6) * 0.012 + sk.sleep * 0.10;   // 睡姿微倾
      ctx.save();
      ctx.translate(0, sk.sleep * 130);              // 睡姿：头整体下沉贴胸（趴桌）
      ctx.translate(450, 520); ctx.rotate(hr); ctx.translate(-450, -520);
      /* 耳 */
      [-1, 1].forEach(s => {
        ell(ctx, 450 + s * 62, 412, 11, 18, s * 0.2);
        ctx.fillStyle = P.skinM; ctx.fill();
        ctx.strokeStyle = "rgba(190,130,100,.4)"; ctx.lineWidth = 1.6; ctx.stroke();
      });
      if (female) {
        /* 瓜子脸（下颌急收 + 尖下巴 + 颧骨微丰） */
        ctx.beginPath();
        ctx.moveTo(450, 306);
        ctx.bezierCurveTo(400, 316, 374, 344, 384, 394);
        ctx.bezierCurveTo(390, 428, 406, 462, 422, 488);
        ctx.bezierCurveTo(436, 508, 464, 508, 478, 488);
        ctx.bezierCurveTo(494, 462, 510, 428, 516, 394);
        ctx.bezierCurveTo(526, 344, 500, 316, 450, 306);
        ctx.closePath();
        ctx.fillStyle = rg(ctx, 442, 420, 130, [
          [0, P.skinL], [.55, P.skinM], [1, P.skinS]]);
        ctx.fill();
        /* 下颌影 + 颧骨下影 */
        ctx.save(); ctx.clip();
        ctx.fillStyle = "rgba(196,124,94,.20)";
        smooth(ctx, [[388, 452], [420, 500], [450, 522], [480, 500], [512, 452], [508, 470], [450, 530], [392, 470]], true);
        ctx.fill();
        ctx.restore();
        /* 额顶光 */
        ell(ctx, 446, 338, 54, 20, -0.1);
        ctx.fillStyle = "rgba(255,250,240,.28)"; ctx.fill();
        /* 腮红 */
        [-1, 1].forEach(s => {
          ell(ctx, 450 + s * 42, 442, 24, 13);
          ctx.fillStyle = rg(ctx, 450 + s * 42, 442, 24, [
            [0, "rgba(" + P.blush + ",.55)"], [1, "rgba(" + P.blush + ",0)"]]);
          ctx.fill();
        });
        /* 颈根影 */
        ctx.fillStyle = "rgba(190,130,100,.20)";
        ell(ctx, 450, 518, 28, 8); ctx.fill();
      } else {
        /* 男：方圆脸 */
        ctx.beginPath();
        ctx.moveTo(450, 308);
        ctx.bezierCurveTo(404, 316, 378, 344, 388, 390);
        ctx.bezierCurveTo(394, 424, 410, 462, 424, 488);
        ctx.bezierCurveTo(436, 508, 464, 508, 476, 488);
        ctx.bezierCurveTo(490, 462, 506, 424, 512, 390);
        ctx.bezierCurveTo(522, 344, 496, 316, 450, 308);
        ctx.closePath();
        ctx.fillStyle = rg(ctx, 442, 420, 130, [[0, "#fdeedd"], [.55, P.skinM], [1, P.skinS]]);
        ctx.fill();
        ctx.fillStyle = "rgba(196,124,94,.18)";
        ell(ctx, 450, 512, 30, 9); ctx.fill();
        ell(ctx, 446, 338, 50, 18); ctx.fillStyle = "rgba(255,250,240,.20)"; ctx.fill();
      }
      ctx.restore();
    }

    /* ========== 五官（眉眼鼻嘴 + 眨眼） ========== */
    function drawFace(ctx, sk, female) {
      const t = sk.t;
      const blink = sk.blink;
      const EY = female ? 412 : 408, EX = female ? 40 : 39, EH = female ? 31 : 24;
      /* 眉（远山眉） */
      [-1, 1].forEach(s => {
        const bx = 450 + s * EX;
        smooth(ctx, [[bx - 22, 378 - 2], [bx - 8, 368], [bx + 10, 369], [bx + 22, 376 + 3]]);
        ctx.strokeStyle = "rgba(95,64,40,.85)"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.stroke();
        smooth(ctx, [[bx + 2, 372], [bx + 14, 374], [bx + 22, 377]]);
        ctx.strokeStyle = "rgba(95,64,40,.35)"; ctx.lineWidth = 3; ctx.stroke();
      });
      /* 眼 ×2 */
      drawEye(ctx, 450 - EX, EY, -1, sk, EH, female);
      drawEye(ctx, 450 + EX, EY, 1, sk, EH, female);
      /* 鼻（小翘鼻：影 + 高光） */
      ctx.fillStyle = "rgba(196,124,94,.38)";
      ell(ctx, 450, 446, 7, 4.5); ctx.fill();
      ell(ctx, 447, 443, 2.6, 2); ctx.fillStyle = "rgba(255,250,242,.75)"; ctx.fill();
      smooth(ctx, [[446, 440], [448, 448], [452, 450]]);
      ctx.strokeStyle = "rgba(180,115,85,.30)"; ctx.lineWidth = 1.6; ctx.stroke();
      /* 嘴（樱桃小嘴） */
      ctx.save();
      const mw = female ? 15 : 13, my = 476;
      ctx.beginPath();
      ctx.moveTo(450 - mw, my);
      ctx.quadraticCurveTo(450 - mw * .45, my - 4.5, 450, my - 1.5);
      ctx.quadraticCurveTo(450 + mw * .45, my - 4.5, 450 + mw, my);
      ctx.quadraticCurveTo(450 + mw * .5, my + 5.5, 450, my + 5);
      ctx.quadraticCurveTo(450 - mw * .5, my + 5.5, 450 - mw, my);
      ctx.closePath();
      ctx.fillStyle = lg(ctx, 450, my - 5, 450, my + 6, [[0, P.lip], [1, P.lipD]]);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.30)";   // 下唇高光
      ell(ctx, 450, my + 3, mw * .5, 1.6); ctx.fill();
      ctx.restore();
      /* 人中 */
      smooth(ctx, [[450, 458], [450, 468]]);
      ctx.strokeStyle = "rgba(190,130,100,.30)"; ctx.lineWidth = 1.4; ctx.stroke();
    }

    /* 卡姿兰大水汪汪眼睛 */
    function drawEye(ctx, ex, ey, side, sk, EH, female) {
      const open = sk.blink;
      const hh = EH * clamp(open, 0.03, 1);
      const w = female ? 27 : 24;
      if (hh < 2.2) {                          // 闭眼：弧线 + 睫毛
        smooth(ctx, [[ex - w, ey + 2], [ex, ey - 4], [ex + w, ey + 1]]);
        ctx.strokeStyle = P.eyeLine; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.stroke();
        smooth(ctx, [[ex - w + 3, ey + 3], [ex, ey - 2], [ex + w - 3, ey + 2]]);
        ctx.strokeStyle = "rgba(43,28,16,.35)"; ctx.lineWidth = 1.6; ctx.stroke();
        return;
      }
      ctx.save();
      ctx.translate(ex, ey); ctx.scale(side, 1);
      /* 眼白（含上睑投影） */
      ell(ctx, 0, 0, w, hh * 0.92);
      ctx.fillStyle = lg(ctx, 0, -hh * 0.5, 0, hh * 0.6, [
        [0, "#e8ecf2"], [.35, "#ffffff"], [1, "#f4f6f8"]]);
      ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = "rgba(150,160,185,.30)";  // 上睑投影
      ctx.fillRect(-w, -hh, w * 2, hh * 0.55);
      ctx.restore();
      /* 虹膜（卡姿兰大眼：占眼球 70%） */
      const ir = Math.min(15.5, hh * 0.68);
      ell(ctx, side * 2, hh * 0.06, ir, ir * 1.02);
      ctx.fillStyle = rg(ctx, side * 2, -ir * 0.4, ir * 1.5, [
        [0, P.iris2], [.55, P.iris1], [1, P.irisRim]]);
      ctx.fill();
      ctx.save(); ctx.clip();                 // 虹膜下缘提亮（水汪汪）
      ctx.fillStyle = "rgba(244,216,164,.55)";
      ctx.fillRect(-ir, ir * 0.25, ir * 2, ir);
      ctx.restore();
      ell(ctx, side * 2, hh * 0.06, ir, ir * 1.02);
      ctx.strokeStyle = P.irisRim; ctx.lineWidth = 1.8; ctx.stroke();
      /* 瞳孔 */
      ell(ctx, side * 2, hh * 0.06, ir * 0.42, ir * 0.44);
      ctx.fillStyle = P.pupil; ctx.fill();
      /* 高光：主 + 次 + 底反光 */
      ell(ctx, -ir * 0.34, -ir * 0.42, ir * 0.34, ir * 0.30);
      ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.fill();
      ell(ctx, ir * 0.36, ir * 0.34, ir * 0.16, ir * 0.14);
      ctx.fillStyle = "rgba(255,255,255,.65)"; ctx.fill();
      ell(ctx, side * 2, ir * 0.72, ir * 0.55, ir * 0.16);   // 底部水面反光
      ctx.fillStyle = "rgba(255,255,255,.58)"; ctx.fill();
      /* 双眼皮 */
      smooth(ctx, [[-w + 2, -hh * 0.86], [-2, -hh * 1.22], [w - 4, -hh * 0.8]]);
      ctx.strokeStyle = "rgba(120,88,64,.38)"; ctx.lineWidth = 2; ctx.stroke();
      /* 上眼线（眼尾上扬） */
      smooth(ctx, [[-w + 1, -hh * 0.10], [-4, -hh * 0.72], [w * 0.45, -hh * 0.66], [w + 5, -hh * 0.18]]);
      ctx.strokeStyle = P.eyeLine; ctx.lineWidth = 3.4; ctx.lineCap = "round"; ctx.stroke();
      /* 上睫毛 6 根（外挑） */
      for (let i = 0; i < 6; i++) {
        const p = i / 5, a = -w + 4 + p * (w * 1.7);
        const ly = -Math.sin(p * Math.PI * 0.9 + 0.12) * hh * 0.85 - 1;
        const ln = 7 + Math.sin(p * Math.PI) * 6 + (i % 2) * 3;
        const dir = -0.5 - p * 0.85;
        ctx.beginPath(); ctx.moveTo(a, ly);
        ctx.quadraticCurveTo(a + ln * 0.4 * Math.cos(dir), ly - ln * 0.7, a + ln * Math.cos(dir), ly - ln * (0.5 + p * 0.5));
        ctx.strokeStyle = P.eyeLash; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.stroke();
      }
      /* 下睫毛 2 根 */
      ctx.beginPath(); ctx.moveTo(-w * 0.4, hh * 0.62); ctx.lineTo(-w * 0.4 + 6, hh * 0.80);
      ctx.moveTo(w * 0.3, hh * 0.58); ctx.lineTo(w * 0.3 + 6, hh * 0.78);
      ctx.strokeStyle = "rgba(46,28,16,.55)"; ctx.lineWidth = 1.6; ctx.stroke();
      /* 卧蚕 */
      smooth(ctx, [[-w * 0.5, hh * 0.78], [0, hh * 1.02], [w * 0.5, hh * 0.72]]);
      ctx.strokeStyle = "rgba(" + P.blush + ",.45)"; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.restore();
    }

    /* ========== 前发 + 发饰（女） ========== */
    function drawHairFront(ctx, sk, female) {
      const t = sk.t;
      ctx.save();
      /* 中分发缝 + 两侧垂发片（★贴脸侧下垂，露出完整眉眼——参考图①） */
      /* 左垂发片 */
      smooth(ctx, [
        [446, 314], [432, 320], [414, 352], [400, 400],
        [398, 448], [410, 480], [424, 474], [414, 428],
        [402, 396], [410, 348], [428, 330]
      ], true);
      ctx.fillStyle = lg(ctx, 400, 320, 420, 470, [
        [0, P.hairL], [.45, P.hairM], [1, P.hairD]]);
      ctx.fill();
      /* 右垂发片 */
      smooth(ctx, [
        [454, 314], [468, 320], [486, 352], [500, 400],
        [502, 448], [490, 480], [476, 474], [486, 428],
        [498, 396], [490, 348], [472, 330]
      ], true);
      ctx.fillStyle = lg(ctx, 500, 320, 480, 470, [
        [0, P.hairL], [.45, P.hairM], [1, P.hairD]]);
      ctx.fill();
      /* 分发缝亮线 */
      smooth(ctx, [[450, 314], [450, 344]]);
      ctx.strokeStyle = "rgba(255,230,195,.30)"; ctx.lineWidth = 3; ctx.stroke();
      /* 额前中分细缕（2 缕细发，垂到眉上即止，不遮眼） */
      const sw = flow(t, 1.2) * 3;
      [-1, 1].forEach(sd => {
        smooth(ctx, [[450 + sd * 3, 316], [443 + sd * 9 + sw * sd, 336], [445 + sd * 11 + sw * 1.4 * sd, 352]]);
        ctx.strokeStyle = "rgba(20,12,6,.42)"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.stroke();
        smooth(ctx, [[450 + sd * 3, 316], [443 + sd * 9 + sw * sd, 336], [445 + sd * 11 + sw * 1.4 * sd, 352]]);
        ctx.strokeStyle = "rgba(255,230,195,.12)"; ctx.lineWidth = 1.4; ctx.stroke();
      });
      /* 鬓角发丝尖梢（飘动） */
      for (let i = 0; i < 3; i++) {
        smooth(ctx, [[404 + i * 4, 400 + i * 16], [396 - sw * 0.4 + i, 434 + i * 10], [402 - sw + i * 2, 462 + i * 8]]);
        ctx.strokeStyle = "rgba(20,12,6,.45)"; ctx.lineWidth = 2; ctx.stroke();
        smooth(ctx, [[496 - i * 4, 400 + i * 16], [504 + sw * 0.4 - i, 434 + i * 10], [498 + sw - i * 2, 462 + i * 8]]);
        ctx.strokeStyle = "rgba(20,12,6,.45)"; ctx.lineWidth = 2; ctx.stroke();
      }
      /* 额前珠链帘（★参考图①标志性） */
      const bp = [[416, 334], [412, 352], [410, 370]];
      beads(ctx, bp, 3.2, 4.6, "#f6f2ea", "#b8b0a0");
      const bp2 = [[484, 334], [488, 352], [490, 370]];
      beads(ctx, bp2, 3.2, 4.6, "#f6f2ea", "#b8b0a0");
      ctx.restore();
    }

    function drawHairOrn(ctx, sk, female) {
      const t = sk.t;
      /* 蓝蝶发饰 ×2（参考图①） */
      drawButterfly(ctx, 366 + flow(t, 0.5) * 1.5, 262 + flow(t, 1.1) * 2, 1, -1, sk);
      drawButterfly(ctx, 534 + flow(t, 2.2) * 1.5, 262 + flow(t, 1.8) * 2, 1, 1, sk);
      /* 金簪（横插发髻） */
      ctx.save();
      ctx.translate(450, 258); ctx.rotate(-0.12);
      ctx.strokeStyle = P.gold; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(34, -4); ctx.stroke();
      ctx.fillStyle = P.gold;
      ell(ctx, -38, 1, 7, 7); ctx.fill();
      /* 簪头垂珠 */
      const dp = [[-38, 9], [-38, 20], [-38, 31]];
      beads(ctx, dp, 3.4, 4.2, "#fbf7ec", "#c0b8a4");
      ctx.restore();
      /* 鬓边垂珠串（长，移到发片外侧） */
      const lp = [[368, 300], [362, 340], [362, 380], [366, 418], [372, 448]];
      beads(ctx, lp, 4, 5.4, "#f8f4ea", "#bdb5a2");
      const rp = [[532, 300], [538, 340], [538, 380], [534, 418], [528, 448]];
      beads(ctx, rp, 4, 5.4, "#f8f4ea", "#bdb5a2");
    }

    function drawButterfly(ctx, bx, by, s, flip, sk) {
      const t = sk.t;
      const flap = 0.82 + Math.sin(t * 2.6 + bx) * 0.18;
      ctx.save();
      ctx.translate(bx, by); ctx.scale(flip * s, s);
      ctx.rotate(Math.sin(t * 1.3 + bx * 0.1) * 0.08);
      /* 上翅 */
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.bezierCurveTo(-16, -34, -52, -40, -56, -16);
      ctx.bezierCurveTo(-58, -2, -30, 4, 0, -4);
      ctx.fillStyle = lg(ctx, -30, -36, -10, 0, [
        [0, "#9fd4f4"], [.5, "#5ea8e0"], [1, "#3a7fc0"]]);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 1.6; ctx.stroke();
      /* 上翅脉络 */
      ctx.beginPath(); ctx.moveTo(-2, -6); ctx.quadraticCurveTo(-26, -18, -48, -14);
      ctx.moveTo(-2, -6); ctx.quadraticCurveTo(-24, -6, -42, -6);
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.2; ctx.stroke();
      /* 下翅 */
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-14, 10, -30, 22, -30, 32);
      ctx.bezierCurveTo(-26, 40, -8, 26, 0, 6);
      ctx.fillStyle = lg(ctx, -20, 10, -8, 30, [
        [0, "#7cc0ee"], [1, "#4a8fd0"]]);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.2; ctx.stroke();
      /* 珠光点 */
      [[-26, -22], [-38, -10], [-16, 14]].forEach(p => {
        ell(ctx, p[0], p[1], 2.6, 2.6);
        ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fill();
      });
      /* 蝶身（金） */
      ell(ctx, 0, 2, 3.4, 13);
      ctx.fillStyle = lg(ctx, 0, -10, 0, 14, [[0, "#f0d590"], [1, "#b08a3c"]]);
      ctx.fill();
      ell(ctx, 0, -12, 3, 3); ctx.fillStyle = "#c9a35e"; ctx.fill();
      /* 触须 */
      ctx.beginPath(); ctx.moveTo(-1, -14); ctx.quadraticCurveTo(-6, -24, -12, -26);
      ctx.moveTo(1, -14); ctx.quadraticCurveTo(6, -24, 12, -26);
      ctx.strokeStyle = "#8a6a30"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }

    /* ========== 首饰 ========== */
    function drawJewelry(ctx, sk, female) {
      if (!female) return;
      /* 耳坠（珍珠三连） */
      [-1, 1].forEach(s => {
        const p = [[450 + s * 62, 430], [450 + s * 64, 446], [450 + s * 63, 462]];
        beads(ctx, p, 4.6, 6.4, "#fbf7ec", "#c4bca8");
      });
      /* 珍珠项链（双层）+ 蓝宝石吊坠 */
      smooth(ctx, [[420, 588], [450, 616], [480, 588]]);
      ctx.strokeStyle = "rgba(240,236,224,.95)"; ctx.lineWidth = 3.4; ctx.stroke();
      const n1 = [];
      for (let i = 0; i <= 8; i++) { const p = i / 8; n1.push([450 - 30 + p * 60, 596 + Math.sin(p * Math.PI) * 16]); }
      beads(ctx, n1, 3.6, 3.6, "#fbf7ec", "#c4bca8");
      smooth(ctx, [[424, 606], [450, 640], [476, 606]]);
      ctx.strokeStyle = "rgba(235,230,216,.9)"; ctx.lineWidth = 2.6; ctx.stroke();
      const n2 = [];
      for (let i = 0; i <= 8; i++) { const p = i / 8; n2.push([450 - 26 + p * 52, 614 + Math.sin(p * Math.PI) * 20]); }
      beads(ctx, n2, 3, 3, "#fbf7ec", "#c4bca8");
      /* 蓝水滴宝石 */
      ctx.save(); ctx.translate(450, 660);
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.bezierCurveTo(9, 2, 9, 12, 0, 17);
      ctx.bezierCurveTo(-9, 12, -9, 2, 0, -12);
      ctx.fillStyle = lg(ctx, -6, -10, 6, 16, [
        [0, "#bfe4fa"], [.45, "#5ea8e0"], [1, "#2f6ea8"]]);
      ctx.fill();
      ell(ctx, -3, -4, 2.4, 3.4, -0.4);
      ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fill();
      ctx.restore();
    }

    /* ========== 男版前发（束发） ========== */
    function drawHairFrontM(ctx, sk) {
      const t = sk.t;
      ctx.save();
      smooth(ctx, [
        [452, 312], [414, 320], [396, 352], [394, 396],
        [404, 428], [428, 420], [420, 384], [436, 344], [450, 326]
      ], true);
      ctx.fillStyle = lg(ctx, 400, 320, 430, 430, [[0, P.hairL], [.5, P.hairM], [1, P.hairD]]);
      ctx.fill();
      smooth(ctx, [
        [448, 312], [486, 320], [504, 352], [506, 396],
        [496, 428], [472, 420], [480, 384], [464, 344], [450, 326]
      ], true);
      ctx.fillStyle = lg(ctx, 500, 320, 470, 430, [[0, P.hairL], [.5, P.hairM], [1, P.hairD]]);
      ctx.fill();
      /* 发冠 */
      ctx.save(); ctx.translate(450, 292);
      rr(ctx, -34, -22, 68, 30, 8);
      ctx.fillStyle = lg(ctx, 0, -22, 0, 8, [[0, "#8a6a30"], [1, "#5c4218"]]);
      ctx.fill();
      ctx.strokeStyle = P.gold; ctx.lineWidth = 2.5; rr(ctx, -34, -22, 68, 30, 8); ctx.stroke();
      ell(ctx, 0, -22, 10, 7); ctx.fillStyle = P.gold; ctx.fill();
      ctx.restore();
      ctx.restore();
    }

    /* ================= Zzz（趴睡） ================= */
    function drawZzz(ctx, sk) {
      const s = sk.sleep;
      if (s < 0.05) return;
      ctx.save();
      ctx.font = 'bold 44px "Comic Sans MS","KaiTi",sans-serif';
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let i = 0; i < 3; i++) {
        const tt = ((sk.t * 0.32) + i / 3) % 1;
        const a = s * (1 - tt) * 0.9;
        ctx.globalAlpha = a;
        ctx.fillStyle = "#8fa0d8";
        const zx = 578 + Math.sin((tt + i) * 5) * 22, zy = 726 - tt * 140;
        const zs = 26 + tt * 22;
        ctx.font = 'bold ' + zs + 'px "Comic Sans MS","KaiTi",sans-serif';
        ctx.fillText("Z", zx, zy);
      }
      ctx.restore();
    }

    /* ================= 主渲染 ================= */
    function render(ctx, sk) {
      if (window.__IMP_DEBUG && window.__IMP_DEBUG.blink != null) sk.blink = window.__IMP_DEBUG.blink;   // 调试钩子
      const dpr = sk.dpr || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, LW, LH);
      const nightK0 = clamp(1 - sk.light.amb / 0.85, 0, 1);
      drawRoom(ctx, sk);
      /* 人物夜色轻罩前先画人 */
      drawFigure(ctx, sk);
      drawDeskFront(ctx, sk, nightK0);   // 桌面物品在前景（裙前）
      /* 人物统一夜罩 */
      const nightK = clamp(1 - sk.light.amb / 0.85, 0, 1);
      if (nightK > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "rgba(38,50,92," + 0.17 * nightK + ")";
        ctx.fillRect(0, 0, LW, LH);
        ctx.restore();
      }
      /* 灯火暖罩（人身上） */
      if (sk.light.lamp > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = "source-atop";
        ell(ctx, 742, 980, 330, 300);
        ctx.fillStyle = rg(ctx, 742, 980, 330, [[0, "rgba(255,170,80," + 0.16 * sk.light.lamp + ")"], [1, "rgba(255,170,80,0)"]]);
        ctx.fill();
        ctx.restore();
      }
      /* 全局柔光（暖暖质感） */
      ctx.save();
      ctx.globalCompositeOperation = "soft-light";
      ell(ctx, 450, 560, 520, 620);
      ctx.fillStyle = rg(ctx, 450, 560, 520, [[0, "rgba(255,236,210,.85)"], [1, "rgba(255,236,210,0)"]]);
      ctx.fill();
      ctx.restore();
      drawZzz(ctx, sk);
    }

    return { LW, LH, render };
  })();
})();
