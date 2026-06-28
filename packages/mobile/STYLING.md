# スタイルの仕組み (mobile)

UI のスタイルは「役割ベースのデザイントークン」を単一情報源にし、画面側には生の数値
(fontSize / 余白 / 色) を書かない。トークンは `src/constants/theme.ts` に集約。

## デザイントークン (`src/constants/theme.ts`)

| トークン | 用途 | 備考 |
|---------|------|------|
| `Colors` | 役割ベースの色 (`ink` / `canvas` / `paper` / `hero` / `danger` …) | hex は `palette` の中だけ。外からは役割名で参照 |
| `TeamColors` | チーム識別色 (赤/青/緑/黄) | ゲームロジック用の配列 |
| `Fonts` | フォントの3階層 | `title`=Dela Gothic One / `label`=M PLUS 1 Bold / `body`=M PLUS 1 (+`bodyMedium/Bold/Black`) / `mono` |
| `Type` | タイポグラフィ・スケール | 役割ごとに family+size+lineHeight+letterSpacing をまとめた8段。下記参照 |
| `Spacing` | 余白 (4pt グリッド) | `hairline(2) xs(4) sm(8) md(12) lg(16) xl(20) xl2(24) xl3(32) xl4(48) xl5(64)` |

### `Type` の役割
- title 系 (Dela): `hero`(52) / `h1`(40) / `h2`(32) / `h3`(24)
- label 系 (M PLUS 1 Bold): `labelLg`(20) / `label`(14) / `labelSm`(12)
- body 系 (M PLUS 1): `body`(16) / `bodySm`(14) / `caption`(12)
- 機能: `link` / `linkPrimary` / `code`

## テキストは `ThemedText` 経由で

`src/components/themed-text.tsx` が全テキストの入口。`type` で役割を選ぶと `Type` から
family/size/lineHeight/letterSpacing がまとまって決まる。**画面側に生の `fontSize`/`fontFamily`
を書かない。** `fontWeight` も使わない (custom font は family 自体が太さを持つため無効)。

```tsx
<ThemedText type="h2">お題</ThemedText>
<ThemedText type="bodySm" themeColor="inkSoft">補足テキスト</ThemedText>
```

`TextInput` など `ThemedText` を使えない要素だけ `Type.body` を直接参照する:
```tsx
<TextInput style={[Type.body, styles.input]} />
```

余白は必ず `Spacing` を使う (`padding: Spacing.md` 等)。width/height などレイアウト固有の寸法は
リズムではないので生値で良い。

## ボタンの仕組み: `PressBox`

ハードシャドウ＋「押すと影の位置へ沈み影が消える」触感は `src/components/ui/press-box.tsx`
に集約。`PrimaryButton` / `SecondaryButton` / プレイ中のボタン類、`SegmentedControl` の
ピル(選択中のみ `elevated`) がこれを使う。

```tsx
<PressBox onPress={fn} style={styles.surface}>...</PressBox>
```
- props: `onPress` / `disabled` / `offset`(=3) / `radius`(=0) / `shadowColor`(=ink) / `elevated`(=true) / `style`(面) / `containerStyle`(外側 Pressable, flex 等)
- 押下アニメは `onPressIn`/`onPressOut` ＋ reanimated。**インライン関数 style は使わない**(下記)。
- 影は「面と同サイズの View を `translate` で右下にずらし opacity をアニメ」。角丸の段差を避けるため
  カードは矩形寄り、`offset` は小さめ(3)。

その他のスタイル系コンポーネント:
- `HighlightHeading` — title 系ロールの枠付き見出し (deviationgame 風)。
- `TeamSizeSelector` — チーム数カード (比率バー・選択チェック・PressBox 相当の押下)。
- `MakimonoBox` — 巻物モチーフの枠。

## 落とし穴 ⚠️

**`Pressable` のインライン関数 style は iOS で適用されないことがある。**
この構成 (Expo SDK54 / React Compiler 有効) では
```tsx
// ❌ iOS で style が当たらず崩れることがある (Web では再現しない)
<Pressable style={({ pressed }) => [styles.btn, pressed && styles.dim]}>
```
押下フィードバックが要るときは **plain な object/array style** か、`onPressIn`/`onPressOut`＋
reanimated (= `PressBox` 方式) を使う。

```tsx
// ✅
<Pressable style={styles.btn}>            // フィードバック不要な小ボタン
<PressBox onPress={fn} style={styles.btn}> // 押下の沈み込みが要るボタン
```

## 表示確認 (iOS 固有崩れの検証)

Web では出ず iOS でのみ崩れる差がある。崩れは推測せず screenshot で確認する。手順は
開発メモ参照 (要約): `xcrun simctl boot` → `expo start --port 8083 --clear` →
`simctl openurl exp://127.0.0.1:8083` → `simctl io booted screenshot`。
反映されない時は Metro を `--clear` 再起動 (複数 Metro 同時起動はウォッチャ競合の元)。
