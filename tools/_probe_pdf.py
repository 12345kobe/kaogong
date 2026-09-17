# -*- coding: utf-8 -*-
"""探查三个 PDF 的结构：页数、目录、前几页文本，为提取器做准备"""
import sys, io, os
import fitz

FILES = {
    "analogy": r"C:/Users/28621/xwechat_files/wxid_nbv2rd7682vc12_6706/msg/file/2026-09/类比常识积累手册.pdf",
    "relation": r"C:/Users/28621/xwechat_files/wxid_nbv2rd7682vc12_6706/msg/file/2026-09/类比推理必对应关系.pdf",
    "allusion": r"C:/Users/28621/xwechat_files/wxid_nbv2rd7682vc12_6706/msg/file/2026-09/申论及综合写作必备典故赏析汇编.pdf",
}

for key, path in FILES.items():
    print("=" * 70)
    print("FILE:", key, os.path.basename(path))
    if not os.path.exists(path):
        print("  NOT FOUND"); continue
    try:
        doc = fitz.open(path)
    except Exception as e:
        print("  OPEN FAIL", e); continue
    print("  pages:", doc.page_count)
    toc = doc.get_toc()
    print("  toc entries:", len(toc))
    for t in toc[:40]:
        print("    ", t)
    # 前 3 页文本
    for pno in range(min(3, doc.page_count)):
        page = doc[pno]
        txt = page.get_text("text")
        print("  --- page", pno, "len", len(txt), "---")
        print("\n".join(txt.split("\n")[:25]))
    doc.close()
