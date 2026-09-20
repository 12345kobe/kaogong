# -*- coding: utf-8 -*-
"""解析《言语必背实词成语(2).pdf》：
   - 前半「言语热点实词(实词30 个)」：每条实词有 ① ② ③ 释义 + 辨析 + 搭配；
     词条名只在引号内提及，需推断（优先取紧跟『多与/有/为/侧重』等连词的引号词）。
   - 后半「易混成语30 组」：以「(近五年考频N 次)(近五年考频N 次)」成对标记分隔；
     成语定义用「成语名：」格式（非【】括号）；真题示例以「(年份 地名)」开头，
     选项 A-D，解析标记【粉笔解析】，答案藏在「故正确答案为X」。
   输出 assets/data/verbal-realwords.js，结构：
     window.VERBAL_WORDS = { updatedAt, entries: [ {id,num,name,type,paras:[],exams:[{q,options,a,analysis}]} ] }
"""
import os, re, sys, datetime, json, collections

try:
    import pymupdf as fitz
except ImportError:
    import fitz

THREE_RE = re.compile(r"^（?[一二三四五六七八九十]+[)）]\s*①")
FIRST_ONE_RE = re.compile(r"^①")
DEF_LINE_RE = re.compile(r"^[\u4e00-\u9fff]{1,12}[：:]\s*\S")
# 语法标注行（非新词定义，不应触发新条）：地形容/中性词/贬义词等
GRAM_RE = re.compile(r"^(地|副|名|动|形|连|介|代)词?[:：]?$|^[\u4e00-\u9fff]{1,3}形容[:：]|中性词|贬义词|褒义词|褒义|贬义|近义|反义")
# 实词名候选：紧跟连词的引号词（最可靠）
WORD_HEAD_RE = re.compile(r"[“\“]([\u4e00-\u9fff]{2,4})[”\”](?:多与|有|为|侧重于|侧重|一般|通常|常|指|多|往往|主要)")
QUOTE_RE = re.compile(r"[“\“]([\u4e00-\u9fff]{2,4})[”\”]")
# 答案：正确答案为X / 答案为X / 本题选X / 正确答案X
ANS_RE = re.compile(
    r"正确答案为?\s*([A-Ha-h])|答案为?\s*([A-Ha-h])|本题?选?\s*([A-Ha-h])|正确答案?[:：]?\s*([A-Ha-h])|答案选?\s*([A-Ha-h])"
)
# 成语组分隔标记（两种写法：数字5 或 中文五）
GROUP_MARK_RE = re.compile(r"\(近\s*[五5]\s*年考频[^)]*\)")
# 真题起始： (年份 地名) / 编号+年份 / 或直接「填入/依次填入…最恰当的一项是：」
EXAM_START_RE = re.compile(
    r"(?m)^\s*\(\d{4}\s|^\s*\d{1,3}[\.．、]\s*\(\d{4}|填入画横线部分最恰当的一项是：|"
    r"依次填入画横线部分最恰当的一项是：|依次填入划线部分最恰当的一项是：|"
    r"填入划横线部分最恰当的一项是："
)
# 成语名（括号格式）排除词
BRACKET_STOP = {"解析", "答案", "例题", "拓展", "辨析", "误用", "例", "注", "粉笔解析"}
# 成语名（冒号格式）排除词
IDIOM_STOP = {"区别", "差异", "表达", "意思", "例如", "注意", "辨析", "用法",
              "相同", "不同", "联系", "综上", "二者", "两者", "相似", "提醒",
              "常见", "易混", "词义", "语义", "侧重", "比较", "搭配", "色彩",
              "语境", "含义", "感情", "以下", "程度", "词义侧重", "感情色彩",
              "区别在于", "表达意思", "程度轻重", "近义", "反义"}


def extract_text(path):
    doc = fitz.open(path)
    out = [doc[i].get_text() for i in range(doc.page_count)]
    doc.close()
    return "\n".join(out)


def clean(t):
    return re.sub(r"\s+", " ", t).strip()


def infer_word(block):
    """实词名推断：优先取紧跟连词的引号词；否则取出现最多的引号词。"""
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
    """切分为实词条块：新词条始于 ① / 三① / 独立定义行（新词），跳过标题行。"""
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
    lines = [clean(l) for l in block.split("\n") if l.strip()]
    word = infer_word(block)
    if not word and ("国画的一种画法" in block or "对所写对象作突出的描写" in block):
        word = "渲染"
    return {"name": word, "type": "word", "paras": lines, "exams": []}


def parse_idiom_group(gtext):
    # 理论部分（首个真题之前）= 成语定义 + 辨析
    em = EXAM_START_RE.search(gtext)
    theory = gtext[:em.start()] if em else gtext
    exam_text = gtext[em.start():] if em else ""
    # 提取成语名：①【成语名】括号格式 ② 名：冒号格式（遇到辨析关键词停）
    names = []
    seen = set()

    def is_stop(w):
        if w in IDIOM_STOP:
            return True
        return any(w.startswith(sw) for sw in IDIOM_STOP)

    for line in theory.split("\n"):
        ls = line.strip()
        for b in re.findall(r"【([\u4e00-\u9fff]{2,6})】", ls):
            if b not in BRACKET_STOP and b not in seen:
                names.append(b); seen.add(b)
    if not names:  # 无括号时退回冒号格式，遇到辨析标题即停
        for line in theory.split("\n"):
            ls = line.strip()
            m = re.match(r"^([\u4e00-\u9fff]{2,6})[:：]", ls)
            if m:
                if is_stop(m.group(1)):
                    break
                if m.group(1) not in seen:
                    names.append(m.group(1)); seen.add(m.group(1))
    paras = [clean(l) for l in theory.split("\n") if clean(l)]
    exams = parse_exams(exam_text)
    name = " vs ".join(dict.fromkeys(names)) if names else "成语组"
    return {"name": name, "type": "idiom", "paras": paras, "exams": exams}


def parse_exams(exam_text):
    """逐行解析：每道题以 A. 选项行开始（新题须在前一题已出现答案之后）；
       题干=前一题答案后到本题 A. 之间的文本；选项取带字母行；解析从【解析】起。"""
    if not exam_text.strip():
        return []
    lines = exam_text.split("\n")
    exams = []
    cur = None
    pending = []          # 题干缓冲（上一题答案后到本题 A. 之间）
    saw_answer = False
    in_analysis = False

    def flush():
        nonlocal cur
        if cur is None:
            return
        q = clean("\n".join(cur["q"]))
        options = cur["options"]
        analysis = clean("\n".join(cur["analysis"]))
        ans_m = ANS_RE.search(analysis) or ANS_RE.search(q)
        a = -1
        if ans_m:
            letter = (ans_m.group(1) or ans_m.group(2) or ans_m.group(3)
                      or ans_m.group(4) or ans_m.group(5) or "").upper()
            if letter:
                a = ord(letter) - ord("A")
        if q and len(options) >= 2 and a >= 0:
            exams.append({"q": q, "options": options, "a": a, "analysis": analysis})
        cur = None

    for ln in lines:
        s = ln.strip()
        is_start = bool(EXAM_START_RE.search(s))
        if is_start:
            # 新题起点（含上一题答案后的下一题题干）：强制分隔
            flush()
            cur = None
            pending = [s]
            saw_answer = False
            in_analysis = False
            continue
        is_opt = bool(re.match(r"^[A-Ha-h][\.．、]", s))
        is_answer = "正确答案为" in s or "答案选" in s or "答案为" in s
        has_jiexi = "【解析】" in s or "【粉笔解析】" in s
        if is_opt:
            if cur is None or saw_answer:
                flush()
                cur = {"q": list(pending), "options": [], "analysis": []}
                pending = []
                saw_answer = False
                in_analysis = False
            m = re.match(r"^([A-Ha-h])[\.．、]\s*(.*)$", s)
            cur["options"].append(clean(m.group(2)))
        elif is_answer or has_jiexi:
            saw_answer = True
            in_analysis = True
            if cur is not None:
                if has_jiexi or is_answer:
                    cur["analysis"].append(s)
        else:
            if in_analysis and cur is not None:
                cur["analysis"].append(s)
            elif cur is None or saw_answer:
                pending.append(s)
            else:
                # 本题 A. 之前（题干）或 D. 之后的裸词行（双空题第二组，丢弃）
                if not cur["options"]:
                    pending.append(s)
    flush()
    return exams


def main():
    if len(sys.argv) < 2:
        print("用法: parse_realwords_pdf.py <pdf> [out_js]"); sys.exit(1)
    p = sys.argv[1]
    text = extract_text(p)
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

    # 按单个标记切分，标记成对相邻；偶数片段（>=2）为各组正文，奇数片段为成对间隔
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

    data = {"updatedAt": datetime.date.today().isoformat(), "entries": entries}
    js = "window.VERBAL_WORDS = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
    out = sys.argv[2] if len(sys.argv) > 2 else "assets/data/verbal-realwords.js"
    open(out, "w", encoding="utf-8").write(js)
    n_word = sum(1 for e in entries if e["type"] == "word")
    n_idiom = sum(1 for e in entries if e["type"] == "idiom")
    n_exam = sum(len(e["exams"]) for e in entries)
    print("实词条目 %d，成语组 %d，真题示例 %d，总条目 %d" % (n_word, n_idiom, n_exam, len(entries)))
    print("实词名:", [e["name"] for e in entries if e["type"] == "word"])
    if any(e["type"] == "idiom" for e in entries):
        sample = next(e for e in entries if e["type"] == "idiom")
        print("成语样本:", sample["name"], "| 题数", len(sample["exams"]))
        print("  首题:", sample["exams"][0])


if __name__ == "__main__":
    main()
