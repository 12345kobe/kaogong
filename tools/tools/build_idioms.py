# 解析【四海】高频成语积累700词.pdf -> assets/data/idioms.js
# 按【第N组】分组，提取每个 ✎词 的 成语解释 与 【例】例句。
import fitz, re, json, os

SRC = r"C:\Users\28621\Desktop\【四海】高频成语积累700词.pdf"
OUT = r"C:\Users\28621\Desktop\考公工作台\assets\data\idioms.js"

doc = fitz.open(SRC)

GROUP_RE = re.compile(r"【第[一二三四五六七八九十百零\d]+组】\s*([^（\n]+?)\s*（\s*(\d+)\s*个\s*）")
WORD_RE = re.compile(r"✎\s*([^\n]+)")
SEC_RE = re.compile(r"^\s*(\d+\.\d+|\d+)\s*$|^成语解释$|^真题示例$|^例题|^【第")

words = []
current_group = None
cur_gid = 0
theme = ""

def flush_word(w):
    if w and w.get("word"):
        words.append(w)

cur = None
for pidx in range(doc.page_count):
    lines = doc[pidx].get_text().split("\n")
    # 跳过目录页（不含 ✎ 的页）
    if "✎" not in doc[pidx].get_text():
        continue
    n = len(lines)
    i = 0
    while i < n:
        line = lines[i]
        gm = GROUP_RE.search(line)
        if gm:
            cur_gid += 1
            current_group = f"第{cur_gid}组·{gm.group(1).strip()}"
            theme = ""
            j = i + 1
            while j < n and not lines[j].strip():
                j += 1
            if j < n:
                nxt = lines[j].strip()
                if nxt and "、" not in nxt and not WORD_RE.search(nxt) \
                   and not GROUP_RE.search(nxt) and not SEC_RE.match(nxt) \
                   and "...." not in nxt:
                    theme = nxt
            i = j if j > i else i + 1
            continue

        wm = WORD_RE.search(line)
        if wm:
            flush_word(cur)
            cur = {"word": wm.group(1).strip(), "group": current_group, "theme": theme,
                   "def": "", "examples": []}
            i += 1
            continue

        if cur is not None:
            s = line.strip()
            if not s:
                i += 1
                continue
            if SEC_RE.match(s) and not s.startswith("【例】"):
                flush_word(cur)
                cur = None
                i += 1
                continue
            em = re.match(r"【例】\s*(.*)", s)
            if em:
                cur["_in_ex"] = True
                ex = em.group(1).strip()
                if ex:
                    cur["examples"].append(ex)
            elif cur.get("_in_ex"):
                # 例句换行续行，并入最后一条例句
                if cur["examples"]:
                    cur["examples"][-1] += s
            else:
                # 释义（可能跨行，直接拼接）
                cur["def"] += s
            i += 1
            continue

        i += 1

    flush_word(cur)
    cur = None  # 跨页清空当前词，避免把下一组内容并入本词

# 规整：example = 首条例句（含原词，供挖空）；ex 同 example
clean_words = []
for w in words:
    ex0 = w["examples"][0] if w["examples"] else ""
    w["example"] = ex0
    w["ex"] = ex0
    w["def"] = w["def"].strip()
    if w["word"]:
        clean_words.append(w)

# 统计分组
from collections import Counter, OrderedDict
grp = OrderedDict()
for w in clean_words:
    grp.setdefault(w["group"], 0)
    grp[w["group"]] += 1

print("总词条:", len(clean_words))
print("组数:", len(grp))
print("各组词数（前10）:", list(grp.items())[:10])
small = [(g, c) for g, c in grp.items() if c < 4]
print("少于4词的组:", len(small), small[:10])

js = "// 自动从《【四海】高频成语积累700词》解析生成（按【第N组】分组）\n"
js += "// 字段：word 成语, def 释义, examples 例句数组, example/ex 首条例句, group 组别, theme 组主题\n"
js += "window.IDIOM_DATA = " + json.dumps(clean_words, ensure_ascii=False, indent=1) + ";\n"

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(js)
print("已写出:", OUT, os.path.getsize(OUT), "bytes")
