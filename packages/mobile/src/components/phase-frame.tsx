import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';

/**
 * 画面全体を包むフレーム。
 *
 * 画面全体を 3px の矩形で囲う (固定額縁) + 背景色を phase ごとに切り替え。
 */

type Props = {
  children: React.ReactNode;
  backgroundColor: string;
  frameColor?: string;
  innerStyle?: ViewStyle;
};

export function PhaseFrame({
  children,
  backgroundColor,
  frameColor,
  innerStyle,
}: Props) {
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor }]} edges={['top', 'bottom']}>
      <View style={[styles.frame, { borderColor: frameColor, backgroundColor }]}>
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
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
});
