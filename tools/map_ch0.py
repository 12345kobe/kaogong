#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, re, io
PATH = "assets/data/muti.js"
with io.open(PATH, encoding="utf-8") as f:
    raw = f.read()
header_end = raw.index("{")
data = json.loads(raw[header_end:].rstrip().rstrip(";"))
qs = data["chapters"][0]["questions"]

def stated(e):
    if not e: return "?"
    ms = re.findall(r"正确答案为([A-D])", e)
    if ms: return ms[-1]
    ms = re.findall(r"选择([A-D]{1,4})选项", e)
    if ms: return ms[-1]
    return "?"

def fp(e, n=46):
    if not e: return "(空)"
    e2 = re.sub(r"\s+", "", e)
    return e2[:n]

print("idx | a | Q(前38) | S[i].e指纹(前46)+答案 | S[i-1].e答案")
for i in range(194, 233):
    q = qs[i]
    a = q["a"]; al = chr(65+a) if isinstance(a,int) else str(a)
    qh = re.sub(r"\s+","",q["q"])[:38]
    se = fp(q.get("e") or "")
    sa = stated(q.get("e") or "")
    prev = qs[i-1] if i>0 else None
    pa = stated(prev.get("e") or "") if prev else "?"
    mark = "" if sa==al else "  <== 不一致"
    print("%3d | %s | %s | [%s]%s%s | prev答=%s" % (i, al, qh, sa, se, mark, pa))
