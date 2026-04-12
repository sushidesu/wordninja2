import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Fonts } from '@/constants/theme';

/**
 * 画面全体を包むフレーム。
 *
 * deviation の `.purple-border.page-border` + `.section-heading` を再現:
 *   - 画面全体を 3px の ink 色の矩形で囲う (固定額縁)
 *   - 左端に縦 90度回転のフェーズラベル (deviation の section-heading 相当)
 *   - 背景色は phase ごとに切り替え (カラーブロッキング)
 */

type Props = {
  children: React.ReactNode;
  backgroundColor: string;
  phaseLabel: string;
  frameColor?: string;
  labelColor?: string;
  /** 子要素のコンテナ追加スタイル。 */
  innerStyle?: ViewStyle;
};

const LABEL_BOX_WIDTH = 200;
const LABEL_BOX_HEIGHT = 20;

export function PhaseFrame({
  children,
  backgroundColor,
  phaseLabel,
  frameColor = Colors.ink,
  labelColor,
  innerStyle,
}: Props) {
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor }]} edges={['top', 'bottom']}>
      <View style={[styles.frame, { borderColor: frameColor, backgroundColor }]}>
        {/* 縦に立つ phase ラベル — Text を absolute 配置 + rotate(-90deg) */}
        <Text
          pointerEvents="none"
          numberOfLines={1}
          style={[
            styles.label,
            { color: labelColor ?? frameColor },
          ]}>
          {phaseLabel}
        </Text>

        <View style={[styles.inner, innerStyle]}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  frame: {
    flex: 1,
    borderWidth: 3,
    margin: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  /**
   * 縦ラベル配置の考え方:
   *  - 幅 200, 高 20 の Text を left=-80, top=100 に置く (unrotated bbox: -80..120, 100..120)
   *  - unrotated center ≈ (20, 110)
   *  - rotate(-90deg) は center を軸に回転 → 視覚 bbox は 20×200 で center 不変
   *  - 結果: x=10..30, y=10..210 の縦コラムに「PHASE 01 · SETUP」が読める
   *  - 長めのフレームでも左上近くに自然に収まる
   */
  label: {
    position: 'absolute',
    top: 100,
    left: -80,
    width: LABEL_BOX_WIDTH,
    height: LABEL_BOX_HEIGHT,
    fontFamily: Fonts.display,
    fontSize: 11,
    letterSpacing: 2,
    textAlign: 'center',
    transform: [{ rotate: '-90deg' }],
    zIndex: 2,
  },
  /** 縦ラベルの幅 (~30px) 分だけ内容に左 padding を足す */
  inner: {
    flex: 1,
    paddingLeft: 32,
    paddingRight: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
});
