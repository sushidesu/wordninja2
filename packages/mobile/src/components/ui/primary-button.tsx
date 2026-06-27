import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { HardShadow } from '@/components/hard-shadow';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';

const BORDER = 3;

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export function PrimaryButton({ label, onPress, disabled }: Props) {
  return (
    <HardShadow style={disabled ? styles.disabled : undefined}>
      <Pressable onPress={onPress} disabled={disabled} style={styles.button}>
        <ThemedText type="labelLg" style={styles.text}>
          {label}
        </ThemedText>
      </Pressable>
    </HardShadow>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: Colors.hero,
    borderWidth: BORDER,
    borderColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
  },
  text: {
    color: Colors.ink,
  },
  disabled: {
    opacity: 0.45,
  },
});
