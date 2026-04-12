import { useRouter } from 'expo-router';
import React from 'react';

import { useGame } from '@/features/game/game-context';
import { AssignmentPhase } from '@/features/game/assignment-phase';

export default function AssignmentScreen() {
  const router = useRouter();
  const game = useGame();

  const handleProceed = () => {
    const allDone = game.proceedAssignment();
    if (allDone) {
      router.replace('/playing');
    }
  };

  return (
    <AssignmentPhase
      key={game.assignmentIndex}
      players={game.gameState.players}
      assignmentIndex={game.assignmentIndex}
      assignmentRevealed={game.assignmentRevealed}
      containerWidth={game.makimonoContainerWidth}
      onContainerLayout={game.onMakimonoContainerLayout}
      onReveal={() => game.setAssignmentRevealed(true)}
      onHide={() => game.setAssignmentRevealed(false)}
      onProceed={handleProceed}
    />
  );
}
