import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { useGame } from '@/features/game/game-context';
import { SetupPhase } from '@/features/game/setup-phase';

export default function SetupScreen() {
  const router = useRouter();
  const game = useGame();
  const insets = useSafeAreaInsets();

  const handleStartGame = () => {
    game.startGame();
    router.replace('/assignment');
  };

  return (
    <View style={styles.root}>
      <SetupPhase
        players={game.setupPlayers}
        teamCount={game.teamCount}
        useCustomTopic={game.useCustomTopic}
        customTopics={game.customTopics}
        onAddPlayer={game.addPlayer}
        onUpdatePlayerName={game.updatePlayerName}
        onRemovePlayer={game.removePlayer}
        onSetTeamCount={game.setTeamCount}
        onSetUseCustomTopic={game.setUseCustomTopic}
        onUpdateCustomTopic={game.updateCustomTopic}
        onStartGame={handleStartGame}
      />

      {/* フォント選定用: プレビュー画面への一時導線。選定が終わったら削除する。 */}
      <Pressable
        accessibilityLabel="フォントプレビューを開く"
        onPress={() => router.push('/font-preview')}
        style={({ pressed }) => [
          styles.fab,
          { top: insets.top + Spacing.sm },
          pressed && styles.fabPressed,
        ]}>
        <Text style={styles.fabText}>Aa フォント</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    backgroundColor: Colors.ink,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Spacing.xl3,
  },
  fabPressed: {
    opacity: 0.7,
  },
  fabText: {
    color: Colors.canvas,
    fontSize: 13,
    fontWeight: '700',
  },
});
