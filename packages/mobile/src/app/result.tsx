import { useRouter } from 'expo-router';
import React from 'react';

import { useGame } from '@/features/game/game-context';
import { ResultPhase } from '@/features/game/result-phase';

export default function ResultScreen() {
  const router = useRouter();
  const game = useGame();

  const handleRestart = () => {
    game.restartGame();
    router.replace('/');
  };

  return <ResultPhase gameState={game.gameState} onRestart={handleRestart} />;
}
