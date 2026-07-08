import { create } from 'zustand';

export interface AIModel {
  id: string;
  label: string;
  backend: 'vscode-lm' | 'anthropic' | 'custom' | 'openai' | 'gemini';
  vendor?: string;
  family?: string;
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
  openaiAuthorized: boolean;
  openaiAuthError: string | null;
  openaiModelCount: number;
  geminiAuthorized: boolean;
  geminiAuthError: string | null;
  geminiModelCount: number;
  copilotAvailable: boolean;
  copilotModelCount: number;
  /** The selector currently persisted in sfHealthAnalyzer.ai.preferredModel — drives every AI callout. */
  preferredModelId: string;
  aiExplanation: AIExplanationData | null;
  aiExplanationLoading: boolean;
  architectAnswer: string | null;
  architectAnswerLoading: boolean;
  architectAnswerProgress: string | null;
  setModels: (models: AIModel[]) => void;
  setClaudeAuth: (authorized: boolean, count?: number, error?: string | null) => void;
  setOpenAIAuth: (authorized: boolean, count?: number, error?: string | null) => void;
  setGeminiAuth: (authorized: boolean, count?: number, error?: string | null) => void;
  setCopilotStatus: (available: boolean, count: number) => void;
  setPreferredModelId: (id: string) => void;
  setAIExplanation: (data: AIExplanationData | null, loading?: boolean) => void;
  clearAIExplanation: () => void;
  setArchitectAnswer: (answer: string | null, loading?: boolean) => void;
  setArchitectAnswerProgress: (progress: string | null) => void;
}

export const useAIStore = create<AIStore>((set) => ({
  availableModels: [],
  claudeAuthorized: false,
  claudeAuthError: null,
  claudeModelCount: 0,
  openaiAuthorized: false,
  openaiAuthError: null,
  openaiModelCount: 0,
  geminiAuthorized: false,
  geminiAuthError: null,
  geminiModelCount: 0,
  copilotAvailable: false,
  copilotModelCount: 0,
  preferredModelId: 'auto',
  aiExplanation: null,
  aiExplanationLoading: false,
  architectAnswer: null,
  architectAnswerLoading: false,
  architectAnswerProgress: null,
  setModels: (availableModels) => set({ availableModels }),
  setClaudeAuth: (claudeAuthorized, claudeModelCount = 0, claudeAuthError = null) =>
    set({ claudeAuthorized, claudeModelCount, claudeAuthError }),
  setOpenAIAuth: (openaiAuthorized, openaiModelCount = 0, openaiAuthError = null) =>
    set({ openaiAuthorized, openaiModelCount, openaiAuthError }),
  setGeminiAuth: (geminiAuthorized, geminiModelCount = 0, geminiAuthError = null) =>
    set({ geminiAuthorized, geminiModelCount, geminiAuthError }),
  setCopilotStatus: (copilotAvailable, copilotModelCount) =>
    set({ copilotAvailable, copilotModelCount }),
  setPreferredModelId: (preferredModelId) => set({ preferredModelId }),
  setAIExplanation: (aiExplanation, aiExplanationLoading = false) =>
    set({ aiExplanation, aiExplanationLoading }),
  clearAIExplanation: () => set({ aiExplanation: null, aiExplanationLoading: false }),
  setArchitectAnswer: (architectAnswer, architectAnswerLoading = false) =>
    set({ architectAnswer, architectAnswerLoading, architectAnswerProgress: null }),
  setArchitectAnswerProgress: (architectAnswerProgress) => set({ architectAnswerProgress }),
}));
