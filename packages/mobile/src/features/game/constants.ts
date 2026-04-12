import type { GameState } from './types';

export const INITIAL_GAME_STATE: GameState = {
  players: [],
  teams: [],
  questions: [],
  currentTurnPlayerIndex: 0,
};

export const TOPICS = [
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
