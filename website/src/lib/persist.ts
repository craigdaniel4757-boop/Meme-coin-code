import { AgentWeights, SimState } from '../types';

// v2: switched from a synthetic fictional-coin market to real DexScreener
// data, which changed the Coin and Features shapes.
// v3: single entry/exit AgentWeights replaced by an ensemble of members
// (`agent.members[]`), plus four new features. Bumped again so older
// saves are cleanly ignored instead of partially loaded.
const STATE_KEY = 'mememind/state/v3';
const BRAIN_KEY = 'mememind/brain/v3';

function isSimState(value: unknown): value is SimState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.tick !== 'number' || !Array.isArray(v.coins) || !v.agent || typeof v.agent !== 'object') return false;
  const members = (v.agent as Record<string, unknown>).members;
  if (!Array.isArray(members) || members.length === 0) return false;
  const first = members[0] as Record<string, unknown>;
  return (first.kind === 'linear' || first.kind === 'neural') && !!first.entry;
}

export function saveState(state: SimState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Storage full/unavailable (e.g. private browsing) -- the simulation
    // keeps running in memory, it just won't survive a reload.
  }
}

export function loadState(): SimState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isSimState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    // ignore
  }
}

export function saveBrain(agent: AgentWeights): void {
  try {
    localStorage.setItem(BRAIN_KEY, JSON.stringify(agent));
  } catch {
    // ignore
  }
}

export function loadBrain(): AgentWeights | null {
  try {
    const raw = localStorage.getItem(BRAIN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AgentWeights;
  } catch {
    return null;
  }
}

export function clearBrain(): void {
  try {
    localStorage.removeItem(BRAIN_KEY);
  } catch {
    // ignore
  }
}
