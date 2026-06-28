import React, { useEffect } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AdaptiveScrollView } from '@/components/adaptive-scroll-view';
import { HighlightHeading } from '@/components/highlight-heading';
import { MakimonoBox } from '@/components/makimono-box';
import { PhaseFrame } from '@/components/phase-frame';
import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StampLabel } from '@/components/ui/stamp-label';
import { Colors, Spacing, Type } from '@/constants/theme';

import { TeamSizeSelector } from './team-size-selector';

import type { Player } from './types';

type Props = {
  players: Player[];
  teamCount: number;
  useCustomTopic: boolean;
  customTopics: string[];
  onAddPlayer: () => void;
  onUpdatePlayerName: (id: string, name: string) => void;
  onRemovePlayer: (id: string) => void;
  onSetTeamCount: (count: number) => void;
  onSetUseCustomTopic: (value: boolean) => void;
  onUpdateCustomTopic: (index: number, value: string) => void;
  onStartGame: () => void;
};

export function SetupPhase({
  players,
  teamCount,
  useCustomTopic,
  customTopics,
  onAddPlayer,
  onUpdatePlayerName,
  onRemovePlayer,
  onSetTeamCount,
  onSetUseCustomTopic,
  onUpdateCustomTopic,
  onStartGame,
}: Props) {
  // チーム数はプレイヤー数を超えられない (最小2)。プレイヤー削除で超過したら丸める。
  const maxTeams = Math.min(4, Math.max(2, players.length));
  useEffect(() => {
    if (teamCount > maxTeams) onSetTeamCount(maxTeams);
  }, [maxTeams, teamCount, onSetTeamCount]);

  return (
    <PhaseFrame backgroundColor={Colors.canvas}>
      <AdaptiveScrollView style={styles.scrollArea} contentContainerStyle={styles.setupContent}>
        <HighlightHeading overflowX={0}>ワードニンジャ</HighlightHeading>

        <StampLabel style={styles.stampLabel}>参加者 · {players.length} PLAYERS</StampLabel>

        <MakimonoBox style={styles.makimono} contentStyle={styles.makimonoContent}>
          {players.map((player, index) => (
            <View key={player.id}>
              {index > 0 && <View style={styles.makimonoDivider} />}
              <View style={styles.playerRow}>
                <TextInput
                  value={player.name}
                  onChangeText={(value) => onUpdatePlayerName(player.id, value)}
                  // 空のときは計算した既定名を薄く表示。未入力ならゲーム開始時にこの名前で確定する。
                  placeholder={`プレイヤー${index + 1}`}
                  placeholderTextColor={Colors.inkMute}
                  style={[Type.body, styles.playerInput]}
                />
                <Pressable onPress={() => onRemovePlayer(player.id)} style={styles.removeButton}>
                  <ThemedText type="labelLg" style={styles.removeButtonText}>
                    ×
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          ))}

          <View style={styles.makimonoDivider} />
          <Pressable onPress={onAddPlayer} style={styles.addPlayerButton}>
            <ThemedText type="label" themeColor="inkSoft">
              + プレイヤーを追加
            </ThemedText>
          </Pressable>
        </MakimonoBox>

        <StampLabel style={styles.stampLabel}>設定 · SETTINGS</StampLabel>

        <MakimonoBox style={styles.makimono} contentStyle={styles.makimonoContent}>
          <View style={styles.settingsRow}>
            <ThemedText type="labelSm">チーム数</ThemedText>
            <TeamSizeSelector
              value={teamCount}
              onChange={onSetTeamCount}
              playersCount={players.length}
              maxTeams={maxTeams}
            />
          </View>

          <View style={styles.makimonoDivider} />

          <View style={styles.settingsRow}>
            <ThemedText type="labelSm">お題</ThemedText>
            <SegmentedControl
              options={[
                { label: 'おまかせ', value: false },
                { label: 'カスタム', value: true },
              ]}
              value={useCustomTopic}
              onChange={onSetUseCustomTopic}
            />
          </View>

          {useCustomTopic &&
            Array.from({ length: teamCount }).map((_, index) => (
              <React.Fragment key={index}>
                <View style={styles.makimonoDivider} />
                <View style={styles.settingsRow}>
                  <TextInput
                    value={customTopics[index] ?? ''}
                    onChangeText={(value) => onUpdateCustomTopic(index, value)}
                    placeholder={`お題${index + 1}`}
                    placeholderTextColor={Colors.inkMute}
                    style={[Type.body, styles.topicInput]}
                  />
                </View>
              </React.Fragment>
            ))}
        </MakimonoBox>
      </AdaptiveScrollView>

      <View style={styles.bottomAction}>
        <PrimaryButton label="▶ ゲーム開始" onPress={onStartGame} disabled={players.length < 2} />
      </View>
    </PhaseFrame>
  );
}

const styles = StyleSheet.create({
  scrollArea: {
    flex: 1,
    marginHorizontal: -Spacing.sm,
  },
  setupContent: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: 120, // 下部の固定アクションに被らないためのスクロール余白
  },
  stampLabel: {
    marginTop: Spacing.xl2,
  },
  makimono: {
    marginTop: Spacing.md,
  },
  makimonoContent: {
    paddingVertical: Spacing.xs,
  },
  makimonoDivider: {
    height: 1,
    backgroundColor: Colors.paperDeep,
    marginHorizontal: Spacing.md,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  playerInput: {
    flex: 1,
    backgroundColor: Colors.canvas,
    color: Colors.ink,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  removeButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: Colors.danger,
  },
  addPlayerButton: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  settingsRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  topicInput: {
    backgroundColor: Colors.canvas,
    color: Colors.ink,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  bottomAction: {
    paddingTop: Spacing.md,
  },
});
