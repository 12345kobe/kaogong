/* 通用「待复习」面板：点各模块的「待复习(到期)」数字 → 弹出到期清单 + 【📖 学习】【📇 测试】两个按钮。
   - 学习：默认用闪卡（普通模式：看题 → 翻面看答案）
   - 测试：默认用闪卡（困难模式：自填），模块也可传 onTest 自定义（如词语释义四选一）
   用法：KGReview.open({ title, subject, group, items:[{id,prompt,answer,sub}], onStudy, onTest, onExit, ... }) */
(function () {
  "use strict";
  window.KGReview = {
    open(o) {
      o = o || {};
      const UI = window.UI;
      const items = (o.items || []).filter(Boolean);
      if (!items.length) { UI.toast(o.emptyMsg || "当前没有到期待复习的内容"); return; }
      const list = items.slice(0, 300);
      const box = UI.el(`<div>
        <div class="muted small" style="margin-bottom:8px">${UI.esc(o.desc || "以下为到期待复习内容：可先「学习」过一遍，或直接「测试」。")}</div>
        <div style="max-height:46vh;overflow:auto;display:flex;flex-direction:column;gap:6px">
          ${list.map((it, i) => `<div class="todo" style="flex-direction:column;align-items:flex-start;gap:2px">
            <div><b class="muted small">${i + 1}.</b> ${UI.esc(it.prompt || "")}</div>
            ${it.sub ? `<div class="small" style="color:#9fb0d8">${UI.esc(it.sub)}</div>` : ""}
          </div>`).join("")}
        </div>
      </div>`);
      const fc = window.Flashcard;
      function study() {
        if (o.onStudy) return o.onStudy(list);
        if (!fc) { UI.toast("闪卡组件未加载"); return; }
        fc.start({
          title: (o.title || "待复习") + " · 学习", subtitle: o.studySub || "",
          group: o.group, subject: o.subject || "综合",
          items: list.map(x => ({ id: x.id, prompt: x.prompt, answer: x.answer })),
          mode: "easy", frontLabel: o.frontLabel || "题目", backLabel: o.backLabel || "答案",
          shuffle: !!o.shuffle, onExit: o.onExit
        });
      }
      function test() {
        if (o.onTest) return o.onTest(list);
        if (!fc) { UI.toast("闪卡组件未加载"); return; }
        fc.start({
          title: (o.title || "待复习") + " · 测试", subtitle: o.testSub || "",
          group: o.group, subject: o.subject || "综合",
          items: list.map(x => ({ id: x.id, prompt: x.prompt, answer: x.answer })),
          mode: "hard", frontLabel: o.frontLabel || "题目", backLabel: o.backLabel || "答案",
          shuffle: o.shuffle !== false, onExit: o.onExit
        });
      }
      UI.modal({
        title: (o.title || "待复习") + "（" + items.length + "）", body: box, width: "680px",
        actions: [
          { label: "📖 学习", cls: "btn", onClick: (m, c) => { c(); study(); } },
          { label: "📇 测试", cls: "primary", onClick: (m, c) => { c(); test(); } },
          { label: "关闭", cls: "ghost", onClick: (m, c) => c() }
        ]
      });
    }
  };
})();
