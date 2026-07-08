import { create } from 'zustand';

export interface ArchitectPromptScope {
  id: string;
  label: string;
  defaultPrompt: string;
}

interface ArchitectPromptsStore {
  scopes: ArchitectPromptScope[];
  overrides: Record<string, string>;
  loaded: boolean;
  setPrompts: (scopes: ArchitectPromptScope[], overrides: Record<string, string>) => void;
}

export const useArchitectPromptsStore = create<ArchitectPromptsStore>((set) => ({
  scopes: [],
  overrides: {},
  loaded: false,
  setPrompts: (scopes, overrides) => set({ scopes, overrides, loaded: true }),
}));
