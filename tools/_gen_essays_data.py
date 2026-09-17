"""
从本地 PDF 提取申论范文，标记层兼顾三种来源：
  1. PDF 矢量绘图层：红色细线（直线/波浪）= 画横线；纯黄填充矩形 = 高亮
  2. 文本颜色层：蓝字 = 好词好句（保留旧规则）；红字 = 段落小标题
  3. 标题用 size>=21 检测；分页以「人民日报优秀范文」为分页头标记。
使用 rawdict 拿每个字符的精确 bbox，再逐字匹配高亮/画线矩形。
输出 js/essays-data.js：window.MODEL_ESSAYS = [{title, html, phrases}, ...]
"""
import fitz, re, json

P = r"C:/Users/28621/xwechat_files/wxid_nbv2rd7682vc12_6706/msg/file/2026-09/2025袁东国考申论范文100篇.pdf"
doc = fitz.open(P)

RED = (1.0, 0.0, 0.0)

def cat(c):
    r=(c>>16)&255; g=(c>>8)&255; b=c&255
    if r>200 and g<70 and b<70: return "RED"
    if b>150 and r<90 and g<170: return "BLUE"
    return "BLACK"

def is_yellow(c):
    if not c: return False
    r, g, b = c
    return r > 0.85 and g > 0.85 and b < 0.4

def esc(s):
    return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")

essays = []
cur = None
para_buf = []       # 当前正在累积的段落（跨行合并用）
last_line_y = None  # 上一行的 y，用于判断段距（跨页续写时由 continuing 逻辑跳过）
prev_line_end = None  # 上一篇正文的上一行文本（判断红色续行 vs 独立小标题）

def build_phrases(chars_list):
    """把整篇正文按完整句子（。！？）切分，仅保留含有标记字符（黄底/红线下划线/蓝字）的完整句。
    跨行自动合并；末尾未闭合的半句直接丢弃，避免出现「用生命」这类断句碎片。"""
    buf = []
    has_mark = False
    phrases = []
    for ch, mk in chars_list:
        buf.append(ch)
        if mk:
            has_mark = True
        if ch in "。！？":
            seg = "".join(buf).strip()
            if has_mark and len(seg) >= 2:
                phrases.append(seg)
            buf = []
            has_mark = False
    # 末尾残留（无结束标点）= 不完整片段，丢弃
    return phrases

PARA_GAP = 45  # 段距阈值：相邻行 y 差 > 此值视为新段落（行距约 28~34，段距约 60~88）
INDENT_TH = 16  # 首行缩进阈值：行首 x0 减去页面正文基准 x0 > 此值视为段首缩进（必为新段落）
                # 中文 size≈18 时字符宽≈18，2字符缩进≈36，故阈值 16 已能可靠识别"空两格"

def emit_paragraph(para_buf, cur):
    """把一个真实段落（已合并跨行）渲染为一个 <p> 或红色小标题 <div>。"""
    all_chars = [c for ln in para_buf for c in ln]
    if not all_chars:
        return
    # 分组：相邻同 (color, hl, ul) 合并
    groups = []
    cur_g = None
    for c in all_chars:
        sig = (c["color"], c["hl"], c["ul"])
        if cur_g and cur_g["sig"] == sig:
            cur_g["chars"].append(c)
        else:
            cur_g = {"sig": sig, "chars": [c]}
            groups.append(cur_g)
    inner = ""
    QUOTE_CH = set('\'"“”‘’：:')
    st = 0
    while st < len(all_chars) and all_chars[st]["c"] in QUOTE_CH:
        st += 1
    # 小标题可能是红字 OR 黑字+红色下划线，二者都算「标记」
    def marked(c):
        return c["color"] == "RED" or c["ul"]
    first_marked = (st < len(all_chars)) and marked(all_chars[st])
    lead_marked_len = 0
    for c in all_chars[st:]:
        if marked(c):
            lead_marked_len += 1
        else:
            break
    seen_red = False
    for g in groups:
        color, hl, ul = g["sig"]
        txt = "".join(c["c"] for c in g["chars"])
        if not txt.strip():
            continue
        e = esc(txt)
        if hl:
            e = f'<mark class="essay-hl">{e}</mark>'
        if ul:
            e = f'<u class="essay-line">{e}</u>'
        if color == "BLUE":
            e = f'<mark>{e}</mark>'
        elif color == "RED":
            e = f'<b class="essay-red">{e}</b>'
            seen_red = True
        else:
            seen_red = True
        inner += e
    full_para = "".join(c["c"] for c in all_chars).strip()
    is_sec = (first_marked and lead_marked_len >= 3
              and re.search(r"[。！？]$", full_para) and len(full_para) < 30)
    if is_sec:
        cur["html"] += '<div class="essay-sec">' + inner + "</div>\n"
    else:
        cur["html"] += '<p class="essay-p">' + inner + "</p>\n"
    for c in all_chars:
        mk = c["hl"] or c["ul"] or c["color"] == "BLUE"
        cur["_chars"].append((c["c"], mk))

def flush():
    global cur, para_buf, prev_line_end
    if para_buf:
        emit_paragraph(para_buf, cur)
        para_buf = []
    if cur and cur["title"]:
        cur["phrases"] = build_phrases(cur.get("_chars", []))
        essays.append(cur)
    cur = None
    prev_line_end = None  # 新文章：重置上一行跟踪

for pi in range(doc.page_count):
    page = doc[pi]

    # ---- 1. 收集本页的矢量层标记 ----
    highlights = []    # (x0, y0, x1, y1) 黄色高亮
    underlines = []    # (x0, y, x1)       红色横线
    for d in page.get_drawings():
        col = d.get("color")
        fill = d.get("fill")
        r = d["rect"]
        rw, rh = r[2]-r[0], r[3]-r[1]
        if col == RED and rh < 5 and rw > 30:
            underlines.append((r[0], (r[1]+r[3])/2, r[2]))
        elif is_yellow(fill) and rh > 10 and rw > 20:
            highlights.append(r)

    # ---- 2. 用 rawdict 拿每字精确 bbox + 颜色 ----
    d = page.get_text("rawdict")
    page_lines = []
    for blk in d["blocks"]:
        if "lines" not in blk: continue
        for ln in blk["lines"]:
            chars = []
            line_y = ln["bbox"][1]
            for s in ln["spans"]:
                color = cat(s["color"])
                size = s.get("size", 0)
                for ch in s.get("chars", []):
                    cc = ch.get("c", "")
                    if not cc.strip(): continue
                    chars.append({
                        "c": cc,
                        "bbox": ch["bbox"],
                        "color": color,
                        "size": size,
                    })
            if chars:
                page_lines.append((line_y, chars))

    page_lines.sort(key=lambda x: x[0])

    # ---- 2.5 算本页正文基准 x0：取本页所有非空行 x0 的众数（最常见左对齐位置）----
    # 用于判定「首行缩进」—— 段首两字符空格会被识别为 new_para
    from collections import Counter
    left_counter = Counter()
    for (_y, chs) in page_lines:
        if not chs: continue
        left_counter[round(chs[0]["bbox"][0], 1)] += 1
    page_left = left_counter.most_common(1)[0][0] if left_counter else 0

    # ---- 3. 找页头「人民日报优秀范文」并跳过 ----
    mh = next((idx for idx, ln in enumerate(page_lines)
               if "".join(c["c"] for c in ln[1]).startswith("人民日报优秀范文")), None)
    content = page_lines[mh+1:] if mh is not None else page_lines
    if not content: continue

    # ---- 4. 标题：首行 size>=21 视为新文章 ----
    first_size = content[0][1][0]["size"]
    first_txt  = "".join(c["c"] for c in content[0][1]).strip()
    cur_was_open = (cur is not None)
    if first_size >= 21 and not first_txt.startswith("人民日报优秀范文"):
        flush()
        cur = {"title": first_txt, "html": "", "phrases": [], "_chars": []}
        body = content[1:]
        continuing = False
    else:
        body = content
        if cur is None:
            cur = {"title": f"范文{pi+1}", "html": "", "phrases": [], "_chars": []}
        continuing = cur_was_open  # 本页是上一篇跨页续写，首行应接上段

    # ---- 5. 逐行：按段距合并为真实段落，再逐字打标记渲染 ----
    first_line_of_page = True
    for (y, line_chars) in body:
        full = "".join(c["c"] for c in line_chars).strip()
        if re.fullmatch(r"\d{1,3}", full): continue
        if not full: continue

        # 每字：判断高亮/画线
        for c in line_chars:
            cx0, cy0, cx1, cy1 = c["bbox"]
            c["hl"] = any(not (cx1<hx0 or cx0>hx1 or cy1<hy0 or cy0>hy1)
                          for (hx0, hy0, hx1, hy1) in highlights)
            c["ul"] = any(
                -1 <= (uy - cy1) <= 5 and not (cx1<ux0 or cx0>ux1)
                for (ux0, uy, ux1) in underlines
            )

        # 红色短小标题行 → 强制另起一段成块（红色小标题块 essay-sec）。
        # 说明：① 小标题=红字 或 黑字+红色下划线，二者都算「标记」；
        #       ② 真小标题最长约 26 字（如「岂因祸福避趋之…英雄之力。」），红色引文续行均≥30 字，故阈值 <30；
        #       ③ 小标题常以引号开头（黑字），故标记判定需跳过前导引号；
        #       ④ 必须上一行以句末标点结尾（独立成块），否则只是红色引文跨行续写，不能断。
        QUOTE_CH = set('\'"“”‘’：:')
        def marked(c):
            return c["color"] == "RED" or c["ul"]
        st = 0
        while st < len(line_chars) and line_chars[st]["c"] in QUOTE_CH:
            st += 1
        lr = 0
        for c in line_chars[st:]:
            if marked(c):
                lr += 1
            else:
                break
        marked_led = (st < len(line_chars)) and marked(line_chars[st])
        prev_ends_punct = (prev_line_end is None) or bool(re.search(r"[。！？]$", prev_line_end))
        is_sec_line = (marked_led and lr >= 3
                       and re.search(r"[。！？]$", full) and len(full) < 30
                       and prev_ends_punct)

        # 段落边界：红色小标题独占一块；跨页续写首行接上段；其余按段距阈值
        if is_sec_line:
            if para_buf:
                emit_paragraph(para_buf, cur)
                para_buf = []
            emit_paragraph([line_chars], cur)   # 小标题单独成块（essay-sec）
            para_buf = []
        elif first_line_of_page and continuing:
            para_buf.append(line_chars)
        else:
            new_para = (last_line_y is None) or ((y - last_line_y) > PARA_GAP)
            # 首行缩进识别：行首 x0 比本页正文基准 x0 大 > INDENT_TH 视为新段落
            line_indent = (line_chars[0]["bbox"][0] - page_left) if line_chars else 0
            if line_indent > INDENT_TH:
                new_para = True
            if new_para:
                if para_buf:
                    emit_paragraph(para_buf, cur)
                    para_buf = []
                para_buf.append(line_chars)
            else:
                para_buf.append(line_chars)
        last_line_y = y
        prev_line_end = full
        first_line_of_page = False

    # 页尾不强制 flush（跨页段落留到下一页续写时合并）

flush()

# ---- 7. 写数据文件 ----
out = ["window.MODEL_ESSAYS = ["]
for i, e in enumerate(essays):
    if i > 0: out.append(",")
    out.append("  " + json.dumps(
        {"title": e["title"], "html": e["html"].strip(), "phrases": e["phrases"]},
        ensure_ascii=False))
out.append("];")
data = "\n".join(out)
open("js/essays-data.js", "w", encoding="utf-8").write(data)

print("essays written:", len(essays))
print("total phrases:", sum(len(e["phrases"]) for e in essays))
print("file KB:", round(len(data.encode("utf-8"))/1024, 1))
