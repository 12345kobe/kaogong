# -*- coding: utf-8 -*-
"""针对《公考行测母题200道—政治理论+常识判断》这类「题号 + 选项 + 【答案】+【解析】+【拓展积累】」内联版式的专用解析器。
用法（由 build 脚本调用或直接运行）：解析单个 PDF，返回 chapters（与 assets/data/muti.js 结构一致）。
"""
import os, re, sys

try:
    import pymupdf as fitz
except ImportError:
    import fitz

Q_NUM_RE = re.compile(r"^\s*(\d{1,4})[．.、]\s*(.*)$")
OPT_RE = re.compile(r"^\s*([A-Ha-h])[.．、]\s*(.*)$")
ANS_RE = re.compile(r"【?\s*答案\s*】?\s*[:：]?\s*([A-Ha-h])")
RIGHT_RE = re.compile(r"正确答案?\s*[：:]\s*([A-Ha-h])")
ANA_RE = re.compile(r"【?\s*(?:解析|答案解析)\s*】?")
EXT_RE = re.compile(r"【?\s*拓展积累\s*】?")


def clean(t):
    return re.sub(r"\s+", " ", t).strip()


def extract_text(path):
    doc = fitz.open(path)
    out = [doc[i].get_text() for i in range(doc.page_count)]
    doc.close()
    return "\n".join(out)


def split_questions(text):
    """按题号切分为 (num, body) 列表。body 为从题号后到下一题号前的原始文本。"""
    lines = text.split("\n")
    chunks = []
    cur = None
    for ln in lines:
        m = Q_NUM_RE.match(ln)
        if m:
            if cur is not None:
                chunks.append(cur)
            cur = {"num": int(m.group(1)), "raw": m.group(2)}
        elif cur is not None:
            cur["raw"] += "\n" + ln
    if cur is not None:
        chunks.append(cur)
    return chunks


def parse_chunk(num, raw):
    # 拆 stem / options / answer / analysis
    # 先定位选项起始行：第一个 OPT_RE 行
    body_lines = raw.split("\n")
    # 找第一个选项行
    opt_start = None
    for i, ln in enumerate(body_lines):
        if OPT_RE.match(ln):
            opt_start = i
            break
    if opt_start is None:
        return None
    # stem = 第一行（题号后剩余）到 opt_start 之前的合并
    stem_parts = [body_lines[0]] + body_lines[1:opt_start]
    stem = clean(" ".join(stem_parts))
    # 选项
    options = []
    i = opt_start
    while i < len(body_lines):
        ln = body_lines[i]
        mo = OPT_RE.match(ln)
        if mo and (not options or mo.group(1).upper() != options[-1][0].upper()):
            options.append([mo.group(1).upper(), mo.group(2)])
        elif options:
            # 续行（非答案/解析/拓展标记的普通文本）追加到最后一项
            s = ln.strip()
            if not s:
                i += 1
                continue
            if ANS_RE.search(s) or ANA_RE.search(s) or EXT_RE.search(s):
                break
            options[-1][1] = clean(options[-1][1] + " " + s)
        i += 1
    options = [[L, clean(V)] for L, V in options]
    # 答案 + 解析：在选项之后的文本里找
    tail = "\n".join(body_lines[i:]) if i < len(body_lines) else ""
    # 若选项遍历提前因标记 break，tail 从那里起
    ma = ANS_RE.search(raw)
    if not ma:
        ma = RIGHT_RE.search(raw)
    if not ma:
        return None
    ans_letter = ma.group(1).upper()
    ans_idx = ord(ans_letter) - ord("A")
    if ans_idx < 0 or ans_idx >= len(options):
        return None
    # 解析：取 【解析】 之后到 【拓展积累】 之前
    em = ANA_RE.search(raw)
    e = ""
    if em:
        rest = raw[em.end():]
        ex = EXT_RE.search(rest)
        if ex:
            rest = rest[:ex.start()]
        e = clean(rest)
    return {
        "q": stem,
        "options": [v for _, v in options],
        "a": ans_idx,
        "e": e,
    }


def parse_book(path):
    text = extract_text(path)
    fname = os.path.basename(path)
    chunks = split_questions(text)
    qs = []
    skipped = 0
    for c in chunks:
        q = parse_chunk(c["num"], c["raw"])
        if q and q["options"] and q["a"] is not None and len(q["options"]) >= 2:
            qs.append(q)
        else:
            skipped += 1
    if not qs:
        return []
    # 整本作为一个题本；若正文中有明显专题分隔可再细分，这里保持单本
    return [{"name": fname[:40], "file": fname, "questions": qs}]


def main():
    if len(sys.argv) < 2:
        print("用法: parse_politics_pdf.py <pdf路径>"); sys.exit(1)
    p = sys.argv[1]
    chs = parse_book(p)
    total = sum(len(c["questions"]) for c in chs)
    print("解析:", os.path.basename(p), "| 章节", len(chs), "| 题目", total)
    for c in chs:
        print(" -", c["name"], len(c["questions"]))
    if chs and chs[0]["questions"]:
        import json
        print(json.dumps(chs[0]["questions"][0], ensure_ascii=False)[:500])


if __name__ == "__main__":
    main()
