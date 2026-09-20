#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""检查第1章：每题 e 末尾声明答案 vs a，列出不一致，辅助定位腐败区间。只读。"""
import json, re, io

PATH = "assets/data/muti.js"
with io.open(PATH, encoding="utf-8") as f:
    raw = f.read()
header_end = raw.index("{")
data = json.loads(raw[header_end:].rstrip().rstrip(";"))
qs = data["chapters"][0]["questions"]

# 取 e 末尾最后一个 "正确答案为X" 或 "选择X选项"
def stated(e):
    if not e:
        return None
    # 找最后一个 正确答案为 / 选择..选项
    ms = re.findall(r"正确答案为([A-D])", e)
    if ms:
        return ms[-1]
    ms = re.findall(r"选择([A-D]{1,4})选项", e)
    if ms:
        return ms[-1]
    return None

print("第1章共 %d 题" % len(qs))
print("=== 不一致题（e声明答案 != 数据a）===")
mism = []
for i, q in enumerate(qs):
    a = q["a"]
    a_letters = chr(65 + a) if isinstance(a, int) else str(a).upper()
    st = stated(q.get("e") or "")
    if st is not None and st != a_letters:
        mism.append(i)
        print("  #%d  数据a=%s  e声明=%s | Q:%s" % (i, a_letters, st, (q["q"] or "")[:46]))
print("不一致总数:", len(mism))
if mism:
    print("区间:", mism[0], "..", mism[-1])
