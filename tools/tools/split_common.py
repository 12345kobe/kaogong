# -*- coding: utf-8 -*-
"""把 assets/data/common_bank.js 拆成按模块分片的小文件（每片 <= ~250KB），
文件名 common_{mod}_{i}.js，供 index.html 按序加载，避免单文件过大。"""
import os, json, re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "assets", "data", "common_bank.js")
OUTDIR = os.path.join(BASE, "assets", "data")
MAX_BYTES = 250000

def load():
    txt = open(SRC, encoding="utf-8").read()
    m = re.search(r"window\.COMMON_BANK\s*=\s*(\{.*\})\s*;?\s*$", txt, re.S)
    return json.loads(m.group(1))

def main():
    bank = load()
    # 清理旧分片，避免残留重复
    for fn in os.listdir(OUTDIR):
        if re.match(r"^common_(geo|law|eco|tech|pol)_\d+\.js$", fn):
            os.remove(os.path.join(OUTDIR, fn))
    files = []
    for mod in ["geo", "law", "eco", "tech", "pol"]:
        items = bank[mod]["items"]
        name = bank[mod]["name"]
        # 按「字节体积」切片（中文约 3 字节/字）
        chunks, cur, cur_bytes = [], [], 0
        for it in items:
            s = json.dumps(it, ensure_ascii=False)
            b = len(s.encode("utf-8"))
            if cur and cur_bytes + b > MAX_BYTES:
                chunks.append(cur); cur, cur_bytes = [], 0
            cur.append(it); cur_bytes += b
        if cur: chunks.append(cur)
        for i, ch in enumerate(chunks, 1):
            fn = f"common_{mod}_{i}.js"
            path = os.path.join(OUTDIR, fn)
            with open(path, "w", encoding="utf-8") as f:
                f.write(f"/* 常识模块：{name}（第 {i}/{len(chunks)} 段） */\n")
                f.write("window.COMMON_BANK = window.COMMON_BANK || {};\n")
                f.write(f'window.COMMON_BANK["{mod}"] = window.COMMON_BANK["{mod}"] || {{name:"{name}", items:[]}};\n')
                # 关键修复：把每个题目作为独立参数 push，避免整段数组被当成单个元素导致双重嵌套
                f.write('window.COMMON_BANK["%s"].items.push(\n' % mod)
                f.write(",\n".join(json.dumps(it, ensure_ascii=False) for it in ch))
                f.write("\n);\n")
            files.append(fn)
            print(f"  {fn}: {len(ch)} 题")
    # 写一份文件清单，供 index.html 更新
    with open(os.path.join(OUTDIR, "_common_chunks.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(files))
    print("分片完成，共", len(files), "个文件")

if __name__ == "__main__":
    main()
