# @wordninja/mobile

ワードニンジャ (ボードゲーム) のスマホアプリ。Expo + expo-router で iOS / Android / Web に対応する。

## 起動

ルートから実行する (`cd` しない):

```bash
pnpm --filter @wordninja/mobile start            # Expo dev server
pnpm --filter @wordninja/mobile start:tailscale  # 実機を Tailscale 経由で繋ぐ場合
pnpm --filter @wordninja/mobile ios              # iOS シミュレータ
pnpm --filter @wordninja/mobile web              # ブラウザ
```

検証:

```bash
pnpm --filter @wordninja/mobile typecheck
pnpm --filter @wordninja/mobile lint
```

## 構成

画面遷移はゲームのフェーズと 1:1 (`src/app/` の file-based routing):

| ルート | フェーズ |
|--------|---------|
| `/` | セットアップ (参加者・チーム数・お題) |
| `/assignment` | お題の受け渡し確認 (巻物をスワイプで開く) |
| `/playing` | 対面プレイ中 (経過時間の表示のみ) |
| `/result` | 結果発表 (お題とチーム分けの公開) |

- `src/features/game/` — ゲームのロジックと各フェーズの UI。state は `game-context.tsx` に集約
- `src/components/` — 見た目のみの共有コンポーネント (巻物・ボタンなど)
- `src/constants/theme.ts` — デザイントークン。スタイルの決まりは [STYLING.md](./STYLING.md) を参照

オンライン対戦用の質問-投票フロー (`playing-phase.tsx` と game-context 内の関連 state) は
現在未使用だが、オンライン実装時に復帰するため温存している。
