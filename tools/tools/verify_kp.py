import json, re
d = open('assets/data/common_kp.js', encoding='utf-8').read()
# extract the JSON array after the first '='
i = d.index('=')
j = d.index(';', i)
arr = json.loads(d[i+1:j])
print('total items:', len(arr))
print('sample[0]:', arr[0])
print('sample[-1]:', arr[-1])
# check unique ids
ids = [a['id'] for a in arr]
print('unique ids:', len(set(ids)))
# check no empty
empties = [a for a in arr if not a['prompt'] or not a['answer']]
print('empties:', len(empties))
# distribution of prompt length
lens = [len(a['prompt']) for a in arr]
print('prompt len min/max/avg:', min(lens), max(lens), sum(lens)//len(lens))
