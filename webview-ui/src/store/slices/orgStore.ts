import { create } from 'zustand';
import type { AnalysisResult, ScanHistoryEntry } from '@/types';

export interface ProgressData {
  step: number;
  label: string;
  meta?: Record<string, unknown>;
}

interface OrgStore {
  results: AnalysisResult | null;
  isLoading: boolean;
  loadingStep: number | null;
  progressData: ProgressData | null;
  orgHistory: Record<string, ScanHistoryEntry[]>;
  setResults: (results: AnalysisResult) => void;
  setLoading: (loading: boolean, step?: number | null) => void;
  setProgress: (data: ProgressData) => void;
  setOrgHistory: (history: Record<string, ScanHistoryEntry[]>) => void;
}

export const useOrgStore = create<OrgStore>((set) => ({
  results: null,
  isLoading: false,
  loadingStep: null,
  progressData: null,
  orgHistory: {},
  setResults: (results) => set({ results, isLoading: false, progressData: null }),
  setLoading: (isLoading, loadingStep = null) => set({ isLoading, loadingStep }),
  setProgress: (progressData) => set({ progressData, isLoading: true }),
  setOrgHistory: (orgHistory) => set({ orgHistory }),
}));
