import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressBox } from '@/components/ui/press-box';
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
          <PressBox
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            elevated={active}
            containerStyle={styles.cell}
            style={[styles.button, active && styles.buttonActive]}>
            <ThemedText type="label" themeColor={active ? 'canvas' : 'ink'}>
              {option.label}
            </ThemedText>
          </PressBox>
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
  cell: {
    flex: 1,
  },
  button: {
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
