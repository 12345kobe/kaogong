# -*- coding: utf-8 -*-
import fitz, re
SRC = r"C:/Users/28621/xwechat_files/wxid_nbv2rd7682vc12_6706/msg/file/2026-09/申论及综合写作必备典故赏析汇编.pdf"
doc = fitz.open(SRC)
print("pages:", doc.page_count)
# 找一个含【例文】的页面
for p in range(min(8, doc.page_count)):
    t = doc[p].get_text("text")
    if "【例文】" in t or "例文" in t:
        print("==== PAGE", p, "====")
        print(repr(t[:1200]))
        break
# 统计页码样式
pat = re.compile(r"第\s*\d+\s*页")
cnt = {}
for p in range(doc.page_count):
    t = doc[p].get_text("text")
    for m in pat.finditer(t):
        cnt[m.group()] = cnt.get(m.group(), 0) + 1
print("页码样张:", list(cnt.items())[:20], " 共", len(cnt))
# 看一个 block 结构
for p in range(min(doc.page_count, 3)):
    blks = doc[p].get_text("blocks")
    print("PAGE", p, "blocks:", len(blks))
    if blks:
        print(repr(blks[0][4][:300]))
