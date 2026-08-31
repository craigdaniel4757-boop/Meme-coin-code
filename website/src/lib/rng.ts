// Standard normal sample via Box-Muller, built on Math.random(). Good
// enough for a market simulation; no need for a seeded/deterministic PRNG.
export function randNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
