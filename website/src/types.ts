export type CoinId = string;

export interface PriceChange {
  m5: number;
  h1: number;
  h6: number;
  h24: number;
}

export interface Coin {
  id: CoinId;
  address: string;
  name: string;
  ticker: string;
  color: string;
  dexId: string;
  pairUrl: string | null;
  price: number;
  prevPrice: number;
  history: number[];
  liquidityUsd: number;
  fdv: number | null;
  priceChange: PriceChange;
  buys1h: number;
  sells1h: number;
  lastUpdated: number;
  // True when the most recent poll couldn't resolve this coin (dropped
  // out of search results, below the liquidity floor, or a request
  // error) -- still shown with its last known price, but excluded from
  // new decisions until it resolves again.
  stale: boolean;
}

export interface Features {
  chg5m: number;
  chg1h: number;
  chg6h: number;
  volatility: number;
  rsi: number;
  smaDist: number;
  buyPressure: number;
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
