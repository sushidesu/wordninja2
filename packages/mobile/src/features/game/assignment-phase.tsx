import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  clamp,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { MAKIMONO, MakimonoBox } from '@/components/makimono-box';
import { PhaseFrame } from '@/components/phase-frame';
import { PrimaryButton } from '@/components/ui/primary-button';
import { StampLabel } from '@/components/ui/stamp-label';
import { Colors, Fonts } from '@/constants/theme';

import type { Player } from './types';

type Props = {
  players: Player[];
  assignmentIndex: number;
  assignmentRevealed: boolean;
  containerWidth: number;
  onContainerLayout: (e: LayoutChangeEvent) => void;
  onReveal: () => void;
  onHide: () => void;
  onProceed: () => void;
};

const S = MAKIMONO.DEFAULT_SCALE;
const RIGHT_CAP_W = MAKIMONO.BORDER_R * S;
const ROD_W_PX = MAKIMONO.ROD_W * S;
const BAR_H_PX = MAKIMONO.BORDER_H * S;
const KNOB_H_PX = MAKIMONO.KNOB_H * S;

export function AssignmentPhase({
  players,
  assignmentIndex,
  assignmentRevealed,
  containerWidth,
  onContainerLayout,
  onReveal,
  onHide,
  onProceed,
}: Props) {
  const player = players[assignmentIndex];
  const openWidth = containerWidth > 0 ? containerWidth - RIGHT_CAP_W : 0;
  const scrollWidth = useSharedValue(ROD_W_PX);
  const startWidth = useSharedValue(ROD_W_PX);

  const clipStyle = useAnimatedStyle(() => ({
    width: scrollWidth.value,
    overflow: 'hidden' as const,
    alignSelf: 'flex-end' as const,
  }));

  const buttonStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollWidth.value,
      [openWidth * 0.7, openWidth * 0.95],
      [0, 1],
      'clamp',
    );
    return { opacity };
  });

  const pan = Gesture.Pan()
    .onStart(() => {
      startWidth.value = scrollWidth.value;
    })
    .onUpdate((e) => {
      scrollWidth.value = clamp(
        startWidth.value - e.translationX,
        ROD_W_PX,
        openWidth,
      );
    })
    .onEnd(() => {
      const threshold = openWidth * 0.4;
      if (scrollWidth.value > threshold) {
        scrollWidth.value = withTiming(openWidth, {
          duration: 300,
          easing: Easing.out(Easing.cubic),
        });
        runOnJS(onReveal)();
      } else {
        scrollWidth.value = withTiming(ROD_W_PX, {
          duration: 300,
          easing: Easing.in(Easing.cubic),
        });
        runOnJS(onHide)();
      }
    });

  const handleHide = useCallback(() => {
    onHide();
    scrollWidth.value = withTiming(ROD_W_PX, {
      duration: 400,
      easing: Easing.in(Easing.cubic),
    });
  }, [onHide, scrollWidth]);

  return (
    <PhaseFrame backgroundColor={Colors.hero} frameColor={Colors.ink}>
      <View style={styles.container}>
        <StampLabel color={Colors.canvas}>PLAYER CHECK</StampLabel>
        <Text style={styles.assignmentName}>{player?.name}さん</Text>

        <GestureDetector gesture={pan}>
          <Animated.View onLayout={onContainerLayout}>
            {!assignmentRevealed && (
              <View style={styles.scrollPrompt}>
                <Text style={styles.hiddenCardTitle}>← スワイプしてお題を確認</Text>
                <Text style={styles.assignmentHint}>
                  ※他の人に見られないようにしてください
                </Text>
              </View>
            )}

            <View style={styles.makimonoRow}>
              <Animated.View style={clipStyle}>
                {containerWidth > 0 && (
                  <View style={{ width: openWidth }}>
                    <MakimonoBox hideRight contentStyle={styles.revealedCard}>
                      <View style={styles.revealedCardInner}>
                        <StampLabel>あなたのお題</StampLabel>
                        <Text style={styles.revealedTopic}>{player?.topic}</Text>
                        <Pressable onPress={handleHide}>
                          <Text style={styles.hideLink}>隠す</Text>
                        </Pressable>
                      </View>
                    </MakimonoBox>
                  </View>
                )}
              </Animated.View>

              <View style={styles.rightCap}>
                <View style={styles.rightCapSpacer} />
                <View style={styles.rightCapBar} />
                <View style={styles.rightCapBody} />
                <View style={styles.rightCapBar} />
                <View style={styles.rightCapSpacer} />
              </View>
            </View>
          </Animated.View>
        </GestureDetector>

        <View style={styles.assignmentBottom}>
          <Animated.View
            style={buttonStyle}
            pointerEvents={assignmentRevealed ? 'auto' : 'none'}>
            <PrimaryButton
              label={
                assignmentIndex < players.length - 1
                  ? '次の人へ渡す'
                  : '全員確認完了'
              }
              onPress={onProceed}
            />
          </Animated.View>

          <View style={styles.progressRow}>
            {players.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.progressDot,
                  index === assignmentIndex
                    ? styles.progressDotActive
                    : index < assignmentIndex
                      ? styles.progressDotDone
                      : undefined,
                ]}
              />
            ))}
          </View>
        </View>
      </View>
    </PhaseFrame>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 20,
  },
  assignmentName: {
    color: Colors.canvas,
    textAlign: 'center',
    marginTop: 4,
    fontSize: 36,
    fontFamily: Fonts.display,
    marginBottom: 24,
  },
  scrollPrompt: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  makimonoRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  rightCap: {
    width: RIGHT_CAP_W,
  },
  rightCapSpacer: {
    height: KNOB_H_PX,
  },
  rightCapBar: {
    height: BAR_H_PX,
    backgroundColor: Colors.ink,
  },
  rightCapBody: {
    flex: 1,
    backgroundColor: Colors.ink,
  },
  hiddenCardTitle: {
    color: Colors.ink,
    fontSize: 16,
    fontFamily: Fonts.display,
    letterSpacing: 1,
    textAlign: 'center',
    padding: 12,
  },
  revealedCard: {
    minHeight: 220,
  },
  revealedCardInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  revealedTopic: {
    color: Colors.ink,
    fontSize: 52,
    fontFamily: Fonts.display,
    marginBottom: 18,
    marginTop: 4,
    textAlign: 'center',
  },
  hideLink: {
    color: Colors.inkSoft,
    fontFamily: Fonts.display,
    fontSize: 12,
    letterSpacing: 1,
  },
  assignmentBottom: {
    marginTop: 22,
    gap: 20,
  },
  assignmentHint: {
    color: Colors.canvas,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: Fonts.body,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  progressDot: {
    width: 10,
    height: 10,
    backgroundColor: Colors.canvas,
    borderWidth: 2,
    borderColor: Colors.ink,
  },
  progressDotDone: {
    backgroundColor: Colors.ink,
  },
  progressDotActive: {
    width: 30,
    backgroundColor: Colors.ink,
  },
});
