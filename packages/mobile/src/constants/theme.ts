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

import { Platform } from 'react-native';

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
  leaf: '#5EC16E',
  leafMist: '#E6F6EA',
  deepLeaf: '#1E7A3E',
  peachPop: '#FF6B9D',
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

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
