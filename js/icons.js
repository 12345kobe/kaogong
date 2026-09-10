/* 赛博朋克可爱风导航图标 (SVG) */
(function () {
  const C = "#34e7e4", M = "#ff5cf0", Y = "#ffd166", P = "#9b6cff", G = "#3ddc97";
  const wrap = (inner) =>
    `<svg class="ico" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

  const ICONS = {
    countdown: wrap(`<path d="M9 5h14M11 5v4a5 5 0 0 0 10 0V5" stroke="${C}"/><path d="M8 26h16M10 26c0-5 4-9 6-9s6 4 6 9" stroke="${M}"/><circle cx="16" cy="15" r="1.6" fill="${Y}" stroke="none"/>`),
    verbal: wrap(`<path d="M6 7h20v13H13l-5 4v-4H6z" stroke="${C}"/><path d="M11 12h10M11 15h6" stroke="${M}"/><circle cx="23" cy="9" r="1.4" fill="${Y}" stroke="none"/>`),
    data: wrap(`<rect x="5" y="5" width="22" height="22" rx="3" stroke="${C}"/><path d="M10 22v-5M16 22v-10M22 22v-7" stroke="${M}"/><circle cx="22" cy="9" r="1.6" fill="${Y}" stroke="none"/>`),
    logic: wrap(`<path d="M16 5a7 7 0 0 0-4 12.7V21h8v-3.3A7 7 0 0 0 16 5z" stroke="${C}"/><path d="M13 25h6M14 28h4" stroke="${M}"/><circle cx="16" cy="12" r="2" fill="${Y}" stroke="none"/>`),
    politics: wrap(`<path d="M16 4l3 3 4-1 1 4 3 3-3 3-1 4-4-1-3 3-3-3-4 1-1-4-3-3 3-3 1-4 4 1z" stroke="${C}"/><circle cx="16" cy="16" r="2.4" fill="${M}" stroke="none"/>`),
    quantity: wrap(`<rect x="5" y="6" width="22" height="20" rx="3" stroke="${C}"/><path d="M10 11h3M19 11h3M10 16h3M19 16h3M10 21h3M19 21h3" stroke="${M}"/><circle cx="25" cy="9" r="1.4" fill="${Y}" stroke="none"/>`),
    common: wrap(`<path d="M16 4l9 5v8c0 6-4 9-9 11-5-2-9-5-9-11V9z" stroke="${C}"/><path d="M13 13h6M16 13v6" stroke="${M}"/><circle cx="22" cy="8" r="1.4" fill="${Y}" stroke="none"/>`),
    essay: wrap(`<path d="M7 5h12l6 6v16H7z" stroke="${C}"/><path d="M14 5v6h6" stroke="${M}"/><path d="M11 16l8 8M19 24l3-1-1-3" stroke="${M}"/><circle cx="24" cy="7" r="1.4" fill="${Y}" stroke="none"/>`),
    essays: wrap(`<path d="M7 5h12l6 6v16H7z" stroke="${C}"/><path d="M14 5v6h6" stroke="${M}"/><path d="M11 14h10M11 18h10M11 22h6" stroke="${M}"/><circle cx="24" cy="7" r="1.4" fill="${Y}" stroke="none"/>`),
    calendar: wrap(`<rect x="5" y="6" width="22" height="21" rx="3" stroke="${C}"/><path d="M5 12h22M10 4v5M22 4v5" stroke="${M}"/><circle cx="16" cy="19" r="2" fill="${Y}" stroke="none"/>`),
    wrongbook: wrap(`<path d="M6 6h9a3 3 0 0 1 3 3v17l-6-3-6 3V6z" stroke="${C}"/><path d="M18 9h8v17l-4 2-4-2" stroke="${M}"/><path d="M10 12l3 3M13 12l-3 3" stroke="${Y}"/>`),
    wrongwords: wrap(`<path d="M6 6h9a3 3 0 0 1 3 3v17l-6-3-6 3V6z" stroke="${C}"/><path d="M19 11h7M19 16h7M19 21h4" stroke="${M}"/><circle cx="25" cy="8" r="1.6" fill="${Y}" stroke="none"/>`),
    stats: wrap(`<path d="M5 26h22" stroke="${C}"/><path d="M8 26V16l5-6 4 4 6-9" stroke="${M}"/><circle cx="27" cy="5" r="1.8" fill="${Y}" stroke="none"/>`),
    relation: wrap(`<circle cx="10" cy="16" r="4.2" stroke="${C}"/><circle cx="22" cy="16" r="4.2" stroke="${M}"/><path d="M14.2 16h3.6" stroke="${Y}" stroke-width="2.4"/><path d="M16 9v5M16 19v5" stroke="${P}"/>`),
    timer: wrap(`<circle cx="16" cy="18" r="8" stroke="${C}"/><path d="M16 18V13M16 18l4 3" stroke="${M}"/><path d="M12 7l2-2h8l2 2" stroke="${Y}"/><circle cx="16" cy="6" r="1.4" fill="${Y}" stroke="none"/>`),
    allusion: wrap(`<rect x="6" y="8" width="20" height="15" rx="3" stroke="${C}"/><path d="M11 13c-2 0-2 2 0 2M17 13c-2 0-2 2 0 2" stroke="${M}" stroke-width="2.2"/><path d="M11 19h10" stroke="${Y}"/><path d="M9 26l2-3h12l2 3" stroke="${P}"/>`),
    account: wrap(`<circle cx="16" cy="12" r="6" stroke="${C}"/><path d="M6 27c0-6 5-9 10-9s10 3 10 9" stroke="${M}"/>`),
    sync: wrap(`<path d="M7 16a9 9 0 0 1 15-5l2 2" stroke="${C}"/><path d="M25 16a9 9 0 0 1-15 5l-2-2" stroke="${M}"/><path d="M24 6v7h-7M8 26v-7h7" stroke="${Y}"/>`)
  };

  window.ICONS = ICONS;
})();
