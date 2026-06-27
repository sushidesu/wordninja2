import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { AssignmentPhase } from '@/features/game/assignment-phase';
import { useGame } from '@/features/game/game-context';
import { HandoffOverlay } from '@/features/game/handoff/handoff-overlay';

export default function AssignmentScreen() {
  const router = useRouter();
  const game = useGame();
  // 受け渡し演出中に表示する「次の人」の名前。演出開始時に確定させる（index 前進で変わらないように）。
  const [handoffName, setHandoffName] = useState<string | null>(null);

  const players = game.gameState.players;
  const isLast = game.assignmentIndex >= players.length - 1;

  const handleProceed = () => {
    if (isLast) {
      // 全員確認完了 → そのまま playing へ（受け渡しは発生しない）。
      game.proceedAssignment();
      router.replace('/playing');
      return;
    }
    // 次の人へ渡す → 受け渡し演出を開始。
    setHandoffName(players[game.assignmentIndex + 1].name);
  };

  return (
    <View style={{ flex: 1 }}>
      <AssignmentPhase
        key={game.assignmentIndex}
        players={players}
        assignmentIndex={game.assignmentIndex}
        assignmentRevealed={game.assignmentRevealed}
        containerWidth={game.makimonoContainerWidth}
        onContainerLayout={game.onMakimonoContainerLayout}
        onReveal={() => game.setAssignmentRevealed(true)}
        onHide={() => game.setAssignmentRevealed(false)}
        onProceed={handleProceed}
      />

      {handoffName !== null && (
        <HandoffOverlay
          nextName={handoffName}
          // 墨幕が覆ったら裏で次の人に差し替える（AssignmentPhase が remount）。
          onCovered={() => game.proceedAssignment()}
          onComplete={() => setHandoffName(null)}
        />
      )}
    </View>
  );
}
