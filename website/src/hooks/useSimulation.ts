import { useCallback, useEffect, useRef, useState } from 'react';
import { SimState } from '../types';
import { createInitialState, stepSimulation } from '../lib/simulation';
import { clearState, loadBrain, loadState, saveBrain, saveState } from '../lib/persist';

export type Speed = 1 | 2 | 5 | 15;

const TICK_MS = 500;
const SAVE_EVERY_N_TICKS = 4;

export function useSimulation() {
  const [state, setState] = useState<SimState>(() => loadState() ?? createInitialState());
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState<Speed>(2);
  const stateRef = useRef(state);
  stateRef.current = state;
  const tickCount = useRef(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setState((prev) => {
        let next = prev;
        for (let i = 0; i < speed; i++) next = stepSimulation(next);
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running, speed]);

  useEffect(() => {
    tickCount.current += 1;
    if (tickCount.current % SAVE_EVERY_N_TICKS === 0) {
      saveState(state);
      saveBrain(state.agent);
    }
  }, [state]);

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
    setState(createInitialState());
  }, []);

  const softReset = useCallback(() => {
    const fresh = createInitialState();
    const brain = loadBrain() ?? stateRef.current.agent;
    const next = { ...fresh, agent: brain };
    saveState(next);
    setState(next);
  }, []);

  return { state, running, setRunning, speed, setSpeed, fullReset, softReset };
}
