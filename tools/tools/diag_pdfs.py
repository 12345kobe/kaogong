import fitz, os, re

BASE = "C:/Users/28621/Desktop/常识"

def dump(path, max_pages=3, find=None):
    print("="*70)
    print("FILE:", os.path.basename(path))
    doc = fitz.open(path)
    print("pages:", doc.page_count)
    full = []
    for p in range(doc.page_count):
        full.append(doc[p].get_text())
    text = "\n".join(full)
    if find:
        for kw in find:
            idx = text.find(kw)
            print(f"  关键词 {kw!r} 首次位置(字符):", idx)
            if idx >= 0:
                print("   上下文:\n", text[idx:idx+400])
    print("--- 前", max_pages, "页文本抽样 ---")
    for p in range(min(max_pages, doc.page_count)):
        print(f"[page {p}]")
        print(doc[p].get_text()[:600])
    doc.close()

dump(os.path.join(BASE, "全新【公考状元笔记】第六讲 常识判断篇  1.pdf"),
     find=["第四部分", "常用知识点", "第一部分", "一、", "（四）", "四、"])

print("\n\n")
dump(os.path.join(BASE, "申论常用名言1000句（更新版） .pdf"),
     find=["中国精神", "经济发展", "篇", "一、", "主题"])

print("\n\n")
dump(os.path.join(BASE, "申论各领域规范词 (1).pdf"),
     find=["应用场景", "规范词", "一、", "板块", "第一篇", "第一讲"])
