# -*- coding: utf-8 -*-
"""从《行测5000题·言语理解与表达（上册/下册）》PDF 提取：
   - 上册：章节结构 + 考点讲解（划线的加粗）+ 题目（题干/选项）
   - 下册：题目答案 + 解析
   按「章 / 节 / 考点」对齐，输出 assets/data/verbal_5000.js → window.VERBAL_5000
"""
import json, re, os, sys
import pymupdf

BASE = r"C:\Users\28621\xwechat_files\wxid_nbv2rd7682vc12_6706\msg\file\2026-09"
UP = os.path.join(BASE, "2025最新版行测5000题 言语理解与表达（上册）【微信公众号：考公上岸资料室】.pdf")
DOWN = os.path.join(BASE, "2025最新版行测5000题 言语理解与表达（下册）【微信公众号：考公上岸资料室】.pdf")
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "data", "verbal_5000.js")

CH_RE = re.compile(r'^第\s*([一二三四五六七八九十]+)\s*章')
JIE_RE = re.compile(r'^第\s*([一二三四五六七八九十]+)\s*节')
KP_RE = re.compile(r'^考点\s*(\d+)')
ZH_RE = re.compile(r'^综合训练\s*([一二三四五六七八九十]+)')
Q_RE = re.compile(r'^(\d{1,4})\s*[.．]\s*(.*)$')
OPT_RE = re.compile(r'^([A-D])\s*[.．、]\s*(.*)$')
ANS_RE = re.compile(r'^(\d{1,4})\s*[.．]\s*【答案】\s*([A-Ea-e])')
EXP_RE = re.compile(r'^【解析】\s*(.*)$')
DROP = [re.compile(r'决战行测'), re.compile(r'关注微信公众号'), re.compile(r'^第\s*\d+\s*页$'),
        re.compile(r'^\d{1,4}$'), re.compile(r'考公上岸资料室'), re.compile(r'言语理解与表达（[上下]册）')]
SENT_END = "。！？；：”」』…"


def clean(s):
    return re.sub(r'[\u2002\u3000\x08\u0001]', ' ', str(s)).strip()


def page_lines(page):
    out = []
    dd = page.get_text("dict")
    for b in dd.get("blocks", []):
        if b.get("type", 0) != 0:
            continue
        for l in b.get("lines", []):
            spans = l.get("spans", [])
            txt = clean("".join(sp["text"] for sp in spans))
            if not txt:
                continue
            size = round(max(sp["size"] for sp in spans), 1)
            out.append({"text": txt, "size": size, "bbox": l["bbox"]})
    out.sort(key=lambda x: (round(x["bbox"][1], 1), x["bbox"][0]))
    return out


def underline_segments(page):
    """返回水平下划线 [(x0,x1,y)]"""
    segs = []
    for d in page.get_drawings():
        for it in d.get("items", []):
            if it[0] == "l":  # line
                p1, p2 = it[1], it[2]
                if abs(p1.y - p2.y) < 1.2 and abs(p2.x - p1.x) > 12:
                    segs.append((min(p1.x, p2.x), max(p1.x, p2.x), p1.y))
            elif it[0] == "re":  # rectangle
                r = it[1]
                if r.height < 2.2 and r.width > 12:
                    segs.append((r.x0, r.x1, r.y1))
    return segs


def is_underlined(line, segs):
    x0, y0, x1, y1 = line["bbox"]
    w = max(1e-6, x1 - x0)
    for sx0, sx1, sy in segs:
        if y1 - 3.0 <= sy <= y1 + 5.0:
            ov = max(0, min(x1, sx1) - max(x0, sx0))
            if ov / w > 0.45:
                return True
    return False


def join_para(lines):
    """把同段的折行合并（中文不加空格），保留段落"""
    paras = []
    cur = ""
    for t in lines:
        if not t:
            continue
        if not cur:
            cur = t
            continue
        if cur[-1] in SENT_END or re.match(r'^[①②③④⑤⑥⑦⑧⑨⑩【]', t) or re.match(r'^\d{1,2}\s*[.．]', t):
            paras.append(cur); cur = t
        else:
            cur += t
    if cur:
        paras.append(cur)
    return paras


def parse_book(path, is_answer):
    doc = pymupdf.open(path)
    sections = []       # [{chapter,jie,kp,name,kind, theory:[...], qraw:[...], ans:{}}]
    cur = None
    chapter = ""
    jie = ""
    kp = ""
    started = False

    def new_section(kind="q"):
        return {"chapter": chapter, "jie": jie, "kp": kp, "name": "",
                "theory_lines": [], "qlines": [], "answers": {}, "exp_by_num": {}}

    for pno in range(doc.page_count):
        page = doc[pno]
        segs = underline_segments(page) if not is_answer else []
        lines = page_lines(page)
        for ln in lines:
            t = ln["text"]; sz = ln["size"]
            if sz < 9.4:
                continue
            if any(r.search(t) for r in DROP):
                continue
            mch = CH_RE.match(t)
            if mch and sz >= 15:
                chapter = t; jie = ""; kp = ""; cur = None; continue
            mzh = ZH_RE.match(t)
            if mzh and sz >= 14:
                chapter = "综合训练"; jie = t; kp = ""; cur = None; continue
            mj = JIE_RE.match(t)
            if mj and sz >= 14:
                jie = t; kp = ""; cur = None; continue
            mk = KP_RE.match(t)
            if mk and sz >= 12:
                kp = t; cur = None; continue
            if sz >= 15:
                continue  # 其他大标题（章节扉页语等）
            if not kp and not jie and not chapter:
                continue
            # 答案册
            if is_answer:
                if cur is None:
                    cur = new_section()
                    sections.append(cur)
                ma = ANS_RE.match(t)
                if ma:
                    num = int(ma.group(1)); cur["answers"][num] = ma.group(2).upper()
                    rest = re.sub(r'^.*?【答案】\s*[A-Ea-e][。.．]?\s*', '', t)
                    cur["exp_by_num"][num] = [rest] if (rest and rest != t) else []
                    cur["last_ans"] = num
                    continue
                # 解析续行：归到最近一题
                ln_ = cur.get("last_ans")
                if ln_ is not None and ln_ in cur["exp_by_num"]:
                    cur["exp_by_num"][ln_].append(t)
                continue
            # 题册
            if cur is None:
                cur = new_section()
                sections.append(cur)
            if cur["qlines"]:
                # 题干/选项/解析等一律收进 qlines，交给 build_questions 拆
                cur["qlines"].append({"text": t, "size": sz})
                continue
            mq = Q_RE.match(t)
            if mq and sz <= 11.4 and re.match(r'^[（(]', mq.group(2).strip()):
                cur["qlines"].append({"text": t, "size": sz})
                continue
            # 题目出现之前的理论行
            cur["theory_lines"].append({"text": t, "size": sz, "u": is_underlined(ln, segs)})
    # 收尾：给 section 起名
    for s in sections:
        nm = s["jie"] or s["kp"] or s["chapter"]
        if s["kp"] and s["jie"]:
            nm = s["jie"] + " · " + s["kp"]
        elif s["kp"]:
            nm = s["kp"]
        elif s["jie"]:
            nm = s["jie"]
        elif s["chapter"]:
            nm = s["chapter"]
        s["name"] = nm
    doc.close()
    return sections


def parse_answers_seq(path):
    """直接按文档顺序抽取全部答案（不依赖章节切分），返回 [{letter, exp}]"""
    doc = pymupdf.open(path)
    out = []
    cur = None
    for pno in range(doc.page_count):
        page = doc[pno]
        for ln in page_lines(page):
            t = ln["text"]; sz = ln["size"]
            if sz < 9.4:
                continue
            if any(r.search(t) for r in DROP):
                continue
            if (CH_RE.match(t) or JIE_RE.match(t) or KP_RE.match(t) or ZH_RE.match(t)) and sz >= 12:
                continue
            ma = ANS_RE.match(t)
            if ma:
                rest = re.sub(r'^.*?【答案】\s*[A-Ea-e][。.．]?\s*', '', t)
                cur = {"letter": ma.group(2).upper(), "exp": rest if rest != t else ""}
                out.append(cur)
                continue
            if cur is not None:
                cur["exp"] = (cur["exp"] + "　" + t) if cur["exp"] else t
    doc.close()
    return out


def build_questions(sec):
    """把 section 的 qlines 拆成题目 [{num,stem,options:[...]}]"""
    qs = []
    cur = None
    for item in sec["qlines"]:
        t = item["text"]
        mo = OPT_RE.match(t)
        mq = Q_RE.match(t)
        if mq and not mo and (cur is None or len(cur["options"]) >= 2 or not cur["stem"]):
            num = int(mq.group(1)); rest = mq.group(2).strip()
            cur = {"num": num, "stem": rest, "options": []}
            qs.append(cur)
            continue
        if cur is None:
            continue
        if mo:
            cur["options"].extend(split_options(t))
            continue
        if cur["options"]:
            cur["options"][-1] += t
        else:
            cur["stem"] += t
    return [q for q in qs if len(q["options"]) >= 2 and q["stem"]]


def split_options(t):
    text = clean(t)
    marks = []
    for m in re.finditer(r'([A-D])\s*[.．、]\s*', text):
        marks.append((m.start(), m.end()))
    res = []
    for i, (s0, e0) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        res.append(clean(text[e0:end]))
    return [x for x in res if x]


def main():
    up = parse_book(UP, False)
    down = parse_book(DOWN, True)
    print("上册 sections:", len(up), " 下册 sections:", len(down))

    # 两本书顺序一致 → 把答案按「文档出现顺序」依次对应到题目（比按章节名匹配更稳）
    ans_seq = parse_answers_seq(DOWN)
    print("下册答案条数:", len(ans_seq))

    chapters = []
    ch_index = {}
    total_q = 0; matched = 0
    ai = 0
    for s in up:
        qs = build_questions(s)
        if not qs and not s["theory_lines"]:
            continue
        out_qs = []
        for q in qs:
            a = -1; e = ""
            if ai < len(ans_seq):
                a = ord(ans_seq[ai]["letter"]) - 65
                e = ans_seq[ai]["exp"]
                ai += 1
            if e:
                mm = re.search(r'正确答案为\s*([A-E])', e)
                if mm:
                    a = ord(mm.group(1)) - 65
            total_q += 1
            if a >= 0:
                matched += 1
            out_qs.append({"q": q["stem"], "options": q["options"][:4], "a": a, "e": e, "num": q["num"]})
        theory = theory_html(s["theory_lines"])
        ch_name = s["chapter"] or "未分章"
        if ch_name not in ch_index:
            ch_index[ch_name] = {"name": ch_name, "sections": []}
            chapters.append(ch_index[ch_name])
        ch_index[ch_name]["sections"].append({
            "name": s["name"] or s["jie"] or s["kp"] or "未命名",
            "theory": theory, "questions": out_qs
        })
    print("题目总数:", total_q, "已匹配答案:", matched, "(%.1f%%)" % (matched * 100.0 / max(1, total_q)))

    data = {"title": "行测5000题 · 言语理解与表达", "chapters": chapters}
    js = "window.VERBAL_5000 = " + json.dumps(data, ensure_ascii=False) + ";\n"
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(js)
    print("written:", OUT, len(js), "chars")


def esc_html(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def theory_html(lines):
    """把理论行拼成段落；原书「有划线」的行 → <b>加粗</b>（用户要求重点加粗）"""
    if not lines:
        return ""
    paras = []
    cur = []
    for l in lines:
        t = l["text"]
        if not t:
            continue
        if cur and (cur[-1][0][-1] in SENT_END or re.match(r'^[①②③④⑤⑥⑦⑧⑨⑩【]', t) or re.match(r'^\d{1,2}\s*[.．]', t)):
            paras.append(cur); cur = []
        cur.append((t, l.get("u")))
    if cur:
        paras.append(cur)
    out = []
    for para in paras:
        html = "".join(("<b>" + esc_html(t) + "</b>") if u else esc_html(t) for t, u in para)
        out.append("<p>" + html + "</p>")
    return "".join(out)


if __name__ == "__main__":
    main()
