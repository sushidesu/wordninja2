export type Player = {
  id: string;
  name: string;
  teamId?: string;
  topic?: string;
};

export type Team = {
  id: string;
  name: string;
  color: string;
  topic: string;
};

export type Question = {
  id: string;
  askerId: string;
  text: string;
  votes: Record<string, 'yes' | 'no'>;
  revealed: boolean;
};

export type GameState = {
  players: Player[];
  teams: Team[];
  questions: Question[];
  currentTurnPlayerIndex: number;
};
