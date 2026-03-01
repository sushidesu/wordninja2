export type Player = {
  id: string;
  name: string;
  score: number;
};

export type Game = {
  id: string;
  players: Player[];
  status: 'waiting' | 'active' | 'finished';
};
