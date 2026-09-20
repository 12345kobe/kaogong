#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, re, io
PATH = "assets/data/muti.js"
with io.open(PATH, encoding="utf-8") as f:
    raw = f.read()
header_end = raw.index("{")
data = json.loads(raw[header_end:].rstrip().rstrip(";"))
mc = next(c for c in data["chapters"] if c["name"]=="多项选择题")
ANS_PAT = re.compile(r"(?:故(?:正确答案|本题答案|答案)为|选择|故本题选|本题选)\s*([A-D]{2,4})\s*(?:选项|。|$)")
for i,q in enumerate(mc["questions"]):
    m = ANS_PAT.search(q.get("e") or "")
    if not m:
        print("="*60)
        print("mc#%d a=%r" % (i, q["a"]))
        print("Q:", q["q"])
        print("E:", q.get("e") or "")
