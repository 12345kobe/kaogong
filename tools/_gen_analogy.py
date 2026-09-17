# -*- coding: utf-8 -*-
"""把《类比常识积累手册》的 OCR 结果解析成结构化数据，输出 js/analogy-data.js → window.ANALOGY
结构：
  units[] = { id, chapter, topic, points:[{type,text}], questions:[{q,options,a,e}] }
  - points 来自「考点直击」
  - questions 来自「真题链接」「牛刀小试」（以【答案】为锚点反推题干+选项+答案+解析）
"""
import json, re

SRC = "tools/_ocr_analogy.json"
OUT = "C:/Users/28621/Desktop/考公工作台/js/analogy-data.js"

WATER = re.compile(r"(FU|粉\s*笔|八粉笔|粉笔)")
FIX = [
    ("一字干金", "一字千金"), ("干金", "千金"), ("莲自已", "连自己"),
    ("源不断", "源源不断"), ("泌汹", "汹汹"), ("着属", "眷属"),
    ("自已", "自己"), ("文放了", "又放了"), ("挖并", "挖井"),
]

def clean(t):
    t = WATER.sub("", t)
    for a, b in FIX:
        t = t.replace(a, b)
    return t.strip()

def is_water(l):
    return bool(WATER.search(l["t"])) and len(l["t"]) <= 6

def flat(t):
    return t.replace("\t", "")

def build_rows(pages):
    rows = []
    for pg in pages:
        lines = [l for l in pg["lines"] if not is_water(l)]
        i = 0
        while i < len(lines):
            grp = [lines[i]]; j = i + 1
            while j < len(lines) and abs(lines[j]["y0"] - lines[i]["y0"]) < 9:
                grp.append(lines[j]); j += 1
            grp.sort(key=lambda l: l["x0"])
            text = "\t".join(clean(g["t"]) for g in grp)
            rows.append({"t": text, "x0": min(g["x0"] for g in grp), "p": pg.get("page", 0)})
            i = j
    return rows

def main():
    d = json.load(open(SRC, encoding="utf-8"))
    rows = build_rows(d["pages"])

    units = []
    cur = None
    chapter = ""
    sec = None

    for r in rows:
        t, x = r["t"], r["x0"]
        if not t:
            continue
        # 篇
        m = re.match(r"^第[一二三四五六七八九十]+篇\s*(.+)$", t)
        if m:
            chapter = "第" + re.match(r"^第([一二三四五六七八九十]+)篇", t).group(1) + "篇 " + m.group(1)
            continue
        # 专题：一、历史典故
        if re.match(r"^[一二三四五六七八九十]+、\s*\S+$", t) and x < 130 and len(t) < 20:
            cur = {"chapter": chapter, "topic": t, "points": [], "questions": []}
            units.append(cur); sec = None
            continue
        # 小节：（一）真题链接 /（二）考点直击 /（三）牛刀小试
        m = re.match(r"^[（(]([一二三四])[)）]\s*(真题链接|考点直击|牛刀小试)\s*$", t)
        if m:
            sec = {"真题链接": "link", "考点直击": "point", "牛刀小试": "quiz"}[m.group(2)]
            continue
        if cur is None:
            cur = {"chapter": chapter or "类比常识", "topic": "综合", "points": [], "questions": []}
            units.append(cur)
        r["u"] = len(units) - 1

        # 考点直击内容块
        if sec == "point":
            if x > 110:
                kind = "item" if re.match(r"^[①②③④⑤⑥⑦⑧⑨⑩\d]", t) else "p"
                cur["points"].append({"type": kind, "text": t})
            else:
                if cur["points"] and cur["points"][-1]["type"] == "p":
                    cur["points"][-1]["text"] += t
                else:
                    cur["points"].append({"type": "p", "text": t})

    # ---- 题目：以【答案】为锚点反推 ----
    aids = [i for i, r in enumerate(rows) if "【答案】" in r["t"]]
    prev_end = 0
    for ai in aids:
        ma = re.search(r"【答案】\s*([A-D])", rows[ai]["t"])
        if not ma:
            continue
        a = "ABCD".index(ma.group(1))
        body = rows[prev_end:ai]
        opts, stem_parts = [], []
        for r in body:
            for s in [x.strip() for x in r["t"].split("\t")]:
                m = re.match(r"^([A-D])[.、．]\s*(.*)$", s)
                if m:
                    opts.append(m.group(2).strip())
                elif not opts:
                    stem_parts.append(s)
                elif opts and not re.search(r"【", s):
                    opts[-1] += s
        stem = "".join(stem_parts)
        stem = re.sub(r"^（[一二三四]）（真题链接|考点直击|牛刀小试）", "", stem).strip()
        stem = re.sub(r"^[（(]?\d{1,2}[）)]?\s*[．.、]?\s*", "", stem).strip()
        # 解析
        exp, j = [], ai + 1
        while j < len(rows):
            rr = rows[j]["t"]
            if re.match(r"^（[一二三四]）（真题链接|考点直击|牛刀小试）", rr):
                break
            if "【答案】" in rr:
                break
            if re.match(r"^（?\d{1,2}[）)]?\s*[．.、]\s*[（(]\d{4}", rr):
                break
            exp.append(flat(rr))
            j += 1
        prev_end = j
        if len(opts) >= 4 and stem and len(stem) > 4:
            ui = rows[ai].get("u", 0)
            if 0 <= ui < len(units):
                units[ui]["questions"].append({
                    "q": stem,
                    "options": opts[:4],
                    "a": a,
                    "e": re.sub(r"^【解析】", "", "".join(exp)).strip()[:400],
                })

    # 只保留有内容的小节
    units = [u for u in units if u["points"] or u["questions"]]
    # 合并同名（跨页重复识别的专题）
    merged = []
    for u in units:
        if merged and merged[-1]["topic"] == u["topic"] and merged[-1]["chapter"] == u["chapter"]:
            merged[-1]["points"].extend(u["points"])
            merged[-1]["questions"].extend(u["questions"])
        else:
            merged.append(u)
    units = merged
    for i, u in enumerate(units):
        u["id"] = "u" + str(i + 1)

    print(f"专题 {len(units)} 个，考点块 {sum(len(u['points']) for u in units)} 个，题目 {sum(len(u['questions']) for u in units)} 道")
    for u in units[:6]:
        print(" -", u["chapter"], "|", u["topic"], "| 考点", len(u["points"]), "| 题", len(u["questions"]))

    def esc(s):
        return (s or "").replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")

    out = ["// 类比推理常识积累：OCR + 结构化（" + str(len(units)) + " 专题）\nwindow.ANALOGY = {\n  units: [\n"]
    for u in units:
        pts = ",".join('{"t":"' + p["type"] + '","x":"' + esc(p["text"]) + '"}' for p in u["points"])
        qs = ",".join(
            '{"q":"' + esc(qq["q"]) + '","o":[' + ",".join('"' + esc(o) + '"' for o in qq["options"]) +
            '],"a":' + str(qq["a"]) + ',"e":"' + esc(qq["e"]) + '"}'
            for qq in u["questions"] if len(qq["options"]) >= 4 and qq["a"] is not None)
        out.append('    {"id":"' + u["id"] + '","chapter":"' + esc(u["chapter"]) + '","topic":"' + esc(u["topic"]) +
                   '","points":[' + pts + '],"questions":[' + qs + ']},\n')
    out.append("  ]\n};\n")
    open(OUT, "w", encoding="utf-8").write("".join(out))
    print("输出:", OUT)

if __name__ == "__main__":
    main()
