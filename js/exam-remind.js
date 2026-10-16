/* 考前提醒弹窗（v20261017a，用户死命令）
   规则：任何考试日期前 3 天内（含当天），打开 APP 弹窗提醒；
   早/中/晚各提醒一次（同一时段只提醒一次，跨时段再弹）。
   弹窗内容：考试名+日期+剩余天数、鼓励祝福语（随机）、文具清单；
   底部一行小字「点击任意处可关闭本弹窗」，也有关闭按钮；点击任意处关闭。 */
(function () {
  "use strict";
  function slotOf(h) { return h < 12 ? "morning" : (h < 18 ? "noon" : "evening"); }

  const BLESSINGS = [
    "乾坤未定，你我皆是黑马！",
    "你翻过的每一页书，都会变成考场上的从容！",
    "所有的深夜苦读，都是为这一刻蓄力——稳住，你能赢！",
    "愿你提笔从容、落笔生花，一战上岸！",
    "平常心，正常发挥，你就已经赢过大多数人了！",
    "星光不问赶路人，时光不负有心人。加油！"
  ];
  const SUPPLIES = [
    "📄 准考证（建议多打印 2 份备用）",
    "🪪 身份证（务必随身）",
    "✏️ 2B 涂卡铅笔 + 备用铅芯",
    "🖊 黑色签字笔 2-3 支",
    "🧽 橡皮",
    "📏 直尺 / 三角板",
    "⌚ 机械手表（部分考场无钟）",
    "🥤 水 + 巧克力/士力架（补充体力）",
    "🗺 提前查好考场路线与出发时间"
  ];

  function showOne(queue) {
    const ex = queue.shift();
    if (!ex) return;
    const bless = BLESSINGS[Math.floor(Math.random() * BLESSINGS.length)];
    const mask = document.createElement("div");
    mask.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px";
    mask.innerHTML = `<div style="background:var(--panel,#fff);color:var(--txt,#222);border-radius:18px;max-width:420px;width:100%;padding:22px 20px 14px;box-shadow:0 12px 48px rgba(0,0,0,.35);border:1px solid var(--line,rgba(0,0,0,.08))">
      <div style="font-size:26px;text-align:center">📢</div>
      <h3 style="margin:8px 0 4px;text-align:center;font-size:20px">距 ${ex.name} 仅剩 ${ex.diff} 天！</h3>
      <div style="text-align:center;font-size:13px;opacity:.75;margin-bottom:12px">考试日期：${ex.date}${ex.subjects && ex.subjects.length ? " · " + ex.subjects.map(s => s.n + " " + s.t).join(" / ") : ""}</div>
      <div style="background:var(--panel2,rgba(0,0,0,.04));border-radius:12px;padding:10px 12px;font-size:14px;line-height:1.6;text-align:center">💪 ${bless}</div>
      <div style="margin-top:12px;font-size:13px;font-weight:700">🎒 考前文具清单：</div>
      <div style="font-size:12.5px;line-height:1.9;opacity:.9;margin-top:4px">${SUPPLIES.join("<br>")}</div>
      <button id="kgExamRemindClose" style="display:block;width:100%;margin-top:14px;padding:10px;border:none;border-radius:12px;background:var(--cyan,#34e7e4);color:#032;font-weight:800;font-size:15px;cursor:pointer">我知道了，加油！</button>
      <div style="text-align:center;font-size:11px;opacity:.55;margin-top:8px">点击任意处可关闭本弹窗 · 每天早/中/晚各提醒一次</div>
    </div>`;
    const close = () => { if (mask.parentNode) mask.parentNode.removeChild(mask); showOne(queue); };
    mask.addEventListener("click", close);
    document.body.appendChild(mask);
  }

  function check() {
    try {
      const DB = window.DB;
      if (!DB || !DB.state || !DB.state.countdown || !Array.isArray(DB.state.countdown.exams)) return;
      if (!DB.state.examReminders) DB.state.examReminders = {};
      const now = new Date();
      const slot = slotOf(now.getHours());
      const key = DB.today() + "_" + slot;
      if (DB.state.examReminders[key]) return; // 该时段已提醒过
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const due = [];
      DB.state.countdown.exams.forEach(ex => {
        if (!ex.date) return;
        const d = new Date(ex.date + "T00:00:00"); d.setHours(0, 0, 0, 0);
        const diff = Math.round((d - today) / 86400000);
        if (diff >= 0 && diff <= 3) due.push({ name: ex.name, date: ex.date, diff, subjects: ex.subjects });
      });
      if (!due.length) return;
      DB.state.examReminders[key] = 1;
      // 只保留近 30 天键，防膨胀
      const cutoff = DB.today();
      Object.keys(DB.state.examReminders).forEach(k => {
        const dk = k.split("_")[0];
        if (dk && (new Date(cutoff) - new Date(dk)) > 30 * 86400000) delete DB.state.examReminders[k];
      });
      DB.save();
      showOne(due);
    } catch (e) { try { console.warn("exam-remind", e); } catch (e2) {} }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(check, 1200));
  else setTimeout(check, 1200);
  // 回前台跨时段再查一次
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") setTimeout(check, 500); });
})();
