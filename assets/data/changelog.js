/* 更新日志数据：每次发布新版本时，把本次更新内容加到 logs 最前面。
   version 与 index.html 的资源版本号（v=）保持一致；items 的 mod 对应左侧导航模块 key。 */
window.CHANGELOG = {
  logs: [
    {
      version: "20260918m",
      date: "2026-09-18",
      title: "本次更新",
      items: [
        { mod: "common", text: "闪卡/常识：答错过的词条需连对2次才消除，答对一次即可消除的规则更合理" },
        { mod: "common", text: "常识新增「口诀88条」：背口诀 + 实战练题 + 手写笔记，笔记永久保存" },
        { mod: "verbal", text: "言语5000题：全面检修，清除88处题干/选项污染，题目不再残缺" },
        { mod: "ai", text: "AI咨询新增「举一反三」：看不懂的题让AI出同类题，自动进入新板块训练" },
        { mod: "countdown", text: "新增更新日志：每次更新后首次打开自动提示，并在对应模块上标气泡" }
      ]
    },
    {
      version: "20260918l",
      date: "2026-09-18",
      title: "答题体验大修",
      items: [
        { mod: "politics", text: "政治理论刷题：题型徽章（单选/多选/判断），多选题支持多选作答" },
        { mod: "politics", text: "AI咨询不再丢失答题记录：浮层咨询，返回原题位置" },
        { mod: "verbal", text: "选非题红字提示：不会再因题干不全选错" }
      ]
    }
  ]
};
