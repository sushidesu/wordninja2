import React from 'react';
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

/**
 * deviationgame.com の `.heading-1.highlight` を再現する見出しラッパー。
 *
 * CSS 原本:
 * ```css
 * .heading-1.highlight {
 *   outline: 3px solid var(--outdraw-orange);
 *   margin: 0 -40px 40px;   ← 左右にネガティブ margin で枠が親の padding をハミ出る
 *   padding: 40px;
 * }
 * ```
 *
 * 3px の矩形枠がテキストを囲み、親のコンテナから左右にハミ出す。
 * モバイルでは横のハミ出し量を控えめに (既定 16px) するが、視覚的な意図は同じ。
 */

type Props = {
  children: React.ReactNode;
  /** 枠の色。既定は `Colors.ink`。 */
  borderColor?: string;
  /** 文字色。既定は `Colors.ink`。 */
  color?: string;
  /** 文字サイズ。既定 44。 */
  fontSize?: number;
  /** 左右のハミ出し量 (ネガティブ margin)。既定 16。 */
  overflowX?: number;
  /** 内側の padding。既定 24。 */
  padding?: number;
  /** 下の margin。既定 24。 */
  marginBottom?: number;
  /** テキスト配置。既定 center。 */
  align?: 'center' | 'left' | 'right';
  /** ラッパー追加スタイル。 */
  style?: ViewStyle;
  /** テキスト追加スタイル。 */
  textStyle?: TextStyle;
};

export function HighlightHeading({
  children,
  borderColor = Colors.ink,
  color = Colors.ink,
  fontSize = 44,
  overflowX = 16,
  padding = 24,
  marginBottom = 24,
  align = 'center',
  style,
  textStyle,
}: Props) {
  return (
    <View
      style={[
        styles.wrap,
        {
          borderColor,
          marginHorizontal: -overflowX,
          paddingVertical: padding,
          paddingHorizontal: padding,
          marginBottom,
        },
        style,
      ]}>
      <Text
        style={[
          styles.text,
          {
            color,
            fontSize,
            textAlign: align,
            lineHeight: Math.round(fontSize * 1.1),
          },
          textStyle,
        ]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 3,
  },
  text: {
    fontFamily: Fonts.display,
  },
});
