import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

type Props = {
  children: React.ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
};

export function StampLabel({ children, color = Colors.ink, style }: Props) {
  return <Text style={[styles.stamp, { color }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  stamp: {
    fontFamily: Fonts.display,
    fontSize: 11,
    letterSpacing: 2,
    color: Colors.ink,
    marginBottom: 10,
    marginTop: 4,
  },
});
