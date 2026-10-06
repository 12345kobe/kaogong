#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""每日时政热点生成（GitHub Actions 版，不依赖任何人的电脑）。

流程：
  1. 素材：优先读仓库里由 crawl-hotspots 抓好的 assets/data/hotspots.js（真实热点）；
     不足再补抓中新网/央视网等公开源。
  2. 生成：调用 AI 接口（智谱 / 硅基流动，密钥走 Actions Secret，绝不进仓库）按规格出内容。
  3. 落盘：合并写入 assets/data/daily_hot.js（**只新增/覆盖今天，历史日期不动**）。
  4. 可选：把当天内容并进云端数据 userdata:data/<user>.json（需要 GH_PAT Secret）。

环境变量（全部来自 Actions Secrets）：
  AI_API_KEY   必填，AI 密钥
  AI_API_BASE  选填，默认 https://open.bigmodel.cn/api/paas/v4/chat/completions
  AI_MODEL     选填，默认 glm-4-flash
  GH_PAT       选填，填了才写云端数据
  GH_USER      选填，默认 kaogong
"""
import datetime
import json
import os
import re
import ssl
import sys
import time
import urllib.request

DATE = (os.environ.get("FORCE_DATE") or "").strip()
if not DATE:
    # Actions 定时是 UTC 12:00 = 北京时间 20:00，对应北京时间当天
    DATE = (datetime.datetime.utcnow() + datetime.timedelta(hours=8)).strftime("%Y-%m-%d")

UA = {"User-Agent": "Mozilla/5.0 (kaogong-daily-hot)"}


def http_get(url, timeout=25):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return r.read().decode("utf-8", "ignore")


def load_local_hotspots():
    """读仓库里已抓取的热点（真实来源），取今天的条目"""
    out = []
    try:
        txt = open("assets/data/hotspots.js", "r", encoding="utf-8").read()
        i = txt.find("=")
        data = json.loads(txt[i + 1].strip().rstrip(";"))
        items = data if isinstance(data, list) else (data.get("list") or data.get("items") or [])
        for x in items:
            d = str(x.get("date") or x.get("pubDate") or "").slice(0, 10) if False else str(x.get("date") or x.get("pubDate") or "")[:10]
            if d and d != DATE:
                continue
            t = str(x.get("title") or "").strip()
            b = str(x.get("body") or x.get("summary") or x.get("desc") or "").strip()[:160]
            if t:
                out.append(t + ("：" + b if b else ""))
    except Exception:
        pass
    return out[:20]


def fallback_fetch():
    """本地热点不足时，补抓公开源（尽力而为，失败不影响主流程）"""
    out = []
    srcs = [
        ("https://www.chinanews.com.cn/rss/importnews.xml", r"<item>.*?<title>(.*?)</title>.*?<description>(.*?)</description>", True),
        ("https://www.chinanews.com.cn/rss/china.xml", r"<item>.*?<title>(.*?)</title>.*?<description>(.*?)</description>", True),
    ]
    for url, pat, _ in srcs:
        try:
            txt = http_get(url)
            for m in re.finditer(pat, txt, re.S):
                t = re.sub(r"<[^>]+>", "", m.group(1)).strip()
                d = re.sub(r"<[^>]+>", "", m.group(2)).strip()[:160]
                if t:
                    out.append(t + ("：" + d if d else ""))
        except Exception:
            continue
        if len(out) >= 12:
            break
    return out[:16]


SPEC_TMPL = """你是公务员考试时政命题专家。下面是 {date} 的真实热点素材，请严格据此生成，禁止编造素材之外的事实。
【今日素材】
{mat}
【输出要求】只输出一个 JSON 对象，不要说明文字、不要 markdown 代码块。结构：
{{"news":[{{"area":"领域","star":5,"title":"要点","body":"一句事实"}} ×9（star=5 三条、4 三条、3 三条）],
"essay":{{"topic":"核心立意","paras":["段落1","段落2"],"quotes":["金句1","金句2","金句3","金句4"]}},
"verbal":[10 题 {{"q":"题干100-150字带时政背景","options":["A","B","C","D"],"a":0,"e":"【答案】A\\n【解析】…"}}，a 为 0 基数字，双空为主、单空四字词、选项强迷惑],
"quiz":[15 单选 + 5 多选。单选 {{"q":"","options":[4 项],"a":1,"e":"【答案】：B\\n【解析】…"}}，a 为 0 基数字，ABCD 约 1:1:1:1，至少 2 道计数型（①②③④⑤选正确数量，选项 A.5项 B.4项 C.3项 D.2项）；多选 {{"q":"（多选）…","options":[4 项],"a":"ABC","type":"multi","multi":"ABC","e":"【答案】：ABC\\n【解析】…"}}，a 为 2-4 个字母且组合不重复]}}
【选项红线】错误选项只做政治词汇/领域/数字/主体的同义替换，句子仍来自素材原意；不得出现消极、否定或负面评价表述。解析说明错在哪个词被替换。
【答案格式】单选【答案】：A；多选【答案】：ABC。"""


def call_ai(prompt):
    key = os.environ.get("AI_API_KEY", "").strip()
    if not key:
        raise SystemExit("缺少 AI_API_KEY（请在仓库 Settings → Secrets and variables → Actions 里配置）")
    # workflow 里 secret 未配置时 env 是空字符串而非缺失，必须用 or 兜底，否则 base='' 直接炸
    base = (os.environ.get("AI_API_BASE") or "https://open.bigmodel.cn/api/paas/v4/chat/completions").strip()
    model = (os.environ.get("AI_MODEL") or "glm-4-flash").strip()
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.5,
    }
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(base, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", "Bearer " + key)
    last = None
    for attempt in range(3):   # 生成 30 题耗时较长：超时 300 秒 + 最多 3 次
        try:
            req2 = urllib.request.Request(base, data=data, method="POST")
            req2.add_header("Content-Type", "application/json")
            req2.add_header("Authorization", "Bearer " + key)
            with urllib.request.urlopen(req2, timeout=300) as r:
                res = json.loads(r.read().decode("utf-8"))
            return res["choices"][0]["message"]["content"]
        except Exception as e:
            last = e
            print("AI 调用第 %d 次失败：%s，重试…" % (attempt + 1, e), file=sys.stderr)
            time.sleep(5)
    raise SystemExit("AI 调用失败（已重试 3 次）：%s" % last)


def parse_json(txt):
    a = txt.find("{")
    b = txt.rfind("}")
    if a < 0 or b <= a:
        raise SystemExit("AI 返回内容不是有效 JSON")
    return json.loads(txt[a:b + 1])


def merge_static(day):
    path = "assets/data/daily_hot.js"
    store = {}
    try:
        txt = open(path, "r", encoding="utf-8").read()
        a, b = txt.find("{"), txt.rfind("}")
        if a >= 0 and b > a:
            store = json.loads(txt[a:b + 1])
    except Exception:
        pass
    store[DATE] = day          # 只写今天，历史日期原样保留
    body = ("/* 每日时政热点（每晚 20:00 自动生成）· 静态兜底数据源\n"
            "   App 启动时与云端数据合并；云端未同步到也能看到当天内容。 */\n"
            "window.KG_DAILY_HOT = " + json.dumps(store, ensure_ascii=False, indent=1) + ";\n")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(body)
    print("静态源已写入：%s（累计 %d 天）" % (path, len(store)))


def main():
    mat = load_local_hotspots()
    if len(mat) < 6:
        mat = (mat + fallback_fetch())[:20]
    if not mat:
        raise SystemExit("没有可用的今日素材，跳过本次生成")
    print("素材 %d 条，日期 %s" % (len(mat), DATE))
    base_prompt = SPEC_TMPL.format(date=DATE, mat="\n".join("%d. %s" % (i + 1, m) for i, m in enumerate(mat)))
    day = None
    for attempt in range(3):
        prompt = base_prompt
        if attempt > 0:
            prompt += ("\n\n【再次强调——上一稿数量不符，本次必须严格满足】"
                       "verbal 恰好 10 题；quiz 恰好 20 题（15 单选 + 5 多选，多选 a 为 2-4 个字母且组合不重复）；"
                       "单选答案 A:B:C:D 约 1:1:1:1。请重新输出完整 JSON。")
        day = parse_json(call_ai(prompt))
        if not all(k in day for k in ("news", "essay", "verbal", "quiz")):
            day = None
            continue
        nv, nq = len(day.get("verbal") or []), len(day.get("quiz") or [])
        if nv == 10 and nq == 20:
            break
        print("第 %d 次生成数量不符（言语 %d / 时政 %d），重试…" % (attempt + 1, nv, nq), file=sys.stderr)
    if day is None or not all(k in day for k in ("news", "essay", "verbal", "quiz")):
        raise SystemExit("多次生成仍未通过数量校验，跳过写入（避免污染数据）")
    nv, nq = len(day.get("verbal") or []), len(day.get("quiz") or [])
    if nv != 10 or nq != 20:
        print("警告：数量仍为 言语 %d / 时政 %d（已达重试上限，仍写入，但建议人工复核）" % (nv, nq), file=sys.stderr)
    day["date"] = DATE
    day["title"] = DATE + " 时政"
    merge_static(day)
    print("生成完成：言语 %d 题 / 时政 %d 题 / 要点 %d 条" % (
        len(day.get("verbal") or []), len(day.get("quiz") or []), len(day.get("news") or [])))


if __name__ == "__main__":
    main()
