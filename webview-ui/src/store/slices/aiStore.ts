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
  claudeModelCount: number;
  copilotAvailable: boolean;
  copilotModelCount: number;
  aiExplanation: AIExplanationData | null;
  aiExplanationLoading: boolean;
  architectAnswer: string | null;
  architectAnswerLoading: boolean;
  setModels: (models: AIModel[]) => void;
  setClaudeAuth: (authorized: boolean, count?: number, error?: string | null) => void;
  setCopilotStatus: (available: boolean, count: number) => void;
  setAIExplanation: (data: AIExplanationData | null, loading?: boolean) => void;
  clearAIExplanation: () => void;
  setArchitectAnswer: (answer: string | null, loading?: boolean) => void;
}

export const useAIStore = create<AIStore>((set) => ({
  availableModels: [],
  claudeAuthorized: false,
  claudeAuthError: null,
  claudeModelCount: 0,
  copilotAvailable: false,
  copilotModelCount: 0,
  aiExplanation: null,
  aiExplanationLoading: false,
  architectAnswer: null,
  architectAnswerLoading: false,
  setModels: (availableModels) => set({ availableModels }),
  setClaudeAuth: (claudeAuthorized, claudeModelCount = 0, claudeAuthError = null) =>
    set({ claudeAuthorized, claudeModelCount, claudeAuthError }),
  setCopilotStatus: (copilotAvailable, copilotModelCount) =>
    set({ copilotAvailable, copilotModelCount }),
  setAIExplanation: (aiExplanation, aiExplanationLoading = false) =>
    set({ aiExplanation, aiExplanationLoading }),
  clearAIExplanation: () => set({ aiExplanation: null, aiExplanationLoading: false }),
  setArchitectAnswer: (architectAnswer, architectAnswerLoading = false) =>
    set({ architectAnswer, architectAnswerLoading }),
}));
