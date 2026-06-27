import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdaptiveScrollView } from '@/components/adaptive-scroll-view';
import { HighlightHeading } from '@/components/highlight-heading';
import { MakimonoBox } from '@/components/makimono-box';
import { PhaseFrame } from '@/components/phase-frame';
import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/primary-button';
import { StampLabel } from '@/components/ui/stamp-label';
import { Colors, Spacing } from '@/constants/theme';

import type { Player } from './types';

type Props = {
  players: Player[];
  onShowResult: () => void;
};

function formatElapsed(totalSeconds: number): string {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/**
 * オフライン対戦の「プレイ中」画面。
 *
 * 対面プレイ中はアプリは進行を持たない（質問・推理は口頭）。この画面は
 * 経過時間の表示と、準備ができたら結果を公開する導線だけを担う。お題・チーム分けは伏せる。
 * （オンライン版の質問-投票フローは playing-phase.tsx に温存。現在ルートからは未使用。）
 */
export function PlayPhase({ players, onShowResult }: Props) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <PhaseFrame backgroundColor={Colors.canvas} frameColor={Colors.ink}>
      <AdaptiveScrollView style={styles.scrollArea} contentContainerStyle={styles.content}>
        <HighlightHeading type="h1" overflowX={0}>
          ゲーム中
        </HighlightHeading>

        <View style={styles.timerWrap}>
          <StampLabel>経過時間 · TIME</StampLabel>
          <ThemedText type="hero">{formatElapsed(elapsedSeconds)}</ThemedText>
        </View>

        <StampLabel style={styles.stampLabel}>参加者 · PLAYERS</StampLabel>
        <MakimonoBox contentStyle={styles.playersContent}>
          {players.map((player, index) => (
            <View key={player.id}>
              {index > 0 && <View style={styles.divider} />}
              <View style={styles.playerRow}>
                <ThemedText type="body">{player.name}</ThemedText>
              </View>
            </View>
          ))}
        </MakimonoBox>
      </AdaptiveScrollView>

      <View style={styles.bottomAction}>
        <PrimaryButton label="結果を見る" onPress={onShowResult} />
      </View>
    </PhaseFrame>
  );
}

const styles = StyleSheet.create({
  scrollArea: {
    flex: 1,
    marginHorizontal: -Spacing.sm,
  },
  content: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: 120, // 下部の固定アクションに被らないためのスクロール余白
  },
  timerWrap: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  stampLabel: {
    marginTop: Spacing.xl2,
  },
  playersContent: {
    paddingVertical: Spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.paperDeep,
    marginHorizontal: Spacing.md,
  },
  playerRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  bottomAction: {
    paddingTop: Spacing.md,
  },
});
