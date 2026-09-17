# -*- coding: utf-8 -*-
"""从《申论及综合写作必备典故赏析汇编.pdf》提取典故，输出 window.ALLUSIONS
修复：
  - 删除每页底部的「第 N 页 共 M 页」页码（有时插在句子中间）与「公众号」水印；
  - PDF 按栏宽折行的「单换行」合并为连续文本，仅保留「空行」作为真实段落分隔，
    避免语义被切碎（不要随便换行，语义完整再断）；
  - 归一化低 9 引号(‚‛)为规范双引号，清理数字与汉字间的 OCR 多余空格。
"""
import re, json
import fitz

SRC = r"C:/Users/28621/xwechat_files/wxid_nbv2rd7682vc12_6706/msg/file/2026-09/申论及综合写作必备典故赏析汇编.pdf"
OUT = r"C:/Users/28621/Desktop/考公工作台/js/allusion-data.js"

PARA = "\x01"  # 段落分隔占位符（无换行，避免被后续处理误删）

# 每页页脚水印/版权声明，常漏进正文末尾
FOOTER = ["公众号", "整理", "时政公考资料站", "时政公考资料", "时政公考资",
          "时政公考", "众号", "号", "资料站", "站"]


def strip_footer(s):
    s = s.strip()
    changed = True
    while changed:
        changed = False
        for w in FOOTER:
            if s.endswith(w):
                s = s[: -len(w)].rstrip(" ）\u3000")
                changed = True
                break
    return s.strip()


def clean_text(s):
    if not s:
        return ""
    # 1) 删除页码「第 N 页 共 M 页」及其前后空白（有时插在句中）
    s = re.sub(r"\s*第\s*\d+\s*页[^\n]{0,4}共\s*\d+\s*页\s*", " ", s)
    s = re.sub(r"\s*第\s*\d+\s*页\s*", " ", s)
    # 2) 删除公众号水印
    s = re.sub(r"\s*公众号\s*", " ", s)
    s = s.replace("\x0c", "")
    # 3) 区分「空行(真实段落)」与「单换行(PDF 折行)」
    s = re.sub(r"\n[ \t]*\n", PARA, s)   # 空行 → 段落分隔
    s = s.replace("\n", "")             # 其余换行(PDF 折行) → 合并
    s = s.replace(PARA, "\n\n")         # 还原段落分隔
    # 4) 引号归一化：低 9 引号 ‚‛ → 规范双引号 “”
    s = s.replace("‚", "\u201c").replace("‛", "\u201d")
    # 5) 清理数字与汉字之间的 OCR 多余空格（如「2020 年」「2 月底」）
    s = re.sub(r"([0-9])\s+([\u4e00-\u9fff])", r"\1\2", s)
    s = re.sub(r"([\u4e00-\u9fff])\s+([0-9])", r"\1\2", s)
    # 6) 压缩多余空格
    s = re.sub(r"[ \t]{2,}", " ", s)
    return s.strip()


def main():
    doc = fitz.open(SRC)
    full = ""
    for p in range(doc.page_count):
        full += doc[p].get_text("text") + "\n"
    doc.close()
    full = clean_text(full)

    items = []
    pat = re.compile(r"(\d+)\.\s*([^【]{2,80}?)\s*【例文】")
    for m in pat.finditer(full):
        n, t = m.group(1), m.group(2).strip()
        s = m.end()
        nxt = pat.search(full, s)
        e = nxt.start() if nxt else len(full)
        body = full[s:e]

        em = re.search(r"【典故】", body)
        if not em:
            continue
        ex_raw = body[:em.start()]
        al_raw = body[em.end():]

        # 释义起点：优先「意思是」，其次「【赏析】」标记
        mean = re.search(r"意思是[，,。]", al_raw)
        if mean:
            allusion = al_raw[:mean.start()]
            analysis = al_raw[mean.start():]
        else:
            sh = re.search(r"【赏析】", al_raw)
            if sh:
                allusion = al_raw[:sh.start()]
                analysis = al_raw[sh.end():]
            else:
                allusion = al_raw
                analysis = ""

        items.append({
            "id": n,
            "title": strip_footer(t),
            "example": strip_footer(ex_raw),
            "allusion": strip_footer(allusion),
            "analysis": strip_footer(analysis),
        })

    print(f"提取典故 {len(items)} 条")
    if items:
        print("样本 #1:\n", json.dumps(items[0], ensure_ascii=False, indent=2))
        print("样本 #2:\n", json.dumps(items[1], ensure_ascii=False, indent=2))

    arr = "[\n"
    for it in items:
        arr += '  { "id": "' + esc(it["id"]) + '",'
        arr += ' "title": "' + esc(it["title"]) + '",'
        arr += ' "example": "' + esc(it["example"]) + '",'
        arr += ' "allusion": "' + esc(it["allusion"]) + '",'
        arr += ' "analysis": "' + esc(it["analysis"]) + '" },\n'
    arr = arr.rstrip().rstrip(",") + "\n"  # 去掉尾逗号，保证严格 JSON 合法
    arr += "]\n"
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// 申论典故：从《申论及综合写作必备典故赏析汇编》提取（" + str(len(items)) + " 条）\n")
        f.write("window.ALLUSIONS = " + arr + ";")
    print("输出:", OUT)


def esc(s):
    return (s.replace("\\", "\\\\").replace('"', '\\"')
             .replace("\n", "\\n").replace("\r", ""))


if __name__ == "__main__":
    main()
