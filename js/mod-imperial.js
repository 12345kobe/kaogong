/* 模块：科举进度 —— 3D 书房养成小人（Three.js，仿「中式书斋 + Q版读书人」风格）
   昼夜作息（用户定版）：00:00 趴桌睡觉 → 07:00 起床；12:00–13:00 午睡；灯光早晚丝滑过渡。 */
(function () {
  "use strict";
  window.MODULES = window.MODULES || {};

  /* ================= 昼夜时段表 ================= */
  const PHASES = [
    { t0: 0,    key: "sleep",     label: "😴 睡梦中",     sub: "呼呼大睡，养足精神",  sun: 0.00, sunC: 0x2a3866, amb: 0.30, lamp: 1,  sleep: true },
    { t0: 6.4,  key: "wakeup",    label: "🌅 天刚蒙蒙亮", sub: "快睡醒啦",           sun: 0.45, sunC: 0xffc490, amb: 0.45, lamp: 0.4, sleep: true },
    { t0: 7,    key: "morning",   label: "🌤 早晨勤学",   sub: "一日之计在于晨",      sun: 1.60, sunC: 0xfff0d0, amb: 0.85, lamp: 0 },
    { t0: 12,   key: "nap",       label: "😌 午睡小憩",   sub: "趴一会儿，下午更有劲", sun: 1.50, sunC: 0xfff2dd, amb: 0.82, lamp: 0, sleep: true },
    { t0: 13,   key: "afternoon", label: "☀️ 下午勤学",   sub: "继续刷题冲冲冲",      sun: 1.55, sunC: 0xffedd0, amb: 0.82, lamp: 0 },
    { t0: 17.5, key: "dusk",      label: "🌇 暮色四合",   sub: "天色渐暗，点灯了",    sun: 0.70, sunC: 0xff9a56, amb: 0.55, lamp: 0.5 },
    { t0: 19,   key: "night",     label: "🌙 挑灯夜读",   sub: "煤油灯下笔耕不辍",    sun: 0.00, sunC: 0x2a3866, amb: 0.32, lamp: 1 },
    { t0: 24,   key: "night",     label: "🌙 挑灯夜读",   sub: "煤油灯下笔耕不辍",    sun: 0.00, sunC: 0x2a3866, amb: 0.32, lamp: 1 }
  ];
  function phaseAt(date) {
    const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    let i = 0;
    for (let k = 0; k < PHASES.length - 1; k++) { if (h >= PHASES[k].t0 && h < PHASES[k + 1].t0) { i = k; break; } }
    const a = PHASES[i], b = PHASES[i + 1] || a;
    const f = Math.min(1, Math.max(0, (h - a.t0) / Math.max(0.001, b.t0 - a.t0)));
    const s = f * f * (3 - 2 * f); // smoothstep 丝滑过渡
    const mix = (x, y) => x + (y - x) * s;
    const near = f < 0.5 ? a : b;
    return { key: near.key, label: near.label, sub: near.sub, sleep: near.sleep, sun: mix(a.sun, b.sun), sunC: a.sunC, amb: mix(a.amb, b.amb), lamp: mix(a.lamp, b.lamp), h };
  }

  /* ================= 工具 ================= */
  const C = {
    skin: 0xf8d8bd, blush: 0xf5b09c, hair: 0x3a2e26,
    gown: 0xf6ead0,            // 上襦米黄（男女同）
    skirtF: 0xa8cde0, beltF: 0x7fb3d0, bandF: 0x9cc4dd,  // 女：浅蓝裙
    pantsM: 0x3e6b7e, beltM: 0x46768a, bandM: 0x6b9cb5,  // 男：深青袴
    woodL: 0xc88a4e, woodM: 0xa5693a, woodD: 0x7a4a28,
    wall: 0xf3e3c3, floor: 0xe9d6b2, paper: 0xfbf6e8,
    brass: 0xc9973f, flame: 0xffa63e
  };
  function mat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.95, metalness: 0.02 }, opts || {}));
  }
  function M(geo, material, x, y, z) {
    const m = new THREE.Mesh(geo, material);
    if (x !== undefined) m.position.set(x, y, z);
    return m;
  }
  function box(w, h, d, color, x, y, z) { return M(new THREE.BoxGeometry(w, h, d), mat(color), x, y, z); }
  function cyl(rt, rb, h, color, x, y, z, seg) { return M(new THREE.CylinderGeometry(rt, rb, h, seg || 20), mat(color), x, y, z); }
  function sph(r, color, x, y, z, w, h) { return M(new THREE.SphereGeometry(r, w || 18, h || 14), mat(color), x, y, z); }
  function disposeGroup(g) {
    g.traverse(o => {
      if (o.geometry) { try { o.geometry.dispose(); } catch (e) {} }
      const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      ms.forEach(m => { if (m.map) { try { m.map.dispose(); } catch (e) {} } try { m.dispose(); } catch (e) {} });
    });
  }

  /* ================= Canvas 贴图 ================= */
  function plaqueTexture() {
    const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 300;
    const g = cv.getContext("2d");
    g.fillStyle = "#8a4a26"; g.fillRect(0, 0, 1024, 300);           // 匾框
    g.fillStyle = "#f6ecd4"; g.fillRect(22, 22, 980, 256);          // 匾心
    g.strokeStyle = "#c9a25e"; g.lineWidth = 6; g.strokeRect(40, 40, 944, 220);
    g.fillStyle = "#2a2018"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "700 150px 'Kaiti SC','STKaiti','KaiTi',serif";
    const chars = ["天", "道", "酬", "勤"];
    chars.forEach((ch, i) => g.fillText(ch, 230 + i * 190, 160));
    g.font = "36px 'Kaiti SC','STKaiti',serif"; g.fillStyle = "#7a3020";
    g.fillText("右军", 950, 90);
    g.fillStyle = "#a33"; g.fillRect(928, 200, 44, 44);             // 印章
    g.fillStyle = "#f6ecd4"; g.font = "24px serif"; g.fillText("勤", 950, 222);
    return new THREE.CanvasTexture(cv);
  }
  function windowTexture() {
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 384;
    const g = cv.getContext("2d");
    g.fillStyle = "#fdf3da"; g.fillRect(0, 0, 512, 384);            // 窗纸
    g.strokeStyle = "#8a5a2e"; g.lineWidth = 14; g.strokeRect(7, 7, 498, 370);
    g.lineWidth = 8;
    for (let x = 1; x <= 3; x++) { g.beginPath(); g.moveTo(x * 128, 7); g.lineTo(x * 128, 377); g.stroke(); }
    for (let y = 1; y <= 2; y++) { g.beginPath(); g.moveTo(7, y * 128); g.lineTo(505, y * 128); g.stroke(); }
    g.lineWidth = 5;
    [64, 192, 320, 448].forEach(x => { g.strokeRect(x - 34, 96, 68, 68); g.strokeRect(x - 34, 224, 68, 68); });
    return new THREE.CanvasTexture(cv);
  }
  function doorTexture() {
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 512;
    const g = cv.getContext("2d");
    g.fillStyle = "#c8914f"; g.fillRect(0, 0, 256, 512);
    g.strokeStyle = "#8a5a2e"; g.lineWidth = 10; g.strokeRect(5, 5, 246, 502);
    g.lineWidth = 6;
    for (let y = 30; y < 480; y += 56) { g.beginPath(); g.moveTo(30, y); g.lineTo(226, y); g.stroke(); }
    g.beginPath(); g.moveTo(128, 5); g.lineTo(128, 507); g.stroke();
    return new THREE.CanvasTexture(cv);
  }
  function floorTexture() {
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 256;
    const g = cv.getContext("2d");
    g.fillStyle = "#e9d6b2"; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "#cdb891"; g.lineWidth = 3;
    g.strokeRect(0, 0, 256, 256); g.strokeRect(128, 0, 128, 128); g.strokeRect(0, 128, 128, 128);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5);
    return t;
  }
  function zzzTexture() {
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 128;
    const g = cv.getContext("2d");
    g.fillStyle = "#4a6fa8"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "700 92px sans-serif"; g.fillText("Z", 64, 68);
    return new THREE.CanvasTexture(cv);
  }
  function scrollTexture() {
    /* ★v20261022c 右墙挂轴：水墨远山+孤舟（贴参考图书房） */
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 448;
    const g = cv.getContext("2d");
    g.fillStyle = "#f6f0dd"; g.fillRect(0, 0, 256, 448);
    g.strokeStyle = "rgba(96,96,108,.85)";
    for (let layer = 0; layer < 3; layer++) {
      g.lineWidth = 2.6 - layer * 0.7;
      g.beginPath();
      const base = 280 - layer * 44;
      g.moveTo(12, base);
      g.bezierCurveTo(62, base - 62 - layer * 10, 102, base + 14, 128, base - 26);
      g.bezierCurveTo(162, base - 64, 212, base + 6, 244, base - 42);
      g.stroke();
    }
    g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(92, 322); g.quadraticCurveTo(128, 314, 164, 322); g.stroke();
    g.beginPath(); g.moveTo(128, 322); g.lineTo(128, 306); g.stroke();
    g.fillStyle = "#a03a2e"; g.fillRect(112, 392, 32, 32);
    g.fillStyle = "#f6f0dd"; g.font = "20px serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("勤", 128, 408);
    return new THREE.CanvasTexture(cv);
  }

  /* ================= 角色（Q版坐姿） ================= */
  function buildCharacter(gender) {
    const female = gender !== "男";
    const root = new THREE.Group();
    const bandC = female ? C.bandF : C.bandM;
    const skirtC = female ? C.skirtF : C.pantsM;
    const beltC = female ? C.beltF : C.beltM;

    /* —— 下身（铺地裙 / 袴）—— */
    if (female) {
      const skirt = cyl(0.19, 0.52, 0.34, skirtC, 0, 0.17, 0, 24);
      skirt.geometry.translate(0, 0, 0);
      root.add(skirt);
      root.add(cyl(0.19, 0.30, 0.14, skirtC, 0, 0.40, 0, 24)); // 腰裙过渡
      /* ★v20261022c 腰后双飘带（贴参考图） */
      const rbM = mat(bandF, { side: THREE.DoubleSide });
      [[-0.09, 0.16], [0.08, -0.12]].forEach(([bx, rot]) => {
        const rb = M(new THREE.BoxGeometry(0.045, 0.34, 0.008), rbM, bx, 0.16, -0.24);
        rb.rotation.set(0.18, 0, rot); root.add(rb);
      });
    } else {
      root.add(cyl(0.17, 0.21, 0.30, skirtC, -0.10, 0.18, 0.02, 18)); // 左袴
      root.add(cyl(0.17, 0.21, 0.30, skirtC, 0.10, 0.18, 0.02, 18));  // 右袴
      root.add(cyl(0.19, 0.22, 0.16, skirtC, 0, 0.38, 0, 20));        // 裆部
    }
    /* 鞋尖 */
    root.add(sph(0.055, 0xe8d8b8, -0.10, 0.04, 0.16, 12, 10));
    root.add(sph(0.055, 0xe8d8b8, 0.10, 0.04, 0.16, 12, 10));

    /* —— 上身组（pivot 在腰，供趴睡前倾）—— */
    const torso = new THREE.Group(); torso.position.set(0, 0.5, 0); root.add(torso);
    const gownM = mat(C.gown);
    torso.add(M(new THREE.CylinderGeometry(0.17, 0.215, 0.40, 22), gownM, 0, 0.20, 0));       // 上襦
    torso.add(M(new THREE.CylinderGeometry(0.10, 0.17, 0.10, 22), gownM, 0, 0.44, 0));        // 肩
    /* 交领 V（两条斜条） */
    const colM = mat(0xd9c8a2);
    const col1 = M(new THREE.BoxGeometry(0.035, 0.24, 0.012), colM, -0.05, 0.30, 0.185); col1.rotation.z = 0.65; torso.add(col1);
    const col2 = M(new THREE.BoxGeometry(0.035, 0.24, 0.012), colM, 0.05, 0.30, 0.185); col2.rotation.z = -0.65; torso.add(col2);
    /* 腰带 + 结 + 流苏 */
    const belt = M(new THREE.TorusGeometry(0.185, 0.022, 10, 24), mat(beltC), 0, 0.06, 0);
    belt.rotation.x = Math.PI / 2; torso.add(belt);
    torso.add(sph(0.026, beltC, 0, 0.055, 0.19, 10, 8));
    const tas = cyl(0.012, 0.012, 0.13, beltC, 0, -0.03, 0.19, 8); torso.add(tas);
    torso.add(sph(0.02, 0xf0e2c0, 0, 0.035, 0.19, 8, 8));

    /* —— 手臂（肩部 pivot）—— */
    function arm(side, withBrush) {
      const g = new THREE.Group(); g.position.set(side * 0.165, 0.40, 0); torso.add(g);
      const upper = M(new THREE.CylinderGeometry(0.052, 0.062, 0.22, 14), gownM, 0, -0.11, 0); g.add(upper);
      const fore = new THREE.Group(); fore.position.set(0, -0.21, 0); g.add(fore);
      fore.add(M(new THREE.CylinderGeometry(0.048, 0.055, 0.20, 14), gownM, 0, -0.10, 0));
      const cuff = M(new THREE.TorusGeometry(0.055, 0.014, 8, 16), mat(0xfdf8ec), 0, -0.19, 0); cuff.rotation.x = Math.PI / 2; fore.add(cuff);
      const hand = sph(0.038, C.skin, 0, -0.235, 0.01, 12, 10); fore.add(hand);
      if (withBrush) {
        const brush = new THREE.Group(); brush.position.set(0, -0.235, 0.02); fore.add(brush);
        brush.add(M(new THREE.CylinderGeometry(0.008, 0.008, 0.20, 8), mat(0xb58a4e), 0, 0.06, 0.03));
        brush.children[0].rotation.x = 1.15;
        const tip = M(new THREE.ConeGeometry(0.014, 0.05, 8), mat(0x2a2a2a), 0, -0.05, 0.115);
        tip.rotation.x = 1.15; brush.add(tip);
      }
      g.rotation.x = 0.85; fore.rotation.x = 0.55;   // 手落到桌面
      return { g, fore };
    }
    const armL = arm(-1, false), armR = arm(1, true);

    /* —— 头（pivot 在脖）—— */
    const neck = new THREE.Group(); neck.position.set(0, 0.50, 0); torso.add(neck);
    neck.add(cyl(0.045, 0.05, 0.07, C.skin, 0, 0.03, 0, 12));
    const head = new THREE.Group(); head.position.set(0, 0.075, 0); neck.add(head);
    const face = sph(0.155, C.skin, 0, 0.09, 0, 26, 20); face.scale.set(1, 0.96, 0.96); head.add(face);
    /* 头发：后脑勺壳 + 刘海 */
    const hairM = mat(C.hair, { roughness: 0.6 });
    const hairBack = M(new THREE.SphereGeometry(0.16, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.095, -0.012);
    head.add(hairBack);
    const bang = M(new THREE.SphereGeometry(0.152, 24, 12, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.24), hairM, 0, 0.10, 0.008);
    bang.scale.set(1, 0.9, 1); head.add(bang);
    /* 眼睛（黑豆豆，眨眼 scaleY）+ 高光 + 腮红 + 嘴 */
    const eyeM = mat(0x2a2018, { roughness: 0.35 });
    const eyeL = sph(0.021, 0x2a2018, -0.058, 0.085, 0.135, 12, 10); eyeL.scale.set(1, 1.35, 0.6);
    const eyeR = sph(0.021, 0x2a2018, 0.058, 0.085, 0.135, 12, 10); eyeR.scale.set(1, 1.35, 0.6);
    head.add(eyeL, eyeR);
    const hlM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const hl1 = M(new THREE.SphereGeometry(0.006, 8, 6), hlM, -0.052, 0.095, 0.150); head.add(hl1);
    const hl2 = M(new THREE.SphereGeometry(0.006, 8, 6), hlM, 0.064, 0.095, 0.150); head.add(hl2);
    const blushM = new THREE.MeshBasicMaterial({ color: C.blush, transparent: true, opacity: 0.55 });
    const b1 = M(new THREE.CircleGeometry(0.026, 12), blushM, -0.095, 0.045, 0.128); b1.rotation.y = 0.5; head.add(b1);
    const b2 = M(new THREE.CircleGeometry(0.026, 12), blushM, 0.095, 0.045, 0.128); b2.rotation.y = -0.5; head.add(b2);
    const mouth = M(new THREE.TorusGeometry(0.022, 0.006, 8, 12, Math.PI * 0.85), mat(0xb5654a), 0, 0.022, 0.148);
    mouth.rotation.set(0.15, 0, Math.PI + Math.PI * 0.075); head.add(mouth);
    /* 发髻 / 发带 / 簪 */
    if (female) {
      const bun = sph(0.085, C.hair, 0, 0.235, -0.02, 18, 14); bun.scale.set(1, 0.85, 0.9); head.add(bun);
      const band = M(new THREE.TorusGeometry(0.062, 0.016, 10, 20), mat(bandF), 0, 0.185, 0.01); band.rotation.x = Math.PI / 2.25; head.add(band);
      const pin = cyl(0.007, 0.007, 0.16, 0xd9a441, 0.07, 0.245, 0.02, 8); pin.rotation.z = -1.25; head.add(pin);
      head.add(sph(0.014, 0xf0c060, 0.145, 0.275, 0.02, 8, 8));
      /* 垂在脑后的小辫 */
      const tail = cyl(0.035, 0.012, 0.20, C.hair, 0, 0.02, -0.15, 10); tail.rotation.x = 0.25; head.add(tail);
      const tie = M(new THREE.TorusGeometry(0.036, 0.010, 8, 14), mat(bandF), 0, 0.10, -0.155); tie.rotation.x = 0.25; head.add(tie);
    } else {
      const tuft = sph(0.052, C.hair, 0, 0.225, -0.03, 14, 12); tuft.scale.set(1, 0.8, 0.9); head.add(tuft);
      const band = M(new THREE.TorusGeometry(0.048, 0.014, 10, 18), mat(bandC), 0, 0.192, -0.005); band.rotation.x = Math.PI / 2.3; head.add(band);
      const pin = cyl(0.006, 0.006, 0.13, 0xd9a441, 0.05, 0.24, -0.01, 8); pin.rotation.z = -1.2; head.add(pin);
    }

    /* 接触假阴影 */
    const shadow = M(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.13 }), 0, 0.006, 0.02);
    shadow.rotation.x = -Math.PI / 2; root.add(shadow);

    return { root, torso, neck, head, eyeL, eyeR, armL, armR, female };
  }

  /* ================= 书斋场景 ================= */
  function buildRoom(scene) {
    const R = 4.1, H = 4.6;
    /* 地板 + 地毯 */
    const floor = M(new THREE.PlaneGeometry(R * 2, R * 2), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 1 }), 0, 0, 0);
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const rug = M(new THREE.CircleGeometry(1.9, 36), mat(0xe4c996, { roughness: 1 }), 0, 0.008, 0.1);
    rug.rotation.x = -Math.PI / 2; scene.add(rug);
    const rugIn = M(new THREE.CircleGeometry(1.7, 36), mat(0xefe0bd, { roughness: 1 }), 0, 0.010, 0.1);
    rugIn.rotation.x = -Math.PI / 2; scene.add(rugIn);
    /* 四墙（盒内面） */
    const wallM = mat(C.wall, { roughness: 1 });
    const room = M(new THREE.BoxGeometry(R * 2, H, R * 2), wallM); room.material.side = THREE.BackSide;
    room.position.y = H / 2; scene.add(room);
    /* 护墙板（四面腰线） */
    const skirtM = mat(0x8a5a34);
    [[0, -R + 0.03, R * 2, 0.06], [0, R - 0.03, R * 2, 0.06]].forEach(([x, z, w]) => scene.add(box(w, 0.5, 0.06, 0x9a6a40, x, 0.25, z)));
    [[-R + 0.03, 0], [R - 0.03, 0]].forEach(([x]) => { const s = box(0.06, 0.5, R * 2 - 0.12, 0x9a6a40, x, 0.25, 0); scene.add(s); });
    /* 房梁 */
    scene.add(box(R * 2, 0.22, 0.26, C.woodD, 0, H - 0.15, -R + 0.5));
    scene.add(box(R * 2, 0.22, 0.26, C.woodD, 0, H - 0.15, R - 0.5));
    scene.add(box(0.26, H, 0.26, C.woodD, -R + 0.5, H / 2, -R + 0.5));
    scene.add(box(0.26, H, 0.26, C.woodD, R - 0.5, H / 2, -R + 0.5));
    /* ★v20261022c 匾额「天道酬勤」加大加醒目（用户点名必须挂上）+ 两侧挂穗 */
    const plaque = M(new THREE.PlaneGeometry(3.1, 0.9), new THREE.MeshStandardMaterial({ map: plaqueTexture(), roughness: 0.85 }), 0, 3.42, -R + 0.09);
    scene.add(plaque);
    scene.add(box(3.3, 0.1, 0.08, C.woodD, 0, 3.92, -R + 0.08));   // 匾顶横梁
    [[-1.62], [1.62]].forEach(([px]) => {
      scene.add(cyl(0.012, 0.012, 0.42, 0xa33, px, 3.24, -R + 0.08, 6));   // 红穗绳
      scene.add(M(new THREE.ConeGeometry(0.035, 0.14, 8), mat(0xb5452e), px, 2.96, -R + 0.08));
    });
    /* 左墙木格窗 ×2（参考图：连排格扇窗，暖光透入） */
    const winMat = new THREE.MeshBasicMaterial({ map: windowTexture(), color: 0xfff2cf });
    [[-0.9], [1.7]].forEach(([wz]) => {
      const win = M(new THREE.PlaneGeometry(2.2, 1.8), winMat, -R + 0.06, 2.35, wz);
      win.rotation.y = Math.PI / 2; scene.add(win);
      scene.add(box(0.1, 1.96, 2.36, C.woodD, -R + 0.05, 2.35, wz));
    });
    /* 右墙格扇门 + 挂轴 */
    const door = M(new THREE.PlaneGeometry(1.7, 3.2), new THREE.MeshStandardMaterial({ map: doorTexture(), roughness: 0.95 }), R - 0.06, 1.6, 0.6);
    door.rotation.y = -Math.PI / 2; scene.add(door);
    const scroll = M(new THREE.PlaneGeometry(1.05, 1.85), new THREE.MeshStandardMaterial({ map: scrollTexture(), roughness: 0.95 }), R - 0.06, 2.3, -1.5);
    scroll.rotation.y = -Math.PI / 2; scene.add(scroll);
    const rod = cyl(0.035, 0.035, 1.15, C.woodD, R - 0.09, 3.26, -1.5, 10);   // 挂轴天杆
    rod.rotation.x = Math.PI / 2; scene.add(rod);
    scene.add(cyl(0.03, 0.03, 1.15, C.woodD, R - 0.09, 1.34, -1.5, 10));      // 地杆
    scene.add(cyl(0.012, 0.012, 0.16, 0xa33, R - 0.11, 1.22, -1.5, 6));       // 轴头穗绳
    /* 书架 ×2 */
    function shelf(x, z) {
      const g = new THREE.Group(); g.position.set(x, 0, z); if (x < 0) g.rotation.y = 0; scene.add(g);
      const fM = mat(0xb9845a);
      [[-0.62], [0.62]].forEach(([px]) => g.add(box(0.07, 2.1, 0.46, 0xb9845a, px, 1.05, 0)));
      [[0.3], [0.85], [1.4], [1.95]].forEach(([py]) => g.add(box(1.3, 0.055, 0.46, 0xb9845a, 0, py, 0)));
      g.add(box(1.3, 0.07, 0.46, 0xb9845a, 0, 0.035, 0));
      const bookC = [0xe8ddc0, 0x9cc4dd, 0xc06a4a, 0xd9b46a, 0x7a9a78, 0xe0c8a8];
      let seed = 7 + Math.round(x * 3);
      const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
      [0.36, 0.91, 1.46].forEach(py => {
        let bx = -0.52;
        while (bx < 0.42) {
          const bw = 0.07 + rnd() * 0.06, bh = 0.26 + rnd() * 0.12;
          g.add(box(bw, bh, 0.30, bookC[Math.floor(rnd() * bookC.length)], bx + bw / 2, py + 0.03 + bh / 2, 0));
          bx += bw + 0.015;
          if (rnd() > 0.75) bx += 0.10;   // 留点空隙
        }
      });
    }
    shelf(-2.75, -3.35); shelf(2.75, -3.35);
    /* 盆栽松 ×2 */
    function plant(x, z, s) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
      const pot = cyl(0.16, 0.11, 0.2, 0x8a4a30, 0, 0.1, 0, 16); g.add(pot);
      g.add(cyl(0.14, 0.14, 0.03, 0x5a3a24, 0, 0.21, 0, 16));
      g.add(cyl(0.025, 0.035, 0.34, 0x6a4a30, 0, 0.38, 0, 8));           // 主干
      const leafM = mat(0x4a7a42, { roughness: 1 });
      [[0, 0.62, 0, 0.16], [0.1, 0.52, 0.05, 0.11], [-0.1, 0.55, -0.04, 0.12], [0.03, 0.72, -0.02, 0.09]]
        .forEach(([px, py, pz, r]) => g.add(M(new THREE.SphereGeometry(r, 12, 10), leafM, px, py, pz)));
      const table = box(0.5, 0.05, 0.5, C.woodM, 0, 0.025, 0); g.add(table);
      [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([px, pz]) => g.add(box(0.05, 0.42, 0.05, C.woodM, px, 0.21, pz)));
    }
    plant(-2.7, -1.4, 1.15); plant(2.7, -1.4, 1.3);
  }

  function buildFurniture(scene) {
    /* —— 书案（仿参考图：厚桌面 + 弯腿感）—— */
    const desk = new THREE.Group(); scene.add(desk);
    desk.add(box(1.9, 0.09, 0.85, C.woodL, 0, 0.755, 0.62));
    desk.add(box(1.9, 0.05, 0.10, C.woodM, 0, 0.665, 0.62 + 0.36));   // 牙板前
    desk.add(box(1.9, 0.05, 0.10, C.woodM, 0, 0.665, 0.62 - 0.36));
    [[-0.82, 0.30], [0.82, 0.30], [-0.82, -0.30], [0.82, -0.30]].forEach(([px, pz]) =>
      desk.add(box(0.10, 0.72, 0.12, C.woodM, px, 0.36, 0.62 + pz)));
    /* 案上文房 */
    const paper = M(new THREE.PlaneGeometry(0.62, 0.44), mat(C.paper, { roughness: 1 }), 0.05, 0.803, 0.60);
    paper.rotation.x = -Math.PI / 2; desk.add(paper);   // 摊开的书纸
    desk.add(cyl(0.10, 0.115, 0.045, 0x3a3a3a, -0.42, 0.828, 0.42, 20));   // 砚台
    desk.add(cyl(0.075, 0.075, 0.14, 0x9a6a40, -0.55, 0.875, 0.85, 14));   // 笔筒
    for (let i = 0; i < 3; i++) {
      const br = cyl(0.008, 0.008, 0.26, 0xd9a441, -0.57 + i * 0.055, 1.02, 0.85, 6);
      br.rotation.z = (i - 1) * 0.16; desk.add(br);
      desk.add(M(new THREE.ConeGeometry(0.013, 0.05, 6), mat(0x2a2a2a), -0.57 + i * 0.055 - (i - 1) * 0.03, 1.14, 0.85));
    }
    desk.add(box(0.30, 0.035, 0.06, 0x5a4a6a, 0.5, 0.822, 0.40));          // 镇纸
    [[-0.28, 0.95], [-0.10, 0.98]].forEach(([px, py], i) => {              // 卷轴×2
      const sc = cyl(0.035, 0.035, 0.5, 0xe8d8b0, px, 0.80, i ? 0.98 : 0.92, 12);
      sc.rotation.z = Math.PI / 2; desk.add(sc);
    });
    /* 笔架（小）*/
    desk.add(box(0.04, 0.16, 0.04, C.woodD, -0.2, 0.88, 0.38));
    desk.add(box(0.04, 0.16, 0.04, C.woodD, 0.06, 0.88, 0.38));
    desk.add(box(0.14, 0.03, 0.04, C.woodD, -0.07, 0.955, 0.38));

    /* —— 圈椅（人物坐）—— */
    const chair = new THREE.Group(); scene.add(chair);
    chair.add(box(0.46, 0.06, 0.44, C.woodL, 0, 0.42, -0.28));
    [[-0.20, -0.10], [0.20, -0.10], [-0.20, -0.44], [0.20, -0.44]].forEach(([px, pz]) =>
      chair.add(box(0.06, 0.42, 0.06, C.woodM, px, 0.21, -0.28 + pz * 0 + pz)));
    /* 靠背板 + 圈 */
    const back = box(0.42, 0.5, 0.05, C.woodL, 0, 0.72, -0.47); chair.add(back);
    const ring = M(new THREE.TorusGeometry(0.23, 0.024, 10, 24, Math.PI), mat(C.woodL), 0, 0.72, -0.46);
    ring.rotation.y = Math.PI / 2; chair.add(ring);
    /* 扶手 */
    [[-0.23], [0.23]].forEach(([px]) => {
      const arm = box(0.05, 0.04, 0.34, C.woodM, px, 0.62, -0.30);
      arm.rotation.x = -0.25; chair.add(arm);
      chair.add(box(0.05, 0.18, 0.05, C.woodM, px, 0.52, -0.14));
    });

    /* —— 煤油灯（案角）—— */
    const lamp = new THREE.Group(); lamp.position.set(0.72, 0.80, 0.35); scene.add(lamp);
    lamp.add(cyl(0.055, 0.075, 0.03, C.brass, 0, 0.015, 0, 14));
    lamp.add(cyl(0.012, 0.012, 0.09, C.brass, 0, 0.07, 0, 8));
    const glass = M(new THREE.SphereGeometry(0.055, 14, 12), new THREE.MeshStandardMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.35, roughness: 0.2 }), 0, 0.15, 0);
    lamp.add(glass);
    const flame = M(new THREE.ConeGeometry(0.018, 0.05, 8), new THREE.MeshBasicMaterial({ color: C.flame }), 0, 0.15, 0);
    lamp.add(flame);
    lamp.add(cyl(0.03, 0.045, 0.015, C.brass, 0, 0.185, 0, 12));
    return { lamp, flame };
  }

  /* ================= 页面 ================= */
  let _stop = null;        // 当前运行中的 3D 停止器
  let _swapCharacter = null; // ★v20261022c 性别切换：只换小人 mesh，不重建场景
  function stop3D() { if (_stop) { try { _stop(); } catch (e) {} _stop = null; _swapCharacter = null; } }

  window.MODULES.imperial = {
    title: "科举进度", icon: "imperial",
    render(body) {
      stop3D();
      const DB = window.DB, UI = window.UI;
      const prof = DB.state.profile || (DB.state.profile = {});
      const gender = prof.gender === "女" ? "女" : "男";

      body.innerHTML = `
      <div class="imp-page">
        <div class="imp-topbar">
          <button class="btn sm ghost" id="impBack">← 返回</button>
          <div class="imp-title">科举进度 · 书斋养成</div>
          <button class="btn sm ghost" id="impEdit">✏️ 编辑资料</button>
        </div>
        <div class="imp-stage-wrap">
          <div id="impStage" class="imp-stage"></div>
          <div class="imp-phase" id="impPhase"></div>
          <div class="imp-bubble" id="impBubble"></div>
          <div class="imp-goodnight" id="impNight">晚安 💤</div>
          <label class="imp-gender">小人
            <select id="impGender">
              <option value="男"${gender === "男" ? " selected" : ""}>男</option>
              <option value="女"${gender === "女" ? " selected" : ""}>女</option>
            </select>
          </label>
          <div class="imp-hint">🖐 单指拖动 360° 旋转 · 双指/滚轮缩放</div>
        </div>
        <div class="card imp-level" id="impLevel"></div>
        <div id="impStats"></div>
      </div>`;

      body.querySelector("#impBack").onclick = () => { stop3D(); location.hash = "#/countdown"; };
      /* ★v20261022c 性别切换只重建小人（不重启页面/场景）——重启整页又慢又闪，
         且 iOS 上反复重建 WebGL 上下文会触发「只能看一次」 bug */
      body.querySelector("#impGender").onchange = (e) => {
        prof.gender = e.target.value; DB.save();
        UI.toast("已切换为" + e.target.value + "版小人");
        if (_swapCharacter) { try { _swapCharacter(prof.gender); } catch (er) { window.MODULES.imperial.render(body); } }
        else window.MODULES.imperial.render(body);
      };
      body.querySelector("#impEdit").onclick = () => openProfile(body);

      renderLevelCard(body);
      /* 学习统计整体搬进来 */
      const statsBox = body.querySelector("#impStats");
      try { window.MODULES.stats.render(statsBox); }
      catch (e) { statsBox.innerHTML = '<div class="card muted">学习统计加载失败：' + UI.esc(e.message) + "</div>"; }

      init3D(body, gender);
    }
  };

  /* ---- 等级卡 ---- */
  function renderLevelCard(body) {
    const KK = window.KGKingke || {};
    const LEVELS = KK.LEVELS || [];
    const idx = KK.levelIndex ? KK.levelIndex() : 0;
    const total = KK.treeTotal ? KK.treeTotal() : 1;
    const done = KK.doneCount ? KK.doneCount() : 0;
    const L = LEVELS[idx] || { name: "秀才" };
    const next = LEVELS[idx + 1];
    let pct = 100;
    if (next) pct = Math.max(0, Math.min(100, (done / total - L.p) / (next.p - L.p) * 100));
    const row = LEVELS.map((l, i) => `<span class="imp-lv ${i === idx ? "cur" : (i < idx ? "done" : "")}">${l.name}</span>`).join("");
    body.querySelector("#impLevel").innerHTML = `
      <div class="spread" style="align-items:baseline">
        <div><span class="imp-lv-now">${L.name}</span><span class="muted small" style="margin-left:8px">已刷 ${done} 题 / 题库 ${total}</span></div>
        <span class="muted small">${next ? "距「" + next.name + "」还差 " + Math.max(0, Math.ceil(total * next.p - done)) + " 题" : "状元及第 🎉"}</span>
      </div>
      <div class="progress-bar" style="margin:10px 0 12px"><i style="width:${pct}%"></i></div>
      <div class="imp-lvs">${row}</div>`;
  }

  /* ---- 编辑资料 ---- */
  function openProfile(body) {
    const DB = window.DB, UI = window.UI;
    const prof = DB.state.profile || (DB.state.profile = {});
    const mask = document.createElement("div");
    mask.className = "imp-mask";
    mask.innerHTML = `<div class="imp-modal">
      <h3>✏️ 编辑个人信息</h3>
      <label class="fld">昵称<input id="ipNick" value="${UI.esc(prof.nickname || "")}" maxlength="20" placeholder="例如：小明"/></label>
      <label class="fld">性别（决定书斋小人形象）
        <select id="ipGender">
          <option value="男"${prof.gender !== "女" ? " selected" : ""}>男</option>
          <option value="女"${prof.gender === "女" ? " selected" : ""}>女</option>
        </select>
      </label>
      <label class="fld">生日<input id="ipBirth" type="date" value="${UI.esc(prof.birthday || "")}"/></label>
      <label class="fld">个性签名<input id="ipSig" value="${UI.esc(prof.signature || "")}" maxlength="40" placeholder="例如：上岸倒计时，冲！"/></label>
      <div class="row" style="margin-top:14px">
        <button class="btn primary" id="ipSave">💾 保存</button>
        <button class="btn ghost" id="ipCancel">取消</button>
      </div></div>`;
    document.body.appendChild(mask);
    const close = () => mask.remove();
    mask.querySelector("#ipCancel").onclick = close;
    mask.onclick = (e) => { if (e.target === mask) close(); };
    mask.querySelector("#ipSave").onclick = () => {
      prof.nickname = mask.querySelector("#ipNick").value.trim();
      prof.gender = mask.querySelector("#ipGender").value;
      prof.birthday = mask.querySelector("#ipBirth").value;
      prof.signature = mask.querySelector("#ipSig").value.trim();
      DB.save();
      UI.toast("已保存，" + (prof.nickname || "考生") + "加油！");
      close();
      window.MODULES.imperial.render(body);
    };
  }

  /* ================= 3D 初始化 ================= */
  function init3D(body, gender) {
    const holder = body.querySelector("#impStage");
    if (typeof THREE === "undefined") {
      holder.innerHTML = '<div class="card muted" style="margin:20px;padding:24px;text-align:center">3D 引擎（three.min.js）加载失败，请检查网络后刷新。</div>';
      return;
    }
    const DB = window.DB;
    let W = holder.clientWidth || 640, H = Math.max(320, Math.min(460, Math.round(W * 0.62)));
    holder.style.height = H + "px";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x241d15);
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 60);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H);
    holder.appendChild(renderer.domElement);

    /* 灯光 */
    const hemi = new THREE.HemisphereLight(0xfff4dd, 0x8a6a48, 0.9); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.6); sun.position.set(-5, 6, 1.5); scene.add(sun);
    const lampLight = new THREE.PointLight(0xffa04a, 0, 6, 2); lampLight.position.set(0.72, 1.05, 0.97); scene.add(lampLight);

    buildRoom(scene);
    const furn = buildFurniture(scene);
    let ch = buildCharacter(gender);
    ch.root.position.set(0, 0, -0.05);
    scene.add(ch.root);

    /* ★v20261022c 性别热切换：只换小人 mesh（WebGL 上下文/场景/相机全保留） */
    _swapCharacter = (g) => {
      const old = ch;
      scene.remove(old.root);
      try { disposeGroup(old.root); } catch (e) {}
      ch = buildCharacter(g);
      ch.root.position.set(0, 0, -0.05 + 0.30 * sleepAmt);
      scene.add(ch.root);
    };

    /* Zzz 精灵 */
    const zzzTex = zzzTexture();
    const zzZs = [];
    for (let i = 0; i < 3; i++) {
      const sm = new THREE.SpriteMaterial({ map: zzzTex, transparent: true, opacity: 0 });
      const sp = new THREE.Sprite(sm);
      sp.scale.setScalar(0.14);
      sp.position.set(0.18, 1.35, 0.15);
      scene.add(sp); zzZs.push(sp);
    }

    /* 相机轨道（自写 orbit：azimuth / polar / radius + 惯性 + 双指缩放） */
    const target = new THREE.Vector3(0, 0.95, 0.25);
    let theta = 0.55, phi = 1.12, radius = 4.3;
    let vTheta = 0, vPhi = 0, dragging = false, lastX = 0, lastY = 0;
    const touches = new Map();
    let pinchD = 0;
    const elc = renderer.domElement;
    elc.style.touchAction = "none";
    elc.addEventListener("pointerdown", (e) => {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 1) { dragging = true; lastX = e.clientX; lastY = e.clientY; vTheta = vPhi = 0; }
      if (touches.size === 2) {
        const a = [...touches.values()];
        pinchD = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      }
      elc.setPointerCapture(e.pointerId);
    });
    elc.addEventListener("pointermove", (e) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        const a = [...touches.values()];
        const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        if (pinchD > 0) radius = Math.min(8, Math.max(2.4, radius * pinchD / d));
        pinchD = d; return;
      }
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      theta -= dx * 0.0062; phi -= dy * 0.0052;
      vTheta = -dx * 0.0062; vPhi = -dy * 0.0052;
      phi = Math.min(1.45, Math.max(0.28, phi));
    });
    const endP = (e) => { touches.delete(e.pointerId); if (touches.size === 0) dragging = false; if (touches.size < 2) pinchD = 0; };
    elc.addEventListener("pointerup", endP); elc.addEventListener("pointercancel", endP);
    elc.addEventListener("wheel", (e) => { e.preventDefault(); radius = Math.min(8, Math.max(2.4, radius + e.deltaY * 0.0022)); }, { passive: false });

    /* 昼夜 + 动画循环 */
    const phaseEl = body.querySelector("#impPhase");
    const bubbleEl = body.querySelector("#impBubble");
    const nightEl = body.querySelector("#impNight");
    const clock = new THREE.Clock();
    let sleepAmt = phaseAt(new Date()).sleep ? 1 : 0;   // 0 学习 ↔ 1 趴睡 的平滑值
    let wasSleep = !!sleepAmt, nightShown = !!sleepAmt, bubbleTimer = 0, nightTimer = 0;
    function sayBubble(txt) {
      if (!bubbleEl) return;
      bubbleEl.textContent = txt;
      bubbleEl.classList.add("on");
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => bubbleEl.classList.remove("on"), 3400);
    }
    function showNight() {
      if (!nightEl) return;
      nightEl.classList.add("on");
      clearTimeout(nightTimer);
      nightTimer = setTimeout(() => nightEl.classList.remove("on"), 3000);
    }
    let raf = 0, phaseTimer = 0, dead = false;

    function frame() {
      if (dead) return;
      if (!holder.isConnected) { cleanup(); return; }
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, clock.getDelta());
      const t = clock.elapsedTime;

      /* —— 昼夜目标值 + 平滑追踪 —— */
      const now = new Date();
      const ph = phaseAt(now);
      phaseTimer += dt;
      if (phaseTimer > 4) { phaseTimer = 0; phaseEl.innerHTML = `<b>${ph.label}</b><span>${ph.sub}</span>`; }
      hemi.intensity += (ph.amb - hemi.intensity) * Math.min(1, dt * 2.5);
      sun.intensity += (ph.sun - sun.intensity) * Math.min(1, dt * 2.5);
      sun.color.lerp(new THREE.Color(ph.sunC), Math.min(1, dt * 2.5));
      hemi.color.lerp(new THREE.Color(ph.sunC), Math.min(1, dt * 1.2));
      const flicker = 1 + Math.sin(t * 9.3) * 0.07 + Math.sin(t * 23.7) * 0.05;
      lampLight.intensity += (ph.lamp * 7 * flicker - lampLight.intensity) * Math.min(1, dt * 4);
      furn.flame.scale.y = 0.85 + Math.sin(t * 11) * 0.18;
      furn.flame.material.color.setHSL(0.07, 1, 0.55 + Math.sin(t * 13) * 0.05);
      /* 窗纸亮度跟太阳走 */
      const winMesh = scene.children.find(o => o.isMesh && o.material && o.material.map && o.material.color && o.material.map.image && o.material.map.image.width === 512);
      if (winMesh) winMesh.material.color.setScalar(0.25 + ph.sun / 1.6 * 0.75);

      /* —— 睡 / 醒 平滑过渡 + 叙事（v20261022c 用户定版：
         到点时先说「夜深了，我要休息了…」→ 慢慢趴下 → 趴平弹「晚安」字幕） —— */
      const wantSleep = ph.sleep ? 1 : 0;
      if (!wasSleep && wantSleep === 1 && sleepAmt < 0.1) {
        sayBubble(ph.key === "nap" ? "吃完午饭啦，我趴一会儿~" : "夜深了，我要休息了…");
      }
      if (wasSleep && wantSleep === 0) sayBubble("天亮啦，新的一天继续加油！");
      wasSleep = wantSleep === 1;
      sleepAmt += (wantSleep - sleepAmt) * Math.min(1, dt * 0.9);   // 慢慢趴下（约2秒）
      if (sleepAmt > 0.92 && !nightShown) { nightShown = true; showNight(); }
      if (sleepAmt < 0.3) nightShown = false;
      const isNapping = ph.key === "nap" || ph.key === "sleep";
      /* 趴睡姿势：前倾 + 整体向桌前移 + 头埋向手臂（修「像枷锁砍头」） */
      ch.torso.rotation.x = -1.32 * sleepAmt;
      ch.torso.position.y = 0.5 - 0.13 * sleepAmt;
      ch.root.position.z = -0.05 + 0.30 * sleepAmt;
      ch.root.position.y = -0.02 * sleepAmt;
      ch.head.rotation.x = 0.55 * sleepAmt;
      ch.neck.rotation.x = 0.20 * sleepAmt;

      /* —— 呼吸 —— */
      const brA = 0.012 + 0.03 * sleepAmt, brF = isNapping ? 1.1 : 2.1;
      ch.torso.scale.y = 1 + Math.sin(t * brF * 2 * Math.PI / (isNapping ? 3 : 2)) * brA;

      /* —— 写字 / 睡手（趴平后手臂前伸枕头下） —— */
      if (sleepAmt < 0.5) {
        const w = Math.sin(t * 5.2) * 0.10;
        ch.armR.g.rotation.x = 0.85 + w;
        ch.armR.fore.rotation.x = 0.55 + w * 0.7;
        ch.armL.g.rotation.x = 0.85 - w * 0.4;
        ch.head.rotation.z = Math.sin(t * 0.8) * 0.03;
        ch.head.rotation.y = Math.sin(t * 0.5) * 0.06;
      } else {
        ch.armR.g.rotation.x += (1.30 - ch.armR.g.rotation.x) * dt * 2.2;
        ch.armL.g.rotation.x += (1.30 - ch.armL.g.rotation.x) * dt * 2.2;
        ch.armR.fore.rotation.x += (0.85 - ch.armR.fore.rotation.x) * dt * 2.2;
        ch.armL.fore.rotation.x += (0.85 - ch.armL.fore.rotation.x) * dt * 2.2;
        ch.head.rotation.z *= 0.95; ch.head.rotation.y *= 0.95;
      }

      /* —— 眨眼（睡觉时不眨）—— */
      if (sleepAmt < 0.5) {
        const cyc = t % 3.4;
        const blink = cyc < 0.13 ? Math.max(0.08, Math.abs(cyc - 0.065) / 0.065) : 1;
        ch.eyeL.scale.y = 1.35 * blink; ch.eyeR.scale.y = 1.35 * blink;
      } else { ch.eyeL.scale.y = 0.1; ch.eyeR.scale.y = 0.1; }

      /* —— Zzz —— */
      zzZs.forEach((sp, i) => {
        const tt = ((t * 0.5) + i / 3) % 1;
        sp.position.set(0.16 + Math.sin((tt + i) * 5) * 0.05, 1.28 + tt * 0.5, 0.2);
        sp.material.opacity = sleepAmt * (1 - tt) * 0.9;
        sp.scale.setScalar(0.10 + tt * 0.10);
      });

      /* —— 相机 —— */
      if (!dragging) {
        theta += vTheta; phi = Math.min(1.45, Math.max(0.28, phi + vPhi));
        vTheta *= 0.92; vPhi *= 0.92;
      }
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta)
      );
      camera.lookAt(target);
      renderer.render(scene, camera);
    }

    function cleanup() {
      if (dead) return;
      dead = true; cancelAnimationFrame(raf);
      clearTimeout(bubbleTimer); clearTimeout(nightTimer);
      /* ★v20261022c 根治「只能看一次」：iOS 上 WebGL 上下文有硬上限（~8 个），
         之前只 dispose geometry，context 从不释放 → 进出两三次后新建 renderer 必失败。
         现在完整释放：material+texture+geometry → forceContextLoss → 移除 canvas。 */
      try {
        scene.traverse(o => {
          if (o.geometry) { try { o.geometry.dispose(); } catch (e) {} }
          const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
          mats.forEach(m => {
            if (m.map) { try { m.map.dispose(); } catch (e) {} }
            try { m.dispose(); } catch (e) {}
          });
        });
      } catch (e) {}
      try { zzZs.forEach(sp => { try { sp.material.dispose(); } catch (e) {} }); } catch (e) {}
      try { renderer.dispose(); } catch (e) {}
      try { renderer.forceContextLoss(); } catch (e) {}
      try { const cv = renderer.domElement; if (cv && cv.parentNode) cv.parentNode.removeChild(cv); } catch (e) {}
    }
    _stop = cleanup;
    phaseEl.innerHTML = "";
    frame();

    /* 自适应 */
    const ro = new ResizeObserver(() => {
      if (dead || !holder.isConnected) return;
      W = holder.clientWidth || W;
      H = Math.max(320, Math.min(460, Math.round(W * 0.62)));
      holder.style.height = H + "px";
      camera.aspect = W / H; camera.updateProjectionMatrix();
      renderer.setSize(W, H);
    });
    ro.observe(holder);
    const oldStop = _stop;
    _stop = () => { try { ro.disconnect(); } catch (e) {} oldStop(); };
  }

  /* ================= 左上角入口：点击 brand → 面板 ================= */
  function bindBrandEntry() {
    const logo = document.getElementById("kingkeLogo");
    const text = document.querySelector(".brand-text");
    if (!logo || logo.dataset.impBound) return;
    logo.dataset.impBound = "1";
    const open = (e) => {
      e.stopPropagation();
      const old = document.getElementById("impEntryMask"); if (old) old.remove();
      const mask = document.createElement("div");
      mask.id = "impEntryMask"; mask.className = "imp-mask";
      mask.innerHTML = `<div class="imp-modal small">
        <div class="imp-entry" id="ieGo">🎓<div><b>科举进度</b><span>书房小人 · 等级 · 学习统计</span></div><i>›</i></div>
        <div class="imp-entry" id="ieStats">📊<div><b>学习统计</b><span>时长 / 正确率趋势图表</span></div><i>›</i></div>
      </div>`;
      document.body.appendChild(mask);
      mask.onclick = (e2) => { if (e2.target === mask) mask.remove(); };
      mask.querySelector("#ieGo").onclick = () => { mask.remove(); location.hash = "#/imperial"; };
      mask.querySelector("#ieStats").onclick = () => { mask.remove(); location.hash = "#/stats"; };
    };
    logo.addEventListener("click", open);
    if (text && !text.dataset.impBound) { text.dataset.impBound = "1"; text.addEventListener("click", open); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindBrandEntry);
  else bindBrandEntry();
})();
