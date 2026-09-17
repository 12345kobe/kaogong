# -*- coding: utf-8 -*-
"""解析 5 组常识 PDF（题 + 答案一一对应），导出 assets/data/common_bank.js
每个模块：题目 PDF 提取 题干+选项，答案 PDF 提取 正确答案+解析，按题号对齐。"""
import os, re, json, pymupdf as fitz

BASE = r'C:\Users\28621\Desktop\常识'
OUT = r'C:\Users\28621\Desktop\考公工作台\assets\data\common_bank.js'

MODULES = [
    ("geo", "地理国情", "地理国情330题.pdf", "地理国情330题答案.pdf"),
    ("law", "法律常识", "法律常识515题.pdf", "法律常识515题答案.pdf"),
    ("eco", "经济常识", "经济常识172题.pdf", "经济常识172题答案.pdf"),
    ("tech", "科技常识", "科技常识677题.pdf", "科技常识677题答案.pdf"),
    ("pol", "政治常识", "政治常识155题试题.pdf", "政治常识155题答案.pdf"),
]

NOISE = ["非卖品", "仅供学习交流", "公众号", "时政连连看", "搜集", "连连看", "微信", "群"]

def is_noise(line):
    return any(n in line for n in NOISE)

OPT_RE = re.compile(r"^\s*([A-Ea-e])[\.、．]\s*(.*)$")
NUM_RE = re.compile(r"^(\d+)[\.．、]\s*(.*)$")
# 答案行：以「数字+标点」开头，答案括号【X】可在同行任意位置（最稳健）
ANS_LINE = re.compile(r"^(\d+)\s*[．.、]?\s*(.*)$")
EXP_RE = re.compile(r"解析[:：]\s*(.*)")
# 一行内多个选项标记（如 "A.…B.…C.…D.…" 挤在一行）
OPT_SPLIT = re.compile(r"(?<![A-Za-z0-9])([A-Ea-e])[\.、．]\s*")

def split_opts(text):
    """返回 (前置文本, [(字母,选项文本), ...])；无选项标记时 opts 为空。"""
    parts = OPT_SPLIT.split(text)
    if len(parts) < 3:
        return (text, [])
    pre = parts[0].strip()
    opts = []
    i = 1
    while i < len(parts) - 1:
        opts.append((parts[i], parts[i + 1].strip()))
        i += 2
    return (pre, opts)

def extract_questions(path):
    doc = fitz.open(path)
    text = []
    for p in range(doc.page_count):
        t = doc[p].get_text()
        for ln in t.split("\n"):
            line = ln.strip()
            if not line:
                continue
            if is_noise(line):
                continue
            text.append(line)
    doc.close()

    qs = []
    cur = None
    for line in text:
        mnum = NUM_RE.match(line)
        if mnum:
            if cur:
                qs.append(cur)
            num = int(mnum.group(1))
            rest = mnum.group(2).strip()
            rest = re.sub(r"^(单选题|多选题|判断题|单项选择|多项选择|不定项选择)\s*", "", rest)
            pre, opts = split_opts(rest)
            cur = {"num": num, "q": pre, "opts": [t for _, t in opts]}
            continue
        if cur is None:
            continue
        pre, opts = split_opts(line)
        if opts:
            cur["opts"].extend([t for _, t in opts])
            # 首个出现选项的行，其前置文本并入题干（续行）
            if len(cur["opts"]) == len(opts) and pre:
                cur["q"] = (cur["q"] + pre) if cur["q"] else pre
            continue
        # 无选项标记：选项未开始时并入题干（中文直接拼接，避免"能 力"错位）
        if len(cur["opts"]) == 0:
            cur["q"] = (cur["q"] + line) if cur["q"] else line
    if cur:
        qs.append(cur)
    return qs

def extract_answers(path):
    doc = fitz.open(path)
    raw = []
    for p in range(doc.page_count):
        t = doc[p].get_text()
        for ln in t.split("\n"):
            line = ln.strip()
            if not line or is_noise(line):
                continue
            raw.append(line)
    doc.close()
    # 答案行：以「数字+标点」开头，答案括号【X】可在同行任意位置
    ans = {}
    cur = None
    cur_exp = []
    for line in raw:
        m = ANS_LINE.match(line)
        if m:
            num = int(m.group(1))
            rest = m.group(2)
            ab = re.search(r"【\s*([A-Ea-e]+)\s*】", rest) or re.search(r"【\s*([A-Ea-e]+)\s*】", line)
            if ab:
                ans[num] = {"ans": ab.group(1).upper(), "e": ""}
                cur = num
                after = line[ab.end():].strip()
                cur_exp = [after] if after else []
            else:
                # 仅有题号、同行无括号（多为题干重述），不记为答案
                cur = None
            continue
        if cur is not None:
            me = re.search(r"解析[:：]\s*(.*)", line)
            cur_exp.append(me.group(1).strip() if me else line)
            ans[cur]["e"] = re.sub(r"\s+", "", "".join(cur_exp))
    return ans

def main():
    out = {}
    summary = []
    for prefix, name, qf, af in MODULES:
        qpath = os.path.join(BASE, qf)
        apath = os.path.join(BASE, af)
        qs = extract_questions(qpath)
        anss = extract_answers(apath)
        items = []
        skipped = 0
        multi = 0
        for q in qs:
            a = anss.get(q["num"])
            if not a or not a["ans"]:
                skipped += 1
                continue
            if len(a["ans"]) > 1:
                multi += 1
                continue
            if len(q["opts"]) < 2:
                skipped += 1
                continue
            idx = ord(a["ans"][0]) - 65
            if idx < 0 or idx >= len(q["opts"]):
                skipped += 1
                continue
            stem = q["q"].strip()
            if not stem:  # 题干为空（PDF 未解析出题干）直接跳过，避免空白怪题
                skipped += 1
                continue
            items.append({
                "id": f"{prefix}-{q['num']}",
                "q": q["q"].strip(),
                "options": q["opts"],
                "a": idx,
                "e": a["e"],
                "tag": name,
            })
        out[prefix] = {"name": name, "items": items}
        summary.append((name, len(items), skipped, multi, len(qs)))
    # 写 JS
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* 常识判断分模块题库（5 模块，由桌面《常识》PDF 解析生成） */\n")
        f.write("window.COMMON_BANK = ")
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("已生成:", OUT)
    total = 0
    for name, n, sk, mu, raw in summary:
        total += n
        print(f"  {name}: 成功 {n} 题（源 {raw} 题，跳过 {sk}，多选 {mu}）")
    print("  合计:", total, "题")

if __name__ == "__main__":
    main()
