"""
build_archive.py — 把百度网盘同步下来的时政PDF/Word文档解析成结构化数据。
用法：
  把网盘目录“月半时政/讲义”同步到本地某个目录后，运行：
  python build_archive.py <本地目录> [输出json/js路径]

输出 assets/data/politics_archive.js（window.ARCHIVE = {...}），前端直接读取。
支持：PDF（pymupdf）、Word（python-docx，可选）。自动按文件名识别月份。
"""
import sys, os, re, json, datetime

def load_text_pdf(path):
    import fitz
    try:
        doc = fitz.open(path)
        return "\n".join(page.get_text() for page in doc)
    except Exception as e:
        return "[PDF解析失败: %s]" % e

def load_text_docx(path):
    try:
        import docx
        d = docx.Document(path)
        return "\n".join(p.text for p in d.paragraphs)
    except ImportError:
        return None  # 未安装 python-docx

def load_text(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        return load_text_pdf(path)
    if ext in (".docx", ".doc"):
        t = load_text_docx(path)
        if t is None:
            raise RuntimeError("缺少 python-docx，请先用 venv 安装：pip install python-docx")
        return t
    return None

def guess_month(filename):
    # 从文件名提取月份，如 01月 / 1月 / 2026.01 / 2026-01
    m = re.search(r"(\d{1,2})\s*月", filename)
    if m:
        return "%04d-%02d" % (datetime.date.today().year, int(m.group(1)))
    m = re.search(r"(\d{4})[-\.](\d{1,2})", filename)
    if m:
        return "%s-%02d" % (m.group(1), int(m.group(2)))
    return ""

def extract_questions(text):
    """尽力从文本中提取选择题：题干 + A/B/C/D + 答案。返回 list[{q,options,answer,analysis}]。"""
    qs = []
    # 常见题型：题干(含？或。) 后接 A./B./C./D. 选项，末尾有 答案/参考答案
    blocks = re.split(r"\n{1,}", text)
    i = 0
    joined = text
    # 先把全角字母替换为半角便于匹配
    norm = joined.replace("．", ".").replace("。", ".")
    # 用正则抓取 “题号 + 题干 + 选项 + 答案”
    pat = re.compile(
        r"(?:^|\n)\s*(?:\(?([0-9]+)\)?[\.\、]?\s*)([^A-D]\S[^A-D]{2,}??\??)\s*"
        r"(?:[A-D][\.、]\s*([^\n]+)\s*)+"
        r"(?:参考答案?[:：]\s*([A-D]))",
        re.S)
    for mm in pat.finditer(norm):
        q = mm.group(2).strip()
        opts_raw = re.findall(r"([A-D])\s*[\.\、]\s*([^\n]+)", mm.group(0))
        options = [o for _, o in opts_raw]
        ans = mm.group(3)
        if len(options) >= 2:
            qs.append({
                "q": q,
                "options": options,
                "answer": "ABCD".index(ans) if ans in "ABCD" else 0,
                "analysis": ""
            })
    return qs

def build(src_dir, out_path):
    docs = []
    files = []
    for name in sorted(os.listdir(src_dir)):
        p = os.path.join(src_dir, name)
        if not os.path.isfile(p):
            continue
        if os.path.splitext(name)[1].lower() not in (".pdf", ".docx", ".doc"):
            continue
        files.append((name, p))
    for name, p in files:
        try:
            raw = load_text(p)
        except Exception as e:
            print("跳过 %s: %s" % (name, e))
            continue
        if not raw:
            continue
        docs.append({
            "id": guess_month(name) or name,
            "title": os.path.splitext(name)[0],
            "file": name,
            "month": guess_month(name),
            "text": re.sub(r"\n{3,}", "\n", raw).strip(),
            "questions": extract_questions(raw)
        })
    docs.sort(key=lambda d: d["month"] or "9999")
    data = {
        "updatedAt": datetime.date.today().isoformat(),
        "source": "百度网盘 / 25-27公考大合集/【3】全年时政类/2026年全年时政/【003】2026年小黑全年时政/月半时政/讲义",
        "docs": docs
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("window.ARCHIVE = ")
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write(";")
    print("已生成 %s，共 %d 份文档，识别题目 %d 道" % (
        out_path, len(docs), sum(len(d["questions"]) for d in docs)))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python build_archive.py <本地同步目录> [输出文件]")
        sys.exit(1)
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(__file__), "..", "assets", "data", "politics_archive.js")
    build(src, out)
