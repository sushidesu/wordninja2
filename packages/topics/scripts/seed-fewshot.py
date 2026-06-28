#!/usr/bin/env python3
"""事例集（人ラベル付きペア）を DB に投入する。docs/odai-rubric-v4.md の蓄積ラベルが出典。
旧 verdict は 5段階評点へ移行（good→5, close→4, 却下→2）。却下理由は reason(自由文)に残す。
使い方: wrangler dev 起動中に  python3 scripts/seed-fewshot.py [base_url]
"""
import json, sys, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8788"

# (rating, reason) -> [ペア...]
GROUPS = [
    (5, None, [["ペンギン","ダチョウ"],["医者","消防士"],["桜","ひまわり"],["お城","灯台"],["自転車","ヘリコプター"],["ろうそく","氷"],["雪だるま","かかし"]]),
    (4, None, [["風船","潜水艦"],["納豆","ヨーグルト"],["筆","クレヨン"],["井戸","噴水"],["ラクダ","サボテン"],["ピアノ","ハープ"],["卓球","ボクシング"],["傘","手袋"]]),
    (2, "近すぎ", [["うどん","パスタ"],["馬","ラクダ"],["雪","雨"],["金槌","のこぎり"],["サメ","タコ"],["カエル","ヘビ"],["蜘蛛","ムカデ"],["亀","ワニ"],["風鈴","鈴"],["竹","タケノコ"],["飛行機","船"]]),
    (2, "予測可能", [["時計","カレンダー"],["鍵","パスワード"],["カタツムリ","ヤドカリ"],["ヨット","いかだ"],["うちわ","扇風機"],["ハチミツ","メープルシロップ"],["蛍","街灯"],["年輪","地層"]]),
    (2, "平凡", [["砂時計","ダム"],["森","砂漠"]]),
    (2, "遠すぎ", [["指紋","雪の結晶"],["磁石","人気者"],["こだま","ブーメラン"],["鏡","湖"],["竹馬","ハイヒール"]]),
    (2, "意味不明", [["種","アイデア"],["カメレオン","信号機"],["ストロー","象の鼻"],["凧","紙飛行機"],["カバ","ペリカン"]]),
]

def post(path, payload):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode(),
                                 headers={"content-type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req).read().decode())

n = 0
for rating, reason, pairs in GROUPS:
    for words in pairs:
        tid = post("/api/topics", {"words": words, "source": "seed"})["ids"][0]
        post("/api/evaluations", {"topicId": tid, "evaluator": "human", "rating": rating, "reason": reason})
        n += 1
print(f"seeded {n} topics with human evaluations (5段階)")
