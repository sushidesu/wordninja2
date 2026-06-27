import { Stack } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { kindLabels, type FontPairing } from '@/constants/font-catalog';
import { fontPairings, generatedRound } from '@/constants/font-pairings.generated';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

/**
 * フォント選定用プレビュー。学習で生成された `fontPairings` を番号付きで縦に積み、一括比較する。
 *
 * 良かった番号を伝えると `font-lab/generate.mjs` がフォント別スコアを更新し、次バッチを再生成する。
 * 本番の `Fonts` には触れない。候補が決まったら選んだペアの値を `theme.ts` に移す。
 * メタ情報(番号・名前・出自)は OS 標準フォントで描画し、候補フォントはサンプル本文だけに適用する
 * ことで、どの候補でもラベルが常に読める状態を保つ。
 */
export default function FontPreviewScreen() {
  const insets = useSafeAreaInsets();

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'フォントプレビュー' }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Spacing.lg, paddingBottom: insets.bottom + Spacing.xl5 },
        ]}>
        <View style={styles.column}>
          <Text style={styles.intro}>
            Round {generatedRound} ・ 全 {fontPairings.length} 候補{'\n'}
            良かった番号を伝えると学習して次の候補を出します。
          </Text>
          {fontPairings.map((pairing) => (
            <PairingCard key={pairing.id} pairing={pairing} />
          ))}
        </View>
      </ScrollView>
    </>
  );
}

function PairingCard({ pairing }: { pairing: FontPairing }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.numberBadge}>
          <Text style={styles.numberText}>{pairing.no}</Text>
        </View>
        <Text style={styles.cardTitle}>{pairing.name}</Text>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{kindLabels[pairing.kind]}</Text>
        </View>
      </View>

      {/* display: 見出し (HighlightHeading 相当の枠付き) */}
      <View style={styles.headingBox}>
        <Text style={[styles.heading, { fontFamily: pairing.display }]}>ワードニンジャ</Text>
      </View>

      {/* display: ボタン風ラベル */}
      <View style={styles.button}>
        <Text style={[styles.buttonText, { fontFamily: pairing.display }]}>ゲームを はじめる</Text>
      </View>

      {/* body: 本文 (通常 + 太字混在) */}
      <Text style={[styles.body, { fontFamily: pairing.body }]}>
        お題の単語を相手に当ててもらおう。
        <Text style={{ fontFamily: pairing.bodyBold }}>ヒントは3つまで</Text>
        、忍者のように的確に伝えるのがコツ。
      </Text>

      {/* body: グリフ網羅 */}
      <Text style={[styles.glyphs, { fontFamily: pairing.body }]}>
        あいうえお ｜ カタカナ ｜ 漢字熟語 ｜ ABCabc ｜ 0123
      </Text>

      <Text style={styles.footnote}>
        display: {pairing.display}
        {'\n'}
        body: {pairing.body} / {pairing.bodyBold}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl2,
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.xl3,
  },
  intro: {
    fontSize: 13,
    lineHeight: 20,
    color: Colors.inkSoft,
    textAlign: 'center',
  },
  card: {
    backgroundColor: Colors.paper,
    borderRadius: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.paperDeep,
    padding: Spacing.xl2,
    gap: Spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  numberBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: Spacing.xs,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    color: Colors.canvas,
    fontSize: 14,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink,
    flexShrink: 1,
    flexGrow: 1,
  },
  tag: {
    backgroundColor: Colors.heroSoft,
    borderRadius: Spacing.xl3,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  tagText: {
    fontSize: 11,
    color: Colors.flame,
  },
  headingBox: {
    borderWidth: 3,
    borderColor: Colors.ink,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  heading: {
    fontSize: 32,
    lineHeight: 38,
    color: Colors.ink,
    textAlign: 'center',
  },
  button: {
    backgroundColor: Colors.hero,
    borderRadius: Spacing.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 18,
    color: Colors.canvas,
  },
  body: {
    fontSize: 15,
    lineHeight: 24,
    color: Colors.ink,
  },
  glyphs: {
    fontSize: 15,
    lineHeight: 24,
    color: Colors.inkSoft,
  },
  footnote: {
    fontSize: 11,
    lineHeight: 16,
    color: Colors.inkMute,
  },
});
