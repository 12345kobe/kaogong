# -*- coding: utf-8 -*-
"""解析 tools/koujue_ocr.txt（RapidOCR 输出）→ assets/data/koujue88.js (window.KJ88)"""
import re, json, io

SRC = "tools/koujue_ocr.txt"
OUT = "assets/data/koujue88.js"

raw = io.open(SRC, encoding="utf-8").read()
pages = re.split(r"###PAGE \d+###", raw)[1:]

# 噪音行（水印/页眉/页码/推广）
NOISE = re.compile(r"^(五分钟打印|单手免费|智慧质量|包邮到家|批量打印|常识速记口诀88条|口决88条|续表|\d{1,3})$")
CH_RE = re.compile(r"^第[一二三四五六七八九十]+章[\s　]*\S{2,12}$")
NUM_RE = re.compile(r"^(\d{1,2})[.．、\s]+(\d{2})[.．、]?\s*$")
SEC_SB = re.compile(r"口[诀决速]{1,2}速背")     # 口诀速背 OCR 变体
SEC_SY = re.compile(r"口[诀决]释义|口诀释义")
SEC_SZ = re.compile(r"口[诀决]实战")
OPT_RE = re.compile(r"^([A-D])[.．、:：]\s*(.+)$")
ANS_RE = re.compile(r"【答案】[:：]?\s*([A-D])")
PICK_RE = re.compile(r"选择\s*([A-D])\s*选项")

def is_noise(line):
    s = line.strip()
    return (not s) or bool(NOISE.match(s))

# 1) 展平：记录章节与行
chapter = ""
entries = []   # {num,title,koujue[],defs[],shizhan{}}
cur = None     # 当前条目
sec = ""       # 当前小节 sb/sy/sz
for pi, page in enumerate(pages):
    lines = [l.strip() for l in page.split("\n") if not is_noise(l)]
    # 章节页：独立成行的 第X章
    for l in lines:
        if CH_RE.match(l):
            t = re.sub(r"[\s　]+", "", l)
            if t != chapter:
                chapter = t
    i = 0
    while i < len(lines):
        l = lines[i]
        m = NUM_RE.match(l)
        if m:
            # 新条目：下一非空行是标题
            title = ""
            j = i + 1
            while j < len(lines) and not title:
                if CH_RE.match(lines[j]):
                    j += 1; continue
                title = lines[j]; break
            cur = {"num": "%s.%s" % (m.group(1), m.group(2)), "title": title,
                   "chapter": chapter, "koujue": [], "defs": [], "shizhan": None}
            entries.append(cur)
            sec = ""
            i = j + 1
            continue
        if SEC_SB.search(l) and len(l) <= 8:
            sec = "sb"; i += 1; continue
        if SEC_SY.search(l) and len(l) <= 8:
            sec = "sy"; i += 1; continue
        if SEC_SZ.search(l) and len(l) <= 8:
            sec = "sz"; i += 1; continue
        if cur:
            if sec == "sb":
                if SEC_SB.search(l):  # 标记词混进行首
                    l = SEC_SB.sub("", l).strip()
                if l: cur["koujue"].append(l)
            elif sec == "sy":
                if SEC_SY.search(l):
                    l = SEC_SY.sub("", l).strip()
                if l: cur["defs"].append(l)
            elif sec == "sz":
                if not cur["shizhan"]:
                    cur["shizhan"] = {"q": "", "options": [], "a": None, "e": ""}
                sh = cur["shizhan"]
                if not sh["q"]:
                    m2 = re.search(r"【?单选】?(.*)", l)
                    if m2 and not OPT_RE.match(l):
                        sh["q"] = m2.group(1).strip()
                        i += 1; continue
                om = OPT_RE.match(l)
                if om and len(sh["options"]) < 4:
                    sh["options"].append(om.group(2).strip())
                elif ANS_RE.search(l):
                    sh["a"] = ANS_RE.search(l).group(1)
                    rest = ANS_RE.sub("", l)
                    ex = re.search(r"【解析】[:：]?(.*)", rest)
                    if ex and ex.group(1).strip():
                        sh["e"] = ex.group(1).strip()
                elif sh["q"] and len(sh["options"]) and not sh["e"] and re.match(r"^【?解析】?", l):
                    sh["e"] = re.sub(r"^【?解析】?[:：]?", "", l).strip()
                elif sh["e"] or (sh["q"] and len(sh["options"]) >= 4):
                    # 解析正文续行
                    if sh["a"] is None and PICK_RE.search(l):
                        sh["a"] = PICK_RE.search(l).group(1)
                    if sh["q"] and len(sh["options"]) >= 4:
                        sh["e"] = (sh["e"] + l).strip()
                    elif sh["q"]:
                        sh["q"] += l
                elif sh["q"]:
                    sh["q"] += l
        i += 1

# 2) 后处理：答案兜底从解析提取；清洗
fixed_ans = 0
for e in entries:
    sh = e.get("shizhan")
    if not sh:
        continue
    if sh["a"] is None and sh["e"]:
        pm = PICK_RE.search(sh["e"])
        if pm:
            sh["a"] = pm.group(1); fixed_ans += 1
    if sh["a"]:
        sh["a"] = ord(sh["a"]) - 65
    # 清理解析里的定位行
    sh["e"] = re.sub(r"^解析[:：]?", "", sh["e"]).strip()
    e["defs"] = [d for d in e["defs"] if len(d) >= 2]
    e["koujue"] = [k for k in e["koujue"] if len(k) >= 2]

# 3) 按章节分组
chapters = []
byc = {}
order = []
for e in entries:
    c = e["chapter"] or "其他"
    if c not in byc:
        byc[c] = []; order.append(c)
    byc[c].append(e)
chapters = [{"name": c, "entries": byc[c]} for c in order]

data = {"updatedAt": "2026-09-18", "chapters": chapters}
with io.open(OUT, "w", encoding="utf-8") as f:
    f.write("window.KJ88 = " + json.dumps(data, ensure_ascii=False) + ";\n")

total_sh = sum(1 for e in entries if e.get("shizhan") and e["shizhan"]["q"])
opt_full = sum(1 for e in entries if e.get("shizhan") and e["shizhan"]["a"] is not None and len(e["shizhan"]["options"]) == 4)
print("章节:", [ (c["name"], len(c["entries"])) for c in chapters ])
print("条目总数:", len(entries), "| 有实战题:", total_sh, "| 实战题完整(4选项+答案):", opt_full, "| 解析补答案:", fixed_ans)
