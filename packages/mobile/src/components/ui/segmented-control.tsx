import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';

type Option<T> = { label: string; value: T };

type Props<T> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

/**
 * ピル型のセグメント選択。横並びの等幅ボタンから1つを選ぶ。
 * チーム数・お題モードなど「少数の択一」を Switch やドロップダウンの代わりに表現する。
 */
export function SegmentedControl<T extends string | number | boolean>({
  options,
  value,
  onChange,
}: Props<T>) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            style={[styles.button, active && styles.buttonActive]}>
            <ThemedText type="label" themeColor={active ? 'canvas' : 'ink'}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  button: {
    flex: 1,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.canvas,
    borderWidth: 2,
    borderColor: Colors.ink,
    alignItems: 'center',
  },
  buttonActive: {
    backgroundColor: Colors.hero,
  },
});
