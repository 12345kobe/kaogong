# -*- coding: utf-8 -*-
"""把 build/daily_hot_day.json（生成步骤产出）合并进 assets/data/daily_hot.js。

workflow 提交步骤在 `git fetch + git reset --hard origin/main` 之后调用本脚本，
因此永远基于最新远端文件修改 → 多个 run 排队执行也不会产生 rebase/push 冲突。
只写当天的键，历史日期原样保留。
"""
import json
import os
import sys

DAY_PATH = os.path.join("build", "daily_hot_day.json")
TARGET = os.path.join("assets", "data", "daily_hot.js")


def main():
    if not os.path.exists(DAY_PATH):
        raise SystemExit("缺少 %s（生成步骤未产出当日内容）" % DAY_PATH)
    with open(DAY_PATH, "r", encoding="utf-8") as f:
        day = json.load(f)
    date = day.get("date")
    if not date:
        raise SystemExit("当日内容缺少 date 字段")

    store = {}
    if os.path.exists(TARGET):
        try:
            txt = open(TARGET, "r", encoding="utf-8").read()
            a, b = txt.find("{"), txt.rfind("}")
            if a >= 0 and b > a:
                store = json.loads(txt[a:b + 1])
        except Exception as e:
            print("读取现有 daily_hot.js 失败（将重建）：%s" % e, file=sys.stderr)
            store = {}
    store[date] = day          # 只写今天，历史日期原样保留

    body = ("/* 每日时政热点（每晚 20:00 自动生成）· 静态兜底数据源\n"
            "   App 启动时与云端数据合并；云端未同步到也能看到当天内容。 */\n"
            "window.KG_DAILY_HOT = " + json.dumps(store, ensure_ascii=False, indent=1) + ";\n")
    with open(TARGET, "w", encoding="utf-8", newline="\n") as f:
        f.write(body)
    print("patch 完成：%s 现含 %d 天（本次写入 %s：言语 %d / 时政 %d）" % (
        TARGET, len(store), date,
        len(day.get("verbal") or []), len(day.get("quiz") or [])))


if __name__ == "__main__":
    main()
