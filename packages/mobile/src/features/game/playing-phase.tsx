// ⚠️ オンライン用の「質問-投票」画面。現在オフラインでは未使用（/playing は play-phase.tsx を表示）。
// オフラインは対面プレイのため質問-投票は不要。オンライン実装時にルートをここへ戻して復帰する。
// 関連する state/関数 (isVoting, questions, startVoting, toggleVote, submitVotes 等) も
// game-context.tsx に温存してある。削除しないこと。
import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AdaptiveScrollView } from '@/components/adaptive-scroll-view';
import { HardShadow } from '@/components/hard-shadow';
import { HighlightHeading } from '@/components/highlight-heading';
import { MakimonoBox } from '@/components/makimono-box';
import { PhaseFrame } from '@/components/phase-frame';
import { ThemedText } from '@/components/themed-text';
import { BreakLine } from '@/components/ui/break-line';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { StampLabel } from '@/components/ui/stamp-label';
import { Colors, Spacing, Type } from '@/constants/theme';

import type { GameState, Player, Question } from './types';

type Props = {
  gameState: GameState;
  isVoting: boolean;
  currentPlayer: Player | undefined;
  currentQuestion: Question | undefined;
  questionText: string;
  currentVotes: Record<string, 'yes' | 'no'>;
  onSetQuestionText: (text: string) => void;
  onStartVoting: () => void;
  onToggleVote: (playerId: string) => void;
  onSubmitVotes: () => void;
  onEndGame: () => void;
};

const BORDER = 3;

export function PlayingPhase({
  gameState,
  isVoting,
  currentPlayer,
  currentQuestion,
  questionText,
  currentVotes,
  onSetQuestionText,
  onStartVoting,
  onToggleVote,
  onSubmitVotes,
  onEndGame,
}: Props) {
  return (
    <PhaseFrame backgroundColor={isVoting ? Colors.spark : Colors.canvas} frameColor={Colors.ink}>
      <View style={styles.gameHeader}>
        <ThemedText type="labelLg" style={{ color: isVoting ? Colors.canvas : Colors.ink }}>
          ワードニンジャ
        </ThemedText>
        <HardShadow>
          <Pressable style={styles.endGameButton} onPress={onEndGame}>
            <ThemedText type="labelSm">ゲーム終了</ThemedText>
          </Pressable>
        </HardShadow>
      </View>
      <BreakLine />

      {!isVoting && (
        <AdaptiveScrollView style={styles.scrollArea} contentContainerStyle={styles.gameContent}>
          <View style={styles.turnWrap}>
            <StampLabel>CURRENT TURN</StampLabel>
            <HighlightHeading type="h1" overflowX={0} marginBottom={Spacing.sm}>
              {currentPlayer?.name ?? ''}
            </HighlightHeading>
            <ThemedText type="bodySm" themeColor="inkSoft">
              質問を考えてください
            </ThemedText>
          </View>

          <MakimonoBox contentStyle={styles.questionCard}>
            <ThemedText type="labelSm">質問内容 (任意)</ThemedText>
            <TextInput
              value={questionText}
              onChangeText={onSetQuestionText}
              placeholder="例: それは食べ物ですか？"
              placeholderTextColor={Colors.inkMute}
              style={[Type.body, styles.questionInput]}
              multiline
            />
            <SecondaryButton
              label="質問して投票へ"
              onPress={onStartVoting}
              disabled={!questionText.trim()}
            />
          </MakimonoBox>

          <BreakLine />
          <StampLabel>履歴 · HISTORY</StampLabel>

          <View style={styles.historyWrap}>
            {gameState.questions.filter((q) => q.revealed).length === 0 && (
              <ThemedText type="bodySm" themeColor="inkSoft">
                まだ質問はありません
              </ThemedText>
            )}

            {[...gameState.questions]
              .reverse()
              .filter((q) => q.revealed)
              .map((question) => {
                const yesCount = Object.values(question.votes).filter((v) => v === 'yes').length;
                const noCount = Object.values(question.votes).filter((v) => v === 'no').length;
                const asker = gameState.players.find((p) => p.id === question.askerId);

                return (
                  <MakimonoBox key={question.id} contentStyle={styles.historyItemContent}>
                    <ThemedText type="labelSm" style={styles.historyMeta}>
                      {asker?.name} の質問
                    </ThemedText>
                    <ThemedText type="body" style={styles.historyQuestion}>
                      {question.text}
                    </ThemedText>
                    <View style={styles.voteResultRow}>
                      <View style={[styles.voteResultCard, styles.voteResultYes]}>
                        <ThemedText type="label">はい</ThemedText>
                        <ThemedText type="labelLg">{yesCount}</ThemedText>
                      </View>
                      <View style={[styles.voteResultCard, styles.voteResultNo]}>
                        <ThemedText type="label">いいえ</ThemedText>
                        <ThemedText type="labelLg">{noCount}</ThemedText>
                      </View>
                    </View>
                  </MakimonoBox>
                );
              })}
          </View>
        </AdaptiveScrollView>
      )}

      {isVoting && currentQuestion && (
        <View style={styles.votingWrap}>
          <StampLabel color={Colors.canvas}>VOTING PHASE</StampLabel>
          <HighlightHeading
            type="h2"
            overflowX={0}
            borderColor={Colors.canvas}
            color={Colors.canvas}>
            {currentQuestion.text}
          </HighlightHeading>
          <ThemedText type="bodySm" style={{ color: Colors.canvas }}>
            全員の回答を入力してください
          </ThemedText>

          <AdaptiveScrollView style={styles.voteList} contentContainerStyle={styles.voteListContent}>
            <MakimonoBox contentStyle={styles.makimonoContent}>
              {gameState.players.map((player, index) => {
                const isYes = currentVotes[player.id] === 'yes';

                return (
                  <View key={player.id}>
                    {index > 0 && <View style={styles.makimonoDivider} />}
                    <View style={styles.voteRow}>
                      <ThemedText type="label">{player.name}</ThemedText>
                      <Pressable
                        onPress={() => onToggleVote(player.id)}
                        style={[styles.voteButton, isYes ? styles.voteYes : styles.voteNo]}>
                        <ThemedText type="label">{isYes ? 'はい' : 'いいえ'}</ThemedText>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </MakimonoBox>
          </AdaptiveScrollView>

          <PrimaryButton label="回答を確定して共有" onPress={onSubmitVotes} />
        </View>
      )}
    </PhaseFrame>
  );
}

const styles = StyleSheet.create({
  scrollArea: {
    flex: 1,
    marginHorizontal: -Spacing.sm,
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  endGameButton: {
    borderWidth: BORDER,
    borderColor: Colors.ink,
    backgroundColor: Colors.canvas,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  gameContent: {
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xl2,
  },
  turnWrap: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  questionCard: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  questionInput: {
    minHeight: 90,
    backgroundColor: Colors.paper,
    color: Colors.ink,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    textAlignVertical: 'top',
  },
  historyWrap: {
    gap: Spacing.lg,
  },
  historyItemContent: {
    padding: Spacing.lg,
  },
  historyMeta: {
    color: Colors.inkSoft,
    marginBottom: Spacing.sm,
  },
  historyQuestion: {
    marginBottom: Spacing.md,
  },
  voteResultRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  voteResultCard: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voteResultYes: {
    backgroundColor: Colors.hero,
  },
  voteResultNo: {
    backgroundColor: Colors.canvas,
  },
  votingWrap: {
    flex: 1,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  voteList: {
    flex: 1,
    marginTop: Spacing.sm,
    marginHorizontal: -Spacing.sm,
  },
  voteListContent: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
  },
  makimonoContent: {
    paddingVertical: Spacing.xs,
  },
  makimonoDivider: {
    height: 1,
    backgroundColor: Colors.paperDeep,
    marginHorizontal: Spacing.md,
  },
  voteRow: {
    backgroundColor: Colors.canvas,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voteButton: {
    minWidth: 100,
    borderWidth: BORDER,
    borderColor: Colors.ink,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  voteYes: {
    backgroundColor: Colors.hero,
  },
  voteNo: {
    backgroundColor: Colors.canvas,
  },
});
