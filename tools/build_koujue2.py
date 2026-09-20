# -*- coding: utf-8 -*-
"""坐标版解析：tools/koujue_ocr2.json → assets/data/koujue88.js (window.KJ88)
   按 y 聚类还原行（表格左列标签+右列内容合并为「标签：内容」），修复实战题识别。"""
import re, json, io

SRC = "tools/koujue_ocr2.json"
OUT = "assets/data/koujue88.js"

pages = json.load(io.open(SRC, encoding="utf-8"))

PROMO = re.compile(r"五分钟|打印|包邮|免费|质量|常识速记|口[诀决].{0,3}88条|扫码|微")
CH_RE = re.compile(r"^第[一二三四五六七八九十]+章")
NUM_RE = re.compile(r"^(\d{1,2})[.．、\s]+(\d{2})[.．、]?\s*$")
OPT_RE = re.compile(r"^([A-D])[.．、:：]\s*(.+)$")
ANS_RE = re.compile(r"【?答案】?[:：]?\s*([A-D])")
PICK_RE = re.compile(r"选择\s*([A-D])\s*选项")

def is_promo(t):
    return bool(PROMO.search(t))

def page_lines(pg):
    """过滤噪音 → y 聚类成行 → 返回 [(y, text)]"""
    # 坐标均为 0-1 归一化
    items = []
    for it in pg["items"]:
        t = it["t"].strip()
        if not t:
            continue
        # 页眉（顶部 8.5%）、页码（底部 6% 纯数字）、右上角推广
        if it["y1"] < 0.085:
            continue
        if it["y0"] > 0.94 and re.match(r"^\d{1,3}$", t):
            continue
        if it["x0"] > 0.78 and is_promo(t):
            continue
        items.append(it)
    if not items:
        return []
    items.sort(key=lambda x: x["yc"])
    lines = []
    cur, cur_yc = [items[0]], items[0]["yc"]
    tol = max(0.006, (items[0]["y1"] - items[0]["y0"]) * 0.6)
    for it in items[1:]:
        if abs(it["yc"] - cur_yc) <= tol:
            cur.append(it)
            cur_yc = sum(x["yc"] for x in cur) / len(cur)
        else:
            lines.append(cur)
            cur = [it]
            cur_yc = it["yc"]
            tol = max(0.006, (it["y1"] - it["y0"]) * 0.6)
    lines.append(cur)
    out = []
    for ln in lines:
        ln.sort(key=lambda x: x["x0"])
        parts = [x["t"].strip() for x in ln if x["t"].strip()]
        if not parts:
            continue
        # 表格行：最左为短标签（≤6字、无标点）且内容起点明显靠右 → 「标签：内容」
        if len(parts) >= 2 and len(parts[0]) <= 6 and not re.search(r"[：:，。；？！（）《》]", parts[0]) \
                and ln[1]["x0"] - ln[0]["x1"] > 0.02:
            text = parts[0] + "：" + "".join(parts[1:])
        else:
            text = ""
            for i, p in enumerate(parts):
                if i and re.search(r"[A-Za-z0-9]$", parts[i - 1]) and re.match(r"^[A-Za-z0-9]", p):
                    text += " " + p
                else:
                    text += p
        y = ln[0]["y0"]
        out.append((y, text))
    return out

# ---- 展平全部行 ----
stream = []  # (page, y, text)
for pg in pages:
    for y, t in page_lines(pg):
        stream.append([pg["page"], y, t])

def norm_chapter(s):
    s = re.sub(r"[　\s‧·•.．]+", "", s)
    m = re.match(r"^(第[一二三四五六七八九十]+章)(.*)$", s)
    if m:
        return m.group(1) + " " + m.group(2)
    return s

chapter = ""
entries = []
cur = None
sec = ""

def new_entry(m, title):
    return {"num": "%d.%02d" % (int(m.group(1)), int(m.group(2))), "title": title,
            "chapter": chapter, "koujue": [], "defs": [], "shizhan": []}

def in_sz():
    return cur and cur["shizhan"]

for pgno, y, line in stream:
    t = line.strip()
    if not t:
        continue
    # 章节横幅（正文区域内独立行）
    if CH_RE.match(t) and len(t) <= 16 and not NUM_RE.match(t) and not t.startswith("【"):
        chapter = norm_chapter(t)
        continue
    m = NUM_RE.match(t)
    if m:
        # 新条目：标题取下一行（由 lookahead 处理——这里先建，标题暂空）
        cur = new_entry(m, "")
        cur["_need_title"] = True
        entries.append(cur)
        sec = ""
        continue
    if cur and cur.get("_need_title"):
        cur["title"] = t[:24]
        cur.pop("_need_title", None)
        continue
    # 小节标记（宽松：含关键词且行短）
    if len(t) <= 12:
        core = re.sub(r"^[^口决快迷]*", "", t)
        if "速背" in t:
            sec = "sb"
            rest = t.split("速背", 1)[1].strip()
            if rest and cur is not None:
                cur["koujue"].append(rest)
            continue
        if "释义" in t and "口" in t or t == "释义" or "口释义" in t:
            sec = "sy"
            rest = re.sub(r"^.*释义", "", t).strip()
            if rest and cur is not None:
                cur["defs"].append(rest)
            continue
        if "实战" in t:
            sec = "sz"
            rest = re.sub(r"^.*实战", "", t).strip()
            if rest and cur is not None and cur["shizhan"]:
                pass
            continue
    if not cur:
        continue
    if sec == "sb":
        t2 = re.sub(r"^口[诀决快]?", "", t) if re.match(r"^口[诀决快]?（", t) else t
        cur["koujue"].append(t2)
    elif sec == "sy":
        t2 = re.sub(r"^口?[诀决]?释义[:：]?", "", t)
        if t2:
            cur["defs"].append(t2)
    elif sec == "sz":
        if not cur["shizhan"] or cur["shizhan"][-1]["done"]:
            cur["shizhan"].append({"q": "", "options": [], "a": None, "e": "", "done": False})
        sh = cur["shizhan"][-1]
        if ANS_RE.search(t):
            sh["a"] = ANS_RE.search(t).group(1)
            ex = re.search(r"【?解析】?[:：]?(.*)", ANS_RE.sub("", t))
            if ex and ex.group(1).strip():
                sh["e"] += ex.group(1).strip()
            if sh["q"] and len(sh["options"]) >= 2:
                sh["done"] = True
            continue
        om = OPT_RE.match(t)
        if om:
            if len(sh["options"]) < 4:
                sh["options"].append(om.group(2).strip())
            else:
                # 下一题的开始？（同条目第二道实战题）——交给上面的 done 分支
                sh["done"] = True
            continue
        if not sh["q"]:
            m2 = re.search(r"【?单选】?[:：]?(.*)", t)
            if m2 is not None:
                sh["q"] = m2.group(1).strip()
                continue
            if re.match(r"^[A-D]", t) and len(sh["options"]) == 0:
                sh["options"].append(re.sub(r"^[A-D][.．、:：]?", "", t).strip())
                continue
            sh["q"] = t
            continue
        # 题干/选项/解析续行
        if len(sh["options"]) < 4 and sh["q"]:
            if len(sh["options"]) >= 1 and not re.search(r"[。：:？！]$", sh["options"][-1]) is None:
                pass
            if len(sh["options"]) >= 1 and len(t) <= 30:
                sh["options"][-1] += t
            else:
                sh["q"] += t
        elif not sh["done"]:
            if PICK_RE.search(t) and sh["a"] is None:
                sh["a"] = PICK_RE.search(t).group(1)
            sh["e"] += t
            if len(sh["e"]) > 8 and re.search(r"[。！？]$", t):
                sh["done"] = True

# ---- 后处理 ----
out_entries = []
for e in entries:
    if not e["title"]:
        continue
    shs = []
    for sh in e["shizhan"]:
        sh.pop("done", None)
        if not sh["q"] or len(sh["options"]) < 2:
            continue
        if sh["a"] is None and sh["e"]:
            pm = PICK_RE.search(sh["e"])
            if pm:
                sh["a"] = pm.group(1)
        if isinstance(sh["a"], str):
            sh["a"] = ord(sh["a"]) - 65
        if sh["q"].endswith("（"):
            sh["q"] += "）"
        sh["q"] = re.sub(r"\s+", "", sh["q"])
        sh["e"] = sh["e"].strip()
        shs.append(sh)
    e["shizhan"] = shs
    e["defs"] = [d for d in e["defs"] if len(d) >= 2]
    e["koujue"] = [k for k in e["koujue"] if len(k) >= 2]
    e.pop("_need_title", None)
    out_entries.append(e)

# 章节分组 + 组内按编号排序
byc, order = {}, []
for e in out_entries:
    c = e["chapter"] or "其他"
    if c not in byc:
        byc[c] = []
        order.append(c)
    byc[c].append(e)
chapters = []
for c in order:
    es = sorted(byc[c], key=lambda x: (int(x["num"].split(".")[0]), int(x["num"].split(".")[1])))
    chapters.append({"name": c, "entries": es})

data = {"updatedAt": "2026-09-18", "chapters": chapters}
io.open(OUT, "w", encoding="utf-8").write("window.KJ88 = " + json.dumps(data, ensure_ascii=False) + ";\n")

total = len(out_entries)
with_sh = sum(1 for e in out_entries if e["shizhan"])
sh_full = sum(1 for e in out_entries for sh in e["shizhan"] if sh["a"] is not None and len(sh["options"]) == 4)
sh_all = sum(len(e["shizhan"]) for e in out_entries)
print("条目:", total, "| 有实战:", with_sh, "| 实战题总数:", sh_all, "| 完整(4项+答案):", sh_full)
print("章节:", [(c["name"], len(c["entries"])) for c in chapters])
nums = [e["num"] for e in out_entries]
print("nums:", " ".join(nums))
