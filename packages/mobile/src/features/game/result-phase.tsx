import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AdaptiveScrollView } from '@/components/adaptive-scroll-view';
import { HighlightHeading } from '@/components/highlight-heading';
import { MakimonoBox } from '@/components/makimono-box';
import { PhaseFrame } from '@/components/phase-frame';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { Colors, Fonts } from '@/constants/theme';

import type { GameState } from './types';

type Props = {
  gameState: GameState;
  onRestart: () => void;
};

export function ResultPhase({ gameState, onRestart }: Props) {
  return (
    <PhaseFrame backgroundColor={Colors.hero} frameColor={Colors.ink}>
      <AdaptiveScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.resultContent}>
        <HighlightHeading
          fontSize={48}
          overflowX={0}
          borderColor={Colors.ink}
          color={Colors.ink}>
          結果発表
        </HighlightHeading>
        <Text style={styles.subtitle}>お題を公開します</Text>

        {gameState.teams.map((team) => (
          <MakimonoBox key={team.id}>
            <View style={styles.teamCardHeader}>
              <Text style={styles.teamTopic}>{team.topic}</Text>
            </View>
            <View style={styles.teamPlayersWrap}>
              {gameState.players
                .filter((player) => player.teamId === team.id)
                .map((player) => (
                  <View key={player.id} style={styles.teamPlayerRow}>
                    <Text style={styles.teamPlayerName}>{player.name}</Text>
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
    marginHorizontal: -8,
  },
  resultContent: {
    paddingHorizontal: 8,
    paddingBottom: 120,
    gap: 16,
  },
  subtitle: {
    color: Colors.ink,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
    fontFamily: Fonts.body,
    fontSize: 14,
  },
  teamCardHeader: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  teamTopic: {
    color: Colors.ink,
    fontFamily: Fonts.display,
    fontSize: 28,
    textAlign: 'center',
  },
  teamPlayersWrap: {
    padding: 14,
    gap: 6,
  },
  teamPlayerRow: {
    paddingVertical: 4,
  },
  teamPlayerName: {
    color: Colors.ink,
    fontFamily: Fonts.body,
    fontSize: 15,
  },
  bottomAction: {
    paddingTop: 12,
  },
});
