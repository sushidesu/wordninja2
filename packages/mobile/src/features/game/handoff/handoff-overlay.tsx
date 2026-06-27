import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';

/**
 * 端末の受け渡し（次の人へ渡す）トランジション。横スライド。
 *
 * マウント → 墨幕が右から滑り込んで全画面を覆う → 「○○ さんに渡してください/タップ」→
 * タップで墨幕が左へ抜けて次の人の画面を公開。
 *
 * progress: 0 = 覆う前(右に退避) / 1 = 完全に覆う / 2 = 公開後(左に退避)。
 * onCovered: 完全に覆った瞬間（裏で次の内容に差し替えてよい）。onComplete: 公開アニメ完了（アンマウント可）。
 */
const COVER_MS = 300;
const REVEAL_MS = 340;

type Props = {
  nextName: string;
  onCovered: () => void;
  onComplete: () => void;
};

export function HandoffOverlay({ nextName, onCovered, onComplete }: Props) {
  const { width } = useWindowDimensions();
  const progress = useSharedValue(0);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    progress.value = withTiming(
      1,
      { duration: COVER_MS, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(handleCovered)();
      },
    );
    // マウント時に1回だけ覆うアニメを再生する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCovered = () => {
    onCovered();
    setWaiting(true);
  };

  const handleTap = () => {
    if (!waiting) return;
    setWaiting(false);
    progress.value = withTiming(
      2,
      { duration: REVEAL_MS, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onComplete)();
      },
    );
  };

  const panelStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1, 2], [width, 0, -width], Extrapolation.CLAMP) },
    ],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.4, 1, 1.6], [0, 1, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.fill} onPress={handleTap} disabled={!waiting}>
        <Animated.View style={[styles.panel, panelStyle]} />
        <View style={styles.center} pointerEvents="none">
          <Animated.View style={[styles.textWrap, textStyle]}>
            <ThemedText type="labelSm" themeColor="canvas">
              NEXT
            </ThemedText>
            <ThemedText type="h2" themeColor="canvas" style={styles.name}>
              {nextName}
            </ThemedText>
            <ThemedText type="label" themeColor="canvas">
              さんに渡してください
            </ThemedText>
            <ThemedText type="labelSm" themeColor="canvas" style={styles.tapHint}>
              タップして始める
            </ThemedText>
          </Animated.View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  panel: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.ink,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl2,
  },
  name: {
    marginVertical: Spacing.sm,
  },
  tapHint: {
    marginTop: Spacing.lg,
    opacity: 0.8,
  },
});
