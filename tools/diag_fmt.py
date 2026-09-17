# -*- coding: utf-8 -*-
import os, sys, re
sys.path.insert(0, os.path.dirname(__file__))
import build_common as bc

def dump_answers(prefix, name, af, nums):
    apath = os.path.join(bc.BASE, af)
    doc = bc.fitz.open(apath)
    text = []
    for p in range(doc.page_count):
        for ln in doc[p].get_text().split("\n"):
            ln = ln.strip()
            if ln and not bc.is_noise(ln):
                text.append(ln)
    doc.close()
    print(f"\n===== {name} 答案 PDF 前 40 行 =====")
    for ln in text[:40]:
        print(repr(ln))

# 看答案PDF的格式（前若干行），以及越界题号的答案块原文
for prefix, name, qf, af in bc.MODULES:
    dump_answers(prefix, name, af, [])
