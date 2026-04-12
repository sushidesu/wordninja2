import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * 巻物 (scroll) モチーフの Box コンポーネント。
 *
 * 構造:
 *   ▓
 *   ██░░░░░░░░░░░░░░░░░░░
 *   ██                 ░░
 *   ██    content      ░░
 *   ██                 ░░
 *   ██░░░░░░░░░░░░░░░░░░░
 *   ▓
 */

/** ドット絵の寸法定数 (dot 単位)。外部でレイアウト計算に使える。 */
export const MAKIMONO = {
  ROD_W: 8,
  BORDER_H: 3,
  BORDER_R: 3,
  KNOB_W: 5,
  KNOB_H: 2,
  DEFAULT_SCALE: 2,
} as const;

type Props = {
  children: React.ReactNode;
  scale?: number;
  rodColor?: string;
  borderColor?: string;
  knobColor?: string;
  paperColor?: string;
  /** 右縁 (右の縦線 + 横棒の右端) を描画しない。アニメ分離用。 */
  hideRight?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export function MakimonoBox({
  children,
  scale = MAKIMONO.DEFAULT_SCALE,
  rodColor = '#0A8F7F',
  borderColor = Colors.ink,
  knobColor = '#F4C22C',
  paperColor = Colors.canvas,
  hideRight = false,
  style,
  contentStyle,
}: Props) {
  const rod = MAKIMONO.ROD_W * scale;
  const barH = MAKIMONO.BORDER_H * scale;
  const barR = MAKIMONO.BORDER_R * scale;
  const knobW = MAKIMONO.KNOB_W * scale;
  const knobH = MAKIMONO.KNOB_H * scale;

  return (
    <View style={style}>
      <View
        style={{
          width: knobW,
          height: knobH,
          backgroundColor: knobColor,
          marginLeft: (rod - knobW) / 2,
        }}
      />

      <View style={styles.row}>
        <View style={{ width: rod, height: barH, backgroundColor: rodColor }} />
        <View style={{ flex: 1, height: barH, backgroundColor: borderColor }} />
        {!hideRight && (
          <View style={{ width: barR, height: barH, backgroundColor: borderColor }} />
        )}
      </View>

      <View style={styles.row}>
        <View style={{ width: rod, backgroundColor: rodColor }} />
        <View style={[{ flex: 1, backgroundColor: paperColor }, contentStyle]}>
          {children}
        </View>
        {!hideRight && (
          <View style={{ width: barR, backgroundColor: borderColor }} />
        )}
      </View>

      <View style={styles.row}>
        <View style={{ width: rod, height: barH, backgroundColor: rodColor }} />
        <View style={{ flex: 1, height: barH, backgroundColor: borderColor }} />
        {!hideRight && (
          <View style={{ width: barR, height: barH, backgroundColor: borderColor }} />
        )}
      </View>

      <View
        style={{
          width: knobW,
          height: knobH,
          backgroundColor: knobColor,
          marginLeft: (rod - knobW) / 2,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
});
