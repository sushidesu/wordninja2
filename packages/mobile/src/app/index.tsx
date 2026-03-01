import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  const teamColors = ['#dc2626', '#2563eb', '#16a34a', '#ca8a04'];
  const teamNames = ['赤チーム', '青チーム', '緑チーム', '黄チーム'];
  const selected = customTopics ?? TOPICS[Math.floor(Math.random() * TOPICS.length)];
  const topics = [selected.teamA, selected.teamB];

  return Array.from({ length: teamCount }, (_, index) => ({
    id: `team-${index}`,
    name: teamNames[index % teamNames.length],
    color: teamColors[index % teamColors.length],
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

  if (gameState.phase === 'setup') {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.container}>
          <Text style={styles.title}>
            ワード<Text style={styles.titleAccent}>ニンジャ</Text>
          </Text>
          <Text style={styles.subtitle}>チーム対戦型推理ゲーム</Text>

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.setupContent}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>参加者 ({setupPlayers.length}人)</Text>
            </View>

            {setupPlayers.map((player) => (
              <View key={player.id} style={styles.playerRow}>
                <TextInput
                  value={player.name}
                  onChangeText={(value) => updatePlayerName(player.id, value)}
                  placeholder="名前を入力"
                  placeholderTextColor="#71717a"
                  style={styles.playerInput}
                />
                <Pressable onPress={() => removePlayer(player.id)} style={styles.removeButton}>
                  <Text style={styles.removeButtonText}>×</Text>
                </Pressable>
              </View>
            ))}

            <Pressable onPress={addPlayer} style={styles.addPlayerButton}>
              <Text style={styles.addPlayerText}>+ プレイヤーを追加</Text>
            </Pressable>

            <View style={styles.settingsCard}>
              <Text style={styles.sectionTitle}>設定</Text>

              <Text style={styles.settingLabel}>チーム数</Text>
              <View style={styles.teamButtonsRow}>
                {[2, 3, 4].map((count) => (
                  <Pressable
                    key={count}
                    onPress={() => setTeamCount(count)}
                    style={[styles.teamButton, teamCount === count && styles.teamButtonActive]}>
                    <Text
                      style={[
                        styles.teamButtonText,
                        teamCount === count && styles.teamButtonTextActive,
                      ]}>
                      {count}チーム
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.customTopicRow}>
                <Text style={styles.settingLabel}>お題を手動で設定する</Text>
                <Switch
                  value={useCustomTopic}
                  onValueChange={setUseCustomTopic}
                  trackColor={{ false: '#27272a', true: '#dc2626' }}
                  thumbColor="#fafafa"
                />
              </View>

              {useCustomTopic && (
                <View style={styles.customTopicInputs}>
                  <TextInput
                    value={customTopicA}
                    onChangeText={setCustomTopicA}
                    placeholder="チームAのお題 (例: 犬)"
                    placeholderTextColor="#71717a"
                    style={styles.topicInput}
                  />
                  <TextInput
                    value={customTopicB}
                    onChangeText={setCustomTopicB}
                    placeholder="チームBのお題 (例: 猫)"
                    placeholderTextColor="#71717a"
                    style={styles.topicInput}
                  />
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.bottomAction}>
            <Pressable
              disabled={setupPlayers.length < 2}
              onPress={startGame}
              style={[styles.primaryButton, setupPlayers.length < 2 && styles.disabledButton]}>
              <Text style={styles.primaryButtonText}>▶ ゲーム開始</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (gameState.phase === 'assignment') {
    const player = gameState.players[assignmentIndex];

    return (
      <SafeAreaView style={styles.screen}>
        <View style={[styles.container, styles.assignmentContainer]}>
          <Text style={styles.assignmentLabel}>PLAYER CHECK</Text>
          <Text style={styles.assignmentName}>{player?.name}さん</Text>

          {!assignmentRevealed ? (
            <Pressable style={styles.hiddenCard} onPress={() => setAssignmentRevealed(true)}>
              <Text style={styles.hiddenCardIcon}>👁</Text>
              <Text style={styles.hiddenCardTitle}>タップしてお題を確認</Text>
              <Text style={styles.hiddenCardNote}>※他の人に見られないようにしてください</Text>
            </Pressable>
          ) : (
            <View style={styles.revealedCard}>
              <Text style={styles.revealedLabel}>あなたのお題</Text>
              <Text style={styles.revealedTopic}>{player?.topic}</Text>
              <Pressable onPress={() => setAssignmentRevealed(false)}>
                <Text style={styles.hideLink}>隠す</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.assignmentBottom}>
            {assignmentRevealed ? (
              <Pressable style={styles.primaryButton} onPress={proceedAssignment}>
                <Text style={styles.primaryButtonText}>
                  {assignmentIndex < gameState.players.length - 1 ? '次の人へ渡す' : '全員確認完了'}
                </Text>
              </Pressable>
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
      </SafeAreaView>
    );
  }

  if (gameState.phase === 'result') {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.container}>
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.resultContent}>
            <Text style={styles.resultTitle}>結果発表</Text>
            <Text style={styles.subtitle}>正体とお題を公開します</Text>

            {gameState.teams.map((team) => (
              <View key={team.id} style={styles.teamCard}>
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
                          <Text style={styles.playerAvatarText}>{player.name.charAt(0)}</Text>
                        </View>
                        <Text style={styles.teamPlayerName}>{player.name}</Text>
                      </View>
                    ))}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.bottomAction}>
            <Pressable style={styles.secondaryButton} onPress={restartGame}>
              <Text style={styles.secondaryButtonText}>もう一度遊ぶ</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.gameHeader}>
          <Text style={styles.gameHeaderTitle}>
            ワード<Text style={styles.titleAccent}>ニンジャ</Text>
          </Text>
          <Pressable
            style={styles.endGameButton}
            onPress={() => setGameState((prev) => ({ ...prev, phase: 'result' }))}>
            <Text style={styles.endGameButtonText}>ゲーム終了</Text>
          </Pressable>
        </View>

        {gameState.phase === 'playing' && (
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.gameContent}>
            <View style={styles.turnWrap}>
              <Text style={styles.turnLabel}>CURRENT TURN</Text>
              <Text style={styles.turnName}>{currentPlayer?.name}</Text>
              <Text style={styles.turnHint}>質問を考えてください</Text>
            </View>

            <View style={styles.questionCard}>
              <Text style={styles.settingLabel}>質問内容 (任意)</Text>
              <TextInput
                value={questionText}
                onChangeText={setQuestionText}
                placeholder="例: それは食べ物ですか？"
                placeholderTextColor="#71717a"
                style={styles.questionInput}
                multiline
              />
              <Pressable
                onPress={startVoting}
                disabled={!questionText.trim()}
                style={[styles.secondaryButton, !questionText.trim() && styles.disabledButton]}>
                <Text style={styles.secondaryButtonText}>質問して投票へ</Text>
              </Pressable>
            </View>

            <View style={styles.historyWrap}>
              <Text style={styles.historyTitle}>履歴</Text>
              {gameState.questions.filter((question) => question.revealed).length === 0 && (
                <Text style={styles.emptyHistory}>まだ質問はありません</Text>
              )}

              {[...gameState.questions]
                .reverse()
                .filter((question) => question.revealed)
                .map((question) => {
                  const yesCount = Object.values(question.votes).filter((vote) => vote === 'yes').length;
                  const noCount = Object.values(question.votes).filter((vote) => vote === 'no').length;
                  const asker = gameState.players.find((player) => player.id === question.askerId);

                  return (
                    <View key={question.id} style={styles.historyItem}>
                      <Text style={styles.historyMeta}>{asker?.name} の質問</Text>
                      <Text style={styles.historyQuestion}>{question.text}</Text>
                      <View style={styles.voteResultRow}>
                        <View style={styles.voteResultCard}>
                          <Text style={styles.yesText}>はい</Text>
                          <Text style={styles.voteCount}>{yesCount}</Text>
                        </View>
                        <View style={styles.voteResultCard}>
                          <Text style={styles.noText}>いいえ</Text>
                          <Text style={styles.voteCount}>{noCount}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
            </View>
          </ScrollView>
        )}

        {gameState.phase === 'voting' && currentQuestion && (
          <View style={styles.votingWrap}>
            <Text style={styles.votingLabel}>VOTING PHASE</Text>
            <Text style={styles.votingQuestion}>{currentQuestion.text}</Text>
            <Text style={styles.turnHint}>全員の回答を入力してください</Text>

            <ScrollView style={styles.voteList}>
              {gameState.players.map((player) => {
                const isYes = currentVotes[player.id] === 'yes';

                return (
                  <View key={player.id} style={styles.voteRow}>
                    <Text style={styles.votePlayerName}>{player.name}</Text>
                    <Pressable
                      onPress={() => toggleVote(player.id)}
                      style={[styles.voteButton, isYes ? styles.voteYes : styles.voteNo]}>
                      <Text style={styles.voteButtonText}>{isYes ? 'はい' : 'いいえ'}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>

            <Pressable style={styles.secondaryButton} onPress={submitVotes}>
              <Text style={styles.secondaryButtonText}>回答を確定して共有</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    marginTop: 12,
    fontSize: 38,
    fontWeight: '900',
    color: '#fafafa',
    textAlign: 'center',
    letterSpacing: -1,
  },
  titleAccent: {
    color: '#ef4444',
  },
  subtitle: {
    color: '#a1a1aa',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  scrollArea: {
    flex: 1,
  },
  setupContent: {
    paddingBottom: 120,
  },
  sectionHeaderRow: {
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#fafafa',
    fontWeight: '700',
    fontSize: 18,
  },
  playerRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  playerInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3f3f46',
    backgroundColor: '#18181b',
    color: '#fafafa',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  removeButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  removeButtonText: {
    color: '#f87171',
    fontSize: 24,
    marginTop: -2,
  },
  addPlayerButton: {
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#3f3f46',
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  addPlayerText: {
    color: '#d4d4d8',
    fontWeight: '600',
  },
  settingsCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272a',
    backgroundColor: '#111111',
    padding: 14,
    gap: 10,
  },
  settingLabel: {
    color: '#d4d4d8',
    fontWeight: '500',
    marginTop: 4,
    marginBottom: 2,
  },
  teamButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  teamButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: '#27272a',
    alignItems: 'center',
  },
  teamButtonActive: {
    backgroundColor: '#dc2626',
  },
  teamButtonText: {
    color: '#a1a1aa',
    fontWeight: '700',
  },
  teamButtonTextActive: {
    color: '#fafafa',
  },
  customTopicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  customTopicInputs: {
    gap: 8,
    marginTop: 4,
  },
  topicInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3f3f46',
    backgroundColor: '#18181b',
    color: '#fafafa',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bottomAction: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 20,
  },
  primaryButton: {
    backgroundColor: '#dc2626',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
  },
  primaryButtonText: {
    color: '#fafafa',
    fontSize: 18,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#f4f4f5',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.45,
  },
  assignmentContainer: {
    justifyContent: 'center',
    paddingBottom: 20,
  },
  assignmentLabel: {
    color: '#71717a',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  assignmentName: {
    color: '#fafafa',
    textAlign: 'center',
    marginTop: 8,
    fontSize: 34,
    fontWeight: '900',
    marginBottom: 24,
  },
  hiddenCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#27272a',
    backgroundColor: '#111111',
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
    color: '#d4d4d8',
    fontSize: 17,
    fontWeight: '700',
  },
  hiddenCardNote: {
    color: '#71717a',
    marginTop: 8,
    fontSize: 12,
  },
  revealedCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#fafafa',
    backgroundColor: '#f4f4f5',
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  revealedLabel: {
    color: '#52525b',
    fontWeight: '700',
    marginBottom: 4,
  },
  revealedTopic: {
    color: '#111111',
    fontSize: 44,
    fontWeight: '900',
    marginBottom: 18,
  },
  hideLink: {
    color: '#71717a',
    fontWeight: '600',
  },
  assignmentBottom: {
    marginTop: 22,
    gap: 20,
  },
  assignmentHint: {
    color: '#71717a',
    textAlign: 'center',
    fontSize: 13,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#27272a',
  },
  progressDotDone: {
    backgroundColor: '#3f3f46',
  },
  progressDotActive: {
    width: 26,
    borderRadius: 4,
    backgroundColor: '#dc2626',
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#18181b',
  },
  gameHeaderTitle: {
    color: '#fafafa',
    fontSize: 20,
    fontWeight: '900',
  },
  endGameButton: {
    borderRadius: 999,
    backgroundColor: '#27272a',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  endGameButtonText: {
    color: '#e4e4e7',
    fontSize: 12,
    fontWeight: '600',
  },
  gameContent: {
    paddingTop: 20,
    paddingBottom: 24,
    gap: 22,
  },
  turnWrap: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  turnLabel: {
    color: '#f87171',
    backgroundColor: '#450a0a',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
    marginBottom: 12,
  },
  turnName: {
    color: '#fafafa',
    fontSize: 42,
    fontWeight: '900',
    marginBottom: 8,
  },
  turnHint: {
    color: '#a1a1aa',
    fontSize: 13,
  },
  questionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#27272a',
    backgroundColor: '#111111',
    padding: 14,
    gap: 10,
  },
  questionInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 12,
    backgroundColor: '#000000',
    color: '#fafafa',
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  historyWrap: {
    gap: 10,
  },
  historyTitle: {
    color: '#71717a',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1.1,
  },
  emptyHistory: {
    color: '#71717a',
    fontStyle: 'italic',
  },
  historyItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    backgroundColor: '#09090b',
    padding: 12,
  },
  historyMeta: {
    color: '#a1a1aa',
    fontSize: 12,
    marginBottom: 4,
  },
  historyQuestion: {
    color: '#fafafa',
    fontWeight: '600',
    marginBottom: 10,
  },
  voteResultRow: {
    flexDirection: 'row',
    gap: 8,
  },
  voteResultCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272a',
    backgroundColor: '#000000',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  yesText: {
    color: '#22c55e',
    fontWeight: '800',
  },
  noText: {
    color: '#ef4444',
    fontWeight: '800',
  },
  voteCount: {
    color: '#fafafa',
    fontSize: 18,
    fontWeight: '900',
  },
  votingWrap: {
    flex: 1,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 12,
  },
  votingLabel: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  votingQuestion: {
    color: '#fafafa',
    fontSize: 30,
    fontWeight: '900',
  },
  voteList: {
    flex: 1,
    marginTop: 8,
  },
  voteRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    backgroundColor: '#111111',
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  votePlayerName: {
    color: '#fafafa',
    fontWeight: '700',
    fontSize: 16,
  },
  voteButton: {
    minWidth: 92,
    borderRadius: 10,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  voteYes: {
    backgroundColor: '#16a34a',
  },
  voteNo: {
    backgroundColor: '#dc2626',
  },
  voteButtonText: {
    color: '#fafafa',
    fontWeight: '800',
  },
  resultContent: {
    paddingBottom: 120,
    gap: 12,
  },
  resultTitle: {
    color: '#fafafa',
    fontSize: 36,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 14,
  },
  teamCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#27272a',
    backgroundColor: '#111111',
    overflow: 'hidden',
  },
  teamCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  teamName: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 18,
  },
  teamTopic: {
    color: '#ffffff',
    backgroundColor: '#00000055',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: '700',
  },
  teamPlayersWrap: {
    padding: 12,
    gap: 8,
  },
  teamPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  playerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27272a',
  },
  playerAvatarText: {
    color: '#fafafa',
    fontWeight: '800',
  },
  teamPlayerName: {
    color: '#fafafa',
    fontWeight: '600',
  },
});
