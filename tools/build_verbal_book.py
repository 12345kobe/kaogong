#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
提取《【苏金朋】成语与实词辨析1500词》PDF 的纯文字（不截图），
按「组别 → 词条」组织为结构化数据，生成 assets/data/verbal_book.js（window.VERBAL_BOOK）。

排版忠实于原书：
  - 组头：☆N.组名（☆ 表示重要度，N 为组号）
  - 词条：[词]：释义 ……   例句：……

用法：
  python tools/build_verbal_book.py
生成后刷新网页即可在「言语理解 → 按组别浏览（翻书式）」查看。
"""
import os, re, sys

try:
    import pymupdf as fitz
except Exception:
    import fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(ROOT, "【苏金朋】成语与实词辨析1500词（无水印版）-自行打印.pdf")
OUT = os.path.join(ROOT, "assets", "data", "verbal_book.js")

# 组头：行首若干 ☆，后接数字 + 点 + 组名（组名通常为该组首个词）
HEAD_RE = re.compile(r"^☆*\s*(\d+)\s*[\.、]\s*(.+?)\s*$")
# 词条释义行：[词]：……
DEF_RE = re.compile(r"^\[(.+?)\]\s*[:：]\s*(.*)$")
# 例句行
EX_RE = re.compile(r"^例句\s*[:：]\s*(.*)$")
# 纯页码 / 装饰行
PAGE_RE = re.compile(r"^[\d·．.\s]+$")


def is_toc_line(line):
    """目录行：含大量中间点 ·，或以数字结尾（页码）。"""
    if "·" in line or "•" in line:
        return True
    s = line.rstrip()
    if s and re.fullmatch(r"\d{1,3}", s):
        return True
    return False


def parse():
    doc = fitz.open(PDF)
    groups = []          # 当前已确认的组
    cur = None           # 当前组 {num,name,stars,words:[]}
    cur_word = None      # 当前词条 {word,def,example}
    mode = "wordlist"    # wordlist | def

    def flush_word():
        nonlocal cur_word
        if cur and cur_word and cur_word.get("word"):
            cur["words"].append(cur_word)
        cur_word = None

    def new_group(num, name, stars):
        nonlocal cur, cur_word, mode
        flush_word()
        if cur and cur["words"]:
            groups.append(cur)
        cur = {"num": num, "name": name, "stars": stars, "words": []}
        cur_word = None
        mode = "wordlist"

    for pno in range(doc.page_count):
        text = doc[pno].get_text("text")
        for raw in text.splitlines():
            line = raw.rstrip()
            if not line.strip():
                continue
            if PAGE_RE.match(line):
                # 页码或纯装饰行
                continue
            m = HEAD_RE.match(line)
            if m:
                if is_toc_line(line):
                    # 目录行：跳过（其后是更多目录或页码，而非词条）
                    continue
                num = m.group(1)
                name = m.group(2).strip()
                stars = line.count("☆")
                new_group(num, name, stars)
                continue
            if cur is None:
                # 尚未遇到任何内容组头，跳过（前文/目录）
                continue
            dm = DEF_RE.match(line)
            if dm:
                flush_word()
                cur_word = {"word": dm.group(1).strip(), "def": dm.group(2).strip(), "example": ""}
                mode = "def"
                continue
            em = EX_RE.match(line)
            if em and cur_word is not None and mode == "def":
                cur_word["example"] = (cur_word["example"] + " " + em.group(1).strip()).strip()
                continue
            # 续行
            if cur_word is not None and mode == "def":
                if cur_word["example"]:
                    cur_word["example"] = (cur_word["example"] + " " + line.strip()).strip()
                else:
                    cur_word["def"] = (cur_word["def"] + " " + line.strip()).strip()
            elif mode == "wordlist":
                # 组头之后的词条名列表（每行一个词）
                w = line.strip()
                if w and not w.startswith("☆") and len(w) <= 12:
                    # 仅作为组名提示，词条释义会由 [词] 行补全，这里不单独建词条
                    pass
    flush_word()
    if cur and cur["words"]:
        groups.append(cur)
    return groups


def main():
    groups = parse()
    total_words = sum(len(g["words"]) for g in groups)
    # 输出：window.VERBAL_BOOK
    out = ["/* 自动生成：tools/build_verbal_book.py 从 PDF 提取文字（不截图） */",
           "window.VERBAL_BOOK = " + json_dump({
               "title": "成语与实词辨析1500词",
               "groups": groups,
           }) + ";"]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print(f"✅ 已生成 {OUT}")
    print(f"   组别数：{len(groups)} · 词条数：{total_words}")


def json_dump(obj):
    import json
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
