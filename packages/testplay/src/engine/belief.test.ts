// 信念(ベイズ更新・EIG・支持集合)の挙動テスト。実装詳細でなく
// 「観測に対して確率がどう動くべきか」を固定する。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Candidate } from '../types.ts'
import {
  LIKELIHOOD, MAX_SUPPORT, bayesUpdate, dedupeReadout, eig, historyConsistencyFactor, likelihood,
  mergeSupport, truncateSupport, wordParts,
} from './belief.ts'

const c = (word: string, prob: number): Candidate => ({ word, prob })

test('likelihood: 一致 > 曖昧予測 > 曖昧観測 > 明確な逆、逆でもゼロにはしない', () => {
  assert.equal(likelihood('はい', 'はい'), LIKELIHOOD.match)
  assert.equal(likelihood('部分的にそう', 'はい'), LIKELIHOOD.fuzzyPred, '曖昧予測は「どちらもあり得る」で矛盾ではない')
  assert.equal(likelihood('はい', '部分的にそう'), LIKELIHOOD.fuzzyObs)
  assert.equal(likelihood('はい', 'いいえ'), LIKELIHOOD.invert)
  assert.ok(LIKELIHOOD.fuzzyPred > LIKELIHOOD.fuzzyObs)
  assert.ok(LIKELIHOOD.invert > 0)
})

test('bayesUpdate: oracle 誤答1回で沈んでも、弁別観測1回で rank1 に回復できる', () => {
  const belief = [c('本命', 0.34), c('対抗', 0.33), c('他', 0.33)]
  // 本命だけ「はい」予想、観測は「いいえ」(oracle 誤答想定)→ 沈む
  bayesUpdate(belief, { 本命: 'はい', 対抗: 'いいえ', 他: 'いいえ' }, 'いいえ')
  const sunk = belief.find((x) => x.word === '本命')!.prob
  assert.ok(sunk > 0, 'ゼロにはならない')
  assert.ok(sunk < belief.find((x) => x.word === '対抗')!.prob, '整合した候補より下がる')
  // 本命だけを支持する観測が1回入れば首位に戻れる(誤答が致命傷にならない)
  bayesUpdate(belief, { 本命: 'はい', 対抗: 'いいえ', 他: 'いいえ' }, 'はい')
  const sorted = [...belief].sort((a, b) => b.prob - a.prob)
  assert.equal(sorted[0].word, '本命')
  assert.ok(sorted[0].prob > 0.3)
})

test('bayesUpdate: 予想が無い語は「わからない」扱い(中間の尤度)', () => {
  const belief = [c('a', 0.5), c('b', 0.5)]
  bayesUpdate(belief, { a: 'はい' }, 'はい')
  assert.ok(belief.find((x) => x.word === 'a')!.prob > belief.find((x) => x.word === 'b')!.prob)
  assert.ok(belief.find((x) => x.word === 'b')!.prob > 0)
})

test('mergeSupport: 既存語の事後は保持、新出語は中央値で参入、棄却語は復活しない', () => {
  const belief = [c('強', 0.6), c('中', 0.3), c('弱', 0.1)]
  const merged = mergeSupport(belief, [c('新', 0.9), c('棄', 0.9)], new Set(['棄']))
  const words = merged.map((x) => x.word)
  assert.ok(words.includes('新') && !words.includes('棄'))
  const strong = merged.find((x) => x.word === '強')!
  const fresh = merged.find((x) => x.word === '新')!
  const weak = merged.find((x) => x.word === '弱')!
  assert.ok(strong.prob > fresh.prob, 'LLM 申告確率(0.9)ではなく中央値で入る')
  assert.ok(fresh.prob > weak.prob, '最弱の既存語よりは上(floor 参入だと切り詰めで即死する)')
})

test('mergeSupport: 初手(信念が空)は LLM のもっともらしさを事前として使う', () => {
  const merged = mergeSupport([], [c('a', 0.6), c('b', 0.4)], new Set())
  assert.ok(merged.find((x) => x.word === 'a')!.prob > merged.find((x) => x.word === 'b')!.prob)
})

test('truncateSupport: 上位 MAX_SUPPORT に切り詰めて正規化する', () => {
  const many = Array.from({ length: 20 }, (_, i) => c('w' + i, (20 - i) / 210))
  const cut = truncateSupport(many)
  assert.equal(cut.length, MAX_SUPPORT)
  assert.ok(Math.abs(cut.reduce((a, x) => a + x.prob, 0) - 1) < 1e-9)
  assert.equal(cut[0].word, 'w0')
})

test('historyConsistencyFactor: 明確な はい↔いいえ の矛盾だけを罰する(矛盾フィルタ)', () => {
  assert.equal(historyConsistencyFactor([{ pred: 'はい', obs: 'はい' }, { pred: 'いいえ', obs: 'いいえ' }]), 1)
  const oneMiss = historyConsistencyFactor([{ pred: 'はい', obs: 'いいえ' }])
  assert.ok(Math.abs(oneMiss - LIKELIHOOD.invert / LIKELIHOOD.match) < 1e-9)
  // 曖昧・欠落は証拠なし = 罰しない(罰すると観測数ぶん累積し新出語が参入前に死ぬ)
  assert.equal(historyConsistencyFactor([{ obs: 'はい' }]), 1)
  assert.equal(historyConsistencyFactor([{ pred: 'わからない', obs: 'はい' }]), 1)
  assert.equal(historyConsistencyFactor([{ pred: '部分的にそう', obs: 'いいえ' }]), 1)
  assert.equal(historyConsistencyFactor([{ pred: 'はい', obs: '部分的にそう' }]), 1)
})

test('wordParts: 括弧の補足を除去し、併記を分割する', () => {
  assert.deepEqual(wordParts('カフェ・喫茶店'), ['カフェ', '喫茶店'])
  assert.deepEqual(wordParts('マッサージ店(整体・リラクゼーション)'), ['マッサージ店'])
  assert.deepEqual(wordParts('病院(クリニック)'), ['病院'])
  assert.deepEqual(wordParts('ネットカフェ'), ['ネットカフェ'])
})

test('mergeSupport: 表記ゆれの提案は既存候補に吸収され、質量が分裂しない', () => {
  const belief = [c('カフェ', 0.5), c('病院', 0.5)]
  const merged = mergeSupport(belief, [c('カフェ・喫茶店', 0.3), c('病院(クリニック)', 0.3), c('ネットカフェ', 0.2)], new Set())
  const words = merged.map((x) => x.word).sort()
  assert.deepEqual(words, ['カフェ', 'ネットカフェ', '病院'], '併記・括弧つきは既存に吸収、別概念は残る')
})

test('mergeSupport: 併記の新規語は先頭の部品を正準形として追加、棄却は部品単位で効く', () => {
  const merged = mergeSupport([c('駅', 0.6), c('公園', 0.4)], [c('銭湯・スーパー銭湯', 0.5), c('温泉・銭湯', 0.5)], new Set())
  const words = merged.map((x) => x.word)
  assert.ok(words.includes('銭湯'), '先頭部品が正準形')
  assert.ok(!words.includes('温泉・銭湯') && !words.includes('温泉'), '2件目は部品「銭湯」既知のため吸収')
  const rejected = mergeSupport([c('駅', 1)], [c('カフェ・喫茶店', 0.5)], new Set(['カフェ']))
  assert.ok(!rejected.some((x) => /カフェ/.test(x.word)), '棄却語を含む併記は復活しない')
})

test('dedupeReadout: 表記ゆれを統合して確率合算・棄却除外・正規化・降順', () => {
  const out = dedupeReadout(
    [c('カフェ', 0.3), c('カフェ・喫茶店', 0.2), c('銭湯(スーパー銭湯)', 0.3), c('外れ', 0.2)],
    new Set(['外れ']),
  )
  assert.deepEqual(out.map((x) => x.word), ['カフェ', '銭湯'])
  assert.ok(Math.abs(out[0].prob - 0.5 / 0.8) < 1e-9, '同一概念の確率は合算して正規化')
})

test('eig: 候補を均等に二分する質問は、全候補が同じ答えの質問より情報利得が高い', () => {
  const cands = [c('a', 0.25), c('b', 0.25), c('x', 0.25), c('y', 0.25)]
  const split = eig({ a: 'はい', b: 'はい', x: 'いいえ', y: 'いいえ' }, cands)
  const useless = eig({ a: 'はい', b: 'はい', x: 'はい', y: 'はい' }, cands)
  assert.ok(split > useless)
  assert.ok(Math.abs(split - 1) < 1e-9, '均等二分は1ビット')
  assert.equal(useless, 0)
})
