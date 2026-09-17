/* ============================================================
   考公工作台 · 社交客户端 (REST + WebSocket)
   依赖后端 server.js。所有数据存后端，本地仅缓存。
   ============================================================ */
window.Social = (function () {
  const LS_BASE = "kg_api_base";
  const LS_TOKEN = "kg_social_token";
  const LS_USER = "kg_social_user";
  const LS_PW = "kg_social_pw"; // 仅用于自动重登，存 localStorage（个人应用）
  let base = localStorage.getItem(LS_BASE) || "";
  let token = localStorage.getItem(LS_TOKEN) || "";
  let me = localStorage.getItem(LS_USER) || "";
  let ws = null, wsRetry = 0, pingTimer = null;
  const listeners = { message: [], presence: [], unread: [], remind: [], friend: [] };

  function setBase(b) { base = (b || "").trim(); localStorage.setItem(LS_BASE, base); }
  function getBase() { return base; }
  function isConfigured() { return !!base; }
  // 同域自动探测：若后端与前端同域部署（一次部署同时托管网页+接口），
  // 无需用户手动填地址。GitHub Pages 等同域无后端时探测失败 → 试备用后端，仍失败则保持「未配置」。
  // 备用后端：本项目已部署在 Railway 的常驻实例（仅作者与伴侣使用，地址稳定）。
  const FALLBACK_BASE = "https://kaogong-production.up.railway.app";
  async function autoDetect() {
    if (base) return false;
    // 1) 同域
    try {
      const r = await fetch(location.origin + "/api/health", { cache: "no-store" });
      if (r.ok) { const j = await r.json(); if (j && j.ok) { setBase(location.origin); return true; } }
    } catch (e) { /* 同域无后端，忽略 */ }
    // 2) 备用后端（跨域）
    if (location.origin === FALLBACK_BASE) return false;
    try {
      const r2 = await fetch(FALLBACK_BASE + "/api/health", { cache: "no-store" });
      if (r2.ok) { const j2 = await r2.json(); if (j2 && j2.ok) { setBase(FALLBACK_BASE); return true; } }
    } catch (e) { /* 备用不可达，忽略 */ }
    return false;
  }
  function isLoggedIn() { return !!token && !!me; }
  function currentUser() { return me; }
  function wsUrl() {
    if (!base) return "";
    const u = new URL(base);
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    return proto + "//" + u.host + "/ws?token=" + encodeURIComponent(token);
  }
  async function api(path, opts) {
    if (!base) throw new Error("未配置后端地址");
    opts = opts || {};
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (token) headers["Authorization"] = "Bearer " + token;
    const r = await fetch(base + path, Object.assign({}, opts, { headers }));
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error((j && j.error) || ("请求失败 " + r.status));
    return j;
  }

  /* ---------- 账号 ---------- */
  async function register(username, password) {
    const j = await api("/api/register", { method: "POST", body: JSON.stringify({ username, password }) });
    token = j.token; me = j.username;
    localStorage.setItem(LS_TOKEN, token); localStorage.setItem(LS_USER, me); localStorage.setItem(LS_PW, password);
    connectWs();
    return j;
  }
  async function login(username, password) {
    const j = await api("/api/login", { method: "POST", body: JSON.stringify({ username, password }) });
    token = j.token; me = j.username;
    localStorage.setItem(LS_TOKEN, token); localStorage.setItem(LS_USER, me); localStorage.setItem(LS_PW, password);
    connectWs();
    return j;
  }
  async function autoLogin() {
    if (!isLoggedIn()) return false;
    try { await getProfile(); connectWs(); return true; }
    catch (e) { return false; }
  }
  function logout() {
    token = ""; me = ""; localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_USER); localStorage.removeItem(LS_PW);
    if (ws) try { ws.close(); } catch (e) {} ws = null;
  }

  /* ---------- 资料 ---------- */
  async function getProfile() { return api("/api/profile"); }
  async function saveProfile(p) { const j = await api("/api/profile", { method: "POST", body: JSON.stringify(p) }); return j; }
  async function getProfileOf(user) { return api("/api/profile/" + encodeURIComponent(user)); }

  /* ---------- 好友 ---------- */
  async function search(q) { return api("/api/users/search?q=" + encodeURIComponent(q || "")); }
  async function sendRequest(to) { return api("/api/friend/request", { method: "POST", body: JSON.stringify({ to }) }); }
  async function listRequests() { return api("/api/friend/requests"); }
  async function accept(from) { return api("/api/friend/accept", { method: "POST", body: JSON.stringify({ from }) }); }
  async function listFriends() { return api("/api/friend/list"); }
  async function setRemark(who, remark) { return api("/api/friend/remark", { method: "POST", body: JSON.stringify({ who, remark }) }); }
  async function setSpecial(who, special) { return api("/api/friend/special", { method: "POST", body: JSON.stringify({ who, special }) }); }
  async function removeFriend(who) { return api("/api/friend/remove", { method: "DELETE", body: JSON.stringify({ who }) }); }

  /* ---------- 聊天 ---------- */
  async function send(msg) { return api("/api/chat/send", { method: "POST", body: JSON.stringify(msg) }); }
  async function history(withU, before) { return api("/api/chat/history?with=" + encodeURIComponent(withU) + (before ? "&before=" + before : "")); }
  async function unread() { return api("/api/chat/unread"); }
  async function markRead(withU) { return api("/api/chat/read", { method: "POST", body: JSON.stringify({ with: withU }) }); }
  async function uploadMedia(mime, data, name) { return api("/api/media", { method: "POST", body: JSON.stringify({ mime, data, name }) }); }
  function mediaUrl(url) { if (!url) return ""; if (/^https?:/.test(url)) return url; return base + url; }

  /* ---------- 提醒 ---------- */
  async function sendRemind(who, text) { return api("/api/friend/remind", { method: "POST", body: JSON.stringify({ who, text }) }); }
  async function getReminders() { return api("/api/reminders"); }
  async function clearReminders() { return api("/api/reminders/clear", { method: "POST" }); }

  /* ---------- WebSocket ---------- */
  function connectWs() {
    if (!isConfigured() || !isLoggedIn()) return;
    if (ws && (ws.readyState === 1 || ws.readyState === 0)) return;
    if (typeof WebSocket === "undefined") return;
    try { ws = new WebSocket(wsUrl()); } catch (e) { scheduleReconnect(); return; }
    ws.onopen = () => { wsRetry = 0; startPing(); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === "message") emit("message", m.message);
      else if (m.type === "presence") emit("presence", { user: m.user, online: m.online });
      else if (m.type === "presence-self") emit("presence", { self: true, list: m.online });
      else if (m.type === "remind") emit("remind", m.reminder);
      else if (m.type === "friend-request" || m.type === "friend-accepted") emit("friend", m);
      else if (m.type === "unread") emit("unread", m.unread);
    };
    ws.onclose = () => { stopPing(); scheduleReconnect(); };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }
  function startPing() { stopPing(); pingTimer = setInterval(() => { if (ws && ws.readyState === 1) try { ws.send(JSON.stringify({ type: "ping" })); } catch (e) {} }, 25000); }
  function stopPing() { if (pingTimer) clearInterval(pingTimer); pingTimer = null; }
  function scheduleReconnect() { wsRetry++; if (wsRetry > 10) return; setTimeout(connectWs, Math.min(8000, 1000 * wsRetry)); }

  function on(ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); return () => { listeners[ev] = (listeners[ev] || []).filter(f => f !== cb); }; }
  function emit(ev, data) { (listeners[ev] || []).forEach(cb => { try { cb(data); } catch (e) {} }); }

  return {
    setBase, getBase, isConfigured, isLoggedIn, currentUser, autoDetect,
    register, login, autoLogin, logout,
    getProfile, saveProfile, getProfileOf,
    search, sendRequest, listRequests, accept, listFriends, setRemark, setSpecial, removeFriend,
    send, history, unread, markRead, uploadMedia, mediaUrl,
    sendRemind, getReminders, clearReminders,
    connectWs, on
  };
})();
