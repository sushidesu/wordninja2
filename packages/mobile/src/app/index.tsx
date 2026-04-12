import React, { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { AdaptiveScrollView } from '@/components/adaptive-scroll-view';
import { HardShadow } from '@/components/hard-shadow';
import { HighlightHeading } from '@/components/highlight-heading';
import { PhaseFrame } from '@/components/phase-frame';
import { Colors, Fonts, TeamColors } from '@/constants/theme';

type Player = {
  id: string;
  name: string;
  teamId?: string;
  topic?: string;
};

type Team = {
  id: string;
  name: string;
  color: string;
  topic: string;
};

type Question = {
  id: string;
  askerId: string;
  text: string;
  votes: Record<string, 'yes' | 'no'>;
  revealed: boolean;
};

type GamePhase = 'setup' | 'assignment' | 'playing' | 'voting' | 'result';

type GameState = {
  phase: GamePhase;
  players: Player[];
  teams: Team[];
  questions: Question[];
  currentTurnPlayerIndex: number;
};

const INITIAL_GAME_STATE: GameState = {
  phase: 'setup',
  players: [],
  teams: [],
  questions: [],
  currentTurnPlayerIndex: 0,
};

const TOPICS = [
  { teamA: 'おにぎり', teamB: 'サンドイッチ' },
  { teamA: '犬', teamB: '猫' },
  { teamA: '海', teamB: '山' },
  { teamA: 'コーヒー', teamB: '紅茶' },
  { teamA: '夏', teamB: '冬' },
  { teamA: '映画', teamB: '小説' },
  { teamA: '遊園地', teamB: '水族館' },
  { teamA: 'カレー', teamB: 'ラーメン' },
  { teamA: 'ピアノ', teamB: 'ギター' },
  { teamA: 'サッカー', teamB: '野球' },
];

function generateTeams(teamCount: number, customTopics?: { teamA: string; teamB: string }): Team[] {
  const teamNames = ['赤チーム', '青チーム', '緑チーム', '黄チーム'];
  const selected = customTopics ?? TOPICS[Math.floor(Math.random() * TOPICS.length)];
  const topics = [selected.teamA, selected.teamB];

  return Array.from({ length: teamCount }, (_, index) => ({
    id: `team-${index}`,
    name: teamNames[index % teamNames.length],
    color: TeamColors[index % TeamColors.length],
    topic: topics[index % topics.length] ?? '???',
  }));
}

function assignPlayersToTeams(players: Player[], teams: Team[]): Player[] {
  const shuffled = [...players].sort(() => Math.random() - 0.5);

  return shuffled.map((player, index) => {
    const team = teams[index % teams.length];
    return {
      ...player,
      teamId: team.id,
      topic: team.topic,
    };
  });
}

function setupInitialVotes(players: Player[]): Record<string, 'yes' | 'no'> {
  return players.reduce<Record<string, 'yes' | 'no'>>((acc, player) => {
    acc[player.id] = 'yes';
    return acc;
  }, {});
}

// ---- 再利用パーツ ----

type StampLabelProps = {
  children: React.ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
};

function StampLabel({ children, color = Colors.ink, style }: StampLabelProps) {
  return (
    <Text style={[styles.stamp, { color }, style]}>{children}</Text>
  );
}

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

function PrimaryButton({ label, onPress, disabled }: PrimaryButtonProps) {
  return (
    <HardShadow style={[styles.primaryShadowWrap, disabled && styles.disabled]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>{label}</Text>
      </Pressable>
    </HardShadow>
  );
}

type SecondaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

function SecondaryButton({ label, onPress, disabled }: SecondaryButtonProps) {
  return (
    <HardShadow style={[styles.secondaryShadowWrap, disabled && styles.disabled]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>{label}</Text>
      </Pressable>
    </HardShadow>
  );
}

function BreakLine() {
  return <View style={styles.breakLine} />;
}

// ---- メイン ----

export default function HomeScreen() {
  const [gameState, setGameState] = useState<GameState>(INITIAL_GAME_STATE);

  const [setupPlayers, setSetupPlayers] = useState<Player[]>([
    { id: '1', name: 'プレイヤー1' },
    { id: '2', name: 'プレイヤー2' },
    { id: '3', name: 'プレイヤー3' },
    { id: '4', name: 'プレイヤー4' },
  ]);
  const [teamCount, setTeamCount] = useState(2);
  const [useCustomTopic, setUseCustomTopic] = useState(false);
  const [customTopicA, setCustomTopicA] = useState('');
  const [customTopicB, setCustomTopicB] = useState('');

  const [assignmentIndex, setAssignmentIndex] = useState(0);
  const [assignmentRevealed, setAssignmentRevealed] = useState(false);

  const [questionText, setQuestionText] = useState('');
  const [currentVotes, setCurrentVotes] = useState<Record<string, 'yes' | 'no'>>({});

  const currentPlayer = gameState.players[gameState.currentTurnPlayerIndex];
  const currentQuestion = useMemo(
    () => gameState.questions.find((question) => !question.revealed),
    [gameState.questions],
  );

  const startGame = () => {
    if (setupPlayers.length < 2) {
      return;
    }

    const customTopics =
      useCustomTopic && customTopicA.trim() && customTopicB.trim()
        ? { teamA: customTopicA.trim(), teamB: customTopicB.trim() }
        : undefined;

    const teams = generateTeams(teamCount, customTopics);
    const assigned = assignPlayersToTeams(setupPlayers, teams);

    setGameState({
      phase: 'assignment',
      players: assigned,
      teams,
      questions: [],
      currentTurnPlayerIndex: Math.floor(Math.random() * setupPlayers.length),
    });

    setAssignmentIndex(0);
    setAssignmentRevealed(false);
    setQuestionText('');
    setCurrentVotes({});
  };

  const restartGame = () => {
    setGameState(INITIAL_GAME_STATE);
    setAssignmentIndex(0);
    setAssignmentRevealed(false);
    setQuestionText('');
    setCurrentVotes({});
  };

  const proceedAssignment = () => {
    if (assignmentIndex < gameState.players.length - 1) {
      setAssignmentIndex((prev) => prev + 1);
      setAssignmentRevealed(false);
      return;
    }

    setGameState((prev) => ({
      ...prev,
      phase: 'playing',
    }));
  };

  const startVoting = () => {
    const trimmed = questionText.trim();
    if (!trimmed || !currentPlayer) {
      return;
    }

    const newQuestion: Question = {
      id: String(Date.now()),
      askerId: currentPlayer.id,
      text: trimmed,
      votes: {},
      revealed: false,
    };

    setGameState((prev) => ({
      ...prev,
      questions: [...prev.questions, newQuestion],
      phase: 'voting',
    }));
    setCurrentVotes(setupInitialVotes(gameState.players));
    setQuestionText('');
  };

  const toggleVote = (playerId: string) => {
    setCurrentVotes((prev) => ({
      ...prev,
      [playerId]: prev[playerId] === 'yes' ? 'no' : 'yes',
    }));
  };

  const submitVotes = () => {
    if (!currentQuestion) {
      return;
    }

    setGameState((prev) => {
      const updated = prev.questions.map((question) =>
        question.id === currentQuestion.id
          ? {
              ...question,
              votes: currentVotes,
              revealed: true,
            }
          : question,
      );

      return {
        ...prev,
        questions: updated,
        currentTurnPlayerIndex: (prev.currentTurnPlayerIndex + 1) % prev.players.length,
        phase: 'playing',
      };
    });

    setCurrentVotes({});
  };

  const addPlayer = () => {
    const newId = String(Date.now());
    setSetupPlayers((prev) => [...prev, { id: newId, name: `プレイヤー${prev.length + 1}` }]);
  };

  const updatePlayerName = (playerId: string, name: string) => {
    setSetupPlayers((prev) =>
      prev.map((player) => (player.id === playerId ? { ...player, name } : player)),
    );
  };

  const removePlayer = (playerId: string) => {
    setSetupPlayers((prev) => prev.filter((player) => player.id !== playerId));
  };

  // ---- SETUP PHASE ----
  if (gameState.phase === 'setup') {
    return (
      <PhaseFrame
        backgroundColor={Colors.canvas}
        phaseLabel="PHASE 01 · SETUP">
        <HighlightHeading fontSize={56} overflowX={0}>
          ワードニンジャ
        </HighlightHeading>
        <Text style={styles.subtitle}>チーム対戦型推理ゲーム</Text>

        <AdaptiveScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.setupContent}>
          <StampLabel>参加者 · {setupPlayers.length} PLAYERS</StampLabel>

          {setupPlayers.map((player) => (
            <View key={player.id} style={styles.playerRow}>
              <HardShadow style={styles.playerInputShadow}>
                <TextInput
                  value={player.name}
                  onChangeText={(value) => updatePlayerName(player.id, value)}
                  placeholder="名前を入力"
                  placeholderTextColor={Colors.inkMute}
                  style={styles.playerInput}
                />
              </HardShadow>
              <HardShadow>
                <Pressable
                  onPress={() => removePlayer(player.id)}
                  style={styles.removeButton}>
                  <Text style={styles.removeButtonText}>×</Text>
                </Pressable>
              </HardShadow>
            </View>
          ))}

          <HardShadow style={styles.addPlayerShadow}>
            <Pressable onPress={addPlayer} style={styles.addPlayerButton}>
              <Text style={styles.addPlayerText}>+ プレイヤーを追加</Text>
            </Pressable>
          </HardShadow>

          <BreakLine />

          <StampLabel>設定 · SETTINGS</StampLabel>

          <View style={styles.settingsBlock}>
            <Text style={styles.settingLabel}>チーム数</Text>
            <View style={styles.teamButtonsRow}>
              {[2, 3, 4].map((count) => {
                const active = teamCount === count;
                return (
                  <HardShadow key={count} style={styles.teamButtonShadow}>
                    <Pressable
                      onPress={() => setTeamCount(count)}
                      style={[styles.teamButton, active && styles.teamButtonActive]}>
                      <Text
                        style={[
                          styles.teamButtonText,
                          active && styles.teamButtonTextActive,
                        ]}>
                        {count}
                      </Text>
                    </Pressable>
                  </HardShadow>
                );
              })}
            </View>

            <View style={styles.customTopicRow}>
              <Text style={styles.settingLabel}>お題を手動で設定する</Text>
              <Switch
                value={useCustomTopic}
                onValueChange={setUseCustomTopic}
                trackColor={{ false: Colors.paperDeep, true: Colors.hero }}
                thumbColor={Colors.canvas}
              />
            </View>

            {useCustomTopic && (
              <View style={styles.customTopicInputs}>
                <HardShadow style={styles.topicInputShadow}>
                  <TextInput
                    value={customTopicA}
                    onChangeText={setCustomTopicA}
                    placeholder="チームAのお題 (例: 犬)"
                    placeholderTextColor={Colors.inkMute}
                    style={styles.topicInput}
                  />
                </HardShadow>
                <HardShadow style={styles.topicInputShadow}>
                  <TextInput
                    value={customTopicB}
                    onChangeText={setCustomTopicB}
                    placeholder="チームBのお題 (例: 猫)"
                    placeholderTextColor={Colors.inkMute}
                    style={styles.topicInput}
                  />
                </HardShadow>
              </View>
            )}
          </View>
        </AdaptiveScrollView>

        <View style={styles.bottomAction}>
          <PrimaryButton
            label="▶ ゲーム開始"
            onPress={startGame}
            disabled={setupPlayers.length < 2}
          />
        </View>
      </PhaseFrame>
    );
  }

  // ---- ASSIGNMENT PHASE ----
  if (gameState.phase === 'assignment') {
    const player = gameState.players[assignmentIndex];

    return (
      <PhaseFrame
        backgroundColor={Colors.hero}
        phaseLabel="PHASE 02 · ASSIGNMENT"
        frameColor={Colors.ink}
        labelColor={Colors.canvas}>
        <View style={styles.assignmentContainer}>
          <StampLabel color={Colors.canvas}>PLAYER CHECK</StampLabel>
          <Text style={styles.assignmentName}>{player?.name}さん</Text>

          {!assignmentRevealed ? (
            <HardShadow style={styles.centerShadow}>
              <Pressable
                style={styles.hiddenCard}
                onPress={() => setAssignmentRevealed(true)}>
                <Text style={styles.hiddenCardIcon}>👁</Text>
                <Text style={styles.hiddenCardTitle}>タップしてお題を確認</Text>
                <Text style={styles.hiddenCardNote}>
                  ※他の人に見られないようにしてください
                </Text>
              </Pressable>
            </HardShadow>
          ) : (
            <HardShadow style={styles.centerShadow}>
              <View style={styles.revealedCard}>
                <StampLabel>あなたのお題</StampLabel>
                <Text style={styles.revealedTopic}>{player?.topic}</Text>
                <Pressable onPress={() => setAssignmentRevealed(false)}>
                  <Text style={styles.hideLink}>隠す</Text>
                </Pressable>
              </View>
            </HardShadow>
          )}

          <View style={styles.assignmentBottom}>
            {assignmentRevealed ? (
              <PrimaryButton
                label={
                  assignmentIndex < gameState.players.length - 1
                    ? '次の人へ渡す'
                    : '全員確認完了'
                }
                onPress={proceedAssignment}
              />
            ) : (
              <Text style={styles.assignmentHint}>本人以外は見ないでください</Text>
            )}

            <View style={styles.progressRow}>
              {gameState.players.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.progressDot,
                    index === assignmentIndex
                      ? styles.progressDotActive
                      : index < assignmentIndex
                        ? styles.progressDotDone
                        : undefined,
                  ]}
                />
              ))}
            </View>
          </View>
        </View>
      </PhaseFrame>
    );
  }

  // ---- RESULT PHASE ----
  if (gameState.phase === 'result') {
    return (
      <PhaseFrame
        backgroundColor={Colors.hero}
        phaseLabel="PHASE 05 · RESULT"
        frameColor={Colors.ink}
        labelColor={Colors.canvas}>
        <AdaptiveScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.resultContent}>
          <HighlightHeading
            fontSize={48}
            overflowX={0}
            borderColor={Colors.ink}
            color={Colors.ink}>
            結果発表
          </HighlightHeading>
          <Text style={[styles.subtitle, { color: Colors.ink }]}>
            正体とお題を公開します
          </Text>

          {gameState.teams.map((team) => (
            <HardShadow key={team.id} style={styles.teamCardShadow}>
              <View style={styles.teamCard}>
                <View style={[styles.teamCardHeader, { backgroundColor: team.color }]}>
                  <Text style={styles.teamName}>{team.name}</Text>
                  <Text style={styles.teamTopic}>{team.topic}</Text>
                </View>
                <View style={styles.teamPlayersWrap}>
                  {gameState.players
                    .filter((player) => player.teamId === team.id)
                    .map((player) => (
                      <View key={player.id} style={styles.teamPlayerRow}>
                        <View style={styles.playerAvatar}>
                          <Text style={styles.playerAvatarText}>
                            {player.name.charAt(0)}
                          </Text>
                        </View>
                        <Text style={styles.teamPlayerName}>{player.name}</Text>
                      </View>
                    ))}
                </View>
              </View>
            </HardShadow>
          ))}
        </AdaptiveScrollView>

        <View style={styles.bottomAction}>
          <SecondaryButton label="もう一度遊ぶ" onPress={restartGame} />
        </View>
      </PhaseFrame>
    );
  }

  // ---- PLAYING or VOTING PHASE ----
  const isVoting = gameState.phase === 'voting';
  return (
    <PhaseFrame
      backgroundColor={isVoting ? Colors.spark : Colors.canvas}
      phaseLabel={isVoting ? 'PHASE 04 · VOTING' : 'PHASE 03 · PLAYING'}
      frameColor={Colors.ink}
      labelColor={isVoting ? Colors.canvas : Colors.ink}>
      <View style={styles.gameHeader}>
        <Text
          style={[
            styles.gameHeaderTitle,
            { color: isVoting ? Colors.canvas : Colors.ink },
          ]}>
          ワードニンジャ
        </Text>
        <HardShadow>
          <Pressable
            style={styles.endGameButton}
            onPress={() => setGameState((prev) => ({ ...prev, phase: 'result' }))}>
            <Text style={styles.endGameButtonText}>ゲーム終了</Text>
          </Pressable>
        </HardShadow>
      </View>
      <BreakLine />

      {gameState.phase === 'playing' && (
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

          <HardShadow style={styles.questionCardShadow}>
            <View style={styles.questionCard}>
              <Text style={styles.settingLabel}>質問内容 (任意)</Text>
              <TextInput
                value={questionText}
                onChangeText={setQuestionText}
                placeholder="例: それは食べ物ですか？"
                placeholderTextColor={Colors.inkMute}
                style={styles.questionInput}
                multiline
              />
              <SecondaryButton
                label="質問して投票へ"
                onPress={startVoting}
                disabled={!questionText.trim()}
              />
            </View>
          </HardShadow>

          <BreakLine />
          <StampLabel>履歴 · HISTORY</StampLabel>

          <View style={styles.historyWrap}>
            {gameState.questions.filter((question) => question.revealed).length === 0 && (
              <Text style={styles.emptyHistory}>まだ質問はありません</Text>
            )}

            {[...gameState.questions]
              .reverse()
              .filter((question) => question.revealed)
              .map((question) => {
                const yesCount = Object.values(question.votes).filter(
                  (vote) => vote === 'yes',
                ).length;
                const noCount = Object.values(question.votes).filter(
                  (vote) => vote === 'no',
                ).length;
                const asker = gameState.players.find(
                  (player) => player.id === question.askerId,
                );

                return (
                  <HardShadow key={question.id} style={styles.historyItemShadow}>
                    <View style={styles.historyItem}>
                      <Text style={styles.historyMeta}>{asker?.name} の質問</Text>
                      <Text style={styles.historyQuestion}>{question.text}</Text>
                      <View style={styles.voteResultRow}>
                        <View style={[styles.voteResultCard, styles.voteResultYes]}>
                          <Text style={styles.yesText}>はい</Text>
                          <Text style={styles.voteCountYes}>{yesCount}</Text>
                        </View>
                        <View style={[styles.voteResultCard, styles.voteResultNo]}>
                          <Text style={styles.noText}>いいえ</Text>
                          <Text style={styles.voteCountNo}>{noCount}</Text>
                        </View>
                      </View>
                    </View>
                  </HardShadow>
                );
              })}
          </View>
        </AdaptiveScrollView>
      )}

      {gameState.phase === 'voting' && currentQuestion && (
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
            {gameState.players.map((player) => {
              const isYes = currentVotes[player.id] === 'yes';

              return (
                <HardShadow key={player.id} style={styles.voteRowShadow}>
                  <View style={styles.voteRow}>
                    <Text style={styles.votePlayerName}>{player.name}</Text>
                    <Pressable
                      onPress={() => toggleVote(player.id)}
                      style={[styles.voteButton, isYes ? styles.voteYes : styles.voteNo]}>
                      <Text style={styles.voteButtonText}>
                        {isYes ? 'はい' : 'いいえ'}
                      </Text>
                    </Pressable>
                  </View>
                </HardShadow>
              );
            })}
          </AdaptiveScrollView>

          <PrimaryButton label="回答を確定して共有" onPress={submitVotes} />
        </View>
      )}
    </PhaseFrame>
  );
}

// ---- スタイル: deviation の造形ルール (radius=0, border=3px, display=DotGothic16) ----

const BORDER = 3;

const styles = StyleSheet.create({
  // ---- 共通テキスト ----
  subtitle: {
    color: Colors.inkSoft,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
    fontFamily: Fonts.body,
    fontSize: 14,
  },
  stamp: {
    fontFamily: Fonts.display,
    fontSize: 11,
    letterSpacing: 2,
    color: Colors.ink,
    marginBottom: 10,
    marginTop: 4,
  },
  scrollArea: {
    flex: 1,
    marginHorizontal: -8,
  },
  setupContent: {
    paddingHorizontal: 8,
    paddingBottom: 120,
  },
  // ---- SETUP ----
  playerRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  playerInputShadow: {
    flex: 1,
  },
  playerInput: {
    borderWidth: BORDER,
    borderColor: Colors.ink,
    backgroundColor: Colors.canvas,
    color: Colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.body,
    fontSize: 15,
  },
  removeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.canvas,
    borderWidth: BORDER,
    borderColor: Colors.ink,
  },
  removeButtonText: {
    color: Colors.danger,
    fontSize: 22,
    fontFamily: Fonts.display,
    marginTop: -2,
  },
  addPlayerShadow: {
    marginBottom: 16,
  },
  addPlayerButton: {
    borderWidth: BORDER,
    borderColor: Colors.ink,
    backgroundColor: Colors.canvas,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addPlayerText: {
    color: Colors.ink,
    fontFamily: Fonts.display,
    fontSize: 13,
    letterSpacing: 1,
  },
  settingsBlock: {
    gap: 10,
  },
  settingLabel: {
    color: Colors.ink,
    fontFamily: Fonts.display,
    fontSize: 12,
    letterSpacing: 1,
    marginTop: 4,
    marginBottom: 2,
  },
  teamButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
  },
  teamButtonShadow: {
    flex: 1,
  },
  teamButton: {
    paddingVertical: 12,
    backgroundColor: Colors.canvas,
    borderWidth: BORDER,
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
  customTopicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  customTopicInputs: {
    gap: 10,
    marginTop: 4,
  },
  topicInputShadow: {},
  topicInput: {
    borderWidth: BORDER,
    borderColor: Colors.ink,
    backgroundColor: Colors.canvas,
    color: Colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.body,
    fontSize: 15,
  },
  // ---- 共通: ボトムアクション ----
  bottomAction: {
    paddingTop: 12,
  },
  // ---- PRIMARY/SECONDARY ボタン ----
  primaryShadowWrap: {},
  primaryButton: {
    backgroundColor: Colors.hero,
    borderWidth: BORDER,
    borderColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: Colors.ink,
    fontFamily: Fonts.display,
    fontSize: 20,
    letterSpacing: 2,
  },
  secondaryShadowWrap: {},
  secondaryButton: {
    backgroundColor: Colors.canvas,
    borderWidth: BORDER,
    borderColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: Colors.ink,
    fontFamily: Fonts.display,
    fontSize: 16,
    letterSpacing: 2,
  },
  disabled: {
    opacity: 0.45,
  },
  // ---- BreakLine ----
  breakLine: {
    height: BORDER,
    backgroundColor: Colors.ink,
    marginVertical: 20,
  },
  // ---- ASSIGNMENT ----
  assignmentContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 20,
  },
  assignmentName: {
    color: Colors.canvas,
    textAlign: 'center',
    marginTop: 4,
    fontSize: 36,
    fontFamily: Fonts.display,
    marginBottom: 24,
  },
  centerShadow: {
    alignSelf: 'center',
    width: '100%',
  },
  hiddenCard: {
    borderWidth: BORDER,
    borderColor: Colors.ink,
    backgroundColor: Colors.canvas,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  hiddenCardIcon: {
    fontSize: 42,
    marginBottom: 10,
  },
  hiddenCardTitle: {
    color: Colors.ink,
    fontSize: 16,
    fontFamily: Fonts.display,
    letterSpacing: 1,
  },
  hiddenCardNote: {
    color: Colors.inkSoft,
    marginTop: 8,
    fontSize: 11,
    fontFamily: Fonts.body,
  },
  revealedCard: {
    borderWidth: BORDER,
    borderColor: Colors.ink,
    backgroundColor: Colors.canvas,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  revealedTopic: {
    color: Colors.ink,
    fontSize: 52,
    fontFamily: Fonts.display,
    marginBottom: 18,
    marginTop: 4,
    textAlign: 'center',
  },
  hideLink: {
    color: Colors.inkSoft,
    fontFamily: Fonts.display,
    fontSize: 12,
    letterSpacing: 1,
  },
  assignmentBottom: {
    marginTop: 22,
    gap: 20,
  },
  assignmentHint: {
    color: Colors.canvas,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: Fonts.body,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  progressDot: {
    width: 10,
    height: 10,
    backgroundColor: Colors.canvas,
    borderWidth: 2,
    borderColor: Colors.ink,
  },
  progressDotDone: {
    backgroundColor: Colors.ink,
  },
  progressDotActive: {
    width: 30,
    backgroundColor: Colors.ink,
  },
  // ---- PLAYING / VOTING ----
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
  questionCardShadow: {
    marginTop: 12,
  },
  questionCard: {
    borderWidth: BORDER,
    borderColor: Colors.ink,
    backgroundColor: Colors.canvas,
    padding: 16,
    gap: 12,
  },
  questionInput: {
    minHeight: 90,
    borderWidth: BORDER,
    borderColor: Colors.ink,
    backgroundColor: Colors.canvas,
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
  historyItemShadow: {},
  historyItem: {
    borderWidth: BORDER,
    borderColor: Colors.ink,
    backgroundColor: Colors.canvas,
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
    borderWidth: BORDER,
    borderColor: Colors.ink,
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
  voteCountYes: {
    color: Colors.ink,
    fontFamily: Fonts.display,
    fontSize: 22,
  },
  voteCountNo: {
    color: Colors.ink,
    fontFamily: Fonts.display,
    fontSize: 22,
  },
  // ---- VOTING ----
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
  voteRowShadow: {},
  voteRow: {
    borderWidth: BORDER,
    borderColor: Colors.ink,
    backgroundColor: Colors.canvas,
    padding: 14,
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
  // ---- RESULT ----
  resultContent: {
    paddingHorizontal: 8,
    paddingBottom: 120,
    gap: 16,
  },
  teamCardShadow: {},
  teamCard: {
    borderWidth: BORDER,
    borderColor: Colors.ink,
    backgroundColor: Colors.canvas,
    overflow: 'hidden',
  },
  teamCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: BORDER,
    borderBottomColor: Colors.ink,
  },
  teamName: {
    color: Colors.canvas,
    fontFamily: Fonts.display,
    fontSize: 18,
    letterSpacing: 1,
  },
  teamTopic: {
    color: Colors.canvas,
    backgroundColor: Colors.overlay,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontFamily: Fonts.display,
    fontSize: 14,
    letterSpacing: 1,
  },
  teamPlayersWrap: {
    padding: 14,
    gap: 10,
  },
  teamPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  playerAvatar: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.hero,
    borderWidth: BORDER,
    borderColor: Colors.ink,
  },
  playerAvatarText: {
    color: Colors.ink,
    fontFamily: Fonts.display,
    fontSize: 16,
  },
  teamPlayerName: {
    color: Colors.ink,
    fontFamily: Fonts.body,
    fontSize: 16,
  },
});
