/* 更新日志数据：每次发布新版本时，把本次更新内容加到 logs 最前面。
   version 与 index.html 的资源版本号（v=）保持一致；items 的 mod 对应左侧导航模块 key。 */
window.CHANGELOG = {
  logs: [
    {
      version: "20260918p",
      date: "2026-09-19",
      title: "本次更新",
      items: [
        { mod: "common", text: "口诀页去掉「一级/三级」文字标签；实战题改为「去做题」悬浮窗（练/背+解析+正确率+AI）" },
        { mod: "countdown", text: "红色重点识别更精准（逐字校准 PDF 原书标注）；每个模块页左下角都有悬浮手写按钮" }
      ]
    },
    {
      version: "20260918o",
      date: "2026-09-19",
      title: "本次更新",
      items: [
        { mod: "common", text: "口诀88条上线「学习」模式：每组10条、艾宾浩斯复习、一/二/三级层次，原书橙色重点红色显示" },
        { mod: "countdown", text: "「举一反三」按钮刷新后不再丢失；进入模块后更新气泡立即消失" }
      ]
    },
    {
      version: "20260918n",
      date: "2026-09-19",
      title: "本次更新",
      items: [
        { mod: "politics", text: "母题特训：四个板块各新增「✍ 刷本章」，可单独选 5-20 题练习" },
        { mod: "verbal", text: "移除答题页的红色「选非题」标注，界面恢复整洁" }
      ]
    },
    {
      version: "20260918m",
      date: "2026-09-18",
      title: "上次更新",
      items: [
        { mod: "common", text: "闪卡/常识：答错过的词条需连对2次才消除" },
        { mod: "common", text: "常识新增「口诀88条」：背口诀 + 实战练题 + 手写笔记" },
        { mod: "verbal", text: "言语5000题：检修题干/选项，题目不再残缺" },
        { mod: "ai", text: "AI咨询新增「举一反三」：一键出同类题并自动建板块训练" },
        { mod: "countdown", text: "新增更新日志：每次更新自动提示并标气泡" }
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
