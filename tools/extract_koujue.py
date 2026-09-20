# -*- coding: utf-8 -*-
import pymupdf, os, json, re
PDF = r"C:/Users/28621/xwechat_files/wxid_nbv2rd7682vc12_6706/msg/file/2026-09/11.0版常识88条速记口诀.pdf"
doc = pymupdf.open(PDF)
print("pages:", doc.page_count)
out = []
for i, page in enumerate(doc):
    t = page.get_text("text")
    out.append(t)
txt = "\n".join(out)
open("tools/koujue_raw.txt", "w", encoding="utf-8").write(txt)
print("chars:", len(txt))
print("=== first 3000 chars ===")
print(txt[:3000])
