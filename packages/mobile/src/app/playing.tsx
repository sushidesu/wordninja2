import { useRouter } from 'expo-router';
import React from 'react';

import { useGame } from '@/features/game/game-context';
import { PlayingPhase } from '@/features/game/playing-phase';

export default function PlayingScreen() {
  const router = useRouter();
  const game = useGame();

  const handleEndGame = () => {
    game.endGame();
    router.replace('/result');
  };

  return (
    <PlayingPhase
      gameState={game.gameState}
      isVoting={game.isVoting}
      currentPlayer={game.currentPlayer}
      currentQuestion={game.currentQuestion}
      questionText={game.questionText}
      currentVotes={game.currentVotes}
      onSetQuestionText={game.setQuestionText}
      onStartVoting={game.startVoting}
      onToggleVote={game.toggleVote}
      onSubmitVotes={game.submitVotes}
      onEndGame={handleEndGame}
    />
  );
}
