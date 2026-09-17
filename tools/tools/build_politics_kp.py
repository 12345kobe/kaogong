# -*- coding: utf-8 -*-
"""解析 6 份「精讲精练 · 政治理论」PDF 为知识点复习卡片。

每个 PDF 即一节课，文件名带序号（政治理论1-6）。
- 课内正文用 一、二、三、(一)(二) 划分子节 → 每个子节一个知识点
- 实战演练 区是该课的关联练习题
- 重新排版：合并被 PDF 折行的续行，在语义边界（1. （1） 【解析】 【注意】）处换行
- 重点加粗：自动抽取年份/第X届/《》/引号术语/标题关键词/常见政治术语
- 题目匹配：按主题关键词把每道题匹配到最相关的知识点（pointId），
  不匹配的题集中在「本课时全部习题」入口，避免复习内容与题目不一致
"""
import os, re, sys, json, datetime, glob
import pymupdf as fitz

SRC = os.environ.get("SRC", r"C:\Users\28621\Desktop\政治理论")
OUT = os.environ.get("OUT", os.path.join(os.path.dirname(__file__), "..", "assets", "data", "politics_kp.js"))

# === 正则 ===
RE_LESSON_MAIN = re.compile(r"^第[一二三四五六七八九十]+(?:节|章)\s+([^\n]{2,60})$")
RE_L1 = re.compile(r"^([一二三四五六七八九十]+)、\s*([^\n]{2,80})$")
RE_L2 = re.compile(r"^（([一二三四五六七八九十]+)）\s*([^\n]{2,80})$")
RE_PRACTICE = re.compile(r"^\s*(?:【\s*)?实战演练(?:\s*】)?\s*$")
RE_QID2 = re.compile(r"^\s*(\d+)\s*[.．、]\s*(.+)$")
RE_OPT = re.compile(r"^([A-Ha-h])[\.．、]\s*(.+)$")
RE_ANS = re.compile(r"【\s*答\s*案\s*】\s*[:：]?\s*([A-Ha-h])")
RE_XUAN = re.compile(r"【\s*选\s*([A-Ha-h])\s*】", re.IGNORECASE)
RE_JIEXI_TAG = re.compile(r"^【\s*解析\s*】")
RE_ZHUYI_TAG = re.compile(r"^【\s*注意\s*】")

# 常见政治理论术语（用于重点标注 + 题目匹配）
CURATED = [
    "守正创新", "两个结合", "两个确立", "六个必须坚持", "中国式现代化", "共同富裕",
    "中华民族伟大复兴", "习近平新时代中国特色社会主义思想", "马克思主义中国化时代化",
    "马克思主义中国化", "时代化", "中华优秀传统文化", "伟大建党精神", "科学体系",
    "世界观", "方法论", "历史地位", "主要矛盾", "新时代", "历史方位", "中国梦",
    "以人民为中心", "人民", "高质量发展", "新发展格局", "全过程人民民主", "社会主义核心价值观",
    "总体国家安全观", "人类命运共同体", "一带一路", "全面深化改革", "全面依法治国",
    "全面从严治党", "新发展理念", "党的全面领导", "治理体系", "治理能力", "最大法宝",
    "归根到底", "必由之路", "战略全局", "世界百年未有之大变局", "三件大事", "中心任务",
    "乡村振兴", "区域协调发展", "科技自立自强", "绿水青山就是金山银山", "江山就是人民",
    "人民就是江山", "中国式现代化道路", "四个全面", "五位一体", "社会主义本质", "初级阶段",
    "基本方略", "总体布局", "政治定力", "问题导向", "十个明确", "十四个坚持", "十三个方面成就",
    "四个意识", "四个自信", "两个维护", "总体布局", "全面建成小康社会", "社会主义现代化强国",
    "长期执政", "马克思主义政党", "中国特色社会主义", "中国特色", "社会主义",
]

SENT_END = "。！？；：.！？）】”』"
def ends_sentence(s):
    return bool(s) and s[-1] in SENT_END

def starts_boundary(s):
    return bool(re.match(
        r"^(\d+[\.．、]|（\d+）|\([0-9]+\)|【|（[一二三四五六七八九十]+）|"
        r"[（(][一二三四五六七八九十]+[)）]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫])", s))

def clean_line(s):
    if s is None: return ""
    return re.sub(r"[ \t\u3000]+", " ", str(s)).strip()

def retypeset_block(lines):
    """合并被 PDF 折行的续行，并在语义边界处换行，得到按文件排版的文本。"""
    if isinstance(lines, str):
        lines = lines.split("\n")
    merged = []
    for raw in lines:
        s = clean_line(raw)
        if not s:
            continue
        if merged and not ends_sentence(merged[-1]) and not starts_boundary(s):
            merged[-1] = merged[-1] + s
        else:
            merged.append(s)
    return "\n".join(merged)

def extract_highlights(body, title, max_n=14):
    """抽取应加粗的重点词（年份/第X届/《》/引号术语/标题关键词/政治术语）。"""
    if not body: return []
    HL = []
    HL += re.findall(r"\d{4}\s*年", body)
    HL += re.findall(r"第[一二三四五六七八九十百0-9]+(?:届|次|个|部|场|批|位)", body)
    HL += re.findall(r"\d+(?:\.\d+)?\s*[%％个项条名年倍位次级]", body)
    HL += re.findall(r"[《【](.+?)[】》]", body)
    HL += re.findall(r"[“\"](.+?)[”\"]", body)
    for seg in re.split(r"[·，、；。：:？?！!（）()]+", title or ""):
        seg = seg.strip()
        if len(seg) >= 2 and seg in body:
            HL.append(seg)
    for t in CURATED:
        if t in GENERIC:
            continue
        if len(t) >= 3 and t in body:
            HL.append(t)
    seen = set(); out = []
    for h in HL:
        h = re.sub(r"\s+", "", h).strip()
        if not h or h in seen or len(h) > 30 or len(h) < 2:
            continue
        seen.add(h); out.append(h)
        if len(out) >= max_n:
            break
    return out

# 课程通用词（几乎出现在每个知识点标题里，无区分度，匹配时忽略）
GENERIC = {
    "习近平新时代中国特色社会主义思想", "中国特色社会主义", "中国特色", "社会主义",
    "新时代", "马克思主义", "马克思主义中国化时代化", "马克思主义中国化",
    "时代化", "中国化", "中华", "理论体系",
}

def tokens_of(text):
    """用于题目-知识点匹配的词袋：政治术语 + 引号/书名号术语 + 标题式长片段。
    排除课程通用词（GENERIC），只保留有区分度的词。"""
    s = text or ""
    toks = set()
    for t in CURATED:
        if t in GENERIC:
            continue
        if t in s:
            toks.add(t)
    for m in re.findall(r"[“\"](.+?)[”\"]", s):
        if len(m) >= 2 and m not in GENERIC:
            toks.add(m)
    for m in re.findall(r"[《【](.+?)[】》]", s):
        if len(m) >= 2 and m not in GENERIC:
            toks.add(m)
    for seg in re.split(r"[·，、；。：:？?！!（）()]+", s):
        if len(seg) >= 3 and seg not in GENERIC:
            toks.add(seg)
    return toks

def match_question_to_point(q, points):
    """返回最相关知识点 id；若无明显相关返回 None。

    评分原则：标题命中权重极高（10×长度），正文命中权重极低（0.3×长度），
    避免被超长正文里的通用词（如“马克思主义/中国特色社会主义”）带偏；
    题干/解析整段包含某点标题的 4 字以上片段 → 强信号加成。
    """
    qt = tokens_of(q.get("q", "") + " " + " ".join(q.get("options", [])) + " " + (q.get("e") or ""))
    if not qt:
        return None
    qtext = (q.get("q", "") or "") + (q.get("e") or "")
    best = None; best_score = 0
    for p in points:
        pt_title = tokens_of(p.get("title", ""))
        pt_body = tokens_of((p.get("body", "") or "") + " " + (p.get("jiexi", "") or "") + " " + " ".join(p.get("zhu", []) or []))
        shared = qt & (pt_title | pt_body)
        if not shared:
            continue
        score = 0
        for t in shared:
            if t in pt_title:
                score += len(t) * 10
            elif t in pt_body:
                score += len(t) * 0.3
        # 标题长片段被题干/解析整段包含 → 强信号
        for seg in re.split(r"[·，、；。：:？?！!（）()]+", p.get("title", "")):
            if seg not in GENERIC and len(seg) >= 4 and seg in qtext:
                score += len(seg) * 5
        if score > best_score:
            best_score = score; best = p
    # 阈值：至少命中一个标题词或一个 4 字以上标题片段
    if best_score >= 4:
        return best["id"]
    return None

def parse_pdf(path, idx_global):
    doc = fitz.open(path)
    fname = os.path.basename(path)
    npages = doc.page_count

    lesson_title = None
    for p in range(min(npages, 5)):
        for line in doc[p].get_text().split("\n"):
            m = RE_LESSON_MAIN.match(line.strip())
            if m: lesson_title = clean_line(m.group(1)); break
        if lesson_title: break
    if not lesson_title:
        m = re.search(r"政治理论\s*(\d+)", fname)
        if m: lesson_title = "政治理论精讲精练 第%s节" % m.group(1)

    sections = []
    questions = []
    in_practice = False
    cur_q = None

    cur_sec = None
    collect_mode = "body"

    def flush_sec():
        nonlocal cur_sec
        if cur_sec is not None:
            cur_sec["body"] = retypeset_block(cur_sec.get("body", []))
            cur_sec["jiexi"] = retypeset_block(cur_sec.get("jiexi", []))
            if cur_sec["body"] or cur_sec["jiexi"]:
                sections.append(cur_sec)
        cur_sec = None

    def flush_q():
        nonlocal cur_q
        if cur_q is None: return
        q = retypeset_block(cur_q.get("q_lines", [])) if cur_q.get("q") is None else cur_q["q"]
        e = retypeset_block(cur_q.get("e_lines", [])) if cur_q.get("e_lines") else ""
        if q and cur_q.get("options") and cur_q.get("a") is not None:
            questions.append({
                "qnum": cur_q["qnum"], "q": q, "options": cur_q["options"],
                "a": cur_q["a"], "e": e,
            })
        cur_q = None

    for p in range(npages):
        for s in doc[p].get_text().split("\n"):
            s = s.strip()
            if not s: continue

            if RE_PRACTICE.match(s):
                flush_sec(); flush_q()
                in_practice = True
                continue

            if in_practice:
                m_qid = RE_QID2.match(s)
                if m_qid and m_qid.group(1).isdigit() and int(m_qid.group(1)) <= 12:
                    flush_q()
                    cur_q = {"q_lines": [clean_line(m_qid.group(2))], "options": [], "a": None,
                             "e_lines": [], "qnum": int(m_qid.group(1)), "q": None}
                    continue
                m_opt = RE_OPT.match(s)
                if m_opt and cur_q is not None:
                    if cur_q.get("q") is None:
                        cur_q["q"] = retypeset_block(cur_q["q_lines"]); cur_q["q_lines"] = None
                    cur_q["options"].append(clean_line(m_opt.group(2)))
                    continue
                m_ans = RE_ANS.search(s)
                if m_ans and cur_q is not None and cur_q["a"] is None:
                    if cur_q.get("q") is None:
                        cur_q["q"] = retypeset_block(cur_q["q_lines"]); cur_q["q_lines"] = None
                    cur_q["a"] = m_ans.group(1).upper()
                    continue
                m_xuan = RE_XUAN.search(s)
                if m_xuan and cur_q is not None:
                    if cur_q.get("q") is None:
                        cur_q["q"] = retypeset_block(cur_q["q_lines"]); cur_q["q_lines"] = None
                    cur_q["a"] = m_xuan.group(1).upper()
                    continue
                if RE_JIEXI_TAG.match(s) and cur_q is not None:
                    if cur_q.get("q") is None:
                        cur_q["q"] = retypeset_block(cur_q["q_lines"]); cur_q["q_lines"] = None
                    rest = re.sub(r"^【\s*解析\s*】\s*\d*\.?\s*", "", s)
                    cur_q["e_lines"].append(clean_line(rest))
                    continue
                # 解析续行
                if cur_q is not None and cur_q.get("e_lines") and not m_qid and not m_opt and not m_ans:
                    cur_q["e_lines"].append(clean_line(s))
                    continue
                # 题干续行
                if cur_q is not None and cur_q.get("q") is None and not m_opt and not m_ans and not m_xuan:
                    cur_q["q_lines"].append(clean_line(s))
                    continue
                continue

            if "遇见不一样的自己" in s: continue
            if "粉笔公考" in s and len(s) < 12: continue
            if re.match(r"^\d{1,3}$", s) and len(s) <= 3: continue

            m_lm = RE_LESSON_MAIN.match(s)
            if m_lm and not lesson_title:
                lesson_title = clean_line(m_lm.group(1))

            m_l1 = RE_L1.match(s)
            if m_l1 and len(s) <= 60 and not s.startswith("一、单项") and not s.startswith("一、多项"):
                flush_sec()
                cur_sec = {"l1": clean_line(m_l1.group(2)), "l2": None, "body": [], "jiexi": [], "zhu": []}
                continue

            m_l2 = RE_L2.match(s)
            if m_l2 and cur_sec is not None and len(s) <= 60:
                cur_sec["l2"] = clean_line(m_l2.group(2))
                cur_sec["body"] = []
                collect_mode = "body"
                continue

            if RE_JIEXI_TAG.match(s):
                if cur_sec is not None:
                    cur_sec["jiexi"].append(clean_line(re.sub(r"^【\s*解析\s*】\s*", "", s)))
                collect_mode = "jiexi"
                continue
            if RE_ZHUYI_TAG.match(s):
                if cur_sec is not None:
                    cur_sec["zhu"].append(clean_line(re.sub(r"^【\s*注意\s*】\s*", "", s)))
                continue

            if cur_sec is not None:
                if collect_mode == "jiexi":
                    cur_sec["jiexi"].append(clean_line(s))
                else:
                    cur_sec["body"].append(clean_line(s))

    flush_q(); flush_sec()

    for sec in sections:
        sec["highlights"] = extract_highlights(sec["body"], sec["l1"] + "·" + (sec["l2"] or ""))
        sec["title"] = (sec["l1"][:30] + ("·" + sec["l2"][:25] if sec["l2"] else "")).strip()

    if not lesson_title:
        m = re.search(r"政治理论\s*(\d+)", fname)
        lesson_title = "政治理论精讲精练 第%s节" % (m.group(1) if m else fname[:20])

    lesson = {
        "idx": idx_global, "title": lesson_title, "fileName": fname, "fileIdx": idx_global,
        "date": re.search(r"\d{4}\.\d{2}\.\d{2}", fname).group(0) if re.search(r"\d{4}\.\d{2}\.\d{2}", fname) else None,
        "sections": sections, "sectionsCount": len(sections),
        "questions": [{"id": "kp-%d-q%d" % (idx_global, q["qnum"]), "q": q["q"],
                        "options": q["options"], "a": q["a"], "e": q["e"]} for q in questions],
        "questionsCount": len(questions),
    }
    return lesson


def main():
    if not os.path.isdir(SRC):
        print("源目录不存在:", SRC); sys.exit(1)
    files = sorted(glob.glob(os.path.join(SRC, "*精讲精练*.pdf")))
    if not files:
        print("找不到 PDF"); sys.exit(1)

    lessons = []
    for i, f in enumerate(files, 1):
        print("解析:", os.path.basename(f))
        try:
            ls = parse_pdf(f, i)
            print("  课时 %d | sections %d | 课堂练习题 %d" % (ls["idx"], ls["sectionsCount"], ls["questionsCount"]))
            lessons.append(ls)
        except Exception:
            import traceback; traceback.print_exc()

    flat_points = []
    bank = []
    for ls in lessons:
        for sec in ls["sections"]:
            flat_points.append({
                "id": "L%d_S%d" % (ls["idx"], len(flat_points)),
                "lessonIdx": ls["idx"], "lessonTitle": ls["title"], "fileName": ls["fileName"],
                "title": sec["title"], "l1": sec["l1"], "l2": sec["l2"] or "",
                "body": sec["body"], "jiexi": sec["jiexi"], "zhu": sec.get("zhu", []),
                "highlights": sec.get("highlights", []),
            })
        for q in ls["questions"]:
            q["lessonIdx"] = ls["idx"]
            bank.append(q)

    # 题目 → 最相关知识点 匹配
    matched = 0
    for ls in lessons:
        lpts = [p for p in flat_points if p["lessonIdx"] == ls["idx"]]
        lqs = [q for q in bank if q["lessonIdx"] == ls["idx"]]
        for q in lqs:
            pid = match_question_to_point(q, lpts)
            q["pointId"] = pid
            if pid: matched += 1
    unmatched = sum(1 for q in bank if not q.get("pointId"))

    data = {
        "updatedAt": datetime.date.today().isoformat(),
        "totalNotes": len(flat_points), "totalLessons": len(lessons), "totalQuestions": len(bank),
        "lessons": [{"idx": ls["idx"], "title": ls["title"], "date": ls.get("date"),
                     "fileName": ls["fileName"], "sectionsCount": ls["sectionsCount"],
                     "questionsCount": ls["questionsCount"]} for ls in lessons],
        "points": flat_points, "bank": bank,
    }

    js = "// 自动从「精讲精练 · 政治理论」PDF 解析生成\n"
    js += "// points: 知识点（id, lessonIdx, title, l1, l2, body, jiexi, zhu, highlights）\n"
    js += "// lessons: 课时元数据（idx, title, date, sectionsCount, questionsCount）\n"
    js += "// bank: 课堂练习题（id, q, options, a, e, lessonIdx, pointId）\n"
    js += "window.POLITICS_KP = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"

    out_path = os.path.abspath(OUT)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(js)
    print("输出:", out_path)
    print("课时 %d | 知识点 %d | 练习题 %d | 已匹配 %d | 未匹配 %d" %
          (len(lessons), len(flat_points), len(bank), matched, unmatched))


if __name__ == "__main__":
    main()
