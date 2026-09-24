# -*- coding: utf-8 -*-
"""提取 每周时政演练 PDF → js/drills-data.js
结构：考点（编号条目，粗体保留为 **..**）→【模拟演练】题目（单选/多选）→【答案】字母（无解析）
用法: python tools/extract_drills.py <pdf1> <pdf2> ...   （输出到 stdout 之外的 js/drills-data.js）
"""
import sys, os, re, json
import pymupdf

CJK = r'\u4e00-\u9fff\u3000-\u303f\uff00-\uffef'

def clean(s):
    # 去掉 CJK/数字间被 PDF 塞进来的空格（"2026 年9 月14 日"→"2026年9月14日"）
    s = re.sub(r'(?<=[%s])\s+(?=[%s])' % (CJK, CJK), '', s)
    s = re.sub(r'(?<=[0-9])\s+(?=[%s])' % CJK, '', s)
    s = re.sub(r'(?<=[%s])\s+(?=[0-9])' % CJK, '', s)
    s = re.sub(r'\s+([，。、；：？！）】》])', r'\1', s)
    s = re.sub(r'([（【《])\s+', r'\1', s)
    # 答题空括号归一
    s = s.replace('(\n)', '（  ）').replace('( )', '（  ）')
    s = re.sub(r'[（(]\s*[）)]', '（  ）', s)
    return s.strip()

def page_spans(page):
    """返回 [(text, bold)] 按阅读顺序；bold=字体为粗体"""
    out = []
    d = page.get_text("dict")
    for blk in d.get("blocks", []):
        if blk.get("type") != 0:
            continue
        for line in blk.get("lines", []):
            for sp in line.get("spans", []):
                t = sp.get("text", "")
                if not t:
                    continue
                bold = bool(sp.get("flags", 0) & 16)
                out.append((t, bold))
            out.append(("\n", False))
    return out

def spans_to_marked_lines(spans):
    """把 span 流转成行数组，粗体段包 **..**（行内）"""
    lines, cur, bold_open = [], "", False
    for t, b in spans:
        if t == "\n":
            if bold_open and cur:
                cur += "**"
                bold_open = False
            lines.append(cur.strip())
            cur, bold_open = "", False
            continue
        if b and not bold_open:
            cur += "**"; bold_open = True
        elif not b and bold_open:
            cur += "**"; bold_open = False
        cur += t
    if cur.strip():
        if bold_open: cur += "**"
        lines.append(cur.strip())
    return [l for l in lines if l]

ITEM_RE = re.compile(r'^(\d{1,3})[.、．]\s*(.+)$')
OPT_RE  = re.compile(r'^([A-D])[.、．]\s*(.*)$')
Q_RE    = re.compile(r'^(\d{1,3})\s*[.、．]?\s*【(单选|多选|判断)】\s*(.*)$')
ANS_RE  = re.compile(r'^(\d{1,3})\s*[.、．]\s*([A-D]{1,4})\s*$')
MARK_RE = re.compile(r'^【(.+?)】\s*$')

def extract(pdf):
    doc = pymupdf.open(pdf)
    all_lines = []
    for pno in range(len(doc)):
        spans = page_spans(doc[pno])
        all_lines += spans_to_marked_lines(spans)
    # 去掉页眉页脚
    out = []
    for l in all_lines:
        t = l.replace("**", "")
        if re.fullmatch(r'\d{1,3}', t):  continue
        if re.fullmatch(r'\d{1,2}\.\d{1,2}\s*-\s*\d{1,2}\.\d{1,2}', t): continue  # 封面周标签 "9.14-9.20"
        if t in ("本资料仅供内部交流使用", "粉笔事考·官方微信"): continue
        if t.startswith("每周时政演练") and len(t) <= 20 and not ITEM_RE.match(t): continue
        out.append(l)

    # 截掉免责声明及之后
    for i, l in enumerate(out):
        if "免责声明" in l.replace("**", ""):
            out = out[:i]; break

    points, questions, answers = [], [], {}
    mode = "point"   # point | quiz | answer
    cur = None       # 当前考点 {n,title,body}
    curq = None      # 当前题
    for raw in out:
        l = clean(raw)
        t = l.replace("**", "")   # 去粗体标记后的纯文本，用于结构匹配
        if not t: continue
        m = MARK_RE.match(t)
        if m:
            tag = m.group(1)
            if "模拟演练" in tag:
                mode = "quiz"
                if cur: points.append(cur); cur = None
                continue
            if tag in ("答案", "参考答案"):
                mode = "answer"
                if curq: questions.append(curq); curq = None
                continue
        if mode == "point":
            im = ITEM_RE.match(t)
            if im:
                if cur: points.append(cur)
                title = im.group(2).strip("*").strip()
                if l.count("**") >= 2:   # 原行整体加粗（标题粗体）
                    title = "**" + title + "**"
                cur = {"n": int(im.group(1)), "title": title, "body": ""}
                continue
            if cur is None:
                continue
            if cur["body"]: cur["body"] += l            # 断句续行直接拼接（保持句子完整）
            else: cur["body"] = l
        elif mode == "quiz":
            qm = Q_RE.match(t)
            if qm:
                if curq: questions.append(curq)
                curq = {"t": qm.group(2), "n": int(qm.group(1)), "q": qm.group(3).strip(), "options": []}
                continue
            om = OPT_RE.match(t)
            if om and curq:
                curq["options"].append(om.group(1) + "." + om.group(2))
                continue
            am = ANS_RE.match(t)
            if am and curq is None:
                answers[am.group(1)] = am.group(2); continue
            if curq:
                if curq["options"]:                      # 选项续行拼到最后一个选项
                    curq["options"][-1] += t
                else:
                    curq["q"] += t                       # 题干续行拼接
            else:
                am2 = ANS_RE.match(t)
                if am2: answers[am2.group(1)] = am2.group(2)
        elif mode == "answer":
            am = ANS_RE.match(t)
            if am: answers[am.group(1)] = am.group(2)
            else:
                # 一行多个答案 "1.D 2.ABD"
                for mm in re.finditer(r'(\d{1,3})\s*[.、．]\s*([A-D]{1,4})', t):
                    answers[mm.group(1)] = mm.group(2)
    if cur: points.append(cur)
    if curq: questions.append(curq)

    qs = []
    for q in questions:
        a = answers.get(str(q["n"]), "")
        if not a or not q["options"]: continue
        qs.append({"t": q["t"], "q": q["q"], "options": q["options"], "a": a})
    return points, qs

def main():
    pdfs = sys.argv[1:]
    weeks = []
    for p in pdfs:
        base = os.path.basename(p)
        m = re.search(r'(\d{1,2}\.\d{1,2})-(\d{1,2}\.\d{1,2})', base)
        label = (m.group(1) + "-" + m.group(2)) if m else base
        name = os.path.splitext(base)[0]
        pts, qs = extract(p)
        weeks.append({"label": label, "name": name, "points": pts, "questions": qs})
        print("%s: 考点 %d, 题 %d (单%d 多%d)" % (label, len(pts), len(qs),
              sum(1 for q in qs if q["t"] == "单选"), sum(1 for q in qs if q["t"] == "多选")), file=sys.stderr)
    weeks.sort(key=lambda w: [int(x) for x in w["label"].split("-")[0].split(".")], reverse=True)
    js = "/* 每周时政演练数据（由 tools/extract_drills.py 生成，云端管理式静态数据） */\n"
    js += "window.KG_DRILLS=" + json.dumps(weeks, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open("js/drills-data.js", "w", encoding="utf-8") as f:
        f.write(js)
    print("written js/drills-data.js, weeks=%d" % len(weeks), file=sys.stderr)

if __name__ == "__main__":
    main()
