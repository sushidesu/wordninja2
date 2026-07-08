import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { AssignmentPhase } from '@/features/game/assignment-phase';
import { useGame } from '@/features/game/game-context';
import { HandoffOverlay } from '@/features/game/handoff/handoff-overlay';

export default function AssignmentScreen() {
  const router = useRouter();
  const game = useGame();
  // 受け渡し演出中に表示する「次の人」の名前。演出開始時に確定させる（index 前進で変わらないように）。
  const [handoffName, setHandoffName] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  // 巻物コンテナの実測幅。AssignmentPhase は人ごとに remount するため、
  // 画面側で保持して remount 直後から確定幅を渡す (0 幅のちらつきを防ぐ)。
  const [containerWidth, setContainerWidth] = useState(0);

  const players = game.gameState.players;
  const isLast = game.assignmentIndex >= players.length - 1;

  const handleProceed = () => {
    if (isLast) {
      // 全員確認完了 → そのまま playing へ（受け渡しは発生しない）。
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
        assignmentRevealed={revealed}
        containerWidth={containerWidth}
        onContainerLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)}
        onReveal={() => setRevealed(true)}
        onHide={() => setRevealed(false)}
        onProceed={handleProceed}
      />

      {handoffName !== null && (
        <HandoffOverlay
          nextName={handoffName}
          // 墨幕が覆ったら裏で次の人に差し替える（AssignmentPhase が remount）。
          onCovered={() => {
            game.proceedAssignment();
            setRevealed(false);
          }}
          onComplete={() => setHandoffName(null)}
        />
      )}
    </View>
  );
}
