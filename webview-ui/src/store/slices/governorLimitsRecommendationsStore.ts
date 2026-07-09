import { create } from 'zustand';
import type { GovernorLimitsRecommendationsReport } from '@/types';

interface GovernorLimitsRecommendationsStore {
  report: GovernorLimitsRecommendationsReport | null;
  loading: boolean;
  error: string | null;
  setReport: (report: GovernorLimitsRecommendationsReport) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
}

export const useGovernorLimitsRecommendationsStore = create<GovernorLimitsRecommendationsStore>((set) => ({
  report: null,
  loading: false,
  error: null,
  setReport: (report) => set({ report, loading: false, error: null }),
  setLoading: (loading) => set({ loading, error: null }),
  setError: (error) => set({ error, loading: false }),
}));
