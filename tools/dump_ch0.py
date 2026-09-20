#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""dump 第1章 q[188..210] 的 题/选项/a/完整解析，用于人工核对腐败区间。只读。"""
import json, io

PATH = "assets/data/muti.js"
with io.open(PATH, encoding="utf-8") as f:
    raw = f.read()
header_end = raw.index("{")
data = json.loads(raw[header_end:].rstrip().rstrip(";"))
qs = data["chapters"][0]["questions"]

for i in range(188, 211):
    q = qs[i]
    a = q["a"]
    a_letters = chr(65 + a) if isinstance(a, int) else str(a)
    print("="*80)
    print("#%d  a=%s(%s)" % (i, a_letters, a))
    print("Q:", q["q"])
    opts = q.get("options") or []
    for oi, o in enumerate(opts):
        print("   %s. %s" % (chr(65+oi), o))
    print("E:", q.get("e") or "")
