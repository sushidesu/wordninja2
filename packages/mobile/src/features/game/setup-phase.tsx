import React from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { AdaptiveScrollView } from '@/components/adaptive-scroll-view';
import { HighlightHeading } from '@/components/highlight-heading';
import { MakimonoBox } from '@/components/makimono-box';
import { PhaseFrame } from '@/components/phase-frame';
import { PrimaryButton } from '@/components/ui/primary-button';
import { StampLabel } from '@/components/ui/stamp-label';
import { Colors, Fonts } from '@/constants/theme';

import type { Player } from './types';

type Props = {
  players: Player[];
  teamCount: number;
  useCustomTopic: boolean;
  customTopicA: string;
  customTopicB: string;
  onAddPlayer: () => void;
  onUpdatePlayerName: (id: string, name: string) => void;
  onRemovePlayer: (id: string) => void;
  onSetTeamCount: (count: number) => void;
  onSetUseCustomTopic: (value: boolean) => void;
  onSetCustomTopicA: (value: string) => void;
  onSetCustomTopicB: (value: string) => void;
  onStartGame: () => void;
};

export function SetupPhase({
  players,
  teamCount,
  useCustomTopic,
  customTopicA,
  customTopicB,
  onAddPlayer,
  onUpdatePlayerName,
  onRemovePlayer,
  onSetTeamCount,
  onSetUseCustomTopic,
  onSetCustomTopicA,
  onSetCustomTopicB,
  onStartGame,
}: Props) {
  return (
    <PhaseFrame backgroundColor={Colors.canvas}>
      <AdaptiveScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.setupContent}>
        <HighlightHeading fontSize={56} overflowX={0}>
          ワードニンジャ
        </HighlightHeading>
        <Text style={styles.subtitle}>お題推理パーティーゲーム</Text>

        <StampLabel>参加者 · {players.length} PLAYERS</StampLabel>

        <MakimonoBox contentStyle={styles.makimonoContent}>
          {players.map((player, index) => (
            <View key={player.id}>
              {index > 0 && <View style={styles.makimonoDivider} />}
              <View style={styles.playerRow}>
                <TextInput
                  value={player.name}
                  onChangeText={(value) => onUpdatePlayerName(player.id, value)}
                  placeholder="名前を入力"
                  placeholderTextColor={Colors.inkMute}
                  style={styles.playerInput}
                />
                <Pressable
                  onPress={() => onRemovePlayer(player.id)}
                  style={styles.removeButton}>
                  <Text style={styles.removeButtonText}>×</Text>
                </Pressable>
              </View>
            </View>
          ))}

          <View style={styles.makimonoDivider} />
          <Pressable onPress={onAddPlayer} style={styles.addPlayerButton}>
            <Text style={styles.addPlayerText}>+ プレイヤーを追加</Text>
          </Pressable>
        </MakimonoBox>

        <StampLabel>設定 · SETTINGS</StampLabel>

        <MakimonoBox contentStyle={styles.makimonoContent}>
          <View style={styles.settingsRow}>
            <Text style={styles.settingLabel}>お題の数</Text>
            <View style={styles.teamButtonsRow}>
              {[2, 3, 4].map((count) => {
                const active = teamCount === count;
                return (
                  <Pressable
                    key={count}
                    onPress={() => onSetTeamCount(count)}
                    style={[styles.teamButton, active && styles.teamButtonActive]}>
                    <Text
                      style={[
                        styles.teamButtonText,
                        active && styles.teamButtonTextActive,
                      ]}>
                      {count}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.makimonoDivider} />

          <View style={styles.settingsRow}>
            <Text style={styles.settingLabel}>お題を手動で設定する</Text>
            <Switch
              value={useCustomTopic}
              onValueChange={onSetUseCustomTopic}
              trackColor={{ false: Colors.paperDeep, true: Colors.hero }}
              thumbColor={Colors.canvas}
            />
          </View>

          {useCustomTopic && (
            <>
              <View style={styles.makimonoDivider} />
              <View style={styles.settingsRow}>
                <TextInput
                  value={customTopicA}
                  onChangeText={onSetCustomTopicA}
                  placeholder="お題A (例: 犬)"
                  placeholderTextColor={Colors.inkMute}
                  style={styles.topicInput}
                />
              </View>
              <View style={styles.makimonoDivider} />
              <View style={styles.settingsRow}>
                <TextInput
                  value={customTopicB}
                  onChangeText={onSetCustomTopicB}
                  placeholder="お題B (例: 猫)"
                  placeholderTextColor={Colors.inkMute}
                  style={styles.topicInput}
                />
              </View>
            </>
          )}
        </MakimonoBox>
      </AdaptiveScrollView>

      <View style={styles.bottomAction}>
        <PrimaryButton
          label="▶ ゲーム開始"
          onPress={onStartGame}
          disabled={players.length < 2}
        />
      </View>
    </PhaseFrame>
  );
}

const styles = StyleSheet.create({
  scrollArea: {
    flex: 1,
    marginHorizontal: -8,
  },
  setupContent: {
    paddingHorizontal: 8,
    paddingBottom: 120,
  },
  subtitle: {
    color: Colors.inkSoft,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
    fontFamily: Fonts.body,
    fontSize: 14,
  },
  makimonoContent: {
    paddingVertical: 4,
  },
  makimonoDivider: {
    height: 1,
    backgroundColor: Colors.paperDeep,
    marginHorizontal: 12,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  playerInput: {
    flex: 1,
    backgroundColor: Colors.canvas,
    color: Colors.ink,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontFamily: Fonts.body,
    fontSize: 16,
  },
  removeButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: Colors.danger,
    fontSize: 20,
    fontFamily: Fonts.display,
  },
  addPlayerButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  addPlayerText: {
    color: Colors.inkSoft,
    fontFamily: Fonts.display,
    fontSize: 13,
    letterSpacing: 1,
  },
  settingsRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  settingLabel: {
    color: Colors.ink,
    fontFamily: Fonts.display,
    fontSize: 12,
    letterSpacing: 1,
  },
  teamButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  teamButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: Colors.canvas,
    borderWidth: 2,
    borderColor: Colors.ink,
    alignItems: 'center',
  },
  teamButtonActive: {
    backgroundColor: Colors.hero,
  },
  teamButtonText: {
    color: Colors.ink,
    fontFamily: Fonts.display,
    fontSize: 18,
  },
  teamButtonTextActive: {
    color: Colors.canvas,
  },
  topicInput: {
    backgroundColor: Colors.canvas,
    color: Colors.ink,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontFamily: Fonts.body,
    fontSize: 15,
  },
  bottomAction: {
    paddingTop: 12,
  },
});
