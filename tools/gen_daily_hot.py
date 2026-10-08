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
"verbal":[5 道「言语理解·逻辑填空」。★核心：今日时政只是背景皮，真正考的是分句之间的逻辑关系（转折/递进/并列/因果/条件/解释）决定空处填什么词；绝不许出成问答题/事实题/主旨题。★题干硬指标：正文 100-200 字且至少 3 个分句，逻辑链条清晰（如「虽然…但…因此…」），不足 100 字或少于 3 个分句=废题；背景用今日中国时政自然融入，禁「背景：」「材料：」标签，国际新闻不作背景。★空与选项对应：设 N 个 ____（N=1或2），单空=每选项1个词，双空=每选项2个词（空格分隔），空数必须=词数。★用词：空处只填四字成语或两字实词，必须取自真实公考词表（成语如：源远流长、博大精深、推陈出新、革故鼎新、墨守成规；实词如：夯实、筑牢、赓续、彰显、涵养），严禁三字词、严禁动词+「了/着/过」、严禁自造词。★同空同字数：同一空位四选项字数完全一致。选项语义接近、强迷惑、靠语境线索择优。★解析=语境线索法：逐空说明关联/解释/搭配/程度/感情色彩线索，讲清最优项为何适配、其余三项差异，附文段出处。正确答案 A/B/C/D 均匀。{"q":"长背景（100-200字、至少3个分句）…____…____","options":["成语一 成语二","成语三 成语四","成语五 成语六","成语七 成语八"],"a":0,"e":"【答案】A\n【解析】第一空…；第二空…。文段出处：……"}，a 为 0 基数字],
"quiz":[10 道（7 单选 + 3 多选）。★★定位（最重要）：今日时政【只作背景引入】（一两句话点到即可，用来引出主题），真正考察的内容全部来自政治理论知识点；严禁整题都在考今天这条新闻本身（如「该会议在哪召开」「该发布于何时」一律禁止）。★考点来源：今日时政涉及哪个主题，就考该主题下的政治理论知识（例：涉及国家安全→考政治安全、经济安全、文化安全、社会安全等构成与表述；涉及科技攻关→考科技自立自强、新质生产力等表述；涉及党中央会议/重大政治表述→那些政治名词本身就是知识点，可直接考）。正确项=知识点原文原词原句，不改写。★错误项=只换「关键词/数字/主体」：①换关键词；②换数字/日期；③换主体（张冠李戴）；④漏条/加条；⑤偷换范围或绝对化。★禁止消极、唱衰、否定性表述（可积极、可绝对化）。★国际时政只作背景引入，不作为考察重点；不考纯外国事件。★题型随机取用：表述辨析（下列说法正确的是/错误的是）、概念归属（下列属于…的是）、要点组合、单一事实（政治名词/会议/文件）、数量辨析（正确的有几项）。单选 {"q":"（今日时政一两句作背景引入，不写背景标签）…\n设问句","options":[4项],"a":1,"e":"【答案】B\n【解析】…"}，a 为 0 基数字；多选 {"q":"（今日时政一两句作背景引入）…\n（多选）下列表述符合政治理论原文的有","options":[4项独立知识表述],"a":"ABC","type":"multi","multi":"ABC","e":"【答案】ABC\n【解析】…"}，a 为 2-4 个字母且组合不重复。★★多选选项红线：A/B/C/D 每个选项必须是一句独立完整的知识表述，严禁把「AC」「BCD」这类字母组合当成选项内容，也不许选项只写字母。★解析：先引知识点原文说明正确项为何对，再逐条指出错误项偷换了哪个关键词/数字/主体，结尾「故本题选X。」★全部题目彼此不得重复。]}}
【范围红线】news/verbal/quiz 全部只限中国相关时政；国际性事件仅当与中国直接相关时才可收录。
【选项红线】错误选项只做关键词/数字/主体的同义替换，不得消极否定负面；解析说明错在哪个词被替换，禁止写「对应易错点第X条」。
【答案格式】单选【答案】：A；多选【答案】：ABC。
【★★答案绝对一致红线】单选 a 的 0 基索引换算出的字母，必须与解析里【答案】X 和末尾「故本题选X」完全相同（a=1→【答案】B）；多选 a 必须是字母串且与【答案】后的字母完全一致。写完逐题自检，做不到就重写该题。
【★★言语感情色彩红线】讲成就、成效、惠民的文段严禁把贬义词当正确答案；解析必须原样点名全部 4 个选项的词，逐项说明错在哪，禁止空泛套话。
【★★★最强锁定规则（用户死命令，违反即废题）】
①【先列清单再出题】动笔前先把今日主题对应到具体政治理论考点，逐条列出「第N题=考点X」。严禁出清单之外的题，严禁凭印象乱出时政常识。
②【四个选项=同一主题下的4个不同知识点】A/B/C/D 各自是一句完整的政治理论表述（如「坚持把××作为××」），来自同一主题域下的不同考点；只有一项与知识点原文一致，其余三项是另外三个同类考点被设错后的版本。不是「同一句话换个词」的四胞胎。
③【错项只准这三种设错手法】a.替换政治名词（「战略基点」→「战术要点」、「新质生产力」→「新型生产力」）；b.替换程度词/定位词（「根本保证」→「重要保障」、「首要任务」→「中心环节」、「基本国策」→「一般政策」）；c.替换关键词/主体（张冠李戴、漏条加条、偷换范围）。
④【错项绝对禁止一眼识破】严禁消极唱衰、否定性表述（「不利于」「阻碍」「失败」「忽视民生」一律禁止），严禁「以上都对/都不对」，严禁违背常识的胡编——这类题一眼能排除，等于废题。正确项与错项必须「长得像」，只能靠准确记忆分辨。
⑤【正确项】允许同义改写，但意思与知识点原文完全一致，核心政治名词（「扩大内需这个战略基点」「新质生产力」「全过程人民民主」「两个毫不动摇」等固定表述）必须原词保留。
⑥【题干婉转切入】今日新闻只作一两句引子，再自然过渡到所考知识点主题（「这一部署体现的…是」「下列表述符合…原文的有」），不许生硬跳转。
⑦【言语用词】上面给的公考词表只是词源参考，优先用里面的词，有更贴语境更规范的好词也可以用；不要求照抄任何现成选项组合。硬要求只有：同空同字数、语义接近、强迷惑、正确项感情色彩与语境一致。"""


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
        "temperature": 0.3,          # ★降低随机性：减少跑偏与格式崩坏
        "max_tokens": 8192,          # ★防截断：整包 15 题一次输出极易被截断（2026-10-07 两次失败即此因）
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


def enforce_answers(items):
    """★写库前强制答案一致（用户死命令）：解析里【答案】X/故本题选X 与 a 字段不一致时，以解析为准纠正 a。
       同时剔除选项数≠4、答案越界的坏题，避免把「解析说B判分C」的错误题写进数据源。"""
    L = "ABCD"
    out = []
    fixed = dropped = 0
    for q in (items or []):
        if not isinstance(q, dict):
            continue
        opts = q.get("options") or []
        if len(opts) != 4:
            dropped += 1
            continue
        e = str(q.get("e") or "")
        is_multi = q.get("type") == "multi" or q.get("multi") or (
            isinstance(q.get("a"), str) and len(q.get("a") or "") > 1)
        if is_multi:
            out.append(q)
            continue
        # 提取解析声明的答案字母（取出现最多的一个）
        cands = re.findall(r"【\s*答案\s*】\s*[:：]?\s*([A-D])(?![A-D])", e)
        cands += re.findall(
            r"(?:故本题选|本题选|故选|应选|故正确答案为|正确答案[是为]|正确选项[是为])\s*[:：]?\s*([A-D])(?![A-D])", e)
        idx = q.get("a")
        idx = idx if isinstance(idx, int) else (L.find(str(idx).strip()) if str(idx).strip() in L else -1)
        if cands:
            freq = {}
            for c in cands:
                freq[c] = freq.get(c, 0) + 1
            best = max(sorted(freq), key=lambda k: freq[k])
            bi = L.find(best)
            if bi >= 0 and bi != idx:
                q["a"] = bi
                fixed += 1
            idx = q["a"]
        if not isinstance(idx, int) or idx < 0 or idx > 3:
            dropped += 1
            continue
        out.append(q)
    if fixed or dropped:
        print("答案一致性处理：纠正 %d 题（以解析为准），剔除坏题 %d 题" % (fixed, dropped), file=sys.stderr)
    return out


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
    # ★用户 2026-10-08 23:52 死命令：不做「已有内容就跳过」的保护，每次生成一律直接覆盖重写
    #  （理由：自动生成的题质量太差、错误率高，宁可每轮重写也不要把旧的错误题留着）
    base_prompt = SPEC_TMPL.replace("{date}", DATE).replace(
        "{mat}", "\n".join("%d. %s" % (i + 1, m) for i, m in enumerate(mat)))
    # ★分段生成（v20261008l）：一次要「要点+金句+言语5+时政10」的整包太大，
    #   弱模型必然截断 → parse_json 救援也救不回来（10-07 连续两次失败即此因）。
    #   改为分段小请求，各自独立重试，最后拼装；某段失败不影响其它段。
    def gen_segment(field, want, tries=3, note=""):
        """只让模型输出某一个字段，输出量小 → 截断概率大幅下降。"""
        for t in range(tries):
            p = base_prompt + (
                "\n\n【本次只输出 %s 字段】只输出一个 JSON 对象，形如 {\"%s\": [...]}，"
                "其余字段（news/essay/verbal/quiz 中本次不要求的）一律不要输出，也不要任何说明文字。"
                "%s 恰好 %s 项。%s" % (field, field, field, want, note))
            if t > 0:
                p += "\n【上一次输出不是合法 JSON 或数量不足，请重新完整输出，不要截断、不要 markdown 围栏。】"
            try:
                obj = parse_json(call_ai(p))
                v = (obj or {}).get(field)
                if v:
                    return v
            except SystemExit as e:
                print("%s 第 %d 次生成失败：%s" % (field, t + 1, e), file=sys.stderr)
            except Exception as e:
                print("%s 第 %d 次异常：%s" % (field, t + 1, e), file=sys.stderr)
            time.sleep(5)
        return None

    news = gen_segment("news", 9)
    essay = gen_segment("essay", 1)
    verbal = gen_segment("verbal", 5)
    quiz = gen_segment("quiz", 10, note=(
        "★题型构成必须严格为 7 道单选 + 3 道多选：多选必须带 \"type\":\"multi\"，a 为 2-4 个字母"
        "（如 \"ABC\"），且必须同时有 \"multi\":\"ABC\" 字段与 a 完全相同；"
        "缺少多选或缺少 type/multi 字段视为本次失败，必须重写。"))
    # 兜底：多选不足 3 道时单独补生成多选题，最后规整为「7 单选 + 3 多选」
    def is_multi(q):
        return (q.get("type") == "multi") or bool(q.get("multi"))

    singles = [q for q in (quiz or []) if not is_multi(q)]
    multis = [q for q in (quiz or []) if is_multi(q)]
    if len(multis) < 3:
        need = 3 - len(multis)
        more = gen_segment("quiz", need, note=(
            "★本次全部输出【多选题】，共 %d 道：每题必须带 \"type\":\"multi\"，a 为 2-4 个字母（如 \"ABC\"），"
            "且必须有 \"multi\" 字段与 a 完全相同；四个选项必须各自是一句独立完整的知识表述。" % need))
        for q in (more or []):
            if is_multi(q):
                multis.append(q)
    quiz = singles[:7] + multis[:3]
    day = {"news": news or [], "essay": essay or {}, "verbal": verbal or [], "quiz": quiz or []}
    day["verbal"] = enforce_answers(day["verbal"])
    day["quiz"] = enforce_answers(day["quiz"])
    nv, nq = len(day["verbal"]), len(day["quiz"])
    nn = len(day["news"])
    if nv < 4 or nq < 8 or nn < 6:
        raise SystemExit("多次生成仍未通过数量校验（要点 %d / 言语 %d / 时政 %d），跳过写入（避免污染数据）"
                         % (nn, nv, nq))
    print("警告提示：要点 %d / 言语 %d / 时政 %d（标准 9/5/10，非标准则按原样写入）" % (nn, nv, nq), file=sys.stderr)
    day["date"] = DATE
    day["title"] = DATE + " 时政"
    day["generatedAt"] = int(time.time() * 1000)   # 每晚20:00自动版时间戳（前端灰色小字显示）
    merge_static(day)
    emit_day(day)
    print("生成完成：言语 %d 题 / 时政 %d 题 / 要点 %d 条" % (
        len(day.get("verbal") or []), len(day.get("quiz") or []), len(day.get("news") or [])))


if __name__ == "__main__":
    main()
