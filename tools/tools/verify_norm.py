import json
for fn in ["essay_normwords.js", "essay_quotes.js"]:
    d = open('assets/data/'+fn, encoding='utf-8').read()
    i = d.index('=')
    j = d.index(';', i)
    data = json.loads(d[i+1:j])
    print("====", fn, "====")
    if isinstance(data, list):
        print("sections:", len(data), "total items:", sum(len(s['items']) for s in data))
        for sec in data[:4]:
            print("  --", sec['section'], "first term:", sec['items'][0]['term'], "| scene:", sec['items'][0]['scene'][:30])
    else:
        print("themes:", len(data), "total quotes:", sum(len(v) for v in data.values()))
        for k in list(data)[:3]:
            print("  --", k, "first:", data[k][0]['t'][:30], "| author:", data[k][0]['author'])
