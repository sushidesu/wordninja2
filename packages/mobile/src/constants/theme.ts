/**
 * アプリのテーマ定義。
 *
 * このファイルは色の「単一情報源」。生の hex 値は `palette` の中だけに存在し、
 * アプリのコードからは役割ベースのトークン (`Colors.canvas`, `Colors.hero` ...) だけを参照する。
 * 色を差し替えたいときは palette の値を変えれば、参照側の意味付けを壊さずに見た目だけ変わる。
 *
 * Theme: "Leaf Pop" — 白キャンバスにグリーンを主役、ピンクを一点挿しにしたキュートな配色。
 */

import '@/global.css';

import { Platform, type TextStyle } from 'react-native';

// ---- palette: hex を持つ唯一の場所。内部専用。外からは export しない。 ----
const palette = {
  white: '#FFFFFF',
  neutral50: '#F9FAFB',
  neutral100: '#F3F4F6',
  neutral200: '#E5E7EB',
  neutral300: '#D1D5DB',
  neutral400: '#9CA3AF',
  neutral500: '#6B7280',
  forestInk: '#102820',
  leaf: '#0EBCAA',
  leafMist: '#E6F6EA',
  deepLeaf: '#1E7A3E',
  peachPop: '#009E88',
  coralRed: '#FF5252',
  inkOverlay: 'rgba(16, 40, 32, 0.33)',
  // チーム識別用 (テーマとは独立した「各チームのシンボルカラー」)
  teamRed: '#DC2626',
  teamBlue: '#2563EB',
  teamGreen: '#16A34A',
  teamYellow: '#CA8A04',
} as const;

// ---- 役割ベースの公開トークン。アプリコードはこれだけを触る。 ----
export const Colors = {
  // ---- 構造 (面) ----
  /** 最も広い背景。清潔な下地。 */
  canvas: palette.white,
  /** 二番目の面。カード/入力フォーム/サブセクション。 */
  paper: palette.neutral50,
  /** 枠線・区切り。paper よりほんの少し濃い。 */
  paperDeep: palette.neutral200,
  /** より強い枠・無効状態などに使う。 */
  paperStrong: palette.neutral300,

  // ---- 文字 ----
  /** 全テキストの主役 (ほぼ全ての見出し・本文)。黒ではなく深い森色。 */
  ink: palette.forestInk,
  /** 補助テキスト。ラベル・説明文・メタ情報。 */
  inkSoft: palette.neutral500,
  /** さらに弱い文字。placeholder など。 */
  inkMute: palette.neutral400,

  // ---- アクセント ----
  /** 主役アクセント。primary ボタン面、active 状態、成功。 */
  hero: palette.leaf,
  /** hero の薄い面。pill 背景・hover tint・celebratory bg。 */
  heroSoft: palette.leafMist,
  /** hero の深いバージョン。強調文字・深緑の差し色。 */
  flame: palette.deepLeaf,
  /** サプライズ一点挿し。タイトルアクセント、決めの瞬間。 */
  spark: palette.peachPop,

  // ---- 機能色 ----
  /** 成功 (= hero を兼用)。 */
  success: palette.leaf,
  /** 破壊的/失敗。削除ボタン、投票の「いいえ」結果など。 */
  danger: palette.coralRed,
  /** 半透明の濃い overlay (on-image バッジ背景など)。 */
  overlay: palette.inkOverlay,

  // ---- 旧 API 互換 (既存 ThemedText/ThemedView が参照するキー) ----
  // 新しい役割トークンへのエイリアス。新規コードでは ink/inkSoft/canvas/paper を使う。
  text: palette.forestInk,
  textSecondary: palette.neutral500,
  background: palette.white,
  backgroundElement: palette.neutral50,
  backgroundSelected: palette.neutral200,
} as const;

/**
 * チーム識別色。ゲームロジック用の配列なので `Colors` 本体とは別口で公開する。
 * テーマ色の置き換え対象ではなく「各チームのシンボル」なので基本触らない。
 */
export const TeamColors = [
  palette.teamRed,
  palette.teamBlue,
  palette.teamGreen,
  palette.teamYellow,
] as const;

export type ThemeColor = Exclude<keyof typeof Colors, never>;

/**
 * 役割ベースのフォントトークン (3階層)。
 * title = 極太ディスプレイ (Dela Gothic One)。大見出し・お題・名前など 28px〜のインパクト文字。
 * label = 角ゴシック太字 (M PLUS 1 Bold)。ボタン・ラベル・バッジなど中小サイズの UI 文字。
 * body  = 角ゴシック (M PLUS 1)。本文・入力・段落。label と同 family を太さで使い分ける。
 *
 * title を小サイズに使うと極太で潰れるため、display/body の2分割をやめて title/label/body に分けた。
 */
export const Fonts = {
  /** 大見出し・お題・プレイヤー名など、インパクト重視の大きな文字 (28px〜)。 */
  title: 'DelaGothicOne_400Regular',
  /** ボタン・ラベル・バッジなど中小サイズの UI 文字。読みやすさ重視の角ゴシック太字。 */
  label: 'MPLUS1_700Bold',
  /** 本文・段落・入力値・補助ラベル。 */
  body: 'MPLUS1_400Regular',
  bodyMedium: 'MPLUS1_500Medium',
  bodyBold: 'MPLUS1_700Bold',
  bodyBlack: 'MPLUS1_900Black',
  /** 旧 API 互換: コード表示など数値系。 */
  mono: Platform.select({
    ios: 'ui-monospace',
    android: 'monospace',
    default: 'monospace',
  }),
} as const;

/**
 * タイポグラフィの単一情報源。役割ごとに family/size/lineHeight/letterSpacing をまとめた8段スケール。
 *
 * テキストは原則 `ThemedText`（`<ThemedText type="...">`）経由で使う。`ThemedText` が扱えない
 * `TextInput` などの例外だけ `Type.body` のようにここから直接参照する。画面側に生の fontSize/fontFamily
 * を書かない。fontWeight は使わない（family 自体が太さを持つ custom font では無効）。
 */
export const Type = {
  // ---- title (Dela Gothic One) ----
  hero: { fontFamily: Fonts.title, fontSize: 52, lineHeight: 56 },
  h1: { fontFamily: Fonts.title, fontSize: 40, lineHeight: 44 },
  h2: { fontFamily: Fonts.title, fontSize: 32, lineHeight: 36 },
  h3: { fontFamily: Fonts.title, fontSize: 24, lineHeight: 28 },
  // ---- label (M PLUS 1 Bold) ----
  labelLg: { fontFamily: Fonts.label, fontSize: 20, lineHeight: 24, letterSpacing: 1 },
  label: { fontFamily: Fonts.label, fontSize: 14, lineHeight: 20, letterSpacing: 1 },
  labelSm: { fontFamily: Fonts.label, fontSize: 12, lineHeight: 16, letterSpacing: 1 },
  // ---- body (M PLUS 1) ----
  body: { fontFamily: Fonts.body, fontSize: 16, lineHeight: 24 },
  bodySm: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 16 },
  // ---- 機能 ----
  link: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  linkPrimary: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  code: { fontFamily: Fonts.mono, fontSize: 12, lineHeight: 16 },
} satisfies Record<string, TextStyle>;

/**
 * 余白の単一情報源。4pt グリッドの規則的なスケール。
 * 余白 (padding/margin/gap) は必ずこのトークンを使い、画面側に生の数値を書かない。
 * width/height など「レイアウト固有の寸法」はリズムではないので対象外 (生値のままでよい)。
 */
export const Spacing = {
  hairline: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xl2: 24,
  xl3: 32,
  xl4: 48,
  xl5: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
