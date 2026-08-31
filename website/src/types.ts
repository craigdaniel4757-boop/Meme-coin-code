export type CoinId = string;

export type Regime = 'choppy' | 'uptrend' | 'downtrend' | 'pump' | 'dump';

export interface Coin {
  id: CoinId;
  name: string;
  ticker: string;
  color: string;
  price: number;
  prevPrice: number;
  history: number[];
  volume: number;
  volumeHistory: number[];
  regime: Regime;
  regimeTicksLeft: number;
}

export interface Features {
  mom3: number;
  mom10: number;
  mom30: number;
  volatility: number;
  rsi: number;
  smaDist: number;
  volumeZ: number;
  unrealized: number;
  bias: number;
}

export type FeatureKey = keyof Features;

export interface Position {
  coinId: CoinId;
  entryPrice: number;
  quantity: number;
  entryTick: number;
  entryTime: number;
  entryFeatures: Features;
  entryConfidence: number;
  costBasis: number;
}

export interface FeedEvent {
  id: string;
  kind: 'open' | 'close';
  coinId: CoinId;
  ticker: string;
  time: number;
  reasoning: string;
  confidence: number;
  pnlUsd?: number;
  pnlPct?: number;
  win?: boolean;
}

export interface EquityPoint {
  t: number;
  equity: number;
}

export interface AgentWeights {
  entry: Features;
  exit: Features;
  updates: number;
  epsilon: number;
  learningRate: number;
}

export interface SimState {
  tick: number;
  coins: Coin[];
  cash: number;
  positions: Record<CoinId, Position>;
  events: FeedEvent[];
  equityCurve: EquityPoint[];
  agent: AgentWeights;
  totalFeesPaid: number;
}
