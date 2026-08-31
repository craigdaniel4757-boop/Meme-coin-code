export interface CoinDef {
  ticker: string;
  name: string;
  color: string;
  basePrice: number;
}

// Entirely fictional meme coins for the simulation -- no connection to any
// real token, chain, or market data.
export const COIN_DEFS: CoinDef[] = [
  { ticker: 'DOGO', name: 'Dogo Classic', color: '#f2c94c', basePrice: 0.0842 },
  { ticker: 'SHIBX', name: 'ShibaMax', color: '#eb5757', basePrice: 0.0000191 },
  { ticker: 'PEPU', name: 'Pepe Unlimited', color: '#27ae60', basePrice: 0.00000734 },
  { ticker: 'FLOKX', name: 'Floki Prime', color: '#f2994a', basePrice: 0.000221 },
  { ticker: 'BONKZ', name: 'Bonk Zero', color: '#e67e22', basePrice: 0.0000283 },
  { ticker: 'WOJAK', name: 'Wojak Finance', color: '#56ccf2', basePrice: 0.00194 },
  { ticker: 'CHONK', name: 'Chonky Cat', color: '#bb6bd9', basePrice: 0.512 },
  { ticker: 'TURBO', name: 'Turbo Frog', color: '#6fcf97', basePrice: 0.0731 },
  { ticker: 'MOONP', name: 'Moon Puppy', color: '#2f80ed', basePrice: 1.84 },
  { ticker: 'GIGA', name: 'Gigachad Token', color: '#e0e0e0', basePrice: 0.281 },
];
