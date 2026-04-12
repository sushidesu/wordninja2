import React, { useCallback, useMemo, useState } from 'react';
import { type LayoutChangeEvent } from 'react-native';

import { TeamColors } from '@/constants/theme';
import { AssignmentPhase } from '@/features/game/assignment-phase';
import { INITIAL_GAME_STATE, TOPICS } from '@/features/game/constants';
import { PlayingPhase } from '@/features/game/playing-phase';
import { ResultPhase } from '@/features/game/result-phase';
import { SetupPhase } from '@/features/game/setup-phase';
import type { GameState, Player, Team } from '@/features/game/types';

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
  const [makimonoContainerWidth, setMakimonoContainerWidth] = useState(0);
  const onMakimonoContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setMakimonoContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const [questionText, setQuestionText] = useState('');
  const [currentVotes, setCurrentVotes] = useState<Record<string, 'yes' | 'no'>>({});

  const currentPlayer = gameState.players[gameState.currentTurnPlayerIndex];
  const currentQuestion = useMemo(
    () => gameState.questions.find((question) => !question.revealed),
    [gameState.questions],
  );

  const startGame = () => {
    if (setupPlayers.length < 2) return;

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
    setGameState((prev) => ({ ...prev, phase: 'playing' }));
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
    if (!currentQuestion) return;

    setGameState((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === currentQuestion.id ? { ...q, votes: currentVotes, revealed: true } : q,
      ),
      currentTurnPlayerIndex: (prev.currentTurnPlayerIndex + 1) % prev.players.length,
      phase: 'playing',
    }));
    setCurrentVotes({});
  };

  const addPlayer = () => {
    const newId = String(Date.now());
    setSetupPlayers((prev) => [...prev, { id: newId, name: `プレイヤー${prev.length + 1}` }]);
  };

  const updatePlayerName = (playerId: string, name: string) => {
    setSetupPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, name } : p)),
    );
  };

  const removePlayer = (playerId: string) => {
    setSetupPlayers((prev) => prev.filter((p) => p.id !== playerId));
  };

  if (gameState.phase === 'setup') {
    return (
      <SetupPhase
        players={setupPlayers}
        teamCount={teamCount}
        useCustomTopic={useCustomTopic}
        customTopicA={customTopicA}
        customTopicB={customTopicB}
        onAddPlayer={addPlayer}
        onUpdatePlayerName={updatePlayerName}
        onRemovePlayer={removePlayer}
        onSetTeamCount={setTeamCount}
        onSetUseCustomTopic={setUseCustomTopic}
        onSetCustomTopicA={setCustomTopicA}
        onSetCustomTopicB={setCustomTopicB}
        onStartGame={startGame}
      />
    );
  }

  if (gameState.phase === 'assignment') {
    return (
      <AssignmentPhase
        key={assignmentIndex}
        players={gameState.players}
        assignmentIndex={assignmentIndex}
        assignmentRevealed={assignmentRevealed}
        containerWidth={makimonoContainerWidth}
        onContainerLayout={onMakimonoContainerLayout}
        onReveal={() => setAssignmentRevealed(true)}
        onHide={() => setAssignmentRevealed(false)}
        onProceed={proceedAssignment}
      />
    );
  }

  if (gameState.phase === 'result') {
    return <ResultPhase gameState={gameState} onRestart={restartGame} />;
  }

  return (
    <PlayingPhase
      gameState={gameState}
      currentPlayer={currentPlayer}
      currentQuestion={currentQuestion}
      questionText={questionText}
      currentVotes={currentVotes}
      onSetQuestionText={setQuestionText}
      onStartVoting={startVoting}
      onToggleVote={toggleVote}
      onSubmitVotes={submitVotes}
      onEndGame={() => setGameState((prev) => ({ ...prev, phase: 'result' }))}
    />
  );
}
