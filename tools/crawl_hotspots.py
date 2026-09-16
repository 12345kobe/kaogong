#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
时事热点抓取脚本（考公工作台）
- 重点抓取「全国」+「广东」权威来源：央视新闻 / 学习强国(无公开RSS，跳过) / 半月谈 /
  南方日报(南方网) / 荔枝网 / 汕头日报 / 人民网 / 新华网 等。
- 关键原则（防张冠李戴）：
  * 每条热点严格保留其「原始发布日期」(来自 RSS pubDate / 网页时间)，
    绝不把旧文章标成今天的日期；
  * 抓取失败（超时/404/解析为空）的来源直接跳过，绝不编造内容；
  * 去重（标题归一化），同一事件只保留一条。
- 输出：assets/data/hotspots.js  （window.KG_HOTSPOTS = {...}）
        部署脚本会把 site/ 整体拍平到仓库根，运行时按 assets/data/hotspots.js 读取；
        故只写根相对路径这一份，避免线上仓库出现多余的 site/ 嵌套目录。
- 若本次全部来源都失败（items 为空）且本地已有数据，则保留旧数据不覆盖。
"""
import os, sys, re, json, hashlib, html as htmlmod, urllib.request, urllib.error, ssl, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT1 = os.path.join(ROOT, "assets", "data", "hotspots.js")

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

SOURCES = [
    {"name": "人民网·时政", "region": "全国", "type": "rss",
     "url": "https://www.people.com.cn/rss/politics.xml"},
    {"name": "新华网·时政", "region": "全国", "type": "rss",
     "url": "http://www.xinhuanet.com/politics/news_politics.xml"},
    {"name": "央视网·新闻", "region": "全国", "type": "rss",
     "url": "https://news.cctv.com/rss/news.xml"},
    {"name": "半月谈", "region": "全国", "type": "rss",
     "url": "https://www.banyuetan.org/rss/byt.xml"},
    {"name": "南方网·广东要闻", "region": "广东", "type": "html",
     "url": "https://www.southcn.com/"},
    {"name": "广东省政府·要闻", "region": "广东", "type": "html",
     "url": "http://www.gd.gov.cn/gdyw/"},
    {"name": "荔枝网·广东广电", "region": "广东", "type": "html",
     "url": "https://www.gdtv.cn/"},
    {"name": "汕头日报", "region": "广东", "type": "html",
     "url": "https://strb.dahuawang.com/"},
]

# 公考常见「考点 / 重要表述」词典（用于前端高亮，也在这里预打标签）
KW = ["高质量发展", "新质生产力", "百县千镇万村", "百千万工程", "粤港澳大湾区", "中国式现代化",
      "全过程人民民主", "全面从严治党", "共同富裕", "乡村振兴", "科技创新", "营商环境", "双碳",
      "碳达峰", "碳中和", "供给侧结构性改革", "扩大内需", "区域协调发展", "制造强国", "教育强国",
      "人才强国", "文化强国", "美丽中国", "国家安全", "新发展格局", "高水平开放", "实体经济",
      "专精特新", "数字中国", "健康中国", "就业优先", "依法行政", "一国两制", "粤港澳大湾区建设",
      "广东", "深圳", "广州", "珠海", "佛山", "东莞", "汕头", "省考", "国考", "宏观调控"]

MAX_ITEMS = 48
MAX_FULL = 24  # 最多抓取多少条全文（控制请求数）


def fetch(url, timeout=9, binary=False):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9"})
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            data = r.read() if binary else r.read(500000).decode("utf-8", "ignore")
            return data
    except Exception:
        return None


MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7,
           "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
           "一月": 1, "二月": 2, "三月": 3, "四月": 4, "五月": 5, "六月": 6,
           "七月": 7, "八月": 8, "九月": 9, "十月": 10, "十一月": 11, "十二月": 12}


def parse_date(s):
    """尽可能解析出 YYYY-MM-DD（用文章原始时间，绝不回退到今天）。解析不到返回 ''。"""
    if not s:
        return ""
    s = s.strip()
    # RFC 822
    try:
        import email.utils as eu
        dt = eu.parsedate_to_datetime(s)
        if dt:
            return dt.strftime("%Y-%m-%d")
    except Exception:
        pass
    # YYYY-MM-DD / YYYY.MM.DD / YYYY年MM月DD日
    m = re.search(r"(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})", s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 2000 <= y <= 2100 and 1 <= mo <= 12 and 1 <= d <= 31:
            return "%04d-%02d-%02d" % (y, mo, d)
    # DD-Mon-YYYY（如 14-Dec-2022）
    m = re.search(r"(\d{1,2})-([A-Za-z]{3,})-(\d{4})", s, re.I)
    if m:
        mo = MONTHS.get(m.group(2).lower())
        if mo:
            y, d = int(m.group(3)), int(m.group(1))
            if 2000 <= y <= 2100 and 1 <= d <= 31:
                return "%04d-%02d-%02d" % (y, mo, d)
    return ""


def clean_text(s):
    if not s:
        return ""
    s = s.replace("<![CDATA[", "").replace("]]>", "")
    s = re.sub(r"<[^>]+>", " ", s)
    s = htmlmod.unescape(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_rss(buf):
    out = []
    # RSS <item>
    for it in re.findall(r"<item[\s\S]*?</item>", buf, re.I):
        t = clean_text(re.search(r"<title>([\s\S]*?)</title>", it, re.I | re.S).group(1) if re.search(r"<title>([\s\S]*?)</title>", it, re.I | re.S) else "")
        if not t:
            continue
        link_m = re.search(r"<link>([\s\S]*?)</link>", it, re.I | re.S)
        link = clean_text(link_m.group(1)) if link_m else ""
        desc_m = re.search(r"<description>([\s\S]*?)</description>", it, re.I | re.S)
        desc = clean_text(desc_m.group(1)) if desc_m else ""
        pub = parse_date(re.search(r"<pubDate>([\s\S]*?)</pubDate>", it, re.I | re.S).group(1) if re.search(r"<pubDate>([\s\S]*?)</pubDate>", it, re.I | re.S) else "")
        out.append({"title": t, "link": link, "summary": desc[:400], "date": pub})
    # Atom <entry>
    for it in re.findall(r"<entry[\s\S]*?</entry>", buf, re.I):
        t = clean_text(re.search(r"<title>([\s\S]*?)</title>", it, re.I | re.S).group(1) if re.search(r"<title>([\s\S]*?)</title>", it, re.I | re.S) else "")
        if not t:
            continue
        lm = re.search(r"<link[^>]*href=\"([^\"]+)\"", it, re.I)
        link = lm.group(1) if lm else ""
        dm = re.search(r"<summary>([\s\S]*?)</summary>", it, re.I | re.S) or re.search(r"<content>([\s\S]*?)</content>", it, re.I | re.S)
        desc = clean_text(dm.group(1)) if dm else ""
        pub = parse_date(re.search(r"<updated>([\s\S]*?)</updated>", it, re.I | re.S).group(1) if re.search(r"<updated>([\s\S]*?)</updated>", it, re.I | re.S) else "")
        out.append({"title": t, "link": link, "summary": desc[:400], "date": pub})
    return out


def parse_html_headlines(buf, base):
    out = []
    base = base.rstrip("/")
    for m in re.finditer(r"<a[^>]+href=\"([^\"]+)\"[^>]*>([\s\S]*?)</a>", buf, re.I):
        href, txt = m.group(1), m.group(2)
        title = clean_text(txt)
        if len(title) < 10:
            continue
        if not re.match(r"https?://", href):
            href = base + (href if href.startswith("/") else "/" + href)
        if any(k in href for k in ["javascript:", "#", "mailto:"]):
            continue
        out.append({"title": title, "link": href, "summary": "", "date": ""})
    # 按标题长度粗筛，去重
    seen = set()
    res = []
    for o in out:
        k = o["title"][:20]
        if k in seen:
            continue
        seen.add(k)
        res.append(o)
    return res[:30]


def fetch_article(url):
    buf = fetch(url, timeout=10)
    if not buf:
        return ""
    buf = re.sub(r"<script[\s\S]*?</script>", " ", buf, flags=re.I)
    buf = re.sub(r"<style[\s\S]*?</style>", " ", buf, flags=re.I)
    # 取 <p> 段落里较长的
    paras = [clean_text(p) for p in re.findall(r"<p[^>]*>([\s\S]*?)</p>", buf, re.I)]
    paras = [p for p in paras if len(p) > 25]
    if not paras:
        # 退化：整页纯文本
        return clean_text(buf)[:1500]
    return "\n".join(paras)[:2000]


def norm_key(s):
    return re.sub(r"\s+", "", s or "")[:40]


def main():
    items = []
    seen = set()
    for src in SOURCES:
        try:
            buf = fetch(src["url"], timeout=10)
            if not buf:
                print("  skip (no data):", src["name"])
                continue
            if src["type"] == "rss":
                rows = parse_rss(buf)
            else:
                rows = parse_html_headlines(buf, src["url"])
            if not rows:
                print("  skip (empty):", src["name"])
                continue
            for r in rows:
                key = norm_key(r["title"])
                if not key or key in seen:
                    continue
                seen.add(key)
                items.append({
                    "title": r["title"], "source": src["name"], "region": src["region"],
                    "url": r["link"], "date": r.get("date", "") or "",
                    "summary": r.get("summary", "") or "", "body": "", "tags": []
                })
            print("  ok:", src["name"], len(rows), "条")
        except Exception as e:
            print("  error:", src["name"], repr(e)[:80])

    # 按来源分组，每源取较新的若干条，避免「全国」大源挤掉「广东」小源
    PER_SOURCE = 16
    by_src = {}
    for it in items:
        by_src.setdefault(it["source"], []).append(it)
    balanced = []
    for src, lst in by_src.items():
        lst.sort(key=lambda x: x["date"] or "0000-00-00", reverse=True)
        balanced.extend(lst[:PER_SOURCE])
    items = balanced

    # 全局按日期倒序（有日期的优先），再补没有日期的
    def sortkey(x):
        return x["date"] or "0000-00-00"
    items.sort(key=sortkey, reverse=True)
    items = items[:MAX_ITEMS]

    # 抓取全文（最多 MAX_FULL 条，且只抓有链接的）
    full = 0
    for it in items:
        if full >= MAX_FULL:
            break
        if it["url"] and not it["body"]:
            body = fetch_article(it["url"])
            if body and len(body) > 30:
                it["body"] = body
                full += 1
        # 标签
        blob = it["title"] + " " + it["summary"] + " " + it["body"]
        it["tags"] = [k for k in KW if k in blob]

    # 防止覆盖：若本次为空且本地已有数据，则保留旧文件
    if not items:
        for o in (OUT1, OUT2):
            if os.path.exists(o):
                print("本次无抓取结果，保留既有", o)
        return

    data = {
        "updatedAt": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "count": len(items),
        "items": items,
    }
    js = "window.KG_HOTSPOTS = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
    for o in (OUT1,):
        try:
            os.makedirs(os.path.dirname(o), exist_ok=True)
            with open(o, "w", encoding="utf-8") as f:
                f.write(js)
            print("written:", o, len(items), "条")
        except Exception as e:
            print("write fail:", o, repr(e)[:80])


if __name__ == "__main__":
    main()
