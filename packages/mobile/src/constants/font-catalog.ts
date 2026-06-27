/**
 * フォント選定システムの安定部分（手書き）。
 *
 * - `fontAssets`: `expo-font` の `useFonts` に渡すアセットマップ。候補プールの全フォントを起動時にロードする。
 * - 型と `kindLabels`: プレビュー画面と自動生成ファイルが共有する契約。
 *
 * 実際の「今表示する組み合わせ」は `font-lab/generate.mjs` が学習結果から `font-pairings.generated.ts`
 * に書き出す。プールのメタデータ（候補フォント・ラベル・bold マッピング）は `font-lab/pool.json` が単一情報源。
 * ここの `fontAssets` のキー集合は pool.json のキーと一致している必要がある。
 */

// ---- display 候補 (すべて 400 のみ) ----
import { DotGothic16_400Regular } from '@expo-google-fonts/dotgothic16';
import { Stick_400Regular } from '@expo-google-fonts/stick';
import { ReggaeOne_400Regular } from '@expo-google-fonts/reggae-one';
import { RampartOne_400Regular } from '@expo-google-fonts/rampart-one';
import { TrainOne_400Regular } from '@expo-google-fonts/train-one';
import { DelaGothicOne_400Regular } from '@expo-google-fonts/dela-gothic-one';
import { MochiyPopOne_400Regular } from '@expo-google-fonts/mochiy-pop-one';
import { MochiyPopPOne_400Regular } from '@expo-google-fonts/mochiy-pop-p-one';
import { HachiMaruPop_400Regular } from '@expo-google-fonts/hachi-maru-pop';
import { YuseiMagic_400Regular } from '@expo-google-fonts/yusei-magic';
// ---- body 候補 (regular + bold) ----
import {
  ZenKakuGothicNew_400Regular,
  ZenKakuGothicNew_700Bold,
} from '@expo-google-fonts/zen-kaku-gothic-new';
import { NotoSansJP_400Regular, NotoSansJP_700Bold } from '@expo-google-fonts/noto-sans-jp';
import { MPLUS1_400Regular, MPLUS1_700Bold } from '@expo-google-fonts/m-plus-1';
import {
  MPLUSRounded1c_400Regular,
  MPLUSRounded1c_700Bold,
} from '@expo-google-fonts/m-plus-rounded-1c';
import { ZenMaruGothic_400Regular, ZenMaruGothic_700Bold } from '@expo-google-fonts/zen-maru-gothic';
import { Murecho_400Regular, Murecho_700Bold } from '@expo-google-fonts/murecho';
// Klee One は 700 を持たないので 600(SemiBold) を bold として使う。
import { KleeOne_400Regular, KleeOne_600SemiBold } from '@expo-google-fonts/klee-one';

/**
 * `useFonts` に渡すアセットマップ。キー名がそのまま `fontFamily` になる。
 * ここに列挙したフォントだけが候補プール (`font-lab/pool.json`) から参照できる。
 */
export const fontAssets = {
  DotGothic16_400Regular,
  Stick_400Regular,
  ReggaeOne_400Regular,
  RampartOne_400Regular,
  TrainOne_400Regular,
  DelaGothicOne_400Regular,
  MochiyPopOne_400Regular,
  MochiyPopPOne_400Regular,
  HachiMaruPop_400Regular,
  YuseiMagic_400Regular,
  ZenKakuGothicNew_400Regular,
  ZenKakuGothicNew_700Bold,
  NotoSansJP_400Regular,
  NotoSansJP_700Bold,
  MPLUS1_400Regular,
  MPLUS1_700Bold,
  MPLUSRounded1c_400Regular,
  MPLUSRounded1c_700Bold,
  ZenMaruGothic_400Regular,
  ZenMaruGothic_700Bold,
  Murecho_400Regular,
  Murecho_700Bold,
  KleeOne_400Regular,
  KleeOne_600SemiBold,
} as const;

export type FontFamily = keyof typeof fontAssets;

/** 組み合わせの出自。学習の仕組みをユーザーに見せるためのラベル付けにも使う。 */
export type PairingKind = 'anchor' | 'learned' | 'random';

export const kindLabels: Record<PairingKind, string> = {
  anchor: '★ 高評価',
  learned: '学習',
  random: 'ランダム',
};

export type FontPairing = {
  /** プレビュー上の表示番号。フィードバックはこの番号で行う。 */
  no: number;
  /** 安定した識別子 (display__body)。 */
  id: string;
  /** 表示名 (例「DotGothic16 × Murecho」)。 */
  name: string;
  /** 見出し・ボタンに使う display フォント。 */
  display: FontFamily;
  /** 本文の通常ウェイト。 */
  body: FontFamily;
  /** 本文の太字ウェイト。 */
  bodyBold: FontFamily;
  /** この組み合わせがどう選ばれたか。 */
  kind: PairingKind;
};
