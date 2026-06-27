import { useRouter } from 'expo-router';
import React from 'react';

import { useGame } from '@/features/game/game-context';
import { SetupPhase } from '@/features/game/setup-phase';

export default function SetupScreen() {
  const router = useRouter();
  const game = useGame();

  const handleStartGame = () => {
    game.startGame();
    router.replace('/assignment');
  };

  return (
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
  );
}
