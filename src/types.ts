
export interface CardType {
  value: number;
  bulls: number;
}

export interface Player {
  id: string;
  name: string;
  hand: CardType[];
  score: number;
  isBot: boolean;
  selectedCard: CardType | null;
}

export enum GamePhase {
  CHOOSING = 'CHOOSING',
  REVEALING = 'REVEALING',
  RESOLVING = 'RESOLVING',
  CHOOSING_ROW = 'CHOOSING_ROW',
  BETWEEN_ROUNDS = 'BETWEEN_ROUNDS',
  GAME_OVER = 'GAME_OVER'
}

export type View = 'HOME' | 'LOBBY' | 'GAME' | 'JOIN';

export interface GameState {
  rows: CardType[][];
  players: Player[];
  phase: GamePhase;
  currentTurnOrder: { playerId: string; card: CardType }[];
  resolvingIndex: number;
  message: string;
}
