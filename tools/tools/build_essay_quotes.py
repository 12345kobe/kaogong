# -*- coding: utf-8 -*-
# build_essay_quotes.py — 解析《申论常用名言1000句》为 window.ESSAY_QUOTES_THEMED
# 结构：一、XXX篇（主题）→ （一）子主题（忽略）→ 1.领导讲话/2.俗语训言/...（类别，忽略）
#        → （1）名言——作者  （叶子名言，含 —— 分隔作者）
import os, re, json, fitz

SRC = r"C:/Users/28621/Desktop/常识/申论常用名言1000句（更新版） .pdf"
OUT = "assets/data/essay_quotes.js"

doc = fitz.open(SRC)
all_lines = []
for p in doc:
    for line in p.get_text().split("\n"):
        all_lines.append(line)
doc.close()

def is_pagenum(s):
    return bool(re.fullmatch(r"\d{1,4}", s.strip()))

# 结构标记
THEME_RE = re.compile(r"^([一二三四五六七八九十]+、)\s*(.+)$")   # 一、中国精神篇 / 二、经济发展篇 ...
SUB_RE   = re.compile(r"^（[一二三四五六七八九十]+）")          # （一）科学家精神
NUM_RE   = re.compile(r"^（?\d+[)）、．.\u4e00-\u9fff]")         # （1）或 1. 开头的结构行
CAT_RE   = re.compile(r"^\d+[\.、]")                          # 1.领导讲话

theme = None
buffer = ""
themed = {}   # theme -> [quote_str...]
order = []    # 主题出现顺序

def flush():
    global buffer
    s = buffer.strip()
    if s and "——" in s:
        themed.setdefault(theme, []).append(s)
    buffer = ""

for raw in all_lines:
    line = raw.strip()
    if not line:
        flush(); continue
    if is_pagenum(line):
        if buffer:
            buffer += line
        continue
    m = THEME_RE.match(line)
    if m:
        # 仅取以「篇」结尾的主题（一、中国精神篇 / 二、经济发展篇 ...）
        nm = re.match(r"^(.+?篇)", m.group(2))
        if nm:
            theme = nm.group(1)
            if theme not in themed: themed[theme] = []
            if theme not in order: order.append(theme)
            flush(); continue
        else:
            continue
    if SUB_RE.match(line):
        flush(); continue
    if NUM_RE.match(line) or CAT_RE.match(line):
        flush(); buffer = line; continue
    # 续行
    buffer = (buffer + line) if buffer else line

flush()

# 拆分 名言——作者，去重，赋稳定 id
result = {}
for ti, th in enumerate(order):
    items = []
    seen = set()
    for li, q in enumerate(themed.get(th, [])):
        q = re.sub(r"\s+", "", q)
        if "——" in q:
            t, author = q.split("——", 1)
        else:
            t, author = q, ""
        t = t.strip("（(）)0123456789.、").strip()
        author = author.strip()
        if not t: continue
        key = (t, author)
        if key in seen: continue
        seen.add(key)
        items.append({"id": f"q-{ti:02d}-{li:04d}", "t": t, "author": author})
    result[th] = items

# 输出
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write("/* 申论常用名言1000句 · 按主题（一、XXX篇）归类 · window.ESSAY_QUOTES_THEMED */\n")
    f.write("window.ESSAY_QUOTES_THEMED = ")
    json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

print("主题数:", len(order))
for th in order:
    print(f"  {th}: {len(result[th])} 句")
print("总句数:", sum(len(v) for v in result.values()))
