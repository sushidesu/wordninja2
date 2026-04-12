import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { HardShadow } from '@/components/hard-shadow';
import { Colors, Fonts } from '@/constants/theme';

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
        <Text style={styles.text}>{label}</Text>
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
    paddingVertical: 16,
  },
  text: {
    color: Colors.ink,
    fontFamily: Fonts.display,
    fontSize: 20,
    letterSpacing: 2,
  },
  disabled: {
    opacity: 0.45,
  },
});
