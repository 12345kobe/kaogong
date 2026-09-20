# -*- coding: utf-8 -*-
"""解析《言语必背实词成语(2).pdf》：
   - 前半「言语热点实词」：每条实词 ① ② ③ 释义 + 辨析 + 搭配（PDF 该区无真题）。
   - 后半「易混成语30 组」：以「(近五年考频N 次)」成对标记分隔；
     真题以「故正确答案为X。」结尾——这是最可靠的分题边界；
     「依次填入画横线部分最恰当的一项是：」只是题干的提问句，绝不是新题起点！
   - 空格线在文本层是内联图片/缺口：按行坐标重建文本行，横向间隙 ≥12px 处补「______」。
   - D 选项后的裸词行 = 双空/三空题的额外选项列，按列归位到 A-D 选项。
   输出 assets/data/verbal-realwords.js：
     window.VERBAL_WORDS = { updatedAt, entries: [ {id,num,name,type,paras,exams:[{q,options,a,analysis}]} ] }
"""
import os, re, sys, datetime, json, collections

try:
    import pymupdf as fitz
except ImportError:
    import fitz

THREE_RE = re.compile(r"^（?[一二三四五六七八九十]+[)）]\s*①")
FIRST_ONE_RE = re.compile(r"^①")
DEF_LINE_RE = re.compile(r"^[\u4e00-\u9fff]{1,12}[：:]\s*\S")
GRAM_RE = re.compile(r"^(地|副|名|动|形|连|介|代)词?[:：]?$|^[\u4e00-\u9fff]{1,3}形容[:：]|中性词|贬义词|褒义词|褒义|贬义|近义|反义")
WORD_HEAD_RE = re.compile(r"[“\“]([\u4e00-\u9fff]{2,4})[”\”](?:多与|有|为|侧重于|侧重|一般|通常|常|指|多|往往|主要)")
QUOTE_RE = re.compile(r"[“\“]([\u4e00-\u9fff]{2,4})[”\”]")
ANS_RE = re.compile(
    r"正确答案为?\s*([A-Ha-h])|答案为?\s*([A-Ha-h])|本题?选?\s*([A-Ha-h])|正确答案?[:：]?\s*([A-Ha-h])|答案选?\s*([A-Ha-h])"
)
# 答案行（锚定行首，防止解析中段的「所以答案选择B」误触发）：
ANSWER_LINE_RE = re.compile(r"^(?:故)?正确答案为?[A-Ha-h]|^本题选[A-Ha-h]|^答案为?[A-Ha-h]|^故答案?为?[A-Ha-h]")
# 成语组分隔标记
GROUP_MARK_RE = re.compile(r"\(近\s*[五5]\s*年考频[^)]*\)")
# 真题头部「1. (2016 黑龙江)」/「(2016 xx)」/「(粉笔模考)」——有的题没有，仅作辅助
EXAM_HEAD_RE = re.compile(r"(?m)^(?:\s*\d{1,3}[\.．、]\s*[\(（]\s*(?:\d{4}|\u7c89\u7b14)|\s*[\(（]\s*(?:\d{4}|\u7c89\u7b14))")
# 题干起始特征：含空格线 / 题头 / 提问句
STEM_HINT_RE = re.compile(r"_{2,}|\(近|\uff3f")
QUESTION_HINT = "最恰当的一项"
OPT_RE = re.compile(r"^([A-Ha-h])[\.．、]\s*(.*)$")
BARE_WORD_RE = re.compile(r"^[\u4e00-\u9fff]{2,8}$")
BRACKET_STOP = {"解析", "答案", "例题", "拓展", "辨析", "误用", "例", "注", "粉笔解析"}
IDIOM_STOP = {"区别", "差异", "表达", "意思", "例如", "注意", "辨析", "用法",
              "相同", "不同", "联系", "综上", "二者", "两者", "相似", "提醒",
              "常见", "易混", "词义", "语义", "侧重", "比较", "搭配", "色彩",
              "语境", "含义", "感情", "以下", "程度", "词义侧重", "感情色彩",
              "区别在于", "表达意思", "程度轻重", "近义", "反义"}


def reconstruct_pages(path):
    """按行坐标重建每页文本：同一 y（±3px）的碎片按 x 排序拼接，
       横向间隙 ≥12px 处视为挖空，补「______」。"""
    doc = fitz.open(path)
    out = []
    for pno in range(doc.page_count):
        d = doc[pno].get_text("dict")
        frags = []  # (y, x0, x1, text)
        for b in d["blocks"]:
            if b.get("type") != 0:
                continue
            for l in b["lines"]:
                txt = "".join(s["text"] for s in l["spans"])
                if txt.strip():
                    frags.append((l["bbox"][1], l["bbox"][0], l["bbox"][2], txt))
        # y 分组
        rows = []
        for y, x0, x1, t in sorted(frags, key=lambda f: (f[0], f[1])):
            placed = False
            for row in rows:
                if abs(row[0] - y) <= 3:
                    row[1].append((x0, x1, t)); placed = True; break
            if not placed:
                rows.append([y, [(x0, x1, t)]])
        rows.sort(key=lambda r: r[0])
        for y, cells in rows:
            cells.sort()
            line = ""
            prev_x1 = None
            for x0, x1, t in cells:
                if prev_x1 is not None:
                    gap = x0 - prev_x1
                    if gap >= 12:
                        line += "______"
                    elif gap > 0:
                        line += " "
                line += t.strip()
                prev_x1 = x1
            out.append(line)
    doc.close()
    return "\n".join(out)


def clean(t):
    t = re.sub(r"\s+", " ", t).strip()
    # 去掉 CJK 字符间残留的 PDF 换行空格
    t = re.sub(r'(?<=[\u4e00-\u9fff，。；：、“”‘’（）《》—…～·])\s+(?=[\u4e00-\u9fff，。；：、“”‘’（）《》—…～·])', "", t)
    return t.strip()


def infer_word(block):
    head = WORD_HEAD_RE.search(block)
    if head:
        return head.group(1)
    cands = QUOTE_RE.findall(block)
    if not cands:
        return ""
    cnt = collections.Counter(cands)
    best = max(cands, key=lambda c: (cnt[c], -block.find(c)))
    return best


def split_realwords(text):
    lines = text.split("\n")
    blocks = []
    cur = []
    title_re = re.compile(r"言语热点|实词\d*|易混成语|^\s*成语?\s*组")

    def flush():
        nonlocal cur
        if cur:
            blocks.append("\n".join(cur).strip())
        cur = []

    for ln in lines:
        s = ln.strip()
        if not s:
            if cur:
                cur.append(ln)
            continue
        if title_re.search(s):
            flush(); continue
        if FIRST_ONE_RE.match(s) or THREE_RE.match(s):
            flush(); cur = [ln]; continue
        if DEF_LINE_RE.match(s) and not s.startswith("与") and len(s) <= 24 and not GRAM_RE.search(s):
            flush(); cur = [ln]; continue
        cur.append(ln)
    flush()
    return [b for b in blocks if b]


def parse_realword_block(block):
    lines = [clean(l) for l in block.split("\n") if clean(l)]
    word = infer_word(block)
    if not word and ("国画的一种画法" in block or "对所写对象作突出的描写" in block):
        word = "渲染"
    return {"name": word, "type": "word", "paras": lines, "exams": []}


def is_stem_line(s):
    """题干特征行：含空格线 / 真题头 / 提问句"""
    return bool(re.search(r"_{2,}", s)) or bool(EXAM_HEAD_RE.search(s)) or (QUESTION_HINT in s)


def parse_exams(lines):
    """行数组 → 真题列表。
       分题边界：答案行（行首『故正确答案为X』等）之后的下一条内容行 = 下一题题干起点。
       题干 = 起点行到首个选项 A. 之间的全部行（含「依次填入…最恰当的一项是：」）。
       D 选项后的裸词行 = 额外空的选项列（按每列=选项数分块，列序追加到各选项）。"""
    exams = []
    cur = None
    pending = []
    saw_answer = False
    in_analysis = False
    bare = []             # D 之后收到的裸词（额外空列）

    def flush():
        nonlocal cur, bare
        if cur is None:
            bare = []
            return
        q = clean("\n".join(cur["q"]))
        options = list(cur["options"])
        analysis = clean("\n".join(cur["analysis"]))
        # 裸词列归位：列序块（每块=选项数）逐列追加
        if bare and len(options) >= 2 and len(bare) % len(options) == 0:
            k = len(bare) // len(options)
            for i in range(len(options)):
                extra = "／".join(bare[c * len(options) + i] for c in range(k))
                options[i] = (options[i] + "／" + extra) if extra else options[i]
        ans_m = ANS_RE.search(analysis) or ANS_RE.search(q)
        a = -1
        if ans_m:
            letter = (ans_m.group(1) or ans_m.group(2) or ans_m.group(3)
                      or ans_m.group(4) or ans_m.group(5) or "").upper()
            if letter:
                a = ord(letter) - ord("A")
        # 质量门：题干完整（≥25 字，且含空格线或提问句）、选项齐全、答案合法
        if (q and len(q) >= 25 and len(options) >= 2 and a >= 0
                and (re.search(r"_{2,}", q) or QUESTION_HINT in q)
                and all(o.strip() for o in options)):
            exams.append({"q": q, "options": options, "a": a, "analysis": analysis})
        cur = None
        bare = []

    for ln in lines:
        s = ln.strip()
        if not s:
            continue
        if ANSWER_LINE_RE.match(s):
            saw_answer = True
            in_analysis = False
            if cur is not None:
                cur["analysis"].append(s)
            continue
        is_opt = bool(OPT_RE.match(s))
        has_jiexi = "【解析】" in s or "【粉笔解析】" in s
        if is_opt:
            if cur is None:
                cur = {"q": list(pending), "options": [], "analysis": []}
                pending = []
                in_analysis = False
            m = OPT_RE.match(s)
            txt = clean(m.group(2))
            if txt:  # 选项与解析同行的残留防护
                cur["options"].append(txt)
        elif has_jiexi:
            saw_answer = False
            in_analysis = True
            if cur is not None:
                cur["analysis"].append(s)
        else:
            if saw_answer:
                # 上一题已以答案行收尾 → 本行是下一题题干起点
                flush()
                cur = None
                pending = [s]
                saw_answer = False
                in_analysis = False
            elif in_analysis and cur is not None:
                cur["analysis"].append(s)
            elif cur is not None and cur["options"] and BARE_WORD_RE.match(s):
                bare.append(s)   # 额外空的选项列
            elif cur is None or not cur["options"]:
                pending.append(s)
            # 其余（cur 活跃且已有选项的杂行）丢弃
    flush()
    return exams


def parse_idiom_group(gtext):
    lines = [l.strip() for l in gtext.split("\n") if l.strip()]
    # 理论区（成语定义+辨析）= 第一条题干特征行之前的所有行。
    # 但题干开头几行可能没有空格线/题头特征（文本层截断），
    # 故从特征行向前回溯：上一行不是以句末标点结尾且像散文续行 → 并入题干。
    li = next((i for i, l in enumerate(lines) if is_stem_line(l)), None)
    if li is not None:
        while li > 0:
            prev = lines[li - 1]
            if len(prev) >= 8 and not re.search(r"[。！？；：”)]\s*$", prev) and not prev.startswith("【"):
                li -= 1
            else:
                break
    theory_lines = lines if li is None else lines[:li]
    exam_lines = [] if li is None else lines[li:]
    # 成语名：①【成语名】 ② 名：冒号格式（遇辨析关键词停）
    names = []
    seen = set()

    def is_stop(w):
        if w in IDIOM_STOP:
            return True
        return any(w.startswith(sw) for sw in IDIOM_STOP)

    for line in theory_lines:
        for b in re.findall(r"【([\u4e00-\u9fff]{2,6})】", line):
            if b not in BRACKET_STOP and b not in seen:
                names.append(b); seen.add(b)
    if not names:
        for line in theory_lines:
            m = re.match(r"^([\u4e00-\u9fff]{2,6})[:：]", line)
            if m:
                if is_stop(m.group(1)):
                    break
                if m.group(1) not in seen:
                    names.append(m.group(1)); seen.add(m.group(1))
    paras = [clean(l) for l in theory_lines if clean(l)]
    exams = parse_exams(exam_lines)
    name = " vs ".join(dict.fromkeys(names)) if names else "成语组"
    return {"name": name, "type": "idiom", "paras": paras, "exams": exams}


def dedupe_exams(entries):
    """PDF 同一道题可能重复印刷（合并版/带空格版），按题干归一化去重。"""
    seen = set()
    for e in entries:
        kept = []
        for ex in e["exams"]:
            key = re.sub(r"[\s_]+", "", ex["q"])[:40]
            if key in seen:
                continue
            seen.add(key)
            kept.append(ex)
        e["exams"] = kept
    return entries


def main():
    if len(sys.argv) < 2:
        print("用法: parse_realwords_pdf.py <pdf> [out_js]"); sys.exit(1)
    p = sys.argv[1]
    text = reconstruct_pages(p)
    mi = text.find("易混成语")
    word_part = text[:mi] if mi >= 0 else text
    idiom_part = text[mi:] if mi >= 0 else ""
    entries = []

    blocks = split_realwords(word_part)
    num = 0
    for b in blocks:
        if len(clean(b)) < 8:
            continue
        num += 1
        e = parse_realword_block(b)
        e["id"] = "w%d" % num
        e["num"] = num
        entries.append(e)

    frags = GROUP_MARK_RE.split(idiom_part)
    raw_groups = [frags[i].strip() for i in range(0, len(frags), 2)
                  if len(frags[i].strip()) > 20]
    for g in raw_groups:
        if len(g) < 20:
            continue
        e = parse_idiom_group(g)
        if not e["exams"]:
            continue
        num += 1
        e["id"] = "i%d" % num
        e["num"] = num
        entries.append(e)

    entries = dedupe_exams(entries)

    data = {"updatedAt": datetime.date.today().isoformat(), "entries": entries}
    js = "window.VERBAL_WORDS = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
    out = sys.argv[2] if len(sys.argv) > 2 else "assets/data/verbal-realwords.js"
    open(out, "w", encoding="utf-8").write(js)
    n_word = sum(1 for e in entries if e["type"] == "word")
    n_idiom = sum(1 for e in entries if e["type"] == "idiom")
    n_exam = sum(len(e["exams"]) for e in entries)
    print("实词条目 %d，成语组 %d，真题示例 %d，总条目 %d" % (n_word, n_idiom, n_exam, len(entries)))
    if any(e["type"] == "idiom" for e in entries):
        sample = next(e for e in entries if e["type"] == "idiom")
        print("成语样本:", sample["name"], "| 题数", len(sample["exams"]))
        print("  首题干:", sample["exams"][0]["q"][:80])
        print("  首题选项:", sample["exams"][0]["options"], "答案:", sample["exams"][0]["a"])


if __name__ == "__main__":
    main()
