import { create } from "zustand";
import { getModel } from "@/engine/session";
import { resetModel as resetModelStorage, type LearnerModel } from "@/engine/persistence/storage";

interface ModelStoreState {
  model: LearnerModel | null;
  hydrated: boolean;
  hydrate: () => void;
  setModel: (m: LearnerModel) => void;
  reset: () => void;
}

export const useModelStore = create<ModelStoreState>((set) => ({
  model: null,
  hydrated: false,
  hydrate: () => set((s) => (s.hydrated ? s : { model: getModel(), hydrated: true })),
  setModel: (m) => set({ model: m }),
  reset: () => set({ model: resetModelStorage() }),
}));
