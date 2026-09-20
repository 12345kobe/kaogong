#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, io
PATH = "assets/data/muti.js"
with io.open(PATH, encoding="utf-8") as f:
    raw = f.read()
header_end = raw.index("{")
data = json.loads(raw[header_end:].rstrip().rstrip(";"))
qs = data["chapters"][0]["questions"]
print("总数:", len(qs))
for i in range(225, 233):
    q = qs[i]
    a = q["a"]; a_letters = chr(65+a) if isinstance(a,int) else str(a)
    print("="*70)
    print("#%d a=%s" % (i, a_letters))
    print("Q:", q["q"])
    print("E尾:", (q.get("e") or "")[-90:])
