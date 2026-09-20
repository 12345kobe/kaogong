#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, io
PATH = "assets/data/muti.js"
with io.open(PATH, encoding="utf-8") as f:
    raw = f.read()
header_end = raw.index("{")
data = json.loads(raw[header_end:].rstrip().rstrip(";"))
qs = data["chapters"][0]["questions"]
for i in range(211, 217):
    q = qs[i]
    a = q["a"]; al = chr(65+a) if isinstance(a,int) else str(a)
    print("="*70)
    print("#%d a=%s" % (i, al))
    print("Q:", q["q"])
    for oi,o in enumerate(q.get("options") or []):
        print("   %s. %s" % (chr(65+oi), o))
    print("E:", q.get("e") or "")
