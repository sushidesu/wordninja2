#!/usr/bin/env python3
"""生成ワークフローの投入ステップ（再利用）。
生成器LLMが作ったペア配列(JSON)を受け取り、既存 topics と重複するものを除いて
/api/topics に未評価で投入する。

使い方:
  python3 scripts/post-topics.py '[["A","B"],["C","D"]]' [base_url]
  echo '[["A","B"]]' | python3 scripts/post-topics.py - [base_url]
"""
import json, sys, urllib.request

args = [a for a in sys.argv[1:]]
raw = sys.stdin.read() if (args and args[0] == "-") else (args[0] if args else "[]")
BASE = args[1] if len(args) > 1 else "http://localhost:8788"

pairs = json.loads(raw)

def get(path):
    return json.loads(urllib.request.urlopen(BASE + path).read().decode())

def post(path, payload):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode(),
                                 headers={"content-type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req).read().decode())

existing = {frozenset(w["text"] for w in t["words"]) for t in get("/api/topics")}
fresh, dup = [], 0
for words in pairs:
    key = frozenset(words)
    if key in existing:
        dup += 1
        continue
    existing.add(key)
    fresh.append({"words": words, "source": "gen"})

if fresh:
    post("/api/topics", {"topics": fresh})
print(f"posted {len(fresh)} topics (skipped {dup} duplicates)")
