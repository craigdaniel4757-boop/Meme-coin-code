import { Coin, Regime } from '../types';
import { COIN_DEFS } from './coins';
import { randNormal } from './rng';

const HISTORY_CAP = 240;

const REGIME_PARAMS: Record<Regime, { drift: number; vol: number; minTicks: number; maxTicks: number }> = {
  choppy: { drift: 0.0, vol: 0.01, minTicks: 30, maxTicks: 90 },
  uptrend: { drift: 0.006, vol: 0.014, minTicks: 20, maxTicks: 60 },
  downtrend: { drift: -0.0055, vol: 0.016, minTicks: 20, maxTicks: 60 },
  pump: { drift: 0.028, vol: 0.05, minTicks: 5, maxTicks: 18 },
  dump: { drift: -0.03, vol: 0.05, minTicks: 5, maxTicks: 16 },
};

const REGIME_TRANSITION: Record<Regime, Array<[Regime, number]>> = {
  choppy: [
    ['choppy', 0.55],
    ['uptrend', 0.16],
    ['downtrend', 0.16],
    ['pump', 0.07],
    ['dump', 0.06],
  ],
  uptrend: [
    ['uptrend', 0.45],
    ['choppy', 0.25],
    ['pump', 0.18],
    ['downtrend', 0.07],
    ['dump', 0.05],
  ],
  downtrend: [
    ['downtrend', 0.45],
    ['choppy', 0.25],
    ['dump', 0.18],
    ['uptrend', 0.07],
    ['pump', 0.05],
  ],
  pump: [
    ['choppy', 0.35],
    ['downtrend', 0.25],
    ['dump', 0.2],
    ['uptrend', 0.15],
    ['pump', 0.05],
  ],
  dump: [
    ['choppy', 0.35],
    ['uptrend', 0.25],
    ['pump', 0.2],
    ['downtrend', 0.15],
    ['dump', 0.05],
  ],
};

function pickNextRegime(current: Regime): Regime {
  const options = REGIME_TRANSITION[current];
  const r = Math.random();
  let acc = 0;
  for (const [regime, p] of options) {
    acc += p;
    if (r <= acc) return regime;
  }
  return options[0][0];
}

function randomTicks(regime: Regime): number {
  const { minTicks, maxTicks } = REGIME_PARAMS[regime];
  return Math.floor(minTicks + Math.random() * (maxTicks - minTicks));
}

export function createMarket(): Coin[] {
  return COIN_DEFS.map((def) => {
    const regime: Regime = 'choppy';
    return {
      id: def.ticker,
      name: def.name,
      ticker: def.ticker,
      color: def.color,
      price: def.basePrice,
      prevPrice: def.basePrice,
      history: [def.basePrice],
      volume: 0,
      volumeHistory: [0],
      regime,
      regimeTicksLeft: randomTicks(regime),
    };
  });
}

function pushCapped(arr: number[], value: number): number[] {
  if (arr.length >= HISTORY_CAP) return [...arr.slice(1), value];
  return [...arr, value];
}

export function tickMarket(coins: Coin[]): Coin[] {
  return coins.map((coin) => {
    let regime = coin.regime;
    let regimeTicksLeft = coin.regimeTicksLeft - 1;
    if (regimeTicksLeft <= 0) {
      regime = pickNextRegime(regime);
      regimeTicksLeft = randomTicks(regime);
    }

    const { drift, vol } = REGIME_PARAMS[regime];
    const shock = randNormal() * vol;
    // Rare fat-tail micro-event on top of the regime's normal volatility --
    // meme coins occasionally spike/crash well outside their usual range.
    const tailEvent = Math.random() < 0.01 ? randNormal() * vol * 4 : 0;
    const ret = drift + shock + tailEvent;

    const prevPrice = coin.price;
    let price = prevPrice * (1 + ret);
    if (!isFinite(price) || price <= 0) price = prevPrice;
    const floor = prevPrice * 1e-6;
    if (price < floor) price = floor;

    const history = pushCapped(coin.history, price);

    const baseVolume = Math.abs(ret) * 5_000_000 + 20_000;
    const volume = Math.max(0, baseVolume * (0.6 + Math.random() * 0.8));
    const volumeHistory = pushCapped(coin.volumeHistory, volume);

    return {
      ...coin,
      prevPrice,
      price,
      history,
      volume,
      volumeHistory,
      regime,
      regimeTicksLeft,
    };
  });
}
