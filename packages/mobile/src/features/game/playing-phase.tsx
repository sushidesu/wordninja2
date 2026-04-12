import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AdaptiveScrollView } from '@/components/adaptive-scroll-view';
import { HardShadow } from '@/components/hard-shadow';
import { HighlightHeading } from '@/components/highlight-heading';
import { MakimonoBox } from '@/components/makimono-box';
import { PhaseFrame } from '@/components/phase-frame';
import { BreakLine } from '@/components/ui/break-line';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { StampLabel } from '@/components/ui/stamp-label';
import { Colors, Fonts } from '@/constants/theme';

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
    <PhaseFrame
      backgroundColor={isVoting ? Colors.spark : Colors.canvas}
      frameColor={Colors.ink}>
      <View style={styles.gameHeader}>
        <Text
          style={[
            styles.gameHeaderTitle,
            { color: isVoting ? Colors.canvas : Colors.ink },
          ]}>
          ワードニンジャ
        </Text>
        <HardShadow>
          <Pressable style={styles.endGameButton} onPress={onEndGame}>
            <Text style={styles.endGameButtonText}>ゲーム終了</Text>
          </Pressable>
        </HardShadow>
      </View>
      <BreakLine />

      {!isVoting && (
        <AdaptiveScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.gameContent}>
          <View style={styles.turnWrap}>
            <StampLabel>CURRENT TURN</StampLabel>
            <HighlightHeading fontSize={44} overflowX={0} marginBottom={8}>
              {currentPlayer?.name ?? ''}
            </HighlightHeading>
            <Text style={styles.turnHint}>質問を考えてください</Text>
          </View>

          <MakimonoBox contentStyle={styles.questionCard}>
            <Text style={styles.settingLabel}>質問内容 (任意)</Text>
            <TextInput
              value={questionText}
              onChangeText={onSetQuestionText}
              placeholder="例: それは食べ物ですか？"
              placeholderTextColor={Colors.inkMute}
              style={styles.questionInput}
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
              <Text style={styles.emptyHistory}>まだ質問はありません</Text>
            )}

            {[...gameState.questions]
              .reverse()
              .filter((q) => q.revealed)
              .map((question) => {
                const yesCount = Object.values(question.votes).filter(
                  (v) => v === 'yes',
                ).length;
                const noCount = Object.values(question.votes).filter(
                  (v) => v === 'no',
                ).length;
                const asker = gameState.players.find((p) => p.id === question.askerId);

                return (
                  <MakimonoBox key={question.id} contentStyle={styles.historyItemContent}>
                    <Text style={styles.historyMeta}>{asker?.name} の質問</Text>
                    <Text style={styles.historyQuestion}>{question.text}</Text>
                    <View style={styles.voteResultRow}>
                      <View style={[styles.voteResultCard, styles.voteResultYes]}>
                        <Text style={styles.yesText}>はい</Text>
                        <Text style={styles.voteCount}>{yesCount}</Text>
                      </View>
                      <View style={[styles.voteResultCard, styles.voteResultNo]}>
                        <Text style={styles.noText}>いいえ</Text>
                        <Text style={styles.voteCount}>{noCount}</Text>
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
            fontSize={32}
            overflowX={0}
            borderColor={Colors.canvas}
            color={Colors.canvas}>
            {currentQuestion.text}
          </HighlightHeading>
          <Text style={[styles.turnHint, { color: Colors.canvas }]}>
            全員の回答を入力してください
          </Text>

          <AdaptiveScrollView
            style={styles.voteList}
            contentContainerStyle={styles.voteListContent}>
            <MakimonoBox contentStyle={styles.makimonoContent}>
              {gameState.players.map((player, index) => {
                const isYes = currentVotes[player.id] === 'yes';

                return (
                  <View key={player.id}>
                    {index > 0 && <View style={styles.makimonoDivider} />}
                    <View style={styles.voteRow}>
                      <Text style={styles.votePlayerName}>{player.name}</Text>
                      <Pressable
                        onPress={() => onToggleVote(player.id)}
                        style={[styles.voteButton, isYes ? styles.voteYes : styles.voteNo]}>
                        <Text style={styles.voteButtonText}>
                          {isYes ? 'はい' : 'いいえ'}
                        </Text>
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
    marginHorizontal: -8,
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
  gameHeaderTitle: {
    fontFamily: Fonts.display,
    fontSize: 22,
    letterSpacing: 1,
  },
  endGameButton: {
    borderWidth: BORDER,
    borderColor: Colors.ink,
    backgroundColor: Colors.canvas,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  endGameButtonText: {
    color: Colors.ink,
    fontSize: 11,
    fontFamily: Fonts.display,
    letterSpacing: 1,
  },
  gameContent: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 24,
  },
  turnWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  turnHint: {
    color: Colors.inkSoft,
    fontSize: 13,
    fontFamily: Fonts.body,
  },
  settingLabel: {
    color: Colors.ink,
    fontFamily: Fonts.display,
    fontSize: 12,
    letterSpacing: 1,
  },
  questionCard: {
    padding: 16,
    gap: 12,
  },
  questionInput: {
    minHeight: 90,
    backgroundColor: Colors.paper,
    color: Colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlignVertical: 'top',
    fontFamily: Fonts.body,
    fontSize: 15,
  },
  historyWrap: {
    gap: 14,
  },
  emptyHistory: {
    color: Colors.inkSoft,
    fontFamily: Fonts.body,
    fontSize: 13,
  },
  historyItemContent: {
    padding: 14,
  },
  historyMeta: {
    color: Colors.inkSoft,
    fontSize: 11,
    fontFamily: Fonts.display,
    letterSpacing: 1,
    marginBottom: 6,
  },
  historyQuestion: {
    color: Colors.ink,
    fontFamily: Fonts.body,
    fontSize: 16,
    marginBottom: 12,
  },
  voteResultRow: {
    flexDirection: 'row',
    gap: 10,
  },
  voteResultCard: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
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
  yesText: {
    color: Colors.ink,
    fontFamily: Fonts.display,
    fontSize: 14,
    letterSpacing: 1,
  },
  noText: {
    color: Colors.ink,
    fontFamily: Fonts.display,
    fontSize: 14,
    letterSpacing: 1,
  },
  voteCount: {
    color: Colors.ink,
    fontFamily: Fonts.display,
    fontSize: 22,
  },
  votingWrap: {
    flex: 1,
    paddingTop: 10,
    paddingBottom: 20,
    gap: 12,
  },
  voteList: {
    flex: 1,
    marginTop: 8,
    marginHorizontal: -8,
  },
  voteListContent: {
    paddingHorizontal: 8,
    paddingBottom: 8,
    gap: 10,
  },
  makimonoContent: {
    paddingVertical: 4,
  },
  makimonoDivider: {
    height: 1,
    backgroundColor: Colors.paperDeep,
    marginHorizontal: 12,
  },
  voteRow: {
    backgroundColor: Colors.canvas,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  votePlayerName: {
    color: Colors.ink,
    fontFamily: Fonts.display,
    fontSize: 16,
    letterSpacing: 1,
  },
  voteButton: {
    minWidth: 100,
    borderWidth: BORDER,
    borderColor: Colors.ink,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  voteYes: {
    backgroundColor: Colors.hero,
  },
  voteNo: {
    backgroundColor: Colors.canvas,
  },
  voteButtonText: {
    color: Colors.ink,
    fontFamily: Fonts.display,
    fontSize: 14,
    letterSpacing: 1,
  },
});
