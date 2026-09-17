/* ============================================================
   考公工作台 · 通讯录 / 好友主页 / 微信式聊天
   依赖 Social（后端）。MODULES.contacts 渲染通讯录列表。
   ============================================================ */
(function () {
  window.MODULES = window.MODULES || {};
  if (!window.UI) return;

  /* 姓名首字母（紧凑姓氏表 + 兜底） */
  const PINYIN = "爱=A鲍=B张=Z王=W李=L刘=L陈=C杨=Y赵=Z黄=H周=Z吴=W徐=X孙=S胡=H朱=Z高=G林=L何=H郭=G马=M罗=L梁=L宋=S郑=Z谢=X韩=H唐=T冯=F于=Y董=D萧=X程=C曹=C袁=Y邓=D许=X傅=F沈=S曾=Z彭=P吕=L苏=S卢=L蒋=J蔡=C贾=J丁=D魏=W薛=X叶=Y阎=Y余=Y潘=P杜=D戴=D夏=X钟=Z汪=W田=T任=R姜=J范=F方=F石=S姚=Y谭=T廖=L邹=Z熊=X金=J陆=L郝=H孔=K白=B崔=C康=K毛=M邱=Q秦=Q江=J史=S顾=G侯=H邵=S孟=M龙=L万=W段=D钱=Q汤=T尹=Y黎=L易=Y常=C武=W乔=Q贺=H赖=L龚=G文=W庞=P樊=F兰=L殷=Y施=S陶=T洪=H翟=Z安=A颜=Y倪=N严=Y牛=N温=W芦=L季=J俞=Y章=Z鲁=L葛=G伍=W韦=W申=S尤=Y毕=B聂=N丛=C焦=J向=X柳=L邢=X路=L岳=Y齐=Q梅=M莫=M庄=Z辛=X管=G祝=Z左=Z涂=T谷=G祁=Q时=S舒=S耿=G牟=M卜=B詹=Z关=G苗=M凌=L费=F纪=J靳=J盛=S童=T欧=O甄=Z项=X曲=Q成=C游=Y阳=Y裴=P席=X卫=W查=C屈=Q鲍=B位=W覃=Q霍=H翁=W隋=S植=Z甘=G景=J薄=B单=D包=B司=S柏=B宁=N柯=K阮=R桂=G闵=M解=X强=Q柴=C吉=J边=B辜=G卓=Z古=G木=M党=D简=J练=L宫=G艾=A楚=C来=L迟=C尚=S寇=K邝=K占=Z东=D利=L师=S";
  const PY_MAP = {}; PINYIN.split(/=?/).forEach(p => { const i = p.indexOf("="); if (i > 0) PY_MAP[p.slice(0, i)] = p.slice(i + 1); });
  function firstLetter(name) {
    if (!name) return "#";
    const c = name[0];
    if (/[a-zA-Z]/.test(c)) return c.toUpperCase();
    if (PY_MAP[c]) return PY_MAP[c];
    return "#";
  }

  function requireSocial(host) {
    if (!Social.isConfigured()) {
      host.innerHTML = `<div class="empty">聊天/好友功能需要先配置后端服务地址。<br>请到「我的 → ⚙ 设置 → 后端服务地址」填写（部署 backend 后获得），或在「我的」里登录社交账号。</div>`;
      return false;
    }
    if (!Social.isLoggedIn()) {
      host.innerHTML = `<div class="empty">请先在「我的」面板登录 / 注册社交账号，再使用通讯录。</div>`;
      return false;
    }
    return true;
  }

  /* ===================== 通讯录 ===================== */
  MODULES.contacts = {
    title: "通讯录",
    icon: "📇",
    async render(body) {
      body.innerHTML = `<div class="contacts-wrap"><div class="kg-loading">加载中…</div></div>`;
      const host = body.querySelector(".contacts-wrap");
      if (!requireSocial(host)) return;
      await renderContacts(host);
    }
  };

  async function renderContacts(host) {
    host_ref = host;
    host.innerHTML = `
      <div class="contacts-bar">
        <button class="btn primary sm" id="addFriend">＋ 添加好友</button>
        <button class="btn sm" id="seeReq">📨 新朋友<span class="kg-req-badge" id="reqBadge" style="display:none"></span></button>
      </div>
      <div class="contacts-list" id="clist"><div class="kg-loading">加载中…</div></div>`;
    host.querySelector("#addFriend").onclick = () => openAddFriend(host);
    host.querySelector("#seeReq").onclick = () => openRequests(host);
    await refreshList(host);
  }

  async function refreshList(host) {
    const list = host.querySelector("#clist");
    if (!list) return;
    let j; try { j = await Social.listFriends(); } catch (e) { list.innerHTML = `<div class="empty">加载失败：${UI.esc(e.message)}</div>`; return; }
    const friends = (j.friends || []);
    // 请求数角标
    try { const rq = await Social.listRequests(); const n = (rq.incoming || []).length; const b = host.querySelector("#reqBadge"); if (b) { if (n) { b.textContent = n; b.style.display = ""; } else b.style.display = "none"; } } catch (e) {}
    if (!friends.length) { list.innerHTML = `<div class="empty">还没有好友。点「＋ 添加好友」搜索用户名加好友吧～</div>`; return; }
    const pinned = friends.filter(f => f.special || (DB.state.chatSettings && DB.state.chatSettings[f.username] && DB.state.chatSettings[f.username].pin));
    const normal = friends.filter(f => !pinned.includes(f));
    const groups = {};
    normal.forEach(f => { const k = firstLetter(f.remark || f.nickname || f.username); (groups[k] = groups[k] || []).push(f); });
    const keys = Object.keys(groups).sort();
    let html = "";
    if (pinned.length) {
      html += `<div class="contacts-group"><div class="contacts-ghead">★ 特别关心 / 置顶</div>` +
        pinned.map(f => itemHtml(f, f.special)).join("") + `</div>`;
    }
    keys.forEach(k => {
      groups[k].sort((a, b) => (a.remark || a.nickname || a.username).localeCompare(b.remark || b.nickname || b.username, "zh"));
      html += `<div class="contacts-group"><div class="contacts-ghead">${k}</div>` + groups[k].map(f => itemHtml(f, false)).join("") + `</div>`;
    });
    list.innerHTML = html;
    list.querySelectorAll("[data-user]").forEach(el => {
      el.onclick = () => openProfilePage(el.getAttribute("data-user"));
    });
  }
  function itemHtml(f, special) {
    const name = f.remark || f.nickname || f.username;
    const init = (name[0] || "?");
    return `<div class="contact-item" data-user="${UI.esc(f.username)}">
      <div class="contact-ava">${f.avatar ? `<img src="${UI.esc(Social.mediaUrl(f.avatar))}"/>` : UI.esc(init)}</div>
      <div class="contact-info">
        <div class="contact-name">${UI.esc(name)} ${special ? '<span class="star">★</span>' : ''} ${f.online ? '<span class="on-dot" title="在线"></span>' : ''}</div>
        <div class="contact-sub muted">${f.online ? "在线" : "离线"} · @${UI.esc(f.username)}</div>
      </div>
    </div>`;
  }

  /* ===================== 加好友 ===================== */
  function openAddFriend(host) {
    const box = UI.el(`<div>
      <input id="afQ" placeholder="输入用户名或昵称搜索" style="width:100%;margin-bottom:10px"/>
      <div id="afRes" class="kg-search-res"></div>
    </div>`);
    UI.modal({
      title: "添加好友", body: box, width: "460px",
      actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }]
    });
    const doSearch = async () => {
      const q = box.querySelector("#afQ").value.trim();
      const res = box.querySelector("#afRes");
      if (!q) { res.innerHTML = ""; return; }
      try {
        const j = await Social.search(q);
        if (!j.users.length) { res.innerHTML = `<div class="empty">未找到用户</div>`; return; }
        res.innerHTML = j.users.map(u => `<div class="search-row"><span>${UI.esc(u.nickname)} <span class="muted">@${UI.esc(u.username)}</span></span>
          <button class="btn sm primary" data-u="${UI.esc(u.username)}">加好友</button></div>`).join("");
        res.querySelectorAll("[data-u]").forEach(b => b.onclick = async () => {
          try { await Social.sendRequest(b.getAttribute("data-u")); UI.toast("已发送好友请求"); b.textContent = "已发送"; b.disabled = true; }
          catch (e) { UI.toast("失败：" + e.message); }
        });
      } catch (e) { res.innerHTML = `<div class="empty">搜索失败：${UI.esc(e.message)}</div>`; }
    };
    box.querySelector("#afQ").oninput = debounce(doSearch, 300);
    box.querySelector("#afQ").onkeydown = (e) => { if (e.key === "Enter") doSearch(); };
  }

  async function openRequests(host) {
    let j; try { j = await Social.listRequests(); } catch (e) { UI.toast("加载失败：" + e.message); return; }
    const inc = j.incoming || [];
    const box = UI.el(`<div>${inc.length ? inc.map(r => `<div class="search-row"><span>${UI.esc(r.nickname)} <span class="muted">@${UI.esc(r.from)}</span></span>
      <button class="btn sm primary" data-f="${UI.esc(r.from)}">接受</button></div>`).join("") : `<div class="empty">暂无好友请求</div>`}</div>`);
    UI.modal({
      title: "新朋友", body: box, width: "460px",
      actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }]
    });
    box.querySelectorAll("[data-f]").forEach(b => b.onclick = async () => {
      try { await Social.accept(b.getAttribute("data-f")); UI.toast("已添加为好友"); c(); await refreshList(host); }
      catch (e) { UI.toast("失败：" + e.message); }
    });
  }

  /* ===================== 聊天设置（免打扰/置顶/背景/清空） ===================== */
  function chatSet(u) {
    const s = DB.state.chatSettings = DB.state.chatSettings || {};
    return s[u] = s[u] || { mute: false, pin: false, remind: false, bg: "", clearedTs: 0 };
  }

  /* 通用微信式全屏页 */
  function wxPage(title) {
    const wrap = UI.el(`<div class="wx-page">
      <div class="wx-head"><button class="wx-back">‹</button><div class="wx-title">${UI.esc(title)}</div><span class="wx-head-r"></span></div>
      <div class="wx-body"></div></div>`);
    const mask = UI.el(`<div class="modal-mask chat-mask wx-mask"></div>`);
    mask.appendChild(wrap);
    document.body.appendChild(mask);
    closeAllModalsKeep(mask);
    const close = () => mask.remove();
    wrap.querySelector(".wx-back").onclick = close;
    return { wrap, mask, close, body: wrap.querySelector(".wx-body") };
  }
  function avaInner(src, ch, cls) {
    if (src) return `<img class="${cls}" src="${UI.esc(src)}"/>`;
    return `<span class="${cls} wx-ava-fb">${UI.esc(ch || "?")}</span>`;
  }
  function switchHtml(on) { return `<span class="wx-switch${on ? " on" : ""}"><i></i></span>`; }

  /* ===================== 聊天详情（微信 ⋯ 页） ===================== */
  function openChatDetail(peer, peerInfo) {
    const st = chatSet(peer);
    const me = Social.currentUser();
    const pg = wxPage("聊天详情");
    const name = peerInfo.nickname ? (peerInfo.remark || peerInfo.nickname) : peer;
    pg.body.innerHTML = `
      <div class="wx-card wx-avas">
        <div class="wx-ava-item" id="cdPeer">${avaInner(Social.mediaUrl(peerInfo.avatar || ""), (name[0] || "?"), "wx-ava-lg")}<span>${UI.esc(name)}</span></div>
        <div class="wx-ava-item" id="cdMe">${avaInner(myAvaSrc(), (me || "?")[0], "wx-ava-lg")}<span>我</span></div>
      </div>
      <div class="wx-card">
        <div class="wx-cell" id="cdSearch"><span>🔍 查找聊天内容</span><i class="wx-arrow">›</i></div>
      </div>
      <div class="wx-card">
        <div class="wx-cell" data-tg="mute"><span>消息免打扰</span>${switchHtml(st.mute)}</div>
        <div class="wx-cell" data-tg="pin"><span>置顶聊天</span>${switchHtml(st.pin)}</div>
        <div class="wx-cell" data-tg="remind"><span>提醒</span>${switchHtml(st.remind)}</div>
      </div>
      <div class="wx-card">
        <div class="wx-cell" id="cdBg"><span>🎨 设置当前聊天背景</span><i class="wx-arrow">›</i></div>
      </div>
      <div class="wx-card">
        <div class="wx-cell" id="cdClear"><span>清空聊天记录</span></div>
        <div class="wx-cell" id="cdRep"><span>投诉</span><i class="wx-arrow">›</i></div>
      </div>`;
    const saveSt = () => DB.save();
    pg.body.querySelector("#cdPeer").onclick = () => { pg.close(); openProfilePage(peer); };
    pg.body.querySelector("#cdMe").onclick = () => { pg.close(); openProfilePage(me); };
    pg.body.querySelector("#cdSearch").onclick = () => openChatSearch(peer);
    pg.body.querySelector("#cdBg").onclick = () => openChatBg(st, saveSt);
    pg.body.querySelector("#cdClear").onclick = () => {
      if (!confirm("确定清空这个聊天的记录？（仅影响本机显示，对方不受影响）")) return;
      st.clearedTs = Date.now(); saveSt();
      const m = document.querySelector(".chat-mask .chat-msgs");
      if (m) m.innerHTML = "";
      UI.toast("已清空");
    };
    pg.body.querySelector("#cdRep").onclick = () => UI.toast("已收到反馈，我们会尽快处理（演示）");
    pg.body.querySelectorAll("[data-tg]").forEach(cell => {
      cell.onclick = () => {
        const k = cell.getAttribute("data-tg");
        st[k] = !st[k]; saveSt();
        cell.querySelector(".wx-switch").classList.toggle("on", st[k]);
        if (k === "pin") { UI.toast(st.pin ? "已置顶该聊天" : "已取消置顶"); if (host_ref) refreshList(host_ref); }
        if (k === "mute") { UI.toast(st.mute ? "已开启免打扰" : "已关闭免打扰"); if (window.refreshSocialBadge) window.refreshSocialBadge(); }
      };
    });
  }

  function openChatSearch(peer) {
    const box = UI.el(`<div><input id="csQ" placeholder="输入关键词搜索聊天记录" style="width:100%;margin-bottom:10px"/><div id="csRes"></div></div>`);
    UI.modal({ title: "查找聊天内容", body: box, width: "460px", actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }] });
    const res = box.querySelector("#csRes");
    const doSearch = async () => {
      const q = box.querySelector("#csQ").value.trim().toLowerCase();
      if (!q) { res.innerHTML = ""; return; }
      res.innerHTML = `<div class="muted small">搜索中…</div>`;
      try {
        let all = [], before = 0, guard = 0;
        while (guard++ < 12) { // 最多拉 12 页
          const j = await Social.history(peer, before);
          const arr = j.messages || [];
          all = all.concat(arr);
          if (!j.hasMore || !arr.length) break;
          before = arr[0].ts;
        }
        const hits = all.filter(m => m.type === "text" && (m.text || "").toLowerCase().includes(q)).slice(0, 50);
        res.innerHTML = hits.length
          ? hits.map(m => `<div class="search-row cs-hit"><span>${UI.esc((m.text || "").slice(0, 60))}</span><span class="muted small">${new Date(m.ts).toLocaleString()}</span></div>`).join("")
          : `<div class="empty">没有找到相关聊天内容</div>`;
      } catch (e) { res.innerHTML = `<div class="empty">搜索失败：${UI.esc(e.message)}</div>`; }
    };
    box.querySelector("#csQ").oninput = debounce(doSearch, 400);
    box.querySelector("#csQ").onkeydown = (e) => { if (e.key === "Enter") doSearch(); };
  }

  function openChatBg(st, saveSt) {
    const COLORS = ["", "#ececec", "#fdf6e3", "#e8f4ea", "#e7f0fa", "#f7e8ee", "#efe9f7", "#e4f4f2"];
    const NAMES = ["默认", "经典灰", "米黄", "淡绿", "淡蓝", "淡粉", "淡紫", "薄荷"];
    const box = UI.el(`<div><div class="row" style="gap:10px;flex-wrap:wrap">${COLORS.map((c, i) =>
      `<div class="bg-opt" data-c="${c}" title="${NAMES[i]}"><span style="display:inline-block;width:44px;height:44px;border-radius:8px;border:1px solid #ddd;background:${c || "#f5f5f5"}"></span><div class="muted small" style="text-align:center">${NAMES[i]}</div></div>`).join("")}</div></div>`);
    UI.modal({ title: "设置当前聊天背景", body: box, width: "420px", actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }] });
    box.querySelectorAll(".bg-opt").forEach(o => o.onclick = () => {
      st.bg = o.getAttribute("data-c"); saveSt();
      const m = document.querySelector(".chat-mask .chat-msgs");
      if (m) m.style.background = st.bg || "";
      UI.toast("背景已更新"); closeAllModals();
    });
  }

  /* ===================== 微信式主页（自己 / 好友） ===================== */
  async function openProfilePage(username) {
    const me = Social.currentUser();
    const isMe = username === me;
    let p;
    if (isMe) { try { p = (await Social.getProfile()).profile || {}; } catch (e) { p = (DB.state.profile || {}); } }
    else {
      try { p = (await Social.getProfileOf(username)).profile || {}; }
      catch (e) { UI.toast("加载失败：" + e.message); return; }
    }
    const name = p.nickname || username;
    const pg = wxPage(isMe ? "我的主页" : "好友主页");
    pg.body.innerHTML = `
      <div class="wx-card wx-prof-top">
        <div class="wx-prof-ava">${avaInner(Social.mediaUrl(p.avatar || ""), (name[0] || "?"), "")}</div>
        <div class="wx-prof-main">
          <div class="wx-prof-name">${UI.esc(name)} ${p.gender === "女" ? "👩" : p.gender === "男" ? "👨" : ""} ${!isMe && p.online ? '<span class="on-dot" title="在线"></span>' : ""}</div>
          <div class="wx-prof-row">昵称：${UI.esc(p.nickname || "未设置")}</div>
          <div class="wx-prof-row">账号：${UI.esc(username)}</div>
          ${p.birthday ? `<div class="wx-prof-row">生日：${UI.esc(p.birthday)}</div>` : ""}
        </div>
        ${!isMe ? `<span class="wx-star" id="wpStar" title="特别关心">${p.special ? "★" : "☆"}</span>` : ""}
      </div>
      <div class="wx-card">
        <div class="wx-cell wx-cell-static"><span class="wx-cell-lb">备注</span><span class="wx-cell-val" id="wpRemark">${UI.esc(p.remark || "未设置")}</span>${!isMe ? '<i class="wx-arrow">›</i>' : ""}</div>
        <div class="wx-cell wx-cell-static"><span class="wx-cell-lb">个性签名</span><span class="wx-cell-val">${UI.esc(p.bio || "未设置")}</span></div>
      </div>
      ${!isMe ? (() => {
        const plan = p.plan || [];
        return `<div class="wx-card">
        <div class="wx-plan-h">📅 今日计划${plan.length ? "" : "（暂无）"}</div>
        ${plan.length ? `<table class="plan-tbl">` + plan.map(t => `<tr class="${t.done ? "done" : ""}"><td>${t.done ? "✅" : "⬜"}</td><td>${UI.esc(t.text)}</td></tr>`).join("") + `</table>` : `<div class="muted small" style="padding:0 14px 10px">对方还没设置计划</div>`}
      </div>`; })() : ""}
      <div class="wx-card">
        <div class="wx-cell" id="wpMoments"><span>📖 学习记录</span><i class="wx-arrow">›</i></div>
      </div>
      ${!isMe ? `
      <div class="wx-card wx-actions-v">
        <div class="wx-big-btn" id="wpChat">💬 发消息</div>
        <div class="wx-big-btn" id="wpRemind">🔔 提醒学习</div>
      </div>
      <div class="wx-card"><div class="wx-cell wx-danger" id="wpDel"><span>删除好友</span></div></div>` : `
      <div class="wx-card wx-actions-v"><div class="wx-big-btn" id="wpEdit">📝 完善资料</div></div>`}`;
    pg.body.querySelector("#wpMoments").onclick = () => { pg.close(); openStudyLog(username, p); };
    if (isMe) {
      pg.body.querySelector("#wpEdit").onclick = () => { pg.close(); if (window.openProfileEdit) window.openProfileEdit(false); };
    } else {
      pg.body.querySelector("#wpChat").onclick = () => { pg.close(); openChat(username); };
      pg.body.querySelector("#wpRemark").parentElement.onclick = () => {
        const v = prompt("修改备注名（留空则显示昵称）：", p.remark || "");
        if (v === null) return;
        Social.setRemark(username, v.trim()).then(() => { UI.toast("备注已更新"); pg.close(); openProfilePage(username); }).catch(e => UI.toast("失败：" + e.message));
      };
      pg.body.querySelector("#wpStar").onclick = () => {
        Social.setSpecial(username, !p.special).then(() => { UI.toast(p.special ? "已取消特别关心" : "已设为特别关心"); pg.close(); openProfilePage(username); }).catch(e => UI.toast("失败：" + e.message));
      };
      pg.body.querySelector("#wpRemind").onclick = () => {
        const plan = p.plan || [];
        if (!plan.some(t => !t.done)) { UI.toast("对方今日计划都完成啦，不用提醒～"); return; }
        const text = prompt("提醒内容：", "快来学习啦，坚持就是胜利～");
        if (text === null) return;
        Social.sendRemind(username, text).then(() => { UI.toast("已发送提醒"); pg.close(); }).catch(e => UI.toast("失败：" + e.message));
      };
      pg.body.querySelector("#wpDel").onclick = () => {
        if (!confirm("确定删除该好友？")) return;
        Social.removeFriend(username).then(() => { UI.toast("已删除"); pg.close(); if (host_ref) refreshList(host_ref); }).catch(e => UI.toast("失败：" + e.message));
      };
    }
  }

  /* ===================== 学习记录（朋友圈式） ===================== */
  function dayTs(d) { const t = new Date(String(d) + "T12:00:00").getTime(); return isNaN(t) ? 0 : t; }
  function modTitle(k) { const M = window.MODULES || {}; return (M[k] && M[k].title) ? M[k].title : k; }
  function buildLocalRecords() {
    const recs = [], S = DB.state;
    ((S.checkin && S.checkin.dates) || []).forEach(d => recs.push({ ts: dayTs(d), title: "📅 每日打卡", sub: "今天也坚持学习打卡啦" }));
    const ll = S.learnedLog || {};
    for (const k in ll) for (const d in (ll[k] || {})) {
      const n = (ll[k][d] || []).length;
      if (n) recs.push({ ts: dayTs(d), title: "📚 " + modTitle(k), sub: "学习了 " + n + " 个知识点" });
    }
    const todos = S.todos || {};
    for (const m in todos) (todos[m] || []).forEach(t => { if (t.done && t.day) recs.push({ ts: dayTs(t.day), title: "✅ 完成待办", sub: t.text || "" }); });
    recs.sort((a, b) => b.ts - a.ts);
    return recs.slice(0, 100);
  }
  function syncStudyRecords() {
    if (!Social.isConfigured() || !Social.isLoggedIn()) return;
    try { Social.saveProfile({ records: buildLocalRecords() }).catch(() => {}); } catch (e) {}
  }
  async function openStudyLog(username, profHint) {
    const me = Social.currentUser();
    const isMe = username === me;
    let p = profHint, records = [];
    if (isMe) {
      records = buildLocalRecords();
      syncStudyRecords();
      if (!p) { try { p = (await Social.getProfile()).profile || {}; } catch (e) { p = {}; } }
    } else {
      try { const j = await Social.getProfileOf(username); p = j.profile || {}; records = p.records || []; }
      catch (e) { UI.toast("加载失败：" + e.message); return; }
    }
    const name = p.nickname || username;
    const pg = wxPage(isMe ? "我的学习记录" : name + " 的学习记录");
    const checkinDays = ((DB.state.checkin && DB.state.checkin.dates) || []).length;
    pg.body.innerHTML = `
      <div class="wx-cover">
        <div class="wx-cover-name">${UI.esc(name)}</div>
        <div class="wx-cover-ava">${avaInner(Social.mediaUrl(p.avatar || ""), (name[0] || "?"), "wx-ava-lg")}</div>
      </div>
      <div class="wx-mom-sign">${UI.esc(p.bio || (isMe ? "记录每一天的努力" : "TA 的学习足迹"))}</div>
      ${isMe ? `<div class="wx-mom-stats">累计打卡 <b>${checkinDays}</b> 天 · 共 <b>${records.length}</b> 条记录（对方可见，自动同步）</div>` : `<div class="wx-mom-stats">共 <b>${records.length}</b> 条学习记录</div>`}
      <div class="wx-mom-list" id="wmList"></div>`;
    const list = pg.body.querySelector("#wmList");
    if (!records.length) { list.innerHTML = `<div class="empty" style="padding:30px 0">${isMe ? "还没有学习记录，去学习打卡吧～" : "TA 还没有同步学习记录"}</div>`; return; }
    list.innerHTML = records.map(r => {
      const d = new Date(r.ts);
      const day = isNaN(d) ? "·" : d.getDate();
      const mon = isNaN(d) ? "" : (d.getMonth() + 1) + "月";
      return `<div class="mom-item">
        <div class="mom-date"><b>${day}</b><span>${mon}</span></div>
        <div class="mom-card"><div class="mom-title">${UI.esc(r.title || "")}</div>${r.sub ? `<div class="mom-sub">${UI.esc(r.sub)}</div>` : ""}</div>
      </div>`;
    }).join("");
  }


  /* ===================== 微信式聊天 ===================== */
  const EMOJI = ["😀","😂","🤣","😊","😍","😘","🤔","😎","😭","😡","👍","👏","🙏","💪","🎉","❤️","💔","🌹","🔥","⭐","✅","❌","📚","⏰","🌟","😴","🥳","😅","🤝","💯","🌈"];
  let chatUnSub = null;

  function openChat(peer) {
    if (chatUnSub) { try { chatUnSub(); } catch (e) {} chatUnSub = null; }
    const wrap = UI.el(`<div class="chat-screen">
      <div class="chat-head">
        <button class="chat-back" id="chBack" title="返回通讯录">‹</button>
        <div class="chat-peer"><span id="chName"></span> <span id="chOnline" class="muted small"></span></div>
        <button class="chat-exit" id="chMore" title="聊天详情">⋯</button>
        <button class="chat-exit" id="chExit" title="退出聊天，回到主页">🏠</button>
      </div>
      <div class="chat-msgs" id="chMsgs"></div>
      <div class="chat-input">
        <button class="chat-emoji" id="chEmoji">😊</button>
        <button class="chat-media" id="chPhoto" title="照片">🖼</button>
        <button class="chat-media" id="chVideo" title="视频">🎬</button>
        <button class="chat-media" id="chVoice" title="语音">🎤</button>
        <input id="chText" placeholder="发送消息…" style="flex:1"/>
        <button class="btn primary sm" id="chSend">发送</button>
        <div class="emoji-pop" id="emojiPop" style="display:none">${EMOJI.map(e => `<span class="emoji-i">${e}</span>`).join("")}</div>
      </div>
      <input type="file" id="chFile" accept="image/*,video/*" style="display:none"/>
    </div>`);
    // 全屏覆盖
    const mask = UI.el(`<div class="modal-mask chat-mask"></div>`);
    mask.appendChild(wrap);
    document.body.appendChild(mask);
    closeAllModalsKeep(mask);

    const msgs = wrap.querySelector("#chMsgs");
    const cst = chatSet(peer);
    if (cst.bg) msgs.style.background = cst.bg;
    const clearedTs = cst.clearedTs || 0;
    let peerInfo = { nickname: peer, online: false };
    Social.listFriends().then(j => {
      const f = (j.friends || []).find(x => x.username === peer);
      if (f) { peerInfo = f; wrap.querySelector("#chName").textContent = f.remark || f.nickname || peer; }
      else wrap.querySelector("#chName").textContent = peer;
      wrap.querySelector("#chOnline").textContent = peerInfo.online ? "在线" : "离线";
      curPeerAva = peerInfo.avatar || "";
      // 已渲染的历史气泡补头像
      msgs.querySelectorAll(".chat-row").forEach(r => insertAva(r, peer));
    }).catch(() => { wrap.querySelector("#chName").textContent = peer; });

    let oldest = 0;
    async function loadHistory(before) {
      try {
        const j = await Social.history(peer, before);
        const arr = (j.messages || []).filter(m => !clearedTs || !(m.ts) || m.ts > clearedTs);
        if (!before) { msgs.innerHTML = ""; }
        arr.forEach(m => msgs.insertBefore(bubble(m, peer), msgs.firstChild));
        if (!before) msgs.scrollTop = msgs.scrollHeight;
        applyTimeSeps(msgs);
        oldest = arr.length ? arr[0].ts : oldest;
        return j.hasMore;
      } catch (e) { if (!before) msgs.innerHTML = `<div class="empty">加载失败：${UI.esc(e.message)}</div>`; return false; }
    }
    loadHistory(0);
    Social.markRead(peer).then(() => { if (window.refreshSocialBadge) window.refreshSocialBadge(); });

    msgs.onscroll = debounce(async () => {
      if (msgs.scrollTop < 40 && oldest) {
        const more = await loadHistory(oldest);
        if (!more) oldest = 0;
      }
    }, 300);

    // 发送
    function sendText(text) {
      if (!text) return;
      const clientId = "c" + Date.now() + Math.random().toString(36).slice(2, 6);
      const tmp = { id: clientId, from: Social.currentUser(), to: peer, type: "text", text, url: "", ts: Date.now(), clientId, _tmp: true };
      msgs.appendChild(bubble(tmp, peer)); msgs.scrollTop = msgs.scrollHeight;
      Social.send({ to: peer, type: "text", text, clientId }).catch(e => UI.toast("发送失败：" + e.message));
    }
    wrap.querySelector("#chSend").onclick = () => { const t = wrap.querySelector("#chText").value.trim(); wrap.querySelector("#chText").value = ""; sendText(t); };
    wrap.querySelector("#chText").onkeydown = (e) => { if (e.key === "Enter") { const t = wrap.querySelector("#chText").value.trim(); wrap.querySelector("#chText").value = ""; sendText(t); } };

    // emoji
    wrap.querySelector("#chEmoji").onclick = () => { const pop = wrap.querySelector("#emojiPop"); pop.style.display = pop.style.display === "none" ? "flex" : "none"; };
    wrap.querySelector("#emojiPop").querySelectorAll(".emoji-i").forEach(s => s.onclick = () => { wrap.querySelector("#chText").value += s.textContent; wrap.querySelector("#chText").focus(); });
    // 照片/视频
    wrap.querySelector("#chPhoto").onclick = () => { const f = wrap.querySelector("#chFile"); f.accept = "image/*"; f.click(); };
    wrap.querySelector("#chVideo").onclick = () => { const f = wrap.querySelector("#chFile"); f.accept = "video/*"; f.click(); };
    wrap.querySelector("#chFile").onchange = () => {
      const file = wrap.querySelector("#chFile").files[0]; if (!file) return;
      const isVideo = file.type.startsWith("video");
      UI.toast("上传中…");
      fileToBase64(file).then(b64 => Social.uploadMedia(file.type, b64, file.name).then(r => {
        Social.send({ to: peer, type: isVideo ? "video" : "image", url: r.url, mediaName: file.name, clientId: "c" + Date.now() }).catch(e => UI.toast("发送失败：" + e.message));
      })).catch(e => UI.toast("上传失败：" + e.message));
      wrap.querySelector("#chFile").value = "";
    };
    // 语音：长按录制，松手发送；上滑/移出取消
    const voiceBtn = wrap.querySelector("#chVoice");
    let rec = null, recStream = null, recStart = 0, recChunks = [], recCancelled = false;
    function startRec() {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        recStream = stream; recChunks = []; recCancelled = false;
        rec = new MediaRecorder(stream);
        rec.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
        rec.onstop = () => {
          voiceBtn.classList.remove("recording");
          voiceBtn.textContent = "🎤";
          if (recCancelled) { recStream.getTracks().forEach(t => t.stop()); return; }
          const dur = Math.max(1, Math.round((Date.now() - recStart) / 1000));
          const blob = new Blob(recChunks, { type: rec.mimeType || "audio/webm" });
          UI.toast("上传语音中…");
          blobToBase64(blob).then(b64 => Social.uploadMedia(blob.type, b64, "voice." + (blob.type.includes("mp4") ? "m4a" : "webm")).then(r => {
            Social.send({ to: peer, type: "voice", url: r.url, duration: dur, clientId: "c" + Date.now() }).catch(e => UI.toast("发送失败：" + e.message));
          })).catch(e => UI.toast("上传失败：" + e.message));
          recStream.getTracks().forEach(t => t.stop());
        };
        recStart = Date.now(); rec.start();
        voiceBtn.classList.add("recording");
        voiceBtn.textContent = "🎙";
      }).catch(e => UI.toast("无法录音：" + e.message));
    }
    voiceBtn.addEventListener("pointerdown", e => { e.preventDefault(); startRec(); });
    voiceBtn.addEventListener("pointerup", () => { if (rec && rec.state === "recording") rec.stop(); });
    voiceBtn.addEventListener("pointerleave", () => { if (rec && rec.state === "recording") { recCancelled = true; rec.stop(); } });
    voiceBtn.addEventListener("pointercancel", () => { if (rec && rec.state === "recording") { recCancelled = true; rec.stop(); } });
    // 返回 / 退出 / 聊天详情
    wrap.querySelector("#chBack").onclick = closeChat;
    wrap.querySelector("#chExit").onclick = () => { closeChat(); location.hash = "#/countdown"; };
    wrap.querySelector("#chMore").onclick = () => openChatDetail(peer, peerInfo);
    mask.onclick = (e) => { if (e.target === mask) closeChat(); };

    // 实时收消息
    chatUnSub = Social.on("message", (m) => {
      if ((m.from === peer && m.to === Social.currentUser()) || (m.to === peer && m.from === Social.currentUser())) {
        if (clearedTs && m.ts && m.ts <= clearedTs) return;
        msgs.appendChild(bubble(m, peer)); msgs.scrollTop = msgs.scrollHeight;
        applyTimeSeps(msgs);
        if (m.from === peer) { Social.markRead(peer).then(() => { if (window.refreshSocialBadge) window.refreshSocialBadge(); }); }
      }
    });
    Social.on("presence", (p) => { if (p.user === peer && !p.self) wrap.querySelector("#chOnline").textContent = p.online ? "在线" : "离线"; });
  }
  function closeChat() {
    if (chatUnSub) { try { chatUnSub(); } catch (e) {} chatUnSub = null; }
    const mask = document.querySelector(".chat-mask"); if (mask) mask.remove();
    if (MODULES.contacts && document.getElementById("routeBody")) { /* 留在通讯录 */ }
  }
  /* 头像工具：我的头像来自本地资料，对方头像来自好友列表 */
  let curPeerAva = "";
  function myAvaSrc() {
    const p = (window.DB && DB.state && DB.state.profile) || {};
    return p.avatar || "";
  }
  function avaHtml(src, fallbackChar) {
    if (src) return `<img class="chat-ava" src="${UI.esc(src)}"/>`;
    return `<span class="chat-ava chat-ava-txt">${UI.esc(fallbackChar || "?")}</span>`;
  }
  function insertAva(row, peer) {
    if (row.querySelector(".chat-ava")) return;
    const mine = row.classList.contains("mine");
    const b = row.querySelector(".chat-bubble");
    if (!b) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = mine ? avaHtml(myAvaSrc(), (Social.currentUser() || "?")[0]) : avaHtml(Social.mediaUrl(curPeerAva), (peer || "?")[0]);
    const ava = tmp.firstChild;
    if (mine) row.insertBefore(ava, b.nextSibling); else row.insertBefore(ava, b);
  }
  /* 时间分隔：整批渲染后统一扫描，与上一条间隔 > 5 分钟插入居中时间 */
  function fmtTime(ts) {
    const d = new Date(ts), now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
    if (sameDay) return hm;
    return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
  }
  function applyTimeSeps(msgs) {
    msgs.querySelectorAll(".chat-time").forEach(t => t.remove());
    let prev = 0;
    Array.from(msgs.children).forEach(row => {
      if (!row.classList || !row.classList.contains("chat-row")) return;
      const ts = +row.getAttribute("data-ts") || 0;
      if (ts && prev && ts - prev > 5 * 60 * 1000) {
        const sep = UI.el(`<div class="chat-time">${UI.esc(fmtTime(ts))}</div>`);
        msgs.insertBefore(sep, row);
      }
      if (ts) prev = ts;
    });
  }
  function bubble(m, peer) {
    const mine = m.from === Social.currentUser();
    const el = UI.el(`<div class="chat-row ${mine ? "mine" : "theirs"}"${m.ts ? ` data-ts="${m.ts}"` : ""}></div>`);
    let inner = "";
    const mediaUrl = m.url ? Social.mediaUrl(m.url) : "";
    if (m.type === "image") {
      inner = `<span class="chat-media-wrap"><img class="chat-media-img" src="${UI.esc(mediaUrl)}"/><a class="ov-save" href="${UI.esc(mediaUrl)}" download="${UI.esc(m.mediaName || "image")}" title="保存到相册">⬇</a></span>`;
    } else if (m.type === "video") {
      inner = `<span class="chat-media-wrap"><video class="chat-media-video" src="${UI.esc(mediaUrl)}" controls></video><a class="ov-save" href="${UI.esc(mediaUrl)}" download="${UI.esc(m.mediaName || "video")}" title="保存到相册">⬇</a></span>`;
    } else if (m.type === "voice") {
      inner = `<span class="chat-voice" data-url="${UI.esc(mediaUrl)}" data-dur="${m.duration || 0}"><span class="vbar"></span>🔊 ${m.duration || 0}″</span>`;
    } else inner = UI.esc(m.text || "");
    el.innerHTML += `<div class="chat-bubble">${inner}</div>`;
    insertAva(el, peer);
    if (m.type === "voice") el.querySelector(".chat-voice").onclick = function () { playVoice(this.getAttribute("data-url")); };
    if (m.type === "image") el.querySelector(".chat-media-img").onclick = () => viewMedia(mediaUrl, "image", m.mediaName);
    if (m.type === "video") el.querySelector(".chat-media-video").onclick = () => viewMedia(mediaUrl, "video", m.mediaName);
    return el;
  }
  function playVoice(url) {
    const a = document.createElement("audio"); a.src = url; a.controls = true;
    const box = UI.el(`<div></div>`); box.appendChild(a);
    UI.modal({ title: "语音消息", body: box, width: "360px", actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => { a.pause(); c(); } }] });
    a.play().catch(() => {});
  }
  function viewMedia(url, kind, name) {
    const box = UI.el(`<div style="text-align:center;position:relative"></div>`);
    if (kind === "image") box.innerHTML = `<img src="${UI.esc(url)}" style="max-width:100%;max-height:60vh;border-radius:8px"/>`;
    else box.innerHTML = `<video src="${UI.esc(url)}" controls style="max-width:100%;max-height:60vh;border-radius:8px"></video>`;
    const a = UI.el(`<a class="chat-save-ic" href="${UI.esc(url)}" download="${UI.esc(name || "file")}" title="保存到相册">⬇</a>`);
    box.appendChild(a);
    UI.modal({ title: "查看媒体", body: box, width: "520px", actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }] });
  }

  /* ---- helpers ---- */
  function fileToBase64(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res((r.result || "").split(",").pop()); r.onerror = rej; r.readAsDataURL(file); }); }
  function blobToBase64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res((r.result || "").split(",").pop()); r.onerror = rej; r.readAsDataURL(blob); }); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function closeAllModalsKeep(keep) { document.querySelectorAll(".modal-mask").forEach(m => { if (m !== keep) m.remove(); }); }
  function closeAllModals() { document.querySelectorAll(".modal-mask").forEach(m => m.remove()); }
  window.syncStudyRecords = syncStudyRecords;
  window.openProfilePage = openProfilePage;
  window.openStudyLog = openStudyLog;
})();
