#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一键部署考公工作台 PWA 到 GitHub Pages（永久静态托管，不被回收）。

用法：
  GH_TOKEN=ghp_xxx  python tools/gh_pages_deploy.py [repo名]

- repo 名默认 "kaogong"
- 需要 ghp_ 开头的 Personal Access Token，勾选 repo 权限（全仓库读写）
- 部署目录：项目根下的 site/（已构建好的纯静态 PWA：index.html/manifest/css/js/assets）
- 部署完成后站点地址： https://<用户名>.github.io/<repo>/
"""
import os, sys, json, subprocess, shutil, urllib.request, urllib.error

TOKEN = os.environ.get("GH_TOKEN") or (sys.argv[2] if len(sys.argv) > 2 else "")
REPO = sys.argv[1] if len(sys.argv) > 1 else "kaogong"
DATA_BRANCH = "userdata"   # 云端同步数据隔离分支（与部署的 main 分离）
DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site")
API = "https://api.github.com"

if not TOKEN:
    print("❌ 未提供 GH_TOKEN。请在环境变量中传入：GH_TOKEN=ghp_xxx python tools/gh_pages_deploy.py")
    sys.exit(1)

def api(method, path, data=None, retries=4):
    """带重试的 GitHub API 调用（沙箱网络偶发 read timeout，重试可显著提高成功率）"""
    import time as _t
    payload = None
    if data is not None:
        payload = json.dumps(data).encode("utf-8")
    last = (0, {"message": "unknown"})
    for attempt in range(retries):
        req = urllib.request.Request(API + path, method=method)
        req.add_header("Authorization", "token " + TOKEN)
        req.add_header("Accept", "application/vnd.github+json")
        if payload is not None:
            req.add_header("Content-Type", "application/json")
            req.data = payload
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.status, json.loads(r.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "ignore")
            try:
                last = (e.code, json.loads(body))
            except Exception:
                last = (e.code, {"message": body[:200]})
            # 4xx（除 429）一般是参数/权限问题，重试无意义
            if 400 <= e.code < 500 and e.code != 429:
                return last
        except Exception as e:
            last = (0, {"message": str(e)})
        if attempt < retries - 1:
            _t.sleep(1.5 * (attempt + 1))
    return last

print("=== 1. 获取 GitHub 用户名 ===")
st, me = api("GET", "/user")
login = me.get("login")
if not login:
    print("❌ 获取用户信息失败：", me.get("message", me))
    sys.exit(1)
print("   用户名：", login)

print(f"=== 2. 创建仓库 {REPO}（已存在则跳过）===")
st, resp = api("POST", "/user/repos", {
    "name": REPO,
    "description": "考公工作台 PWA — 个人备考助手",
    "public": True,
    "auto_init": False,
    "has_pages": True,
})
if st in (200, 201):
    print("   仓库已创建：", resp.get("html_url"))
elif st == 422:
    print("   仓库已存在，继续。")
else:
    print("   ⚠️ 创建仓库返回：", st, resp.get("message", ""))

print(f"=== 2.5 确保云端同步分支 {DATA_BRANCH} 存在 ===")
st_m, mainref = api("GET", f"/repos/{login}/{REPO}/git/refs/heads/main")
if st_m == 200 and isinstance(mainref, dict) and "object" in mainref:
    st_u, _ = api("GET", f"/repos/{login}/{REPO}/git/refs/heads/{DATA_BRANCH}")
    if st_u != 200:
        st_c, cr = api("POST", f"/repos/{login}/{REPO}/git/refs",
                       {"ref": "refs/heads/" + DATA_BRANCH, "sha": mainref["object"]["sha"]})
        print("   已创建分支" if st_c == 201 else f"   ⚠️ 创建分支返回 {st_c}: {cr.get('message','') if isinstance(cr,dict) else cr}")
    else:
        print("   分支已存在，跳过。")
else:
    print("   ⚠️ 无法获取 main 引用，跳过分支创建（首次同步时会自动创建）。")

print("=== 3. 通过 GitHub Git Data API 推送（无需 git 协议，适配受限网络）===")
import base64

def walk_files(root):
    """收集待推送文件。
    排除项（很重要）：node_modules / __pycache__ / .git 等不应该进仓库的目录——
    Railway 构建时自己会 npm install（Dockerfile 里有），node_modules 进仓库只会
    把文件数从 ~280 撑到 ~900，拖慢推送并触发 GitHub tree 接口 422 / 读超时。"""
    EXCLUDE_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", ".idea", ".vscode"}
    out = []
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in EXCLUDE_DIRS and not d.endswith(".egg-info")]
        for fn in fns:
            if fn.endswith((".pyc", ".pyo", ".log", ".tmp")):
                continue
            full = os.path.join(dp, fn)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            # 早年的错误 cp 在 site/backend/ 下嵌了一整份 backend 副本（含 node_modules），
            # 属于垃圾目录，不再推到仓库（未列出的路径会随 tree 全量覆盖而从仓库移除）
            if rel.startswith("backend/backend/"):
                continue
            out.append((rel, full))
    return out

files = walk_files(DIST)
print(f"   待推送文件：{len(files)} 个")

# 当前 main 引用
st, ref = api("GET", f"/repos/{login}/{REPO}/git/refs/heads/main")
if st != 200 or not isinstance(ref, dict) or "object" not in ref:
    st2, repo_info = api("GET", f"/repos/{login}/{REPO}")
    branch = (repo_info.get("default_branch") or "main") if isinstance(repo_info, dict) else "main"
    st, ref = api("GET", f"/repos/{login}/{REPO}/git/refs/heads/{branch}")
if st != 200 or not isinstance(ref, dict) or "object" not in ref:
    print("   ❌ 获取分支引用失败：", st, ref.get("message") if isinstance(ref, dict) else ref); sys.exit(1)
base_sha = ref["object"]["sha"]

# 由云端（GitHub Actions 每日抓取）维护的文件：若线上已存在则本地部署跳过，避免覆盖已抓取到的最新数据
CLOUD_MANAGED = {"assets/data/hotspots.js", "assets/data/hotspot_history.js"}
cloud_present = set()
for cf in CLOUD_MANAGED:
    st_c, _ = api("GET", f"/repos/{login}/{REPO}/contents/{cf}")
    if st_c == 200:
        cloud_present.add(cf)
        print(f"   ☁ 云端已存在 {cf}，部署跳过（保留线上最新抓取数据）")

# 创建 blobs
tree_entries = []
for rel, full in files:
    if rel in cloud_present:
        continue
    with open(full, "rb") as f:
        data = f.read()
    is_text = rel.endswith((".html", ".css", ".js", ".json", ".webmanifest", ".txt", ".md"))
    if is_text:
        st_b, blob = api("POST", f"/repos/{login}/{REPO}/git/blobs",
                         {"content": data.decode("utf-8"), "encoding": "utf-8"})
    else:
        st_b, blob = api("POST", f"/repos/{login}/{REPO}/git/blobs",
                         {"content": base64.b64encode(data).decode("ascii"), "encoding": "base64"})
    if st_b != 201 or not isinstance(blob, dict) or "sha" not in blob:
        print("   ❌ 创建 blob 失败：", rel, st_b, blob.get("message") if isinstance(blob, dict) else blob); sys.exit(1)
    tree_entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})

# ⚠️ 关键：GitHub tree 接口传 base_tree 时，「未列出的文件」不会自动删除，
# 必须显式传 {"sha": null} 才会真正删掉。否则仓库里的历史垃圾（如早年误拷进去的
# backend/backend + node_modules）会永久残留，越堆越多，甚至把 tree 请求撑爆返回 422。
local_paths = {rel for rel, _ in files}
st_rt, rtree = api("GET", f"/repos/{login}/{REPO}/git/trees/{base_sha}?recursive=1")
if st_rt == 200 and isinstance(rtree, dict):
    remote_blobs = {t["path"] for t in (rtree.get("tree") or []) if t.get("type") == "blob"}
    to_delete = sorted(remote_blobs - local_paths)
    if to_delete:
        print(f"   🧹 仓库中已不存在于 site/ 的文件 {len(to_delete)} 个，本次一并删除"
              + (f"：{to_delete[0]} 等" if len(to_delete) > 1 else f"：{to_delete[0]}"))
        for p in to_delete:
            tree_entries.append({"path": p, "mode": "100644", "type": "blob", "sha": None})
else:
    print(f"   ⚠️ 读取远端 tree 失败（{st_rt}），本次不做删除清理")

# 创建 tree + commit + 更新引用；遇到 422 非快进（并发部署竞态）则重新拉取基准并重试一次
commit = None
for attempt in range(2):
    # 创建 tree：新增/修改 + 显式删除，保证仓库与 site/ 完全一致
    st_t, tree = api("POST", f"/repos/{login}/{REPO}/git/trees",
                     {"base_tree": base_sha, "tree": tree_entries})
    if st_t != 201 or not isinstance(tree, dict) or "sha" not in tree:
        print("   ❌ 创建 tree 失败：", st_t, tree.get("message") if isinstance(tree, dict) else tree); sys.exit(1)

    # 创建 commit
    st_c, commit = api("POST", f"/repos/{login}/{REPO}/git/commits",
                       {"message": "deploy 考公工作台 (API)", "tree": tree["sha"], "parents": [base_sha]})
    if st_c != 201 or not isinstance(commit, dict) or "sha" not in commit:
        print("   ❌ 创建 commit 失败：", st_c, commit.get("message") if isinstance(commit, dict) else commit); sys.exit(1)

    # 更新引用
    st_r, ref_up = api("PATCH", f"/repos/{login}/{REPO}/git/refs/heads/main", {"sha": commit["sha"]})
    if st_r in (200, 201):
        print("   推送成功 ✅"); break
    msg = ref_up.get("message", "") if isinstance(ref_up, dict) else str(ref_up)
    if st_r == 422 and attempt == 0 and "fast" in msg.lower():
        print("   ⏳ 基准已变动（并发部署），重新拉取基准并重试…")
        st_b2, ref2 = api("GET", f"/repos/{login}/{REPO}/git/refs/heads/main")
        if st_b2 == 200 and isinstance(ref2, dict) and "object" in ref2:
            base_sha = ref2["object"]["sha"]
            continue
    print("   ❌ 更新引用失败：", st_r, msg); sys.exit(1)

print("=== 4. 启用 GitHub Pages（main 分支根目录）===")
st, resp = api("POST", f"/repos/{login}/{REPO}/pages", {
    "source": {"branch": "main", "path": "/"}
})
if st in (200, 201):
    print("   Pages 已启用：", resp.get("html_url"))
elif st == 409 or (isinstance(resp, dict) and "already" in str(resp.get("message", "")).lower()):
    print("   Pages 已启用（或正在构建）。")
else:
    print("   ⚠️ Pages 启用返回：", st, resp.get("message", ""))
    print("   可稍后到仓库 Settings → Pages 手动确认。")

url = f"https://{login}.github.io/{REPO}/"
print("\n✅ 部署完成！GitHub Pages 构建约需 30 秒~1 分钟，之后访问：")
print("   ", url)
print("\n提示：部署完成后该仓库已常驻 GitHub，你可随时在 Settings → Pages 管理；")
print("      本次使用的 PAT 仅在推送时需要，部署完成后可自行撤销/删除该令牌。")
