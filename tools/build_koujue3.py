# -*- coding: utf-8 -*-
"""koujue88 构建器 v3：坐标 OCR → 行还原 → 表格标签归组 → window.KJ88"""
import re, json, io

SRC = "tools/koujue_ocr2.json"
OUT = "assets/data/koujue88.js"
pages = json.load(io.open(SRC, encoding="utf-8"))

PROMO = re.compile(r"五分钟|五分打印|打印|包邮|免费|质量|常识速记|速记口[诀决]|88条|扫码|刺猬|云印|续表")
CH_RE = re.compile(r"^第[一二三四五六七八九十]+章")
NUM_RE = re.compile(r"^(\d{1,2})[.．、\s]+(\d{2})[.．、]?\s*$")
OPT_RE = re.compile(r"^([A-D])[.．、:：]\s*(.+)$")
ANS_RE = re.compile(r"【?答案】?[:：]?\s*([A-D]{1,5})")
PICK_RE = re.compile(r"选择\s*([A-D]{1,5})\s*选项")

# ---------- 页 → 逻辑行（含 x0/y 信息） ----------
def page_lines(pg):
    items = []
    for it in pg["items"]:
        t = it["t"].strip()
        if not t:
            continue
        if it["y1"] < 0.085:            # 页眉
            continue
        if re.match(r"^\d{1,3}$", t):   # 独立页码
            continue
        if it["x0"] > 0.78 and (PROMO.search(t) or len(t) <= 6):  # 右上推广/水印
            continue
        if PROMO.search(t):
            continue
        items.append(it)
    if not items:
        return []
    items.sort(key=lambda x: x["yc"])
    clusters = []
    cur = [items[0]]
    cur_yc = items[0]["yc"]
    tol = max(0.006, (items[0]["y1"] - items[0]["y0"]) * 0.6)
    for it in items[1:]:
        if abs(it["yc"] - cur_yc) <= tol:
            cur.append(it)
            cur_yc = sum(x["yc"] for x in cur) / len(cur)
        else:
            clusters.append(cur)
            cur = [it]
            cur_yc = it["yc"]
            tol = max(0.006, (it["y1"] - it["y0"]) * 0.6)
    clusters.append(cur)
    out = []
    for cl in clusters:
        cl.sort(key=lambda x: x["x0"])
        # 选项双列：B./C./D. 开头的框另起新逻辑行
        logical = []
        for it in cl:
            p = it["t"].strip()
            if not p:
                continue
            if logical and re.match(r"^[B-D][.．、]", p):
                logical.append(p)
            elif logical:
                logical[-1] += p
            else:
                logical.append(p)
        y0 = min(x["y0"] for x in cl)
        logical2 = []
        for p in logical:
            if re.match(r"^[A-D][.．、]", p):
                # 同一 OCR 框内粘连的多个选项：在汉字/数字后的 B. C. D. 处切开
                cuts = [0]
                for mm in re.finditer(r"[B-D][.．、]", p):
                    j = mm.start()
                    if j > 0 and (re.match(r"[\u4e00-\u9fff）)0-9]", p[j-1])):
                        cuts.append(j)
                if len(cuts) > 1:
                    for ci, cst in enumerate(cuts):
                        cend = cuts[ci + 1] if ci + 1 < len(cuts) else len(p)
                        logical2.append(p[cst:cend].strip())
                    continue
            logical2.append(p)
        logical = logical2
        for p in logical:
            # 条目编号行与标题被视觉聚类并进同一行 → 拆开
            mnum = re.match(r"^(\d{1,2}[.．、]\s*\d{2})(.+)$", p)
            if mnum:
                out.append({"y": y0, "x0": cl[0]["x0"], "t": mnum.group(1)})
                out.append({"y": y0 + 0.001, "x0": cl[0]["x0"], "t": mnum.group(2).strip()})
            else:
                out.append({"y": y0, "x0": cl[0]["x0"], "t": p})
    return out

# ---------- 全局扁平流（按 页→y 排序，保留 label 标记） ----------
def is_label(o):
    t = o["t"]
    return o["x0"] < 0.16 and 2 <= len(t) <= 6 and not re.search(r"[：:，。；？！、（）()《》【】A-Za-z0-9．.]", t)

stream = []
for pg in pages:
    for o in page_lines(pg):
        o["pg"] = pg["page"]
        o["lab"] = is_label(o)
        stream.append(o)
stream.sort(key=lambda x: (x["pg"], x["y"]))

# ---------- 条目解析 ----------
chapter = ""
entries = []
cur = None
sec = ""

for o in stream:
    t = o["t"].strip()
    lab = o["lab"]
    if not t:
        continue
    if CH_RE.match(t) and len(t) <= 16 and "：" not in t[:3]:
        chapter = re.sub(r"[　\s‧·•.．]+", "", t)
        m2 = re.match(r"^(第[一二三四五六七八九十]+章)(.*)$", chapter)
        if m2:
            chapter = m2.group(1) + " " + m2.group(2)
        continue
    m = NUM_RE.match(t)
    if m:
        cur = {"num": "%d.%02d" % (int(m.group(1)), int(m.group(2))), "title": "",
               "chapter": chapter, "koujue": [], "defs": [], "shizhan": [], "_nt": True}
        entries.append(cur)
        sec = ""
        continue
    if cur and cur.get("_nt"):
        cur["title"] = t[:24]
        cur.pop("_nt")
        continue
    core = t.replace(" ", "")
    if len(core) <= 8:
        if "速背" in core:
            sec = "sb"
            rest = core.split("速背", 1)[1]
            if rest and cur:
                cur["koujue"].append(rest)
            continue
        if "释义" in core:
            sec = "sy"
            rest = core.split("释义", 1)[1]
            if rest and cur:
                cur["defs"].append(rest)
            continue
        if "实战" in core:
            sec = "sz"
            continue
    if not cur:
        continue
    if sec == "sb":
        t2 = re.sub(r"^口(诀|决|快)?(?=（)", "口诀", t) if re.match(r"^口", t) else t
        cur["koujue"].append(t2)
    elif sec == "sy":
        t2 = re.sub(r"^口?[诀决]?释义[:：]", "", t)
        if not t2:
            continue
        if lab or (len(t2) <= 8 and "：" in t2[:9] and not t2.startswith("(")):
            cur["defs"].append(t2)
        elif cur["defs"]:
            cur["defs"][-1] += t2
        else:
            cur["defs"].append(t2)
    elif sec == "sz":
        last = cur["shizhan"][-1] if cur["shizhan"] else None
        qstart = bool(re.match(r"^【?(单选|多选|判断)】?", t))
        if last is None:
            if not qstart and not OPT_RE.match(t) and not re.match(r"^在|^据|^下列", t):
                continue
            cur["shizhan"].append({"q": "", "options": [], "a": None, "e": "", "done": False})
        elif last.get("done"):
            if qstart or (OPT_RE.match(t) and len(last["options"]) >= 4):
                cur["shizhan"].append({"q": "", "options": [], "a": None, "e": "", "done": False})
            else:
                t2 = re.sub(r"^【?解析】?[:：]?", "", t)
                pm2 = PICK_RE.search(t2)
                if pm2 and last["a"] is None:
                    last["a"] = pm2.group(1)
                if len(t2) >= 6:
                    last["e"] = (last["e"] + t2)
                continue
        sh = cur["shizhan"][-1]
        am = ANS_RE.search(t)
        if am:
            sh["a"] = am.group(1)
            ex = re.search(r"【?解析】?[:：]?(.*)", ANS_RE.sub("", t))
            if ex and ex.group(1).strip():
                sh["e"] += ex.group(1).strip()
            sh["done"] = True
            continue
        om = OPT_RE.match(t)
        if om:
            if len(sh["options"]) < 4:
                sh["options"].append(om.group(2).strip())
            else:
                sh["done"] = True   # 第二道实战题开始
            continue
        if not sh["q"]:
            m2 = re.search(r"【?单选】?[:：]?(.*)", t)
            if m2 is not None:
                sh["q"] = m2.group(1).strip()
            else:
                sh["q"] = t
            continue
        if len(sh["options"]) < 4:
            mm = re.search(r"【?(单选|多选|判断)】?", t)
            if mm and len(sh["q"]) >= 8:
                sh["done"] = True
                cur["shizhan"].append({"q": t[mm.start():].strip(), "options": [], "a": None, "e": "", "done": False})
            elif sh["options"] and len(t) <= 30:
                sh["options"][-1] += t
            else:
                sh["q"] += t
        elif not sh.get("done"):
            if PICK_RE.search(t) and sh["a"] is None:
                sh["a"] = PICK_RE.search(t).group(1)
            mm = re.search(r"【?(单选|多选|判断)】?", t)
            if mm and len(sh["e"]) >= 8:
                sh["e"] += t[:mm.start()]
                sh["done"] = True
                cur["shizhan"].append({"q": t[mm.start():].strip(), "options": [], "a": None, "e": "", "done": False})
            else:
                sh["e"] += t

# ---------- 清洗输出 ----------
out_entries = []
for e in entries:
    if not e["title"]:
        continue
    if not e["koujue"] and not e["defs"] and not e["shizhan"]:
        continue  # OCR 噪声造成的空条目（如误读的编号行）
    e.pop("_nt", None)
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
            sh["a"] = sh["a"].strip().upper()
            if len(sh["a"]) == 1:
                sh["a"] = ord(sh["a"]) - 65
        if sh["q"].endswith("（"):
            sh["q"] += "）"
        sh["q"] = re.sub(r"\s+", "", sh["q"])
        sh["e"] = re.sub(r"^【?解析】?[:：]?", "", sh["e"]).strip()
        if sh["q"] and len(sh["options"]) == 4 and sh["a"] is not None:
            shs.append(sh)
    e["shizhan"] = shs
    if not e["koujue"] and not e["defs"] and not shs:
        continue  # 清洗后仍为空的噪声条目
    e["defs"] = [d for d in e["defs"] if len(d) >= 2]
    e["koujue"] = [k for k in e["koujue"] if len(k) >= 2]
    out_entries.append(e)

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
sh_all = sum(len(e["shizhan"]) for e in out_entries)
sh_full = sum(1 for e in out_entries for sh in e["shizhan"] if sh["a"] is not None and len(sh["options"]) == 4)
print("条目:", total, "| 有实战:", with_sh, "| 实战题总数:", sh_all, "| 完整:", sh_full)
print("章节:", [(c["name"], len(c["entries"])) for c in chapters])
print("nums:", " ".join(e["num"] for e in out_entries))
