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
{"news":[{"area":"领域","star":5,"title":"要点","body":"一句事实"} ×9（star=5 三条、4 三条、3 三条）],
"essay":{"topic":"核心立意","paras":["段落1","段落2"],"quotes":["金句1","金句2","金句3","金句4"]}},
"verbal":[10 道「言语理解·逻辑填空」：考查核心=词汇匹配（近义辨析、语境适配、感情色彩、搭配陷阱），时政只是题干背景皮，绝不许出成问答题。题干=以中国时政/国家大政方针为背景的完整长材料（100-150字，不足100字=不合格；背景自然融入，严禁「背景：」「材料：」标签；国际新闻一律不作背景）。★空与选项严格对应：单空题=题干恰好1个____、每选项恰好1个词；双空题=题干恰好2个____、每选项恰好2个词（一个空格分隔）。双空为主（约7题）、单空为辅（约3题，只填四字成语）。★用词铁律：空处只允许四字成语和两字实词两类，严禁任何三字词（含政策名词也不许）；严禁动词+「了」（推动了/促进了/凸显了/加强了等一律禁止）；严禁普通短语名词组当填空词。★同一空位四选项字数完全一致。选项强迷惑（都要看似可行、对比择优）；政务固定搭配（夯实责任、打通堵点、筑牢底线）可入题。正确答案 A/B/C/D 尽量均匀。解析逐空逐项对比：第一空，搭配「××」，侧重…；最优项…；其余三项说明侧重点/搭配对象差异。第二空同理。{"q":"长背景…____…____","options":["一蹴而就 恪尽职守","一帆风顺 废寝忘食","轻而易举 呕心沥血","一朝一夕 兢兢业业"],"a":0,"e":"【答案】A\\n【解析】第一空，…；第二空，…"}，a 为 0 基数字],
"quiz":[15 单选 + 5 多选。★范围红线：只考中国相关时政，纯国际新闻一律禁止；素材中的国际条目一律忽略。★命题结构（最重要）：15 道单选中至多 2 道是「常识直考题」（直接考今日时政事实/数字）；其余全部按「时政引子 + 国家政策考点」命题——题干先用今日时政事件/成就作引子（60-120字自然成段，禁「背景：」「材料：」标签、禁媒体字样），设问指向国家大政方针：十五五规划、中央经济工作会议、中央一号文件、党的二十大报告、习近平新时代中国特色社会主义思想、政府工作报告等中央文件的核心表述，正确答案必须来自这些文件原文。示例方向：海水淡化突破→考「海洋强国/创新驱动发展战略」；短视频专项整治→考「网络综合治理体系」；国庆消费→考「扩大内需战略」。选项为同类政策名词/表述，错误项把政策名词替换成相近政策名词挖坑（如枫桥经验换浦江经验），句子通顺、迷惑性强，禁低级错项、禁消极否定唱衰。单选正确答案 A/B/C/D 尽量均匀；多选答案 2-4 个正确随机、组合不重复。15 道单选中必须包含 2 道「数量辨析」新题型：题干给 ①②③④ 四条关于今日时政的表述（正误混合，错误项只做名词或数字偷换），设问「下列表述正确的有几项」或「错误的有几项」，选项固定 A.1项 B.2项 C.3项 D.4项，解析逐条说明对错。单选 {"q":"（时政引子）…\\n设问","options":[4项],"a":1,"e":"【答案】B\\n【解析】先引政策原文，再逐条指出错误项偷换了哪个名词"}，a 为 0 基数字；数量辨析 {"q":"…材料…\\n下列表述正确的有几项？\\n①…\\n②…\\n③…\\n④…","options":["1项","2项","3项","4项"],"a":1,"e":"【答案】B\\n【解析】①对…②错（把××偷换成××）…"}；多选 {"q":"（时政引子）…\\n（多选）下列表述符合中央文件原文的有","options":[4项内容表述],"a":"ABC","type":"multi","multi":"ABC","e":"【答案】ABC\\n【解析】…"}，a 为 2-4 个字母且组合不重复。★多选选项红线：每个选项必须是完整的一句知识表述（同属一大类的政策/事实内容），ABCD 只是选项编号；严禁把答案字母组合（如 ABC、ABD、ACD）当成选项内容。★全部题目彼此不得重复。]}}
【范围红线】news/verbal/quiz 全部只限中国相关时政；国际性事件仅当与中国直接相关时才可收录。
【选项红线】错误选项只做政治词汇/领域/数字/主体的同义替换，不得消极否定负面；解析说明错在哪个词被替换，禁止写「对应易错点第X条」。
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
    for attempt in range(5):   # 生成 30 题耗时较长：超时 300 秒 + 最多 5 次（服务端 500 常见）
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
            time.sleep(10 * (attempt + 1))   # 服务端 500 多为过载，指数退避
    raise SystemExit("AI 调用失败（已重试 5 次）：%s" % last)


def parse_json(txt):
    t = (txt or "").replace("```json", "").replace("```", "").strip()
    a = t.find("{")
    if a < 0:
        raise SystemExit("AI 返回内容不是有效 JSON")
    s = t[a:]
    try:
        return json.loads(s)
    except Exception:
        pass
    # 括号平衡救援：找到与首个 { 匹配的 }，截断尾部多余内容再解析（应对流式截断）
    depth, in_str, esc, end = 0, False, False, -1
    for i, c in enumerate(s):
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end > 0:
        try:
            return json.loads(s[:end + 1])
        except Exception:
            pass
        # 尾逗号清理再试一次
        try:
            return json.loads(re.sub(r",\s*([}\]])", r"\1", s[:end + 1]))
        except Exception:
            pass
    raise SystemExit("AI 返回内容不是有效 JSON（已救援仍失败）")


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


def emit_day(day):
    """把当天内容单独输出到 build/，供 workflow 提交步骤在 reset 到最新远端后由
    patch_daily_hot.py 合并写入——彻底避免多 run 并发时的 rebase 冲突。"""
    try:
        os.makedirs("build", exist_ok=True)
        with open(os.path.join("build", "daily_hot_day.json"), "w", encoding="utf-8") as f:
            json.dump(day, f, ensure_ascii=False)
        print("当日内容已输出：build/daily_hot_day.json")
    except Exception as e:
        print("输出 build/daily_hot_day.json 失败：%s" % e, file=sys.stderr)


def main():
    mat = load_local_hotspots()
    if len(mat) < 6:
        mat = (mat + fallback_fetch())[:20]
    if not mat:
        raise SystemExit("没有可用的今日素材，跳过本次生成")
    print("素材 %d 条，日期 %s" % (len(mat), DATE))
    base_prompt = SPEC_TMPL.replace("{date}", DATE).replace(
        "{mat}", "\n".join("%d. %s" % (i + 1, m) for i, m in enumerate(mat)))
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
        # 数量宽容：模型偶发多出/少出一两题，答题引擎本身不限题数；太离谱才重试（减少服务端压力）
        if nv >= 8 and nq >= 15:
            if nv != 10 or nq != 20:
                print("警告：数量为 言语 %d / 时政 %d（非标准 10/20，按原样写入）" % (nv, nq), file=sys.stderr)
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
    emit_day(day)
    print("生成完成：言语 %d 题 / 时政 %d 题 / 要点 %d 条" % (
        len(day.get("verbal") or []), len(day.get("quiz") or []), len(day.get("news") or [])))


if __name__ == "__main__":
    main()
