import { create } from 'zustand';
import type { AgentforceInsightsReport } from '@/types';

interface AgentforceInsightsStore {
  report: AgentforceInsightsReport | null;
  loading: boolean;
  error: string | null;
  setReport: (report: AgentforceInsightsReport) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
}

export const useAgentforceInsightsStore = create<AgentforceInsightsStore>((set) => ({
  report: null,
  loading: false,
  error: null,
  setReport: (report) => set({ report, loading: false, error: null }),
  setLoading: (loading) => set({ loading, error: null }),
  setError: (error) => set({ error, loading: false }),
}));
