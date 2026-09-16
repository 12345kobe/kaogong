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
    // 特别关心置顶
    friends.sort((a, b) => (b.special === b.special) ? 0 : 0);
    const special = friends.filter(f => f.special);
    const normal = friends.filter(f => !f.special);
    const groups = {};
    normal.forEach(f => { const k = firstLetter(f.remark || f.nickname || f.username); (groups[k] = groups[k] || []).push(f); });
    const keys = Object.keys(groups).sort();
    let html = "";
    if (special.length) {
      html += `<div class="contacts-group"><div class="contacts-ghead">★ 特别关心</div>` +
        special.map(f => itemHtml(f, true)).join("") + `</div>`;
    }
    keys.forEach(k => {
      groups[k].sort((a, b) => (a.remark || a.nickname || a.username).localeCompare(b.remark || b.nickname || b.username, "zh"));
      html += `<div class="contacts-group"><div class="contacts-ghead">${k}</div>` + groups[k].map(f => itemHtml(f, false)).join("") + `</div>`;
    });
    list.innerHTML = html;
    list.querySelectorAll("[data-user]").forEach(el => {
      el.onclick = () => openFriendHomepage(el.getAttribute("data-user"));
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

  /* ===================== 好友主页 ===================== */
  async function openFriendHomepage(username) {
    let j; try { j = await Social.getProfileOf(username); } catch (e) { UI.toast("加载失败：" + e.message); return; }
    const p = j.profile || {};
    const name = p.nickname || username;
    const plan = p.plan || [];
    const incomplete = plan.some(t => !t.done);
    const box = UI.el(`<div class="friend-home">
      <div class="fh-top">
        <div class="fh-ava">${p.avatar ? `<img src="${UI.esc(Social.mediaUrl(p.avatar))}"/>` : UI.esc((name[0] || "?"))}</div>
        <div>
          <div class="fh-name">${UI.esc(name)} ${p.online ? '<span class="on-dot"></span>' : ''}</div>
          <div class="muted small">@${UI.esc(username)} ${p.gender ? "· " + UI.esc(p.gender) : ""} ${p.birthday ? "· 🎂" + UI.esc(p.birthday) : ""}</div>
          ${p.bio ? `<div class="fh-bio">${UI.esc(p.bio)}</div>` : ""}
        </div>
      </div>
      <div class="fh-plan">
        <div class="fh-sub">📅 今日计划${plan.length ? "" : "（暂无）"}</div>
        ${plan.length ? `<table class="plan-tbl">` + plan.map(t => `<tr class="${t.done ? "done" : ""}"><td>${t.done ? "✅" : "⬜"}</td><td>${UI.esc(t.text)}</td></tr>`).join("") + `</table>` : `<div class="muted small">对方还没设置计划</div>`}
      </div>
      <div class="row fh-actions" style="gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn primary" id="fhChat">💬 发消息</button>
        <button class="btn" id="fhRemark">✏️ 备注</button>
        <button class="btn" id="fhStar">${p.special ? "★ 已特别关心" : "☆ 特别关心"}</button>
        <button class="btn" id="fhRemind" ${incomplete ? "" : "disabled title='对方计划均已完成'"}>🔔 提醒学习</button>
        <button class="btn danger ghost" id="fhDel">🗑 删除好友</button>
      </div>
    </div>`);
    UI.modal({
      title: "好友主页", body: box, width: "460px",
      actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }]
    });
    box.querySelector("#fhChat").onclick = () => { closeAllModals(); openChat(username); };
    box.querySelector("#fhRemark").onclick = () => {
      const v = prompt("修改备注名（留空则显示昵称）：", "");
      if (v === null) return;
      Social.setRemark(username, v.trim()).then(() => { UI.toast("备注已更新"); closeAllModals(); openFriendHomepage(username); }).catch(e => UI.toast("失败：" + e.message));
    };
    box.querySelector("#fhStar").onclick = () => {
      Social.setSpecial(username, !p.special).then(() => { UI.toast(p.special ? "已取消特别关心" : "已设为特别关心"); closeAllModals(); openFriendHomepage(username); }).catch(e => UI.toast("失败：" + e.message));
    };
    box.querySelector("#fhRemind").onclick = () => {
      const text = prompt("提醒内容：", "快来学习啦，坚持就是胜利～");
      if (text === null) return;
      Social.sendRemind(username, text).then(() => { UI.toast("已发送提醒"); closeAllModals(); }).catch(e => UI.toast("失败：" + e.message));
    };
    box.querySelector("#fhDel").onclick = () => {
      if (!confirm("确定删除该好友？")) return;
      Social.removeFriend(username).then(() => { UI.toast("已删除"); closeAllModals(); if (host_ref) refreshList(host_ref); }).catch(e => UI.toast("失败：" + e.message));
    };
  }
  let host_ref = null;

  /* ===================== 微信式聊天 ===================== */
  const EMOJI = ["😀","😂","🤣","😊","😍","😘","🤔","😎","😭","😡","👍","👏","🙏","💪","🎉","❤️","💔","🌹","🔥","⭐","✅","❌","📚","⏰","🌟","😴","🥳","😅","🤝","💯","🌈"];
  let chatUnSub = null;

  function openChat(peer) {
    if (chatUnSub) { try { chatUnSub(); } catch (e) {} chatUnSub = null; }
    const wrap = UI.el(`<div class="chat-screen">
      <div class="chat-head">
        <button class="chat-back" id="chBack">‹</button>
        <div class="chat-peer"><span id="chName"></span> <span id="chOnline" class="muted small"></span></div>
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
    let peerInfo = { nickname: peer, online: false };
    Social.listFriends().then(j => {
      const f = (j.friends || []).find(x => x.username === peer);
      if (f) { peerInfo = f; wrap.querySelector("#chName").textContent = f.remark || f.nickname || peer; }
      else wrap.querySelector("#chName").textContent = peer;
      wrap.querySelector("#chOnline").textContent = peerInfo.online ? "在线" : "离线";
    }).catch(() => { wrap.querySelector("#chName").textContent = peer; });

    let oldest = 0;
    async function loadHistory(before) {
      try {
        const j = await Social.history(peer, before);
        const arr = j.messages || [];
        if (!before) { msgs.innerHTML = ""; }
        arr.forEach(m => msgs.insertBefore(bubble(m, peer), msgs.firstChild));
        if (!before) msgs.scrollTop = msgs.scrollHeight;
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
    // 语音
    let rec = null, recStream = null, recStart = 0;
    wrap.querySelector("#chVoice").onclick = async () => {
      const btn = wrap.querySelector("#chVoice");
      if (rec) { // 停止
        try { rec.stop(); } catch (e) {}
        return;
      }
      try {
        recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        rec = new MediaRecorder(recStream);
        const chunks = [];
        rec.ondataavailable = e => chunks.push(e.data);
        rec.onstop = () => {
          btn.textContent = "🎤";
          const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          const dur = Math.round((Date.now() - recStart) / 1000);
          UI.toast("上传语音中…");
          blobToBase64(blob).then(b64 => Social.uploadMedia(blob.type, b64, "voice." + (blob.type.includes("mp4") ? "m4a" : "webm")).then(r => {
            Social.send({ to: peer, type: "voice", url: r.url, duration: dur, clientId: "c" + Date.now() }).catch(e => UI.toast("发送失败：" + e.message));
          })).catch(e => UI.toast("上传失败：" + e.message));
          recStream.getTracks().forEach(t => t.stop());
        };
        recStart = Date.now(); rec.start();
        btn.textContent = "⏹ 录音中";
      } catch (e) { UI.toast("无法录音：" + e.message); }
    };
    // 返回
    wrap.querySelector("#chBack").onclick = closeChat;
    mask.onclick = (e) => { if (e.target === mask) closeChat(); };

    // 实时收消息
    chatUnSub = Social.on("message", (m) => {
      if ((m.from === peer && m.to === Social.currentUser()) || (m.to === peer && m.from === Social.currentUser())) {
        msgs.appendChild(bubble(m, peer)); msgs.scrollTop = msgs.scrollHeight;
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
  function bubble(m, peer) {
    const mine = m.from === Social.currentUser();
    const el = UI.el(`<div class="chat-row ${mine ? "mine" : "theirs"}"></div>`);
    let inner = "";
    if (m.type === "image") inner = `<img class="chat-media-img" src="${UI.esc(Social.mediaUrl(m.url))}"/>`;
    else if (m.type === "video") inner = `<video class="chat-media-video" src="${UI.esc(Social.mediaUrl(m.url))}" controls></video>`;
    else if (m.type === "voice") inner = `<span class="chat-voice" data-url="${UI.esc(Social.mediaUrl(m.url))}" data-dur="${m.duration || 0}">🔊 ${m.duration || 0}"</span>`;
    else inner = UI.esc(m.text || "");
    el.innerHTML = `<div class="chat-bubble">${inner}</div>`;
    if (m.type === "voice") el.querySelector(".chat-voice").onclick = function () { playVoice(this.getAttribute("data-url")); };
    if (m.type === "image") el.querySelector(".chat-media-img").onclick = () => viewMedia(Social.mediaUrl(m.url), "image", m.mediaName);
    if (m.type === "video") el.querySelector(".chat-media-video").onclick = () => viewMedia(Social.mediaUrl(m.url), "video", m.mediaName);
    return el;
  }
  function playVoice(url) {
    const a = document.createElement("audio"); a.src = url; a.controls = true;
    const box = UI.el(`<div></div>`); box.appendChild(a);
    UI.modal({ title: "语音消息", body: box, width: "360px", actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => { a.pause(); c(); } }] });
    a.play().catch(() => {});
  }
  function viewMedia(url, kind, name) {
    const box = UI.el(`<div style="text-align:center"></div>`);
    if (kind === "image") box.innerHTML = `<img src="${UI.esc(url)}" style="max-width:100%;max-height:60vh"/>`;
    else box.innerHTML = `<video src="${UI.esc(url)}" controls style="max-width:100%;max-height:60vh"></video>`;
    const a = UI.el(`<a class="btn primary" href="${UI.esc(url)}" download="${UI.esc(name || "file")}" style="margin-top:10px;display:inline-block">⬇ 保存到本地</a>`);
    box.appendChild(a);
    UI.modal({ title: "查看媒体", body: box, width: "520px", actions: [{ label: "关闭", cls: "ghost", onClick: (m, c) => c() }] });
  }

  /* ---- helpers ---- */
  function fileToBase64(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res((r.result || "").split(",").pop()); r.onerror = rej; r.readAsDataURL(file); }); }
  function blobToBase64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res((r.result || "").split(",").pop()); r.onerror = rej; r.readAsDataURL(blob); }); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function closeAllModalsKeep(keep) { document.querySelectorAll(".modal-mask").forEach(m => { if (m !== keep) m.remove(); }); }
  function closeAllModals() { document.querySelectorAll(".modal-mask").forEach(m => m.remove()); }
})();
