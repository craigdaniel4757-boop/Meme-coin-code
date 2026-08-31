import { useCallback, useEffect, useRef, useState } from 'react';
import { FeedEvent, SimState } from '../types';
import { createInitialState, EVENT_LOG_CAP, stepDecisions } from '../lib/simulation';
import { mergeMarketUpdate } from '../lib/marketData';
import { fetchWatchlist } from '../lib/dexscreener';
import { WATCHLIST } from '../lib/coins';
import { clearBrain, clearState, loadBrain, loadState, saveBrain, saveState } from '../lib/persist';

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting';

const POLL_INTERVAL_MS = 20_000;

export function useSimulation() {
  const [state, setState] = useState<SimState>(() => loadState() ?? createInitialState());
  const [running, setRunning] = useState(true);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const results = await fetchWatchlist(WATCHLIST.map((w) => w.query));
      const resolvedCount = results.filter((r) => r.pair).length;
      const now = Date.now();

      const coins = mergeMarketUpdate(stateRef.current.coins, WATCHLIST, results, now);
      const next = stepDecisions(stateRef.current, coins);
      setState(next);
      saveState(next);
      saveBrain(next.agent);
      setLastFetchAt(now);
      setStatus(resolvedCount > 0 ? 'live' : 'reconnecting');
    } catch {
      setStatus('reconnecting');
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [running, poll]);

  useEffect(() => {
    const onUnload = () => {
      saveState(stateRef.current);
      saveBrain(stateRef.current.agent);
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  const fullReset = useCallback(() => {
    clearState();
    clearBrain();
    setState(createInitialState());
    poll();
  }, [poll]);

  // Fresh $1,000, fresh positions -- but the AI's learned weights *and*
  // its trade history both carry over, marked with a boundary event, so
  // performance stats keep accumulating sample size across many resets
  // instead of getting wiped back to near-zero every time.
  const softReset = useCallback(() => {
    const fresh = createInitialState();
    const brain = loadBrain() ?? stateRef.current.agent;
    const marker: FeedEvent = {
      id: `reset-${Date.now()}`,
      kind: 'reset',
      coinId: '',
      ticker: '',
      time: Date.now(),
      reasoning: 'New $1,000 portfolio started. The brain and trade history above carried over.',
      confidence: 0,
    };
    const next: SimState = {
      ...fresh,
      agent: brain,
      coins: stateRef.current.coins,
      events: [marker, ...stateRef.current.events].slice(0, EVENT_LOG_CAP),
    };
    saveState(next);
    setState(next);
  }, []);

  return { state, running, setRunning, status, lastFetchAt, fullReset, softReset, refreshNow: poll };
}
