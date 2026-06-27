import { useRouter } from 'expo-router';
import React from 'react';

import { useGame } from '@/features/game/game-context';
import { PlayPhase } from '@/features/game/play-phase';

export default function PlayingScreen() {
  const router = useRouter();
  const game = useGame();

  const handleShowResult = () => {
    game.endGame();
    router.replace('/result');
  };

  return <PlayPhase players={game.gameState.players} onShowResult={handleShowResult} />;
}
