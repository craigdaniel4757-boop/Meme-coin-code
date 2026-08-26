"use client";

import { useCallback, useRef, useState } from "react";
import { useModelStore } from "@/store/modelStore";
import { playOneGame } from "@/engine/session";

const CHUNK_SIZE = 4;

export function useTrainer() {
  const model = useModelStore((s) => s.model);
  const setModel = useModelStore((s) => s.setModel);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const cancelRef = useRef(false);

  const run = useCallback(
    async (n: number) => {
      if (!model || running) return;
      cancelRef.current = false;
      setRunning(true);
      setProgress({ done: 0, total: n });

      let current = model;
      for (let i = 0; i < n; i++) {
        if (cancelRef.current) break;
        const result = playOneGame(current);
        current = result.modelAfter;

        if (i % CHUNK_SIZE === 0 || i === n - 1) {
          setModel(current);
          setProgress({ done: i + 1, total: n });
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      setModel(current);
      setRunning(false);
    },
    [model, running, setModel],
  );

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { run, cancel, running, progress };
}
