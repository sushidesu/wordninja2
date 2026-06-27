import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { TeamColors } from '@/constants/theme';

import { INITIAL_GAME_STATE, TOPICS } from './constants';
import type { GameState, Player, Team } from './types';

/** ランダムなテーマグループからチーム数ぶんの語を重複なく選ぶ。 */
function pickRandomTopics(teamCount: number): string[] {
  const group = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  const shuffled = [...group].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, teamCount);
}

/** チーム数ぶんのチームを生成し、各チームに別々のお題を1語ずつ割り当てる。 */
function generateTeams(teamCount: number, customTopics?: string[]): Team[] {
  const teamNames = ['赤チーム', '青チーム', '緑チーム', '黄チーム'];
  const topics = customTopics ?? pickRandomTopics(teamCount);

  return Array.from({ length: teamCount }, (_, index) => ({
    id: `team-${index}`,
    name: teamNames[index % teamNames.length],
    color: TeamColors[index % TeamColors.length],
    topic: topics[index] ?? '???',
  }));
}

function assignPlayersToTeams(players: Player[], teams: Team[]): Player[] {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  return shuffled.map((player, index) => {
    const team = teams[index % teams.length];
    return { ...player, teamId: team.id, topic: team.topic };
  });
}

function setupInitialVotes(players: Player[]): Record<string, 'yes' | 'no'> {
  return players.reduce<Record<string, 'yes' | 'no'>>((acc, player) => {
    acc[player.id] = 'yes';
    return acc;
  }, {});
}

type GameContextValue = {
  // ---- setup state ----
  setupPlayers: Player[];
  teamCount: number;
  useCustomTopic: boolean;
  customTopics: string[];
  addPlayer: () => void;
  updatePlayerName: (id: string, name: string) => void;
  removePlayer: (id: string) => void;
  setTeamCount: (count: number) => void;
  setUseCustomTopic: (value: boolean) => void;
  updateCustomTopic: (index: number, value: string) => void;

  // ---- game state ----
  gameState: GameState;
  currentPlayer: Player | undefined;
  currentQuestion: Question | undefined;

  // ---- assignment ----
  assignmentIndex: number;
  assignmentRevealed: boolean;
  makimonoContainerWidth: number;
  onMakimonoContainerLayout: (e: { nativeEvent: { layout: { width: number } } }) => void;
  setAssignmentRevealed: (value: boolean) => void;

  // ---- playing / voting ----
  isVoting: boolean;
  questionText: string;
  currentVotes: Record<string, 'yes' | 'no'>;
  setQuestionText: (text: string) => void;
  toggleVote: (playerId: string) => void;

  /**
   * ゲームを開始する。state を更新するだけ。
   * 呼び出し側で `router.replace('/assignment')` する。
   */
  startGame: () => void;
  /** 全データをリセット。呼び出し側で `router.replace('/')` する。 */
  restartGame: () => void;
  /**
   * 次のプレイヤーへ進む。全員完了なら true を返す。
   * true の場合、呼び出し側で `router.replace('/playing')` する。
   */
  proceedAssignment: () => boolean;
  /** 投票フェーズに入る。呼び出し側での router 操作は不要 (同画面内)。 */
  startVoting: () => void;
  /** 投票を確定して playing に戻る。同画面内。 */
  submitVotes: () => void;
  /** ゲーム終了。呼び出し側で `router.replace('/result')` する。 */
  endGame: () => void;
};

type Question = {
  id: string;
  askerId: string;
  text: string;
  votes: Record<string, 'yes' | 'no'>;
  revealed: boolean;
};

const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [gameState, setGameState] = useState<GameState>(INITIAL_GAME_STATE);

  const [setupPlayers, setSetupPlayers] = useState<Player[]>([
    { id: '1', name: 'プレイヤー1' },
    { id: '2', name: 'プレイヤー2' },
    { id: '3', name: 'プレイヤー3' },
    { id: '4', name: 'プレイヤー4' },
  ]);
  const [teamCount, setTeamCount] = useState(2);
  const [useCustomTopic, setUseCustomTopic] = useState(false);
  // チームごとのお題。最大チーム数 (4) ぶん確保し、teamCount ぶんだけ使う。
  const [customTopics, setCustomTopics] = useState<string[]>(['', '', '', '']);

  const updateCustomTopic = useCallback((index: number, value: string) => {
    setCustomTopics((prev) => prev.map((topic, i) => (i === index ? value : topic)));
  }, []);

  const [assignmentIndex, setAssignmentIndex] = useState(0);
  const [assignmentRevealed, setAssignmentRevealed] = useState(false);
  const [makimonoContainerWidth, setMakimonoContainerWidth] = useState(0);
  const onMakimonoContainerLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => {
      setMakimonoContainerWidth(e.nativeEvent.layout.width);
    },
    [],
  );

  const [isVoting, setIsVoting] = useState(false);
  const [questionText, setQuestionText] = useState('');
  const [currentVotes, setCurrentVotes] = useState<Record<string, 'yes' | 'no'>>({});

  const currentPlayer = gameState.players[gameState.currentTurnPlayerIndex];
  const currentQuestion = useMemo(
    () => gameState.questions.find((q) => !q.revealed),
    [gameState.questions],
  );

  const addPlayer = useCallback(() => {
    const newId = String(Date.now());
    setSetupPlayers((prev) => [...prev, { id: newId, name: `プレイヤー${prev.length + 1}` }]);
  }, []);

  const updatePlayerName = useCallback((id: string, name: string) => {
    setSetupPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }, []);

  const removePlayer = useCallback((id: string) => {
    setSetupPlayers((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const startGame = useCallback(() => {
    if (setupPlayers.length < 2) return;

    const trimmedTopics = customTopics.slice(0, teamCount).map((topic) => topic.trim());
    // カスタムは全チーム分が埋まっているときだけ採用。未入力があればランダムにフォールバック。
    const custom = useCustomTopic && trimmedTopics.every(Boolean) ? trimmedTopics : undefined;

    const teams = generateTeams(teamCount, custom);
    const assigned = assignPlayersToTeams(setupPlayers, teams);

    setGameState({
      players: assigned,
      teams,
      questions: [],
      currentTurnPlayerIndex: Math.floor(Math.random() * setupPlayers.length),
    });
    setAssignmentIndex(0);
    setAssignmentRevealed(false);
    setIsVoting(false);
    setQuestionText('');
    setCurrentVotes({});
  }, [setupPlayers, teamCount, useCustomTopic, customTopics]);

  const restartGame = useCallback(() => {
    setGameState(INITIAL_GAME_STATE);
    setAssignmentIndex(0);
    setAssignmentRevealed(false);
    setIsVoting(false);
    setQuestionText('');
    setCurrentVotes({});
  }, []);

  const proceedAssignment = useCallback((): boolean => {
    if (assignmentIndex < gameState.players.length - 1) {
      setAssignmentIndex((prev) => prev + 1);
      setAssignmentRevealed(false);
      return false;
    }
    return true;
  }, [assignmentIndex, gameState.players.length]);

  const startVoting = useCallback(() => {
    const trimmed = questionText.trim();
    if (!trimmed || !currentPlayer) return;

    setGameState((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        { id: String(Date.now()), askerId: currentPlayer.id, text: trimmed, votes: {}, revealed: false },
      ],
    }));
    setCurrentVotes(setupInitialVotes(gameState.players));
    setQuestionText('');
    setIsVoting(true);
  }, [questionText, currentPlayer, gameState.players]);

  const toggleVote = useCallback((playerId: string) => {
    setCurrentVotes((prev) => ({
      ...prev,
      [playerId]: prev[playerId] === 'yes' ? 'no' : 'yes',
    }));
  }, []);

  const submitVotes = useCallback(() => {
    if (!currentQuestion) return;

    setGameState((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === currentQuestion.id ? { ...q, votes: currentVotes, revealed: true } : q,
      ),
      currentTurnPlayerIndex: (prev.currentTurnPlayerIndex + 1) % prev.players.length,
    }));
    setCurrentVotes({});
    setIsVoting(false);
  }, [currentQuestion, currentVotes]);

  const endGame = useCallback(() => {
    // state はそのまま (result 画面で使う)。呼び出し側が router.replace('/result') する。
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      setupPlayers,
      teamCount,
      useCustomTopic,
      customTopics,
      addPlayer,
      updatePlayerName,
      removePlayer,
      setTeamCount,
      setUseCustomTopic,
      updateCustomTopic,
      gameState,
      currentPlayer,
      currentQuestion,
      assignmentIndex,
      assignmentRevealed,
      makimonoContainerWidth,
      onMakimonoContainerLayout,
      setAssignmentRevealed,
      isVoting,
      questionText,
      currentVotes,
      setQuestionText,
      toggleVote,
      startGame,
      restartGame,
      proceedAssignment,
      startVoting,
      submitVotes,
      endGame,
    }),
    [
      setupPlayers,
      teamCount,
      useCustomTopic,
      customTopics,
      addPlayer,
      updatePlayerName,
      removePlayer,
      updateCustomTopic,
      gameState,
      currentPlayer,
      currentQuestion,
      assignmentIndex,
      assignmentRevealed,
      makimonoContainerWidth,
      onMakimonoContainerLayout,
      isVoting,
      questionText,
      currentVotes,
      toggleVote,
      startGame,
      restartGame,
      proceedAssignment,
      startVoting,
      submitVotes,
      endGame,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
