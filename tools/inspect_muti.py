#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""只读检查 muti.js：确认腐败区间、多选答案提取、校验不一致。不改文件。"""
import json, re, io

PATH = "assets/data/muti.js"
with io.open(PATH, encoding="utf-8") as f:
    raw = f.read()
header_end = raw.index("{")
data = json.loads(raw[header_end:].rstrip().rstrip(";"))
chapters = data["chapters"]
print("章节数:", len(chapters))
for i, c in enumerate(chapters):
    print("  [%d] %s : %d 题" % (i, c["name"], len(c["questions"])))

qs = chapters[0]["questions"]
print("\n--- 第1章腐败区间抽查 ---")
for idx in [193, 194, 195, 196, 200, 232]:
    q = qs[idx]
    a = q["a"]
    a_letters = chr(65 + a) if isinstance(a, int) else str(a)
    print("\n#%d a=%r(%s)" % (idx, a, a_letters))
    print("  Q:", (q["q"] or "")[:50])
    print("  E尾部:", (q.get("e") or "")[-120:])

print("\n--- 多选章节答案提取抽查 ---")
ANS_PAT = re.compile(r"(?:故(?:正确答案|本题答案|答案)为|选择|故本题选|本题选)\s*([A-D]{2,4})\s*(?:选项|。|$)")
mc = next(c for c in chapters if c["name"] == "多项选择题")
single = 0
for i, q in enumerate(mc["questions"]):
    m2 = ANS_PAT.search(q.get("e") or "")
    a = q["a"]
    a_letters = chr(65 + a) if isinstance(a, int) else str(a)
    if m2:
        letters = m2.group(1)
        flag = "" if letters == a_letters else "  <<< 将改为 %s" % letters
    else:
        flag = "  ??? 未提取到"
    if isinstance(a, int):
        single += 1
    if m2 or isinstance(a, int):
        print("  mc#%d a=%r(%s)%s | E尾部:%s" % (i, a, a_letters, flag, (q.get("e") or "")[-60:]))
print("  多选章节当前单字母 a 数量:", single)

print("\n--- 全库校验（解析答案 vs 数据 a）---")
ANS_ALL = re.compile(r"(?:故(?:正确答案|本题答案|答案)为|因此，?选择|故本题选|本题选)\s*([A-D]{1,4})")
bad = []
for c in chapters:
    for i, q in enumerate(c["questions"]):
        a = q["a"]
        a_letters = chr(65 + a) if isinstance(a, int) else str(a).upper()
        m3 = ANS_ALL.search(q.get("e") or "")
        if m3 and m3.group(1) != a_letters:
            bad.append((c["name"], i, a_letters, m3.group(1), (q["q"] or "")[:30]))
print("  不一致:", len(bad))
for b in bad[:30]:
    print("    [%s#%d] 数据=%s 解析=%s | %s" % b)
