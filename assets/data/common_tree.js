/* 常识「开门刷题」分类树
   顶层模块节点带 bg（开门背景图）；有 children 的可下钻；有 bank 的指向 window.COMMON_BANK[bank].items。
   叶子或任意层级都支持「整段抽题」（收集所有子孙 bank）。
   说明：pol/law/eco/tech 直接复用现有 COMMON_BANK 已有题库；其余（历史各朝代、文化、中国地理、读图）由新数据文件按同模式注入。 */
window.COMMON_TREE = {
  cats: [
    {
      id: "hist", name: "历史", icon: "📜", bg: "assets/img/door/hist.png",
      children: [
        {
          id: "china", name: "中国历史", children: [
            {
              id: "ancient", name: "古代史", children: [
                { id: "preqin", name: "先秦（夏商周·春秋战国）", bank: "hist_preqin" },
                { id: "qinhan", name: "秦汉", bank: "hist_qinhan" },
                { id: "weijin", name: "三国两晋南北朝", bank: "hist_weijin" },
                { id: "suitang", name: "隋唐", bank: "hist_suitang" },
                { id: "song", name: "宋（北宋·南宋）", bank: "hist_song" },
                { id: "yuan", name: "元", bank: "hist_yuan" },
                { id: "ming", name: "明", bank: "hist_ming" },
                { id: "qing", name: "清（鸦片战争前）", bank: "hist_qing" }
              ]
            },
            { id: "modern", name: "近代史（1840—1949）", bank: "hist_modern" },
            { id: "contemp", name: "现代史（1949—今）", bank: "hist_contemp" },
            { id: "aj", name: "抗日战争（1931—1945）", bank: "hist_aj" }
          ]
        },
        {
          id: "world", name: "世界历史（少量）", children: [
            { id: "world_anc", name: "世界古代·中世纪", bank: "hist_world_anc" },
            { id: "world_mod", name: "世界近现代", bank: "hist_world_mod" }
          ]
        }
      ]
    },
    {
      id: "geo", name: "地理", icon: "🌍", bg: "assets/img/door/geo.png", children: [
        { id: "china_geo", name: "中国地理（地理国情）", bank: "geo" },
        { id: "readmap", name: "读图识图（等高线·经纬度·季风·河流）", bank: "geo_img" }
      ]
    },
    { id: "pol", name: "政治", icon: "🏛️", bg: "assets/img/door/pol.png", bank: "pol" },
    { id: "culture", name: "文化", icon: "🏮", bg: "assets/img/door/culture.png", bank: "culture" },
    { id: "law", name: "法律", icon: "⚖️", bg: "assets/img/door/law.png", bank: "law" },
    { id: "eco", name: "经济", icon: "💰", bg: "assets/img/door/eco.png", bank: "eco" },
    { id: "tech", name: "科技", icon: "🔬", bg: "assets/img/door/tech.png", bank: "tech" }
  ]
};
