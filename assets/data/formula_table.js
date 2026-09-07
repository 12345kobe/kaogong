// 资料分析 · 速算背诵表（百化分 / 平方数 / 三次方 / 四次方 / 开根号）
// 数据来源：用户提供的"百化分.jpg"
window.FORMULA_TABLE = {
  // 百化分：百分比 <-> 1/x
  baihuafen: [
    { p: "50%",   q: "1/2"   },
    { p: "40%",   q: "1/2.5" },
    { p: "33.3%", q: "1/3"   },
    { p: "28.6%", q: "1/3.5" },
    { p: "25%",   q: "1/4"   },
    { p: "22.2%", q: "1/4.5" },
    { p: "20%",   q: "1/5"   },
    { p: "18.2%", q: "1/5.5" },
    { p: "16.7%", q: "1/6"   },
    { p: "15.4%", q: "1/6.5" },
    { p: "14.3%", q: "1/7"   },
    { p: "13.3%", q: "1/7.5" },
    { p: "12.5%", q: "1/8"   },
    { p: "11.8%", q: "1/8.5" },
    { p: "11.1%", q: "1/9"   },
    { p: "10.5%", q: "1/9.5" },
    { p: "10%",   q: "1/10"  },
    { p: "9.5%",  q: "1/10.5"},
    { p: "9.1%",  q: "1/11"  },
    { p: "8.7%",  q: "1/11.5"},
    { p: "8.3%",  q: "1/12"  },
    { p: "8%",    q: "1/12.5"},
    { p: "7.7%",  q: "1/13"  },
    { p: "7.4%",  q: "1/13.5"},
    { p: "7.1%",  q: "1/14"  },
    { p: "6.9%",  q: "1/14.5"},
    { p: "6.7%",  q: "1/15"  },
    { p: "6.5%",  q: "1/15.5"},
    { p: "6.25%", q: "1/16"  },
    { p: "6.1%",  q: "1/16.5"},
    { p: "5.9%",  q: "1/17"  },
    { p: "5.7%",  q: "1/17.5"},
    { p: "5.6%",  q: "1/18"  },
    { p: "5.4%",  q: "1/18.5"},
    { p: "5.3%",  q: "1/19"  },
    { p: "5.1%",  q: "1/19.5"},
    { p: "5%",    q: "1/20"  },
    { p: "4.8%",  q: "1/21"  },
    { p: "4.5%",  q: "1/22"  },
    { p: "4.3%",  q: "1/23"  },
    { p: "4.2%",  q: "1/24"  },
    { p: "4%",    q: "1/25"  }
  ],

  // 平方数：n²=?
  squaring: [
    { n: 11,   v: 121  },
    { n: 12,   v: 144  },
    { n: 13,   v: 169  },
    { n: 14,   v: 196  },
    { n: 15,   v: 225  },
    { n: 16,   v: 256  },
    { n: 17,   v: 289  },
    { n: 18,   v: 324  },
    { n: 19,   v: 361  }
  ],

  // 三次方：n³=?
  cubing: [
    { n: 1,     v: 1     },
    { n: 2,     v: 8     },
    { n: 3,     v: 27    },
    { n: 4,     v: 64    },
    { n: 5,     v: 125   },
    { n: 6,     v: 216   },
    { n: 7,     v: 343   },
    { n: 8,     v: 512   },
    { n: 9,     v: 729   },
    { n: 1.1,   v: 1.3   },
    { n: 1.2,   v: 1.7   },
    { n: 1.3,   v: 2.2   },
    { n: 1.4,   v: 2.7   },
    { n: 1.5,   v: 3.375 }
  ],

  // 四次方：n⁴=?
  fourth: [
    { n: 1.05, v: 1.22 },
    { n: 1.1,  v: 1.46 },
    { n: 1.2,  v: 2.1  },
    { n: 1.3,  v: 2.9  },
    { n: 1.4,  v: 3.8  },
    { n: 1.5,  v: 5.06 }
  ],

  // 开根号：√n
  rooting: [
    { n: 2, v: 1.414 },
    { n: 3, v: 1.732 },
    { n: 5, v: 2.236 }
  ]
};

// 合并一张总表供抽题使用（带分类 id）
window.FORMULA_ITEMS = [];
(function () {
  const F = window.FORMULA_TABLE;
  F.baihuafen.forEach(x => window.FORMULA_ITEMS.push({
    cat: "baihuafen", prompt: x.p, answer: x.q, raw: x
  }));
  F.squaring.forEach(x => window.FORMULA_ITEMS.push({
    cat: "squaring", prompt: x.n + "²", answer: String(x.v), raw: x
  }));
  F.cubing.forEach(x => window.FORMULA_ITEMS.push({
    cat: "cubing", prompt: x.n + "³", answer: String(x.v), raw: x
  }));
  F.fourth.forEach(x => window.FORMULA_ITEMS.push({
    cat: "fourth", prompt: x.n + "⁴", answer: String(x.v), raw: x
  }));
  F.rooting.forEach(x => window.FORMULA_ITEMS.push({
    cat: "rooting", prompt: "√" + x.n, answer: String(x.v), raw: x
  }));
})();
