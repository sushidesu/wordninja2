import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';

export function BreakLine() {
  return <View style={styles.line} />;
}

const styles = StyleSheet.create({
  line: {
    height: 3,
    backgroundColor: Colors.ink,
    marginVertical: 20,
  },
});
