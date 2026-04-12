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

// Topics API

export type Word = {
  id: string;
  text: string;
};

export type TopicSet = {
  id: string;
  wordIds: string[];
};

export type PlayRecord = {
  id: string;
  topicSetId: string;
  wordIds: string[];
  vote: 'up' | 'down' | null;
};

// API Request / Response

export type GetRandomTopicsResponse = {
  topicSetId: string;
  topics: Word[];
};

export type PostPlayedRequest = {
  topicSetId: string;
  wordIds: string[];
  vote: 'up' | 'down' | null;
};
