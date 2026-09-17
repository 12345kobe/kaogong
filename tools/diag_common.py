# -*- coding: utf-8 -*-
import os, sys, re
sys.path.insert(0, os.path.dirname(__file__))
import build_common as bc

total_ok = 0
for prefix, name, qf, af in bc.MODULES:
    qpath = os.path.join(bc.BASE, qf)
    apath = os.path.join(bc.BASE, af)
    qs = bc.extract_questions(qpath)
    anss = bc.extract_answers(apath)
    r = {"no_answer":0, "lt2opts":0, "multi":0, "idx_oob":0, "ok":0, "no_letter":0}
    multi_examples = []
    for q in qs:
        a = anss.get(q["num"])
        if not a or not a["ans"]:
            r["no_answer"] += 1; continue
        if len(a["ans"]) > 1:
            r["multi"] += 1
            if len(multi_examples) < 3: multi_examples.append((q["num"], a["ans"], len(q["opts"])))
            continue
        if len(q["opts"]) < 2:
            r["lt2opts"] += 1; continue
        letters = re.findall(r"[A-E]", a["ans"])
        if not letters:
            r["no_letter"] += 1; continue
        idx = ord(letters[0]) - 65
        if idx >= len(q["opts"]):
            r["idx_oob"] += 1; continue
        r["ok"] += 1
    total_ok += r["ok"]
    print(f"{name}: 源 {len(qs)} -> ok {r['ok']} | 无答案 {r['no_answer']} | 选项<2 {r['lt2opts']} | 多字母(多选) {r['multi']} | 下标越界 {r['idx_oob']} | 无字母 {r['no_letter']}")
    if multi_examples:
        print(f"    多选样例: {multi_examples}")
print("合计 ok:", total_ok)
