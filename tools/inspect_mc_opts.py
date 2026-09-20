#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, io
PATH = "assets/data/muti.js"
with io.open(PATH, encoding="utf-8") as f:
    raw = f.read()
header_end = raw.index("{")
data = json.loads(raw[header_end:].rstrip().rstrip(";"))
mc = next(c for c in data["chapters"] if c["name"]=="多项选择题")
for i in [24,37,46,47,48,49,50,51,52,53,54]:
    q = mc["questions"][i]
    print("="*60)
    print("mc#%d" % i)
    print("Q:", q["q"])
    for oi,o in enumerate(q.get("options") or []):
        print("   %s. %s" % (chr(65+oi), o))
