# -*- coding: utf-8 -*-
"""koujue88 构建器 v4：坐标 OCR + 橙色标注检测 + 语义分块
   - 橙色：逐字符检测（口诀整行/释义关键术语）→ 前端红色显示
   - 语义：label 回溯归属当前未闭合块；「具体措施」等归为三级；长项按句切分
   产出 window.KJ88：defs=[{label,t,o,subs:[{t,o}]}]"""
import re, json, io
import pymupdf
import numpy as np

SRC = "tools/koujue_ocr2.json"
OUT = "assets/data/koujue88.js"
PDF = r"C:/Users/28621/xwechat_files/wxid_nbv2rd7682vc12_6706/msg/file/2026-09/11.0版常识88条速记口诀.pdf"

pages = json.load(io.open(SRC, encoding="utf-8"))

PROMO = re.compile(r"五分钟|五分打印|打印|包邮|免费|质量|常识速记|速记口[诀决]|88条|扫码|刺猬|云印|续表")
CH_RE = re.compile(r"^第[一二三四五六七八九十]+章")
NUM_RE = re.compile(r"^(\d{1,2})[.．、\s]+(\d{2})[.．、]?\s*$")
OPT_RE = re.compile(r"^([A-D])[.．、:：]\s*(.+)$")
ANS_RE = re.compile(r"【?答案】?[:：]?\s*([A-D]{1,5})")
PICK_RE = re.compile(r"选择\s*([A-D]{1,5})\s*选项")
SUB_TERMS = {"具体措施", "主要内容", "分类", "形式", "特点", "内容", "公式", "步骤", "种类", "包括"}

# ---------- 橙色掩码（dpi=150，与 OCR 坐标同基准） ----------
doc = pymupdf.open(PDF)
ORANGE = {}
for pg in pages:
    i = pg["page"]
    pix = doc[i].get_pixmap(dpi=150)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3).astype(int)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    ORANGE[i] = (r > 140) & (g > 60) & (g < 180) & (b < 130) & ((r - b) > 60) & ((r - g) > 25)

def item_orange(it, pgidx, thr=0.02):
    """逐字符橙色检测：阈值+桥接+边缘扩展，返回 0/1 flags"""
    t = it["t"]
    n = len(t)
    if n == 0:
        return []
    om = ORANGE.get(pgidx)
    if om is None:
        return []
    H, W = om.shape
    x0, x1 = it["x0"] * W, it["x1"] * W
    y0, y1 = int(it["y0"] * H), max(int(it["y1"] * H), int(it["y0"] * H) + 1)
    w = (x1 - x0) / n
    ratios = []
    for i in range(n):
        cx0 = int(x0 + i * w)
        cx1 = max(int(x0 + (i + 1) * w), cx0 + 1)
        sub = om[y0:y1, cx0:cx1]
        ratios.append(float(sub.mean()) if sub.size else 0.0)
    flags = [rv >= thr for rv in ratios]
    # 桥接：夹在橙色中间的 ≤3 字低覆盖断点（笔画少的字如"一二三"）
    i = 0
    while i < n:
        if not flags[i]:
            j = i
            while j < n and not flags[j]:
                j += 1
            if 0 < i and j < n and (j - i) <= 3:
                for k in range(i, j):
                    flags[k] = True
            i = max(j, i + 1)
        else:
            i += 1
    # 边缘扩展：区间两端各扩 1 字（若邻字有轻微橙覆盖），补齐分割误差
    def rv(k):
        return ratios[k] if 0 <= k < n else 0.0
    i = 0
    while i < n:
        if flags[i]:
            s = i
            while i < n and flags[i]:
                i += 1
            e = i  # [s, e)
            if s - 1 >= 0 and rv(s - 1) >= 0.012:
                flags[s - 1] = True
            if e < n and rv(e) >= 0.012:
                flags[e] = True
        else:
            i += 1
    return flags

def flags_to_ranges(flags):
    out, s = [], None
    for i, f in enumerate(flags):
        if f and s is None:
            s = i
        if (not f or i == len(flags) - 1) and s is not None:
            e = i + 1 if not f else len(flags)
            if e - s >= 1:
                out.append([s, e])
            s = None
    return out

def shift_clip(flags, off, ln):
    """取 flags 的字符串切片 [off, off+ln) 对应的子 flags"""
    return flags[off:off + ln]

# ---------- 页 → 逻辑行 ----------
def page_lines(pg):
    pgidx = pg["page"]
    items = []
    for it in pg["items"]:
        t = it["t"].strip()
        if not t:
            continue
        if it["y1"] < 0.085:
            continue
        if re.match(r"^\d{1,3}$", t):
            continue
        if it["x0"] > 0.78 and (PROMO.search(t) or len(t) <= 6):
            continue
        if PROMO.search(t):
            continue
        lead = len(it["t"]) - len(it["t"].lstrip())
        trail = len(it["t"]) - len(it["t"].rstrip())
        f = item_orange(it, pgidx)
        it["f"] = f[lead:len(f) - trail] if trail else f[lead:]
        it["t"] = t
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
        logical = []  # [text, flags]
        for it in cl:
            p, f = it["t"], it["f"]
            if logical and re.match(r"^[B-D][.．、]", p):
                logical.append([p, f])
            elif logical:
                logical[-1][0] += p
                logical[-1][1] += f
            else:
                logical.append([p, f])
        y0 = min(x["y0"] for x in cl)
        pieces = []
        for p, f in logical:
            if re.match(r"^[A-D][.．、]", p):
                cuts = [0]
                for mm in re.finditer(r"[B-D][.．、]", p):
                    j = mm.start()
                    if j > 0 and re.match(r"[\u4e00-\u9fff）)0-9]", p[j - 1]):
                        cuts.append(j)
                if len(cuts) > 1:
                    for ci, cst in enumerate(cuts):
                        cend = cuts[ci + 1] if ci + 1 < len(cuts) else len(p)
                        seg = p[cst:cend].strip()
                        soff = cst + (len(p[cst:cend]) - len(p[cst:cend].lstrip()))
                        pieces.append([seg, shift_clip(f, soff, len(seg))])
                    continue
            pieces.append([p, f])
        for p, f in pieces:
            mnum = re.match(r"^(\d{1,2}[.．、]\s*\d{2})(.+)$", p)
            if mnum:
                k = len(mnum.group(1))
                rest = mnum.group(2).strip()
                roff = k + (len(mnum.group(2)) - len(rest))
                out.append({"y": y0, "x0": cl[0]["x0"], "t": mnum.group(1), "f": []})
                out.append({"y": y0 + 0.001, "x0": cl[0]["x0"], "t": rest, "f": shift_clip(f, roff, len(rest))})
            else:
                out.append({"y": y0, "x0": cl[0]["x0"], "t": p, "f": f})
    return out

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

def new_def(text, flags, label=""):
    return {"label": label, "t": text, "f": flags, "subs": []}

for o in stream:
    t = o["t"].strip()
    lab = o["lab"]
    fl = o.get("f") or []
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
                cur["koujue"].append(new_def(rest, []))
            continue
        if "释义" in core:
            sec = "sy"
            rest = core.split("释义", 1)[1]
            if rest and cur:
                cur["defs"].append(new_def(rest, []))
            continue
        if "实战" in core:
            sec = "sz"
            continue
    if not cur:
        continue
    if sec == "sb":
        t2 = re.sub(r"^口(诀|决|快)?(?=（)", "口诀", t) if re.match(r"^口", t) else t
        # 口诀行在原 PDF 中整行橙色：直接全标（避免前缀替换导致的偏移错位）
        cur["koujue"].append(new_def(t2, [True] * len(t2)))
    elif sec == "sy":
        t2 = re.sub(r"^口?[诀决]?释义[:：]", "", t)
        off = len(t) - len(t2)
        f2 = shift_clip(fl, off, len(t2))
        if not t2:
            continue
        if lab:
            # 标签回溯：当前块未闭合且无标签 → 归它；否则新开带标签块
            if cur["defs"] and not cur["defs"][-1]["label"] and cur["defs"][-1]["t"] \
                    and not re.search(r"[。；！？]$]", cur["defs"][-1]["t"]):
                cur["defs"][-1]["label"] = t2
            else:
                cur["defs"].append(new_def("", [], label=t2))
            continue
        has_term = re.match(r"^([\u4e00-\u9fffA-Za-z0-9（）()]{2,12})[:：]", t2)
        is_sub = bool(has_term and has_term.group(1) in SUB_TERMS)
        numbered = bool(re.match(r"^[1-9][0-9]?[.、]", t2))
        if cur["defs"] and is_sub:
            d = cur["defs"][-1]
            d["subs"].append({"t": t2, "o": flags_to_ranges(f2)})
        elif cur["defs"] and not has_term and not numbered \
                and cur["defs"][-1]["t"] and not re.search(r"[。；！？]$", cur["defs"][-1]["t"]):
            # 续行：并入当前块
            d = cur["defs"][-1]
            d["t"] += t2
            d["f"] += f2
        else:
            cur["defs"].append(new_def(t2, f2))
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
                sh["done"] = True
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

# ---------- 清洗与结构化 ----------
def split_long(d):
    """长块按句切分为多项（同 label 下），flags 跟随"""
    t, f, subs = d["t"], d.get("f") or [], d["subs"]
    if len(t) <= 46 or t.count("。") + t.count("；") < 1:
        return [d]
    parts = re.split(r"(?<=[。；])", t)
    out, off = [], 0
    for p in parts:
        if not p:
            off += len(p)
            continue
        out.append({"label": "", "t": p, "f": shift_clip(f, off, len(p)), "subs": []})
        off += len(p)
    if subs and out:
        out[-1]["subs"] = subs
    return [x for x in out if len(x["t"]) >= 2]

out_entries = []
for e in entries:
    if not e["title"]:
        continue
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
    # koujue → {t,o}
    kj = []
    for d in e["koujue"]:
        if len(d["t"]) >= 2:
            kj.append({"t": d["t"], "o": flags_to_ranges(d["f"])})
    e["koujue"] = kj
    # defs → 结构化块（label 回溯已做），再长块切句
    # 空标签块：把标签让给下一个无标签块
    ds = e["defs"]
    i2 = 0
    while i2 < len(ds):
        if ds[i2]["label"] and not ds[i2]["t"] and i2 + 1 < len(ds) and not ds[i2 + 1]["label"]:
            ds[i2 + 1]["label"] = ds[i2]["label"]
            ds.pop(i2)
        else:
            i2 += 1
    blocks = []
    for d in ds:
        d["f"] = d.get("f") or []
        for seg in split_long(d):
            seg["o"] = flags_to_ranges(seg["f"])
            seg.pop("f", None)
            seg["subs"] = [{"t": s["t"], "o": s["o"]} for s in seg["subs"] if len(s["t"]) >= 2]
            blocks.append(seg)
    e["defs"] = [b for b in blocks if b["t"] or b["label"]]
    if not e["koujue"] and not e["defs"] and not shs:
        continue
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

data = {"updatedAt": "2026-09-19", "ver": 4, "chapters": chapters}
io.open(OUT, "w", encoding="utf-8").write("window.KJ88 = " + json.dumps(data, ensure_ascii=False) + ";\n")

total = len(out_entries)
sh_all = sum(len(e["shizhan"]) for e in out_entries)
orange_cnt = sum(1 for e in out_entries for d in e["defs"] if d.get("o"))
print("条目:", total, "| 实战题:", sh_all)
print("章节:", [(c["name"], len(c["entries"])) for c in chapters])
print("带橙色块的释义块数:", orange_cnt)
