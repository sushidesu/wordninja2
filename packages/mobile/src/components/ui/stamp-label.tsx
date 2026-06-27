import React from 'react';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';

type Props = {
  children: React.ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
};

/** スタンプ風のラベル。label ロール + 広めの字間 (スタンプの意匠) で見出しの上に置く。 */
export function StampLabel({ children, color = Colors.ink, style }: Props) {
  return (
    <ThemedText type="label" style={[styles.stamp, { color }, style]}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  stamp: {
    letterSpacing: 2,
  },
});
