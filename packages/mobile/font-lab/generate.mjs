// フォント組み合わせの学習＆生成スクリプト。
//
// 使い方:
//   node packages/mobile/font-lab/generate.mjs                 # 初回バッチ生成
//   node packages/mobile/font-lab/generate.mjs --liked 3,7,11  # 前バッチの good を反映して次バッチ生成
//
// 仕組み: 組み合わせ単位ではなく「フォント1つ1つの好まれ度」を学習する。
// 各フォントの評価を Beta 分布で持ち、Thompson sampling でスコアをサンプリングして並べる。
// これにより「学習で良い display × 良い body」を選びつつ (exploit)、評価の浅いフォントも
// たまに高く出て探索される (explore)。さらに純ランダム枠で未知の組み合わせを必ず混ぜる。
//
// 1 バッチ = ANCHOR(過去の高評価を再掲) + LEARNED(学習で上位) + RANDOM(純ランダム)。

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const POOL_PATH = path.join(__dirname, 'pool.json');
const FEEDBACK_PATH = path.join(__dirname, 'feedback.json');
const OUT_PATH = path.join(__dirname, '..', 'src', 'constants', 'font-pairings.generated.ts');

// ---- バッチ構成 ----
const BATCH = 12;
const ANCHORS = 2; // 過去の高評価を再掲する枠
const RANDOM = 3; // 純ランダム探索枠
// 残り (BATCH - 実アンカー数 - RANDOM) が学習枠。

// 1バッチ内で同じフォントに偏らないための上限 (見比べの多様性を担保)。
const MAX_PER_DISPLAY = 2;
const MAX_PER_BODY = 2;

// ---- 乱数ユーティリティ (Thompson sampling 用) ----
function normal() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Gamma(k, 1) サンプリング (Marsaglia–Tsang)。
function gamma(k) {
  if (k < 1) return gamma(k + 1) * Math.pow(Math.random(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let x;
    let v;
    do {
      x = normal();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

// Beta(a, b) サンプリング。
function betaSample(a, b) {
  const x = gamma(a);
  const y = gamma(b);
  return x / (x + y);
}

// 1フォントの評価をサンプリング。like=liked, miss=shown-liked。+1 は Laplace 平滑化 (事前=一様)。
function sampleScore(s) {
  return betaSample(s.liked + 1, s.shown - s.liked + 1);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---- 読み込み ----
const pool = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
const fb = fs.existsSync(FEEDBACK_PATH)
  ? JSON.parse(fs.readFileSync(FEEDBACK_PATH, 'utf8'))
  : { round: 0, displayStats: {}, bodyStats: {}, likedHistory: [], shownCombos: [], currentBatch: [] };

const stat = (map, key) => (map[key] ??= { shown: 0, liked: 0 });
const comboKey = (d, b) => `${d}|${b}`;

// ---- --liked 引数のパース ----
const likedArg = process.argv.find((a) => a === '--liked' || a.startsWith('--liked='));
let likedNos = [];
if (likedArg) {
  const raw = likedArg.includes('=')
    ? likedArg.split('=')[1]
    : process.argv[process.argv.indexOf(likedArg) + 1];
  likedNos = (raw ?? '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n));
}

// ---- 1) 前バッチへのフィードバック反映 ----
if (fb.currentBatch?.length) {
  const likedSet = new Set(likedNos);
  for (const item of fb.currentBatch) {
    // アンカーは「再掲」なので shown を増やさない (高評価フォントが再表示で不利にならないように)。
    if (item.kind !== 'anchor') {
      stat(fb.displayStats, item.display).shown++;
      stat(fb.bodyStats, item.body).shown++;
    }
    if (likedSet.has(item.no)) {
      stat(fb.displayStats, item.display).liked++;
      stat(fb.bodyStats, item.body).liked++;
      fb.likedHistory.push({ display: item.display, body: item.body, round: fb.round });
    }
  }
}

// ---- 2) フォント別スコアをサンプリング ----
const dispSample = {};
for (const d of pool.display) dispSample[d.key] = sampleScore(stat(fb.displayStats, d.key));
const bodySample = {};
for (const b of pool.body) bodySample[b.regular] = sampleScore(stat(fb.bodyStats, b.regular));

// ---- 補助テーブル ----
const labelOf = {};
for (const d of pool.display) labelOf[d.key] = d.label;
for (const b of pool.body) labelOf[b.regular] = b.label;
const bodyByReg = {};
for (const b of pool.body) bodyByReg[b.regular] = b;

// ---- 3) バッチ組み立て ----
const shownSet = new Set(fb.shownCombos);
const used = new Set();
const dispCount = {};
const bodyCount = {};
const batch = [];

// ignoreCaps: アンカーや探索空間枯渇時のフォールバックでは多様性上限を無視する。
function pushCombo(display, bodyReg, kind, ignoreCaps = false) {
  const key = comboKey(display, bodyReg);
  if (used.has(key)) return false;
  if (
    !ignoreCaps &&
    ((dispCount[display] ?? 0) >= MAX_PER_DISPLAY || (bodyCount[bodyReg] ?? 0) >= MAX_PER_BODY)
  ) {
    return false;
  }
  used.add(key);
  dispCount[display] = (dispCount[display] ?? 0) + 1;
  bodyCount[bodyReg] = (bodyCount[bodyReg] ?? 0) + 1;
  const b = bodyByReg[bodyReg];
  batch.push({
    display,
    body: bodyReg,
    bodyBold: b.bold,
    kind,
    name: `${labelOf[display]} × ${b.label}`,
  });
  return true;
}

// (a) アンカー: like 回数が多い組み合わせを再掲。
const likedCount = {};
for (const h of fb.likedHistory) {
  const k = comboKey(h.display, h.body);
  likedCount[k] = (likedCount[k] ?? 0) + 1;
}
const topLiked = Object.entries(likedCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, ANCHORS);
for (const [k] of topLiked) {
  const [d, bReg] = k.split('|');
  pushCombo(d, bReg, 'anchor', true);
}

// (b) 学習枠: 未表示の組み合わせを (dispSample + bodySample) で並べて上位から。
const candidates = [];
for (const d of pool.display) {
  for (const b of pool.body) {
    const k = comboKey(d.key, b.regular);
    if (shownSet.has(k) || used.has(k)) continue;
    candidates.push({ d: d.key, b: b.regular, score: dispSample[d.key] + bodySample[b.regular] });
  }
}
candidates.sort((x, y) => y.score - x.score);
const learnedTarget = BATCH - batch.length - RANDOM;
for (const c of candidates) {
  if (batch.filter((x) => x.kind === 'learned').length >= learnedTarget) break;
  pushCombo(c.d, c.b, 'learned');
}

// (c) ランダム枠: 残りの未表示から一様ランダム。
const remaining = [];
for (const d of pool.display) {
  for (const b of pool.body) {
    const k = comboKey(d.key, b.regular);
    if (shownSet.has(k) || used.has(k)) continue;
    remaining.push({ d: d.key, b: b.regular });
  }
}
shuffle(remaining);
for (const c of remaining) {
  if (batch.length >= BATCH) break;
  pushCombo(c.d, c.b, 'random');
}

// (d) 探索空間を使い切った場合のフォールバック: 未使用の全組み合わせから補充。
if (batch.length < BATCH) {
  const all = [];
  for (const d of pool.display) {
    for (const b of pool.body) {
      const k = comboKey(d.key, b.regular);
      if (!used.has(k)) all.push({ d: d.key, b: b.regular });
    }
  }
  shuffle(all);
  for (const c of all) {
    if (batch.length >= BATCH) break;
    pushCombo(c.d, c.b, 'random', true);
  }
}

// ---- 4) 採番 & 状態更新 ----
fb.round++;
const numbered = batch.map((it, i) => ({ no: i + 1, ...it }));
for (const it of numbered) {
  const k = comboKey(it.display, it.body);
  if (!shownSet.has(k)) fb.shownCombos.push(k);
}
fb.currentBatch = numbered.map((it) => ({
  no: it.no,
  display: it.display,
  body: it.body,
  kind: it.kind,
}));

// ---- 5) 出力 ----
const rows = numbered.map((it) => {
  const id = `${it.display}__${it.body}`;
  return (
    `  { no: ${it.no}, id: ${JSON.stringify(id)}, name: ${JSON.stringify(it.name)}, ` +
    `display: ${JSON.stringify(it.display)}, body: ${JSON.stringify(it.body)}, ` +
    `bodyBold: ${JSON.stringify(it.bodyBold)}, kind: ${JSON.stringify(it.kind)} },`
  );
});
const out =
  `// AUTO-GENERATED by font-lab/generate.mjs — 直接編集しない。\n` +
  `// round ${fb.round} / ${numbered.length} combos\n` +
  `import type { FontPairing } from './font-catalog';\n\n` +
  `export const generatedRound = ${fb.round};\n\n` +
  `export const fontPairings: readonly FontPairing[] = [\n${rows.join('\n')}\n];\n`;

fs.writeFileSync(OUT_PATH, out);
fs.writeFileSync(FEEDBACK_PATH, JSON.stringify(fb, null, 2));

// ---- ログ ----
const counts = numbered.reduce((acc, it) => ((acc[it.kind] = (acc[it.kind] ?? 0) + 1), acc), {});
console.log(`round ${fb.round} generated (liked applied: ${likedNos.join(',') || 'none'})`);
console.log(`  kinds: anchor=${counts.anchor ?? 0} learned=${counts.learned ?? 0} random=${counts.random ?? 0}`);
for (const it of numbered) {
  console.log(`  #${String(it.no).padStart(2)} [${it.kind.padEnd(7)}] ${it.name}`);
}
