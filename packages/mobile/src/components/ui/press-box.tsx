import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Colors } from '@/constants/theme';

/**
 * ハードシャドウ＋「押すと影の位置へ沈み、影が消える」触感を持つボタンの土台。
 * チーム数カード (team-size-selector.tsx) の press 機構を一般化したもの。
 *
 * 面の見た目（背景/枠/padding）は呼び出し側が `style` で与える。面は不透明にすること
 * （影が透けないように）。横幅を制御したい場合（行内で flex 等）は `containerStyle` を使う。
 */
type Props = {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  /** 影のオフセット (px)。既定 3。 */
  offset?: number;
  /** 角丸。既定 0 (矩形ボタン)。 */
  radius?: number;
  /** 影の色。既定 ink。 */
  shadowColor?: string;
  /** 影を出すか。既定 true。false で flat（押下の沈みのみ）。 */
  elevated?: boolean;
  /** 面のスタイル（背景/枠/padding 等）。 */
  style?: StyleProp<ViewStyle>;
  /** 外側 Pressable のスタイル（flex など幅の制御用）。 */
  containerStyle?: StyleProp<ViewStyle>;
};

export function PressBox({
  children,
  onPress,
  disabled = false,
  offset = 3,
  radius = 0,
  shadowColor = Colors.ink,
  elevated = true,
  style,
  containerStyle,
}: Props) {
  const press = useSharedValue(0);
  const showShadow = elevated && !disabled;

  const shadowStyle = useAnimatedStyle(() => ({ opacity: showShadow ? 1 - press.value : 0 }));
  const surfaceStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: press.value * offset }, { translateY: press.value * offset }],
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 70 });
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: 120 });
      }}
      style={[{ marginRight: offset, marginBottom: offset }, disabled && styles.disabled, containerStyle]}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius, backgroundColor: shadowColor, transform: [{ translateX: offset }, { translateY: offset }] },
          shadowStyle,
        ]}
      />
      <Animated.View style={[{ borderRadius: radius }, style, surfaceStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.45,
  },
});
