import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';

export function BreakLine() {
  return <View style={styles.line} />;
}

const styles = StyleSheet.create({
  line: {
    height: 3,
    backgroundColor: Colors.ink,
    marginVertical: Spacing.xl,
  },
});
