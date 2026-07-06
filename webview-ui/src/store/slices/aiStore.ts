import { create } from 'zustand';

export interface AIModel {
  id: string;
  label: string;
  backend: 'vscode-lm' | 'anthropic';
}

export interface AIExplanationData {
  summary?: string;
  rootCause?: string;
  suggestion?: string;
  effort?: string;
  error?: string;
}

interface AIStore {
  availableModels: AIModel[];
  claudeAuthorized: boolean;
  claudeAuthError: string | null;
  aiExplanation: AIExplanationData | null;
  aiExplanationLoading: boolean;
  architectAnswer: string | null;
  architectAnswerLoading: boolean;
  setModels: (models: AIModel[]) => void;
  setClaudeAuth: (authorized: boolean, count?: number, error?: string | null) => void;
  setAIExplanation: (data: AIExplanationData | null, loading?: boolean) => void;
  clearAIExplanation: () => void;
  setArchitectAnswer: (answer: string | null, loading?: boolean) => void;
}

export const useAIStore = create<AIStore>((set) => ({
  availableModels: [],
  claudeAuthorized: false,
  claudeAuthError: null,
  aiExplanation: null,
  aiExplanationLoading: false,
  architectAnswer: null,
  architectAnswerLoading: false,
  setModels: (availableModels) => set({ availableModels }),
  setClaudeAuth: (claudeAuthorized, _count, claudeAuthError = null) =>
    set({ claudeAuthorized, claudeAuthError }),
  setAIExplanation: (aiExplanation, aiExplanationLoading = false) =>
    set({ aiExplanation, aiExplanationLoading }),
  clearAIExplanation: () => set({ aiExplanation: null, aiExplanationLoading: false }),
  setArchitectAnswer: (architectAnswer, architectAnswerLoading = false) =>
    set({ architectAnswer, architectAnswerLoading }),
}));
