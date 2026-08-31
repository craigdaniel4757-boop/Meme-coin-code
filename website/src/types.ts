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
  volumeH1: number;
  volumeH24: number;
  pairCreatedAt: number | null;
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
  volTrend: number;
  tokenAge: number;
  solRegime: number;
  relStrength: number;
  unrealized: number;
  bias: number;
}

export type FeatureKey = keyof Features;

// Shared per-tick context that isn't specific to any one coin (SOL's own
// momentum as a market-regime signal, the watchlist's average momentum so
// a coin's move can be judged relative to the rest of the market).
export interface FeatureContext {
  solChg1h: number;
  avgChg1h: number;
}

export interface Position {
  coinId: CoinId;
  entryPrice: number;
  quantity: number;
  entryTick: number;
  entryTime: number;
  entryFeatures: Features;
  entryConfidence: number;
  costBasis: number;
  // True for a position opened as a held-out evaluation trade: it trades
  // for real (real P&L, real sizing) but its outcome is excluded from
  // learning updates, so its win rate is an unbiased read on the current
  // policy rather than a number the policy was fit to.
  isEval: boolean;
}

export interface FeedEvent {
  id: string;
  kind: 'open' | 'close' | 'reset';
  coinId: CoinId;
  ticker: string;
  time: number;
  reasoning: string;
  confidence: number;
  pnlUsd?: number;
  pnlPct?: number;
  win?: boolean;
  isEval?: boolean;
}

export interface EquityPoint {
  t: number;
  equity: number;
}

export interface LinearMember {
  kind: 'linear';
  entry: Features;
  exit: Features;
}

// A deliberately tiny hand-rolled MLP (13 inputs -> hidden -> 1 output),
// trained online via the same reward-weighted gradient-ascent idea as the
// linear members, just backpropagated through two layers. Small enough
// that clamping keeps it numerically stable without a real ML framework.
export interface NeuralWeights {
  w1: number[][]; // [hidden][input]
  b1: number[]; // [hidden]
  w2: number[]; // [hidden]
  b2: number;
}

export interface NeuralMember {
  kind: 'neural';
  entry: NeuralWeights;
  exit: NeuralWeights;
}

export type EnsembleMember = LinearMember | NeuralMember;

export interface AgentWeights {
  members: EnsembleMember[];
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
