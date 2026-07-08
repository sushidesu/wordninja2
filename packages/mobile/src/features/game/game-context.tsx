import React, { createContext, useContext, useState } from 'react';

import { TeamColors } from '@/constants/theme';

import { INITIAL_GAME_STATE, TOPICS } from './constants';
import type { GameState, Player, Question, Team } from './types';

/** 偏りのないシャッフル (Fisher–Yates)。 */
function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** ランダムなテーマグループからチーム数ぶんの語を重複なく選ぶ。 */
function pickRandomTopics(teamCount: number): string[] {
  const group = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  return shuffle(group).slice(0, teamCount);
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
  return shuffle(players).map((player, index) => {
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
  /** 実効チーム数。常に 2〜maxTeamCount に収まる。 */
  teamCount: number;
  /** 選べる最大チーム数 (プレイヤー数と上限4で決まる)。 */
  maxTeamCount: number;
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

const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [gameState, setGameState] = useState<GameState>(INITIAL_GAME_STATE);

  // 名前は空がデフォ。表示時は空なら「プレイヤーN」を計算して出す (state には既定名を持たせない)。
  const [setupPlayers, setSetupPlayers] = useState<Player[]>([
    { id: '1', name: '' },
    { id: '2', name: '' },
    { id: '3', name: '' },
    { id: '4', name: '' },
  ]);
  // 選択値はそのまま保持し、公開する teamCount は毎回クランプして導出する。
  // プレイヤー削除で上限が下がっても、再追加すれば選択値に戻る。
  const [teamCountChoice, setTeamCount] = useState(2);
  const maxTeamCount = Math.min(4, Math.max(2, setupPlayers.length));
  const teamCount = Math.min(teamCountChoice, maxTeamCount);

  const [useCustomTopic, setUseCustomTopic] = useState(false);
  // チームごとのお題。最大チーム数 (4) ぶん確保し、teamCount ぶんだけ使う。
  const [customTopics, setCustomTopics] = useState<string[]>(['', '', '', '']);

  const [assignmentIndex, setAssignmentIndex] = useState(0);

  const [isVoting, setIsVoting] = useState(false);
  const [questionText, setQuestionText] = useState('');
  const [currentVotes, setCurrentVotes] = useState<Record<string, 'yes' | 'no'>>({});

  const currentPlayer = gameState.players[gameState.currentTurnPlayerIndex];
  const currentQuestion = gameState.questions.find((q) => !q.revealed);

  const addPlayer = () => {
    const newId = String(Date.now());
    setSetupPlayers((prev) => [...prev, { id: newId, name: '' }]);
  };

  const updatePlayerName = (id: string, name: string) => {
    setSetupPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  };

  const removePlayer = (id: string) => {
    setSetupPlayers((prev) => prev.filter((p) => p.id !== id));
  };

  const updateCustomTopic = (index: number, value: string) => {
    setCustomTopics((prev) => prev.map((topic, i) => (i === index ? value : topic)));
  };

  const startGame = () => {
    if (setupPlayers.length < 2) return;

    const trimmedTopics = customTopics.slice(0, teamCount).map((topic) => topic.trim());
    // カスタムは全チーム分が埋まっているときだけ採用。未入力があればランダムにフォールバック。
    const custom = useCustomTopic && trimmedTopics.every(Boolean) ? trimmedTopics : undefined;

    const teams = generateTeams(teamCount, custom);
    // 空の名前はここで計算した既定名「プレイヤーN」に確定する (以降の画面では常に非空)。
    const namedPlayers = setupPlayers.map((player, index) => ({
      ...player,
      name: player.name.trim() || `プレイヤー${index + 1}`,
    }));
    const assigned = assignPlayersToTeams(namedPlayers, teams);

    setGameState({
      players: assigned,
      teams,
      questions: [],
      currentTurnPlayerIndex: Math.floor(Math.random() * setupPlayers.length),
    });
    setAssignmentIndex(0);
    setIsVoting(false);
    setQuestionText('');
    setCurrentVotes({});
  };

  const restartGame = () => {
    setGameState(INITIAL_GAME_STATE);
    setAssignmentIndex(0);
    setIsVoting(false);
    setQuestionText('');
    setCurrentVotes({});
  };

  const proceedAssignment = (): boolean => {
    if (assignmentIndex < gameState.players.length - 1) {
      setAssignmentIndex((prev) => prev + 1);
      return false;
    }
    return true;
  };

  const startVoting = () => {
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
  };

  const toggleVote = (playerId: string) => {
    setCurrentVotes((prev) => ({
      ...prev,
      [playerId]: prev[playerId] === 'yes' ? 'no' : 'yes',
    }));
  };

  const submitVotes = () => {
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
  };

  const endGame = () => {
    // state はそのまま (result 画面で使う)。呼び出し側が router.replace('/result') する。
  };

  const value: GameContextValue = {
    setupPlayers,
    teamCount,
    maxTeamCount,
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
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
