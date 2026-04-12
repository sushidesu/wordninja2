import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * 巻物 (scroll) モチーフの Box コンポーネント。
 *
 * 構造:
 *   ▪━━━━━━━━━━━━━━━━▪   ← 上軸 (太い横棒、左右にはみ出す。端に突起)
 *    │                │
 *    ��  content        │   ← 本紙 (側面枠 + 白い面)
 *    │                │
 *   ▪━━━━━━━━━━━━━━━━▪   ← 下軸
 */

type Props = {
  children: React.ReactNode;
  /** 軸の太さ (px)。既定 8。 */
  rodHeight?: number;
  /** 軸の左右は��出し量 (px)。既定 6。 */
  rodOverflow?: number;
  /** 軸端の突起サイズ (px)。0 で突起な���。既定 12。 */
  knobSize?: number;
  /** 軸・枠の色。既定は `Colors.ink`。 */
  color?: string;
  /** 本紙の背景色���既定は `Colors.canvas`。 */
  paperColor?: string;
  /** 本紙の左右枠の��さ (px)。既定 3。 */
  sideBorderWidth?: number;
  /** ラッパ���追加スタイル。 */
  style?: StyleProp<ViewStyle>;
  /** 本紙の追加スタイル。 */
  contentStyle?: StyleProp<ViewStyle>;
};

export function ScrollBox({
  children,
  rodHeight = 8,
  rodOverflow = 6,
  knobSize = 12,
  color = Colors.ink,
  paperColor = Colors.canvas,
  sideBorderWidth = 3,
  style,
  contentStyle,
}: Props) {
  const knobOffset = (knobSize - rodHeight) / 2;

  return (
    <View style={style}>
      {/* ---- 上軸 ---- */}
      <View style={{ marginHorizontal: -rodOverflow, position: 'relative' }}>
        <View style={{ height: rodHeight, backgroundColor: color }} />
        {knobSize > 0 && (
          <>
            <View
              style={[
                styles.knob,
                {
                  width: knobSize,
                  height: knobSize,
                  backgroundColor: color,
                  left: 0,
                  top: -knobOffset,
                },
              ]}
            />
            <View
              style={[
                styles.knob,
                {
                  width: knobSize,
                  height: knobSize,
                  backgroundColor: color,
                  right: 0,
                  top: -knobOffset,
                },
              ]}
            />
          </>
        )}
      </View>

      {/* ---- 本紙 ---- */}
      <View
        style={[
          {
            borderLeftWidth: sideBorderWidth,
            borderRightWidth: sideBorderWidth,
            borderColor: color,
            backgroundColor: paperColor,
          },
          contentStyle,
        ]}>
        {children}
      </View>

      {/* ---- 下軸 ---- */}
      <View style={{ marginHorizontal: -rodOverflow, position: 'relative' }}>
        <View style={{ height: rodHeight, backgroundColor: color }} />
        {knobSize > 0 && (
          <>
            <View
              style={[
                styles.knob,
                {
                  width: knobSize,
                  height: knobSize,
                  backgroundColor: color,
                  left: 0,
                  top: -knobOffset,
                },
              ]}
            />
            <View
              style={[
                styles.knob,
                {
                  width: knobSize,
                  height: knobSize,
                  backgroundColor: color,
                  right: 0,
                  top: -knobOffset,
                },
              ]}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  knob: {
    position: 'absolute',
  },
});
