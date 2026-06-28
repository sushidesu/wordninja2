import React from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressBox } from '@/components/ui/press-box';
import { Colors, Spacing } from '@/constants/theme';

const BORDER = 3;

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export function PrimaryButton({ label, onPress, disabled }: Props) {
  return (
    <PressBox onPress={onPress} disabled={disabled} style={styles.button}>
      <ThemedText type="labelLg" style={styles.text}>
        {label}
      </ThemedText>
    </PressBox>
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
});
