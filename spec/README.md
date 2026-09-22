# ゲーム進行の形式モデル (Lean 4)

`packages/server` が権威として持つ部屋の状態・遷移・可視性の射影を Lean 4 で記述し、
壊れてはいけない性質を定理として固定している。**実装からは独立した検証専用のモデル**で、
ビルドにもデプロイにも関与しない。ここで証明した性質が実装の受け入れ条件になる。

- `WordNinja/Room.lean` … 状態 `Room` / 視点 `PlayerView` / 射影 `viewFor` / 遷移 `step`
- `WordNinja/Invariants.lean` … 証明した性質

## 検査する

```
lake build
```

Lean のバージョンは `lean-toolchain` に固定されている。elan が自動で合わせる
(未導入なら `curl https://elan.lean-lang.org/elan-init.sh -sSf | sh`)。
