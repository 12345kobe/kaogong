# -*- coding: utf-8 -*-
"""解析本地政治理论 PDF（母题特训用）。
读取 SRC 目录下的 PDF，提取选择题（题干/选项/答案/解析），输出 assets/data/muti.js。
支持两种版式：
  A) 题本 + 题目解析（答案在文档后半部分，按题号对应）—— 如《政Z理论必刷题集》
  B) 题干与【答案】【解析】同行/同段 —— 如《李梦娇课后作业》
"""
import os, re, sys, json, datetime

try:
    import pymupdf as fitz
except ImportError:
    import fitz

SRC = os.environ.get("SRC", r"C:\Users\28621\Desktop\政治理论")
OUT = os.environ.get("OUT", os.path.join(os.path.dirname(__file__), "..", "assets", "data", "muti.js"))

SKIP_RE = re.compile(r"(微博：|抖音/公众号|凭听课笔记截图|华图李梦娇|公考李梦娇|领《李梦娇|口诀歌合集)")
# 章节标题（仅用于把题目分组显示）
HEADER_RE = re.compile(r"^\s*(?:第\s*[一二三四五六七八九十百0-9]+\s*章|第\s*[一二三四五六七八九十0-9]+\s*部分|（?[一二三四五六七八九十]+）?[、．.]|模块\s*[一二三四五六七八九十0-9]+|考点\s*[一二三四五六七八九十0-9]+|专题\s*[一二三四五六七八九十0-9]+|第二部分|第一部分|第三|第四|第五|第六|第七|第八|第九|第十)\s*([^\n]{1,30})")
Q_RE = re.compile(r"^\s*(\d{1,3})[．.、]\s*(.+)$")
INLINE_OPT_RE = re.compile(r"([A-Ha-h])[\.．、]\s*([^A-Ha-h\s][^A-Ha-h]*?(?=\s[A-Ha-h][\.．、]|$))")
ANS_RE = re.compile(r"【?\s*答案\s*】?\s*[:：]?\s*([A-Ha-h])")
ANA_RE = re.compile(r"【?\s*(?:解析|答案解析)\s*】?\s*[:：]?\s*(.*)$")

OPT_LETTERS = set("ABCDEFGH")


def clean(t):
    return re.sub(r"\s+", " ", t).strip()


def extract_text(path):
    doc = fitz.open(path)
    out = [doc[i].get_text() for i in range(doc.page_count)]
    doc.close()
    return "\n".join(out)


def merge_lines(text):
    raw = [l for l in text.split("\n")]
    merged, buf = [], ""
    for l in raw:
        s = l.strip()
        if not s:
            if buf:
                merged.append(buf); buf = ""
            continue
        if SKIP_RE.search(s):
            if buf:
                merged.append(buf); buf = ""
            continue
        if HEADER_RE.match(s) or Q_RE.match(s) or (s and s[0] in OPT_LETTERS and INLINE_OPT_RE.search(s)):
            if buf:
                merged.append(buf); buf = ""
            merged.append(s)
        else:
            buf = (buf + " " + s).strip() if buf else s
    if buf:
        merged.append(buf)
    return merged


def strip_prefix(stem):
    # 去掉题号后的 （2024 江西） 这类来源前缀，使题干更干净
    s = re.sub(r"^（[^）]*）\s*", "", stem)
    return s.strip()


def parse_questions_region(lines):
    """从合并后的行中解析题目（不含答案区），返回 (questions, chapters_bounds)。"""
    qs = []
    cur = None
    mode = None
    chapters = []  # (start_index, name)

    def flush():
        if cur and cur.get("options") and cur.get("q"):
            qs.append(cur)

    for s in lines:
        if not s.strip():
            continue
        mh = HEADER_RE.match(s)
        if mh and not Q_RE.match(s) and len(s) <= 28 and "？" not in s and "：" not in s:
            flush()
            title = re.sub(r"^[（(]?[一二三四五六七八九十]+[)）]?[、．.\s]*", "", s).strip("、．. ")
            chapters.append((len(qs), title[:40] or "未命名"))
            cur = None
            mode = None
            continue
        mq = Q_RE.match(s)
        if mq and not (s and s[0] in OPT_LETTERS and INLINE_OPT_RE.search(s)):
            flush()
            cur = {"q": strip_prefix(clean(mq.group(2))), "options": [], "a": None, "e": ""}
            mode = "stem"
            continue
        if cur is not None and s and s[0] in OPT_LETTERS and INLINE_OPT_RE.search(s):
            opts = INLINE_OPT_RE.findall(s)
            if opts:
                for _, val in opts:
                    cur["options"].append(clean(val))
                mode = "opts"
                continue
        if cur is not None:
            if mode in ("stem", None):
                cur["q"] = clean(cur["q"] + " " + s)
            elif mode == "opts":
                if cur["options"]:
                    cur["options"][-1] = clean(cur["options"][-1] + " " + s)
    flush()
    return qs, chapters


def parse_answers_region(text):
    """解析 题目解析 区，返回按文档顺序的答案列表 [(num,a,e), ...]。"""
    pat = re.compile(r"(\d{1,3})\s*[.．]?\s*【答案】\s*([A-Ha-h])(.*?)(?=(?:\n\d{1,3}\s*[.．]?\s*【答案】)|$)", re.S)
    ans = []
    for m in pat.finditer(text):
        num = int(m.group(1)); a = m.group(2).upper()
        rest = m.group(3)
        em = re.search(r"【解析】\s*(.*)", rest, re.S)
        e = clean(em.group(1)) if em else ""
        ans.append((num, a, e))
    return ans


def build_chapters(qs, bounds, fname):
    if not bounds:
        return [{"name": fname[:40], "file": fname, "questions": qs}]
    chapters = []
    bounds = sorted(bounds, key=lambda x: x[0])
    for i, (start, name) in enumerate(bounds):
        end = bounds[i + 1][0] if i + 1 < len(bounds) else len(qs)
        chunk = qs[start:end]
        if chunk:
            chapters.append({"name": name, "file": fname, "questions": chunk})
    # 末尾可能还有
    last = bounds[-1][0]
    if last < len(qs):
        chapters.append({"name": fname[:40], "file": fname, "questions": qs[last:]})
    if not chapters:
        chapters = [{"name": fname[:40], "file": fname, "questions": qs}]
    return chapters


def parse_book(path):
    text = extract_text(path)
    fname = os.path.basename(path)
    # 检测 题目解析 区
    mk = re.search(r"(题目解析|答案解析|参考答案|答案与解析)", text)
    two_region = bool(mk and len(re.findall(r"【答案】", text[mk.end():])) >= 5)
    if two_region:
        qtext = text[:mk.start()]
        atext = text[mk.start():]
        qs, bounds = parse_questions_region(merge_lines(qtext))
        ans = parse_answers_region(atext)
        for i, q in enumerate(qs):
            if i < len(ans):
                q["a"] = ord(ans[i][1]) - ord("A")
                q["e"] = ans[i][2]
        chapters = build_chapters(qs, bounds, fname)
    else:
        # 单行内联答案
        lines = merge_lines(text)
        qs, bounds = parse_questions_region(lines)
        # 内联答案已在 parse 中？这里单独再扫一遍答案
        # 重新用带答案的逻辑：直接在全行里匹配 【答案】
        cur = None
        mode = None
        qs2 = []
        def flush():
            if cur and cur.get("options") and cur.get("a") is not None and cur.get("q"):
                qs2.append(cur)
        for s in lines:
            if not s.strip():
                continue
            mh = HEADER_RE.match(s)
            if mh and not Q_RE.match(s) and len(s) <= 28 and "？" not in s and "：" not in s:
                flush(); cur = None; mode = None; continue
            mq = Q_RE.match(s)
            if mq and not (s and s[0] in OPT_LETTERS and INLINE_OPT_RE.search(s)):
                flush(); cur = {"q": strip_prefix(clean(mq.group(2))), "options": [], "a": None, "e": ""}; mode = "stem"; continue
            if cur is not None and s and s[0] in OPT_LETTERS and INLINE_OPT_RE.search(s):
                for _, val in INLINE_OPT_RE.findall(s):
                    cur["options"].append(clean(val))
                mode = "opts"; continue
            ma = ANS_RE.search(s)
            if ma and cur is not None:
                cur["a"] = ord(ma.group(1).upper()) - ord("A"); mode = "ana"
                an = ANA_RE.search(s)
                if an and an.group(1).strip():
                    cur["e"] = clean(cur["e"] + " " + an.group(1))
                continue
            an = ANA_RE.search(s)
            if an and cur is not None and cur.get("a") is not None:
                tail = an.group(1).strip()
                if tail:
                    cur["e"] = clean(cur["e"] + " " + tail)
                mode = "ana"; continue
            if cur is not None:
                if mode in ("stem", None):
                    cur["q"] = clean(cur["q"] + " " + s)
                elif mode == "ana":
                    cur["e"] = clean(cur["e"] + " " + s)
                elif mode == "opts":
                    if cur["options"]:
                        cur["options"][-1] = clean(cur["options"][-1] + " " + s)
        flush()
        chapters = build_chapters(qs2, bounds, fname)
    # 去重
    seen = set()
    for c in chapters:
        uniq = []
        for q in c["questions"]:
            key = q["q"]
            if key in seen or not q.get("options") or q.get("a") is None:
                continue
            seen.add(key); uniq.append(q)
        c["questions"] = uniq
    chapters = [c for c in chapters if c["questions"]]
    return chapters


def main():
    if not os.path.isdir(SRC):
        print("源目录不存在:", SRC); sys.exit(1)
    all_chapters = []
    for f in sorted(os.listdir(SRC)):
        if f.lower().endswith(".pdf"):
            print("解析:", f)
            try:
                chs = parse_book(os.path.join(SRC, f))
                n = sum(len(c["questions"]) for c in chs)
                print("  -> 章节 %d, 题目 %d" % (len(chs), n))
                all_chapters.extend(chs)
            except Exception as e:
                import traceback; traceback.print_exc(); print("  解析失败:", e)
    total = sum(len(c["questions"]) for c in all_chapters)
    data = {"updatedAt": datetime.date.today().isoformat(), "chapters": all_chapters}
    js = "window.MUTI = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
    out_path = os.path.abspath(OUT)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(js)
    print("输出:", out_path, "| 总章节", len(all_chapters), "总题目", total)


if __name__ == "__main__":
    main()
