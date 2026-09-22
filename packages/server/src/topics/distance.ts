// 語ベクトル間の距離（純関数）。D1 にベクトル型は無いので JS で計算する。

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// コサイン距離（0=同一方向, 大きいほど遠い）。
export const cosineDistance = (a: Float32Array, b: Float32Array): number =>
  1 - cosine(a, b);
