#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
修复 assets/data/muti.js 政治理论题库：

1. 第1章(政Z理论必刷题集) 腐败区间：
   - 解析器把下一题的解析错贴到上一题，导致"每题挂的是下一题的解析/答案"。
   - 实测指纹确认：对 i in 195..232，第 i 题的正确 (e,a) = 上一题存储的 (e,a)（即 S[i-1]）。
   - q[194] 自身解析正确（创新，答案A），但尾部粘连了 q[195] 的解析（共享发展）作为垃圾，需截断。
   - q[195] 的正确 (e,a) = q[194] 尾部的垃圾（共享发展，答案C）。
   - 因此：先对整个 questions 拍快照 old（在任何修改之前），再用 old[i-1] 回填 196..232。
     （早期草稿的 bug：old 在改完 194/195 之后才拍，导致回填错位。）

2. 「多项选择题」章节：55 题 a 全是单字母，但解析写明多字母答案 → 从解析提取多字母写回 a。
   扩展至 A-E；对正则抓不到的题用人工判定覆盖（mc#37 为单答选非题，保持 A 不变）。

3. 全库校验：解析末尾声明答案 vs 数据 a，输出不一致清单（应为 0）。
"""
import json, re, io

PATH = "assets/data/muti.js"
with io.open(PATH, encoding="utf-8") as f:
    raw = f.read()
header_end = raw.index("{")
prefix = raw[:header_end]
data = json.loads(raw[header_end:].rstrip().rstrip(";"))

chapters = data["chapters"]
ch0 = chapters[0]
qs = ch0["questions"]
assert len(qs) == 233, len(qs)

# ===== 1. 第1章腐败修复（先拍快照）=====
old = [dict(q) for q in qs]   # 必须在任何修改前

# 1a. q[194] 截断粘连垃圾（保留到 "故正确答案为A。"）
e194 = qs[194]["e"]
cut = e194.find("故正确答案为A。")
assert cut > 0, "q[194] 未找到截断点"
qs[194]["e"] = e194[: cut + len("故正确答案为A。")]

# 1b. q[195] 重建（来自 q[194] 垃圾 = 共享发展，答案C）
qs[195]["a"] = 2
qs[195]["e"] = ("本题考查中国特色社会主义理论体系。"
    "A 项错误，创新发展注重解决新时代我国发展壮大中的动力问题，创新是引领发展的第一动力，与题干表述不符。"
    "B 项错误，协调发展注重解决新时代我国发展壮大中的不平衡问题，与题干表述不符。"
    "C 项正确，共享发展注重解决新时代我国发展壮大中的社会公平正义问题。坚持共享发展，就是要坚持发展为了人民、"
    "发展依靠人民、发展成果由人民共享。共享理念实质就是坚持以人民为中心的发展思想，体现的是逐步实现共同富裕的要求。"
    "D 项错误，绿色发展注重解决好人与自然和谐共生问题，与题干表述不符。故正确答案为C。")

# 1c. q[196..232] 用快照回填上一题
for i in range(196, 233):
    qs[i]["e"] = old[i - 1]["e"]
    qs[i]["a"] = old[i - 1]["a"]

# ===== 2. 多选章节答案改多字母 =====
ANS_PAT = re.compile(r"(?:故(?:正确答案|本题答案|答案)为|选择|故本题选|本题选)\s*([A-E]{2,5})\s*(?:选项|。|$)")
mc = next(c for c in chapters if c["name"] == "多项选择题")
# 人工判定覆盖（正则抓不到或需显式确认）
MANUAL = {
    24: "ABCDE",  # 5 选项全对
    46: "ABC",    # D 总任务表述错
    47: "ABD", 48: "ABD", 49: "ABCD",
    50: "ABC", 51: "ABC", 52: "ACD",
    53: "ABD", 54: "ABCD",
    # 37 为单答选非题，保持 A 不变，不在此表
}
fixed_multi = 0
for i, q in enumerate(mc["questions"]):
    cur = q["a"]
    cur_letters = chr(65 + cur) if isinstance(cur, int) else str(cur).upper()
    if i in MANUAL:
        if MANUAL[i] != cur_letters:
            q["a"] = MANUAL[i]
            fixed_multi += 1
        continue
    m2 = ANS_PAT.search(q.get("e") or "")
    if m2:
        letters = m2.group(1)
        if letters != cur_letters:
            q["a"] = letters
            fixed_multi += 1

# ===== 3. 全库校验 =====
ANS_ALL = re.compile(r"(?:故(?:正确答案|本题答案|答案)为|因此，?选择|故本题选|本题选)\s*([A-E]{1,5})")
bad = []
for c in chapters:
    for i, q in enumerate(c["questions"]):
        a = q["a"]
        a_letters = chr(65 + a) if isinstance(a, int) else str(a).upper()
        m3 = ANS_ALL.search(q.get("e") or "")
        if m3 and m3.group(1) != a_letters:
            bad.append((c["name"], i, a_letters, m3.group(1), (q["q"] or "")[:30]))

data["updatedAt"] = "2026-09-18"
out = prefix + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
with io.open(PATH, "w", encoding="utf-8") as f:
    f.write(out)

print("多选章节答案修正:", fixed_multi, "题")
print("校验：解析答案与数据不一致:", len(bad), "条")
for b in bad[:40]:
    print("  [%s#%d] 数据=%s 解析=%s | %s" % b)
