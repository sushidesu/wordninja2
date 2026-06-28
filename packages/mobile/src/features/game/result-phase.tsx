import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AdaptiveScrollView } from '@/components/adaptive-scroll-view';
import { HighlightHeading } from '@/components/highlight-heading';
import { MakimonoBox } from '@/components/makimono-box';
import { PhaseFrame } from '@/components/phase-frame';
import { ThemedText } from '@/components/themed-text';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { Colors, Spacing, TeamSplitColors } from '@/constants/theme';

import type { GameState } from './types';

type Props = {
  gameState: GameState;
  onRestart: () => void;
};

export function ResultPhase({ gameState, onRestart }: Props) {
  return (
    <PhaseFrame backgroundColor={Colors.hero} frameColor={Colors.ink}>
      <AdaptiveScrollView style={styles.scrollArea} contentContainerStyle={styles.resultContent}>
        <HighlightHeading type="h1" overflowX={0} borderColor={Colors.ink} color={Colors.ink}>
          結果発表
        </HighlightHeading>
        <ThemedText type="bodySm" style={styles.subtitle}>
          お題を公開します
        </ThemedText>

        {gameState.teams.map((team, index) => (
          <MakimonoBox
            key={team.id}
            rodColor={TeamSplitColors[index % TeamSplitColors.length]}>
            <View style={styles.teamCardHeader}>
              <ThemedText type="h2" style={styles.teamTopic}>
                {team.topic}
              </ThemedText>
            </View>
            <View style={styles.teamPlayersWrap}>
              {gameState.players
                .filter((player) => player.teamId === team.id)
                .map((player) => (
                  <View key={player.id} style={styles.teamPlayerRow}>
                    <ThemedText type="body">{player.name}</ThemedText>
                  </View>
                ))}
            </View>
          </MakimonoBox>
        ))}
      </AdaptiveScrollView>

      <View style={styles.bottomAction}>
        <SecondaryButton label="もう一度遊ぶ" onPress={onRestart} />
      </View>
    </PhaseFrame>
  );
}

const styles = StyleSheet.create({
  scrollArea: {
    flex: 1,
    marginHorizontal: -Spacing.sm,
  },
  resultContent: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: 120, // 下部の固定アクションに被らないためのスクロール余白
    gap: Spacing.lg,
  },
  subtitle: {
    color: Colors.ink,
    textAlign: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  teamCardHeader: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  teamTopic: {
    color: Colors.ink,
    textAlign: 'center',
  },
  teamPlayersWrap: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  teamPlayerRow: {
    paddingVertical: Spacing.xs,
  },
  bottomAction: {
    paddingTop: Spacing.md,
  },
});
