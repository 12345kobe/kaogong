/* ============================================================
   考公工作台 · 后端服务 (Node + Express + WebSocket)
   功能：账号注册/登录 + 数据同步 + 时政抓取 + 智能出题
        + 社交：资料 / 好友 / 聊天(实时) / 在线状态 / 媒体 / 提醒
   零原生依赖（仅 express + ws），可一键部署到 Render / Railway。
   ============================================================ */
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.SYNC_SECRET || "kaogong-desk-default-secret-change-me";
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SOCIAL_FILE = path.join(DATA_DIR, "social.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const MEDIA_DIR = path.join(DATA_DIR, "media");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}");
if (!fs.existsSync(SOCIAL_FILE)) fs.writeFileSync(SOCIAL_FILE, "{}");
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, "{}");

/* ---------- 持久化 helpers ---------- */
function loadUsers() { try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); } catch (e) { return {}; } }
function saveUsers(u) { fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2)); }
function loadSocial() { try { return JSON.parse(fs.readFileSync(SOCIAL_FILE, "utf8")); } catch (e) { return {}; } }
function saveSocial(s) { fs.writeFileSync(SOCIAL_FILE, JSON.stringify(s, null, 2)); }
function loadMessages() { try { return JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf8")); } catch (e) { return {}; } }
function saveMessages(m) { fs.writeFileSync(MESSAGES_FILE, JSON.stringify(m, null, 2)); }

/* ---------- 密码 / token ---------- */
function hashPw(password, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const h = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash: h };
}
function verifyPw(password, salt, hash) {
  const h = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash));
}
function makeToken(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 })).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return payload + "." + sig;
}
function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [p, s] = token.split(".");
  const sig = crypto.createHmac("sha256", SECRET).update(p).digest("base64url");
  if (sig !== s) return null;
  try { const d = JSON.parse(Buffer.from(p, "base64url").toString()); if (d.exp < Date.now()) return null; return d.u; } catch (e) { return null; }
}

/* ---------- 社交数据结构 ---------- */
// social = {
//   friends:   { user: { peer: { remark, special, addedAt } } },        // 双向
//   requests:  { user: { from: ts } },                                   // user 收到的请求
//   unread:    { user: { peer: count } },
//   reminders: { user: [ { from, ts, text } ] }
// }
function ensureSocialUser(s, user) { s.friends = s.friends || {}; s.requests = s.requests || {}; s.unread = s.unread || {}; s.reminders = s.reminders || {};
  s.friends[user] = s.friends[user] || {}; s.requests[user] = s.requests[user] || {}; s.unread[user] = s.unread[user] || {}; s.reminders[user] = s.reminders[user] || []; return s; }
function pairKey(a, b) { return [a, b].sort().join("__"); }

app.use(express.json({ limit: "40mb" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS,DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
function auth(req, res) {
  const token = (req.query.token) || (req.body && req.body.token) || (req.headers.authorization || "").replace(/^Bearer\s+/, "");
  const user = verifyToken(token);
  if (!user) { res.status(401).json({ error: "未登录或登录已过期" }); return null; }
  return user;
}

/* ============================================================
   账号 / 数据同步（保留原有）
   ============================================================ */
app.post("/api/register", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !/^[\w一-龥]{2,20}$/.test(username)) return res.status(400).json({ error: "用户名需 2-20 位（字母/数字/中文）" });
  if (!password || password.length < 4) return res.status(400).json({ error: "密码至少 4 位" });
  const users = loadUsers();
  if (users[username]) return res.status(409).json({ error: "用户名已存在" });
  const { salt, hash } = hashPw(password);
  users[username] = { salt, hash, data: {}, profile: {}, createdAt: Date.now() };
  saveUsers(users);
  const s = ensureSocialUser(loadSocial(), username); saveSocial(s);
  res.json({ token: makeToken(username), username });
});
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const users = loadUsers();
  const u = users[username];
  if (!u || !verifyPw(password, u.salt, u.hash)) return res.status(401).json({ error: "用户名或密码错误" });
  res.json({ token: makeToken(username), username });
});
app.get("/api/data", (req, res) => {
  const user = auth(req, res); if (!user) return;
  const users = loadUsers();
  res.json({ data: (users[user] && users[user].data) || {} });
});
app.post("/api/data", (req, res) => {
  const user = auth(req, res); if (!user) return;
  const { data } = req.body || {};
  if (!data) return res.status(400).json({ error: "缺少 data" });
  const users = loadUsers();
  users[user] = users[user] || {};
  users[user].data = data;
  saveUsers(users);
  res.json({ ok: true });
});

/* ============================================================
   资料（昵称/性别/生日/头像/签名/计划）
   ============================================================ */
const PROFILE_REQ = ["nickname", "gender", "birthday"];
app.get("/api/profile", (req, res) => {
  const user = auth(req, res); if (!user) return;
  const users = loadUsers();
  const p = (users[user] && users[user].profile) || {};
  res.json({ profile: Object.assign({ username: user }, p), complete: PROFILE_REQ.every(k => p[k]) });
});
app.post("/api/profile", (req, res) => {
  const user = auth(req, res); if (!user) return;
  const users = loadUsers();
  users[user] = users[user] || {};
  const p = users[user].profile || {};
  const allowed = ["nickname", "gender", "birthday", "avatar", "bio", "plan", "records"];
  for (const k of allowed) { if (k in (req.body || {})) p[k] = req.body[k]; }
  if (Array.isArray(p.records)) p.records = p.records.slice(0, 100); // 学习记录最多保留 100 条
  users[user].profile = p;
  saveUsers(users);
  res.json({ profile: Object.assign({ username: user }, p), complete: PROFILE_REQ.every(k => p[k]) });
});
app.get("/api/profile/:user", (req, res) => {
  const me = auth(req, res); if (!me) return;
  const users = loadUsers();
  const u = users[req.params.user];
  if (!u) return res.status(404).json({ error: "用户不存在" });
  const p = u.profile || {};
  res.json({ profile: Object.assign({ username: req.params.user }, p), complete: PROFILE_REQ.every(k => p[k]) });
});

/* ============================================================
   好友
   ============================================================ */
app.get("/api/users/search", (req, res) => {
  const me = auth(req, res); if (!me) return;
  const q = (req.query.q || "").trim();
  const users = loadUsers();
  const list = Object.keys(users)
    .filter(u => u !== me && (!q || u.includes(q) || (users[u].profile && (users[u].profile.nickname || "").includes(q))))
    .slice(0, 30)
    .map(u => ({ username: u, nickname: (users[u].profile && users[u].profile.nickname) || u }));
  res.json({ users: list });
});
app.post("/api/friend/request", (req, res) => {
  const me = auth(req, res); if (!me) return;
  const to = (req.body && req.body.to) || "";
  const users = loadUsers();
  if (!users[to] || to === me) return res.status(400).json({ error: "用户不存在" });
  const s = ensureSocialUser(loadSocial(), me);
  if (s.friends[me][to]) return res.status(409).json({ error: "已是好友" });
  if (s.requests[to] && s.requests[to][me]) return res.status(409).json({ error: "请求已发送" });
  s.requests[to] = s.requests[to] || {};
  s.requests[to][me] = Date.now();
  saveSocial(s);
  broadcastTo(to, { type: "friend-request", from: me });
  res.json({ ok: true });
});
app.post("/api/friend/accept", (req, res) => {
  const me = auth(req, res); if (!me) return;
  const from = (req.body && req.body.from) || "";
  const s = ensureSocialUser(loadSocial(), me);
  if (!s.requests[me] || !s.requests[me][from]) return res.status(400).json({ error: "无此请求" });
  delete s.requests[me][from];
  s.friends[me][from] = { remark: "", special: false, addedAt: Date.now() };
  s.friends[from] = s.friends[from] || {};
  s.friends[from][me] = { remark: "", special: false, addedAt: Date.now() };
  saveSocial(s);
  broadcastTo(from, { type: "friend-accepted", by: me });
  res.json({ ok: true });
});
app.get("/api/friend/requests", (req, res) => {
  const me = auth(req, res); if (!me) return;
  const s = ensureSocialUser(loadSocial(), me);
  const users = loadUsers();
  const incoming = Object.keys(s.requests[me] || {}).map(from => ({ from, nickname: (users[from] && users[from].profile && users[from].profile.nickname) || from, ts: s.requests[me][from] }));
  res.json({ incoming });
});
app.get("/api/friend/list", (req, res) => {
  const me = auth(req, res); if (!me) return;
  const s = ensureSocialUser(loadSocial(), me);
  const users = loadUsers();
  const online = presenceList();
  const list = Object.keys(s.friends[me] || {}).map(peer => {
    const fp = (users[peer] && users[peer].profile) || {};
    return {
      username: peer,
      nickname: (fp.nickname) || peer,
      remark: (s.friends[me][peer].remark) || "",
      special: !!s.friends[me][peer].special,
      gender: fp.gender || "",
      birthday: fp.birthday || "",
      avatar: fp.avatar || "",
      bio: fp.bio || "",
      plan: fp.plan || [],
      online: !!online[peer]
    };
  });
  res.json({ friends: list });
});
app.post("/api/friend/remark", (req, res) => {
  const me = auth(req, res); if (!me) return;
  const { who, remark } = req.body || {};
  const s = ensureSocialUser(loadSocial(), me);
  if (!s.friends[me][who]) return res.status(400).json({ error: "非好友" });
  s.friends[me][who].remark = remark || "";
  saveSocial(s);
  res.json({ ok: true });
});
app.post("/api/friend/special", (req, res) => {
  const me = auth(req, res); if (!me) return;
  const { who, special } = req.body || {};
  const s = ensureSocialUser(loadSocial(), me);
  if (!s.friends[me][who]) return res.status(400).json({ error: "非好友" });
  s.friends[me][who].special = !!special;
  saveSocial(s);
  res.json({ ok: true });
});
app.delete("/api/friend/remove", (req, res) => {
  const me = auth(req, res); if (!me) return;
  const who = (req.body && req.body.who) || (req.query.who);
  const s = ensureSocialUser(loadSocial(), me);
  if (s.friends[me][who]) { delete s.friends[me][who]; saveSocial(s); }
  res.json({ ok: true });
});

/* ============================================================
   聊天
   ============================================================ */
app.post("/api/chat/send", (req, res) => {
  const me = auth(req, res); if (!me) return;
  const { to, type, text, url, duration, clientId, mediaName } = req.body || {};
  if (!to || !users_exist(to) || to === me) return res.status(400).json({ error: "收件人无效" });
  const s = ensureSocialUser(loadSocial(), me);
  if (!s.friends[me][to]) return res.status(403).json({ error: "请先加对方为好友" });
  const msg = { id: crypto.randomUUID(), from: me, to, type: type || "text", text: text || "", url: url || "", duration: duration || 0, mediaName: mediaName || "", clientId: clientId || "", ts: Date.now() };
  const all = loadMessages();
  const key = pairKey(me, to);
  all[key] = all[key] || [];
  all[key].push(msg);
  if (all[key].length > 2000) all[key] = all[key].slice(-2000);
  saveMessages(all);
  s.unread[to] = s.unread[to] || {};
  s.unread[to][me] = (s.unread[to][me] || 0) + 1;
  saveSocial(s);
  broadcastTo(to, { type: "message", message: msg });
  res.json({ message: msg });
});
function users_exist(u) { const users = loadUsers(); return !!users[u]; }
app.get("/api/chat/history", (req, res) => {
  const me = auth(req, res); if (!me) return;
  const withU = req.query.with || "";
  const before = parseInt(req.query.before || "0", 10); // 时间戳，加载更早
  const all = loadMessages();
  const arr = (all[pairKey(me, withU)] || []).slice();
  let slice = arr;
  if (before) slice = arr.filter(m => m.ts < before);
  slice = slice.slice(-30);
  res.json({ messages: slice, hasMore: slice.length === 30 && slice[0].ts > (all[pairKey(me, withU)][0] || 0).ts });
});
app.get("/api/chat/unread", (req, res) => {
  const me = auth(req, res); if (!me) return;
  const s = ensureSocialUser(loadSocial(), me);
  res.json({ unread: s.unread[me] || {} });
});
app.post("/api/chat/read", (req, res) => {
  const me = auth(req, res); if (!me) return;
  const withU = (req.body && req.body.with) || "";
  const s = ensureSocialUser(loadSocial(), me);
  if (s.unread[me]) s.unread[me][withU] = 0;
  saveSocial(s);
  res.json({ ok: true });
});

/* ============================================================
   提醒（督促好友学习）
   ============================================================ */
app.post("/api/friend/remind", (req, res) => {
  const me = auth(req, res); if (!me) return;
  const { who, text } = req.body || {};
  const s = ensureSocialUser(loadSocial(), me);
  if (!s.friends[me][who]) return res.status(403).json({ error: "请先加对方为好友" });
  s.reminders[who] = s.reminders[who] || [];
  const r = { from: me, ts: Date.now(), text: text || "快来学习啦，别掉队！" };
  s.reminders[who].push(r);
  saveSocial(s);
  broadcastTo(who, { type: "remind", reminder: r });
  res.json({ ok: true });
});
app.get("/api/reminders", (req, res) => {
  const me = auth(req, res); if (!me) return;
  const s = ensureSocialUser(loadSocial(), me);
  res.json({ reminders: s.reminders[me] || [] });
});
app.post("/api/reminders/clear", (req, res) => {
  const me = auth(req, res); if (!me) return;
  const s = ensureSocialUser(loadSocial(), me);
  s.reminders[me] = [];
  saveSocial(s);
  res.json({ ok: true });
});

/* ============================================================
   媒体上传（写文件，返回 URL）
   ============================================================ */
const MEDIA_EXT = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "audio/webm": "weba", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg" };
app.post("/api/media", (req, res) => {
  const me = auth(req, res); if (!me) return;
  const { mime, data, name } = req.body || {};
  if (!mime || !data) return res.status(400).json({ error: "缺少媒体数据" });
  const ext = MEDIA_EXT[mime] || "bin";
  const fname = me + "_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex") + "." + ext;
  const buf = Buffer.from(data, "base64");
  if (buf.length > 40 * 1024 * 1024) return res.status(413).json({ error: "文件过大(>40MB)" });
  fs.writeFileSync(path.join(MEDIA_DIR, fname), buf);
  res.json({ url: "/api/media/" + fname, name: name || fname });
});
app.use("/api/media", express.static(MEDIA_DIR, { maxAge: "7d" }));

/* ============================================================
   时政 / 智能出题（保留原有）
   ============================================================ */
const FEEDS = [
  "https://www.people.com.cn/rss/politics.xml",
  "https://news.cctv.com/rss/News.xml",
  "http://www.xinhuanet.com/politics/news_politics.xml",
  "http://www.chinanews.com/rss/scroll-news.xml"
];
function fetchRSS(url) {
  return new Promise((resolve) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } })
      .then(r => { if (!r.ok) throw new Error("bad status"); return r.text(); })
      .then(buf => {
        const items = []; const re = /<item>([\s\S]*?)<\/item>/g; let m;
        while ((m = re.exec(buf))) {
          const t = (/<title>([\s\S]*?)<\/title>/.exec(m[1]) || [])[1];
          if (t) { const c = t.replace(/<!\[CDATA\[|\]\]>/g, "").trim(); if (c) items.push(c); }
          if (items.length >= 6) break;
        }
        resolve(items);
      })
      .catch(() => resolve([]))
      .finally(() => clearTimeout(timer));
  });
}
app.get("/api/news", async (req, res) => {
  let news = [];
  for (const f of FEEDS) { const arr = await fetchRSS(f); if (arr.length) news = news.concat(arr); if (news.length >= 12) break; }
  news = news.filter(t => t && t.trim()).slice(0, 12);
  if (!news.length) news = ["（示例）新征程上，要牢牢把握高质量发展这个首要任务，因地制宜发展新质生产力。",
    "（示例）广东深入实施“百县千镇万村高质量发展工程”。", "（示例）我国持续推进“双碳”工作，稳妥推进碳达峰碳中和。"];
  res.json({ news });
});
const LLM_SYS = `你是一名公务员考试（国考/省考）命题专家。请根据用户提供的近期时政/新闻素材，出单项选择题。
要求：
1. 严格只输出 JSON，格式：{"questions":[{"q":"题干","options":["A","B","C","D"],"a":正确选项下标(0-3整数),"e":"解析(1-2句)","tag":"考点标签(如 时政/经济/党建/科技)"}]}
2. 每题 4 个选项，只有 1 个正确；正确选项下标 a 必须准确对应 options 数组中的下标；
3. 题干与选项贴近公考风格，语言简洁、无歧义；解析要点明知识点与依据；
4. 除 JSON 外不要输出任何多余说明文字。`;
function buildPrompt(news, count, subject) {
  const joined = (news && news.length) ? news.slice(0, 15).map((n, i) => `${i + 1}. ${n}`).join("\n") : "（无具体素材，请基于近期国内重大时政方针政策出题）";
  return `素材（近半月时政/新闻）：\n${joined}\n\n请出 ${count} 道「${subject}」相关单选题。`;
}
function parseQuestions(content) {
  let s = (content || "").trim();
  const f = s.indexOf("{"); const l = s.lastIndexOf("}");
  if (f >= 0 && l > f) s = s.slice(f, l + 1);
  try {
    const j = JSON.parse(s);
    const arr = j.questions || [];
    return arr.filter(x => x && x.q && Array.isArray(x.options) && x.options.length === 4 && x.a >= 0 && x.a <= 3)
      .map(x => ({ q: String(x.q), options: x.options.map(String), a: +x.a, e: x.e ? String(x.e) : "", tag: x.tag ? String(x.tag) : "" }));
  } catch (e) { return []; }
}
app.post("/api/generate-questions", async (req, res) => {
  const { news = [], count = 10, subject = "政治" } = req.body || {};
  const key = process.env.LLM_API_KEY;
  if (!key) return res.status(503).json({ error: "后端未配置 LLM_API_KEY，无法智能出题。" });
  const base = (process.env.LLM_API_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  try {
    const r = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({ model, messages: [{ role: "system", content: LLM_SYS }, { role: "user", content: buildPrompt(news, count, subject) }], temperature: 0.7, response_format: { type: "json_object" } })
    });
    if (!r.ok) { const t = await r.text(); return res.status(502).json({ error: "大模型调用失败：" + r.status + " " + t.slice(0, 200) }); }
    const j = await r.json();
    const content = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
    const qs = parseQuestions(content);
    if (!qs.length) return res.status(502).json({ error: "大模型返回内容无法解析为题目，请重试。" });
    res.json({ questions: qs });
  } catch (e) { res.status(500).json({ error: "智能出题异常：" + (e && e.message ? e.message : e) }); }
});

/* ---------- 网页抓取代理：前端「导入网页」用，规避浏览器跨域限制 ---------- */
app.get("/api/fetch-url", async (req, res) => {
  const target = String(req.query.url || "").trim();
  if (!/^https?:\/\//i.test(target)) return res.status(400).json({ error: "url 参数无效" });
  try {
    const r = await fetch(target, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9"
      }
    });
    const html = await r.text();
    res.json({ ok: true, url: target, html });
  } catch (e) {
    res.status(502).json({ error: "抓取失败：" + (e && e.message ? e.message : e) });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

/* ============================================================
   静态前端托管（可选）：若仓库根的 site/ 存在，则同域一起托管 PWA。
   这样「一次部署」即可同时提供 网页 + 接口 + WebSocket，前端无需跨域、
   也无需再单独填后端地址（同域自动探测）。以 backend/ 为根部署时
   ../site 不存在，本段自动跳过，仍是纯 API 服务。
   ============================================================ */
const SITE_DIR = path.join(__dirname, "..");   // 部署时＝仓库根；本地＝项目根
// 白名单：只放行前端资源，绝不暴露 backend/ 源码、.git、tools/、.workbuddy 等
const STATIC_PREFIX = ["/js/", "/css/", "/assets/"];
const STATIC_EXACT = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];
if (fs.existsSync(path.join(SITE_DIR, "index.html"))) {
  app.get("*", (req, res, next) => {
    const p = req.path;
    if (p.startsWith("/api") || p.startsWith("/ws")) return next();
    const ok = STATIC_EXACT.indexOf(p) >= 0 || STATIC_PREFIX.some(x => p.startsWith(x));
    if (!ok) return next();
    const file = path.join(SITE_DIR, p === "/" ? "index.html" : p);
    if (!file.startsWith(SITE_DIR)) return next();                 // 防目录穿越
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
    res.sendFile(file);
  });
  console.log("[static] 已同域托管前端(白名单): " + SITE_DIR);
}

/* ============================================================
   WebSocket：在线状态 + 实时消息 / 提醒 / 好友事件
   ============================================================ */
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });
const online = new Map(); // username -> Set<ws>
function presenceList() { const o = {}; online.forEach((set, u) => { if (set.size) o[u] = true; }); return o; }
function broadcastTo(user, obj) {
  const set = online.get(user);
  if (!set || !set.size) return;
  const data = JSON.stringify(obj);
  set.forEach(ws => { if (ws.readyState === 1) try { ws.send(data); } catch (e) {} });
}
function notifyFriendsPresence(user, isOnline) {
  const s = loadSocial();
  if (!s.friends || !s.friends[user]) return;
  const payload = { type: "presence", user, online: isOnline };
  Object.keys(s.friends[user]).forEach(peer => broadcastTo(peer, payload));
}
wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://x");
  const token = url.searchParams.get("token");
  const user = verifyToken(token);
  if (!user) { try { ws.close(); } catch (e) {} return; }
  ws._user = user;
  if (!online.has(user)) online.set(user, new Set());
  online.get(user).add(ws);
  // 通知好友上线
  notifyFriendsPresence(user, true);
  broadcastTo(user, { type: "presence-self", online: presenceList() });
  ws.on("message", (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (m.type === "ping") { try { ws.send(JSON.stringify({ type: "pong", t: Date.now() })); } catch (e) {} }
  });
  ws.on("close", () => {
    const set = online.get(user);
    if (set) { set.delete(ws); if (!set.size) online.delete(user); }
    if (!online.has(user)) notifyFriendsPresence(user, false);
  });
});

server.listen(PORT, () => console.log("考公工作台服务已启动: http://localhost:" + PORT));
