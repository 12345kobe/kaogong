# -*- coding: utf-8 -*-
"""把《类比推理必会对应关系》OCR 结果解析为专题数据，输出 js/relation-data.js → window.RELATION
特点：
  - 专题一 ~ 专题二十二；每专题抽取「名称 + 正文」；
  - 正文按「（一）解释 / 真题示例 / 知识积累」切分为段落，折行合并为完整语义句，不随便断行；
  - 过滤页码、公众号、OCR 噪声（如 ，“一， 等孤立标点行）。
"""
import json, re

SRC = "tools/_ocr_relation.json"
OUT = "C:/Users/28621/Desktop/考公工作台/js/relation-data.js"

CN = "零一二三四五六七八九十百"
def cn2int(s):
    s = s.strip()
    if s.isdigit(): return int(s)
    if len(s) == 1: return CN.index(s)
    if "十" in s:
        a, _, b = s.partition("十")
        a = CN.index(a) if a else 1
        b = CN.index(b) if b else 0
        return a * 10 + b
    return 999

WATER = re.compile(r"(FU|粉\s*笔|八粉笔|粉笔)")
JUNK = re.compile(r"^(更多资料添加[：:].*|[，。：、；：：\s]*$|feifeixuejie\d*|电子王業出版社|Publishing House.*|北京[·•]?BEIJING|未经许可.*|版权所有.*|图书在版.*|ISBN.*|中国版本.*|责任编辑.*|印\s*刷.*|装\s*订.*|出版发行.*|北京市.*|邮编.*|字数.*|本：.*|次：.*|价：.*|凡所购买.*|质量投诉.*|盗版侵权.*|本书咨询.*|公务员考试|公考|编著|\d{1,3})$")

def clean(t):
    t = WATER.sub("", t).strip()
    # 去掉孤立的噪声标点行
    if re.fullmatch(r"[，。：、；：：\s]+", t): return ""
    return t

def main():
    d = json.load(open(SRC, encoding="utf-8"))
    # 规范专题名（依据原书目录，按专题号映射，规避 OCR 把页码/正文混进名称）
    CANON = {
        1: "因果关系", 2: "原材料、工艺和成品", 3: "属性关系", 4: "动作先后顺序",
        5: "作品与作者", 6: "位置对应", 7: "方式与目的", 8: "地点对应", 9: "食物对应",
        10: "职业、场所与工作", 11: "反比关系", 12: "条件关系", 13: "事物与功能",
        14: "动力来源", 15: "工具对应", 16: "人物对应", 17: "物理单位对应",
        18: "配套使用", 19: "依据对应", 20: "载体对应", 21: "诗句+主题对应", 22: "研究对象对应",
    }
    # 全文本按行
    lines = []
    for pg in d["pages"]:
        for l in pg["lines"]:
            ct = clean(l["t"])
            if ct: lines.append(ct)

    TOPIC = re.compile(r"^专题([一二三四五六七八九十百]+)")
    blocks = {}   # num -> {name, content:[lines]}
    cur = None
    i = 0
    while i < len(lines):
        m = TOPIC.match(lines[i])
        if m:
            num = cn2int(m.group(1))
            # 名称：下一非空行（跳过页码/噪声）
            name = ""
            j = i + 1
            while j < len(lines) and (not name):
                nxt = lines[j]
                if TOPIC.match(nxt) or JUNK.match(nxt) or re.fullmatch(r"\d{1,3}", nxt):
                    j += 1; continue
                name = re.sub(r'^[上下见同该此之其]+', '', nxt).strip()
                name = re.split(r'对应(?:关系)?题目', name)[0].strip()
                name = re.sub(r'^[（(][一二三四五六七八九十]+[)）]\s*', '', name).strip()
                break
            if not name:
                name = "专题" + str(num)
            # 正文：从名称之后到下一个专题
            content = []
            k = j + 1
            while k < len(lines) and not TOPIC.match(lines[k]):
                if not JUNK.match(lines[k]):
                    content.append(lines[k])
                k += 1
            b = {"num": num, "name": name, "content": content}
            if num not in blocks:
                blocks[num] = b          # 首次出现（多为目录页，名称干净短小）
            elif len(content) > len(blocks[num]["content"]):
                blocks[num]["content"] = content   # 正文取最长的一份，名称保留首次的
            i = k
        else:
            i += 1

    topics = []
    for num in sorted(blocks.keys()):
        b = blocks[num]
        # 合并折行：中文按句合并（去换行），再以小节标题分段
        raw = "".join(b["content"])
        # 去掉残留页码（行尾孤立数字）
        raw = re.sub(r"\s*\n?\d{1,3}\s*$", "", raw)
        # 小节切分
        seg = re.sub(r"(（[一二三四五六七八九十]+）|真题示例|知识积累)", r"\n\1\n", raw)
        paras = [p.strip() for p in seg.split("\n") if p.strip()]
        topics.append({"id": "t" + str(num), "num": num, "name": CANON.get(num, b["name"]), "paras": paras})

    print(f"专题 {len(topics)} 个")
    for t in topics[:4]:
        print(f"  - 专题{t['num']} {t['name']}（{len(t['paras'])} 段）")
        print("    首段:", t["paras"][0][:50] if t["paras"] else "(空)")

    def esc(s):
        return (s or "").replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")

    out = ["// 类比推理必会对应关系：OCR + 结构化（" + str(len(topics)) + " 专题）\nwindow.RELATION = {\n  topics: [\n"]
    for t in topics:
        ps = ",".join('"' + esc(p) + '"' for p in t["paras"])
        out.append('    {"id":"' + t["id"] + '","num":' + str(t["num"]) + ',"name":"' + esc(t["name"]) +
                   '","paras":[' + ps + ']},\n')
    out.append("  ]\n};\n")
    open(OUT, "w", encoding="utf-8").write("".join(out))
    print("输出:", OUT)

if __name__ == "__main__":
    main()
