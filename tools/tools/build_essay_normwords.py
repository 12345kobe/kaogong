# -*- coding: utf-8 -*-
"""重新解析《申论各领域规范词》—— 用 PyMuPDF 表格检测（find_tables）替代长度启发式。

背景：旧版用「长短行交替」启发式判断哪个是规范词汇、哪个是应用场景，
      遇到场景跨 PDF 折行时就会错位（例如把「化技术解决日常工作」当成规范词汇）。
      该 PDF 实为两列表格（左=规范词汇 x≈99，右=应用场景 x≈196），
      直接用 find_tables().extract() 可精确取到合并后的单元格文本。
"""
import fitz
import re
import json
import os

SRC = r"C:/Users/28621/Desktop/常识/申论各领域规范词 (1).pdf"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "assets", "data", "essay_normwords.js")

SEC_RE = re.compile(r"^([一二三四五六七八九十]+)、\s*(.+)$")
HEAD_TERMS = {"规范词汇", "规范词"}
HEAD_SCENES = {"应用场景", "适用场景", "使用场景"}


def norm(s):
    """去掉单元格内换行与多余空白（表格内换行是 PDF 折行，不是真实分段）"""
    return re.sub(r"\s+", "", (s or "").strip())


def main():
    doc = fitz.open(SRC)
    sections = []          # [{name, items:[]}]
    order = []
    cur_sec = None
    stats = {"rows": 0, "skipped_header": 0, "skipped_empty": 0}

    def ensure(name):
        nonlocal cur_sec
        if name not in order:
            order.append(name)
            sections.append({"section": name, "items": []})
        cur_sec = sections[order.index(name)]

    for pno in range(doc.page_count):
        page = doc[pno]
        # ---- 1) 收集本页「板块标题」(带 y) ----
        heads = []
        for blk in page.get_text("dict").get("blocks", []):
            for ln in blk.get("lines", []):
                txt = "".join(sp.get("text", "") for sp in ln.get("spans", [])).strip()
                if not txt:
                    continue
                m = SEC_RE.match(txt)
                if m:
                    heads.append((round(ln["bbox"][1], 1), m.group(2).strip()))

        # ---- 2) 收集本页「表格行」(带 y) ----
        rows = []
        for tab in page.find_tables().tables:
            for r in tab.rows:
                y = round(r.bbox[1], 1) if getattr(r, "bbox", None) else 0
                cells = [norm(c) for c in (tab.extract() and [])]  # 占位，下面用 index 对齐
                rows.append((y, r, tab))

        # 用 extract() 一次性拿文本，按行索引对齐 bbox
        row_texts = []
        for tab in page.find_tables().tables:
            data = tab.extract()
            for i, r in enumerate(tab.rows):
                y = round(r.bbox[1], 1)
                cells = [norm(c) for c in (data[i] if i < len(data) else [])]
                row_texts.append((y, cells))

        # ---- 3) 标题 + 行 按 y 排序，顺序归属 ----
        events = [(y, 0, name) for y, name in heads] + [(y, 1, cells) for y, cells in row_texts]
        events.sort(key=lambda e: (e[0], e[1]))

        for y, kind, payload in events:
            if kind == 0:                       # 板块标题
                ensure(payload)
                continue
            cells = payload
            if len(cells) < 2:
                continue
            term, scene = cells[0], cells[1]
            stats["rows"] += 1
            if term in HEAD_TERMS or scene in HEAD_SCENES:
                stats["skipped_header"] += 1
                continue
            if not term or not scene:
                stats["skipped_empty"] += 1
                continue
            if cur_sec is None:
                continue
            cur_sec["items"].append({"term": term, "scene": scene})

    doc.close()

    # ---- 4) 去重 + 编号 ----
    for si, sec in enumerate(sections):
        seen, uniq = set(), []
        for it in sec["items"]:
            key = (it["term"], it["scene"])
            if key in seen:
                continue
            seen.add(key)
            uniq.append(it)
        sec["items"] = [{"id": f"nw-{si:02d}-{i:04d}", "term": it["term"], "scene": it["scene"]}
                        for i, it in enumerate(uniq)]

    total = sum(len(s["items"]) for s in sections)
    body = json.dumps(sections, ensure_ascii=False)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* 申论各领域规范词 · 按板块归类（PDF 表格精确提取） · window.ESSAY_NORMWORDS */\n")
        f.write("window.ESSAY_NORMWORDS = " + body + ";\n")

    print(f"板块数: {len(sections)}  总条目: {total}")
    for s in sections:
        print(f"  {s['section']}: {len(s['items'])}")
    print("统计:", stats)

    # ---- 5) 质量自检：term 不应像句子片段 ----
    bad = []
    for s in sections:
        for it in s["items"]:
            t = it["term"]
            if len(t) > 16 or "，" in t or "。" in t or t.endswith(("了", "的", "和", "与")):
                bad.append((s["section"], t, it["scene"][:28]))
    if bad:
        print(f"\n⚠ 可疑 term {len(bad)} 条：")
        for secname, t, sc in bad[:20]:
            print(f"   [{secname}] {t!r} | {sc}")
    else:
        print("\n✅ 质量自检通过：无异常 term")


if __name__ == "__main__":
    main()
