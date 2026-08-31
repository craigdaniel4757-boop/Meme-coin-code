import { AgentWeights, SimState } from '../types';

// v2: switched from a synthetic fictional-coin market to real DexScreener
// data, which changed the Coin and Features shapes -- bumped so any v1
// state from before that change is cleanly ignored instead of partially
// loaded (e.g. an old Features object missing the new `chg5m` key).
const STATE_KEY = 'mememind/state/v2';
const BRAIN_KEY = 'mememind/brain/v2';

function isSimState(value: unknown): value is SimState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.tick !== 'number' || !Array.isArray(v.coins) || !v.agent || typeof v.agent !== 'object') return false;
  const entry = (v.agent as Record<string, unknown>).entry;
  return !!entry && typeof (entry as Record<string, unknown>).chg5m === 'number';
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
