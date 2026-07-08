import { create } from 'zustand';
import type { OrgInfoRecommendationsReport } from '@/types';

interface OrgInfoRecommendationsStore {
  report: OrgInfoRecommendationsReport | null;
  loading: boolean;
  error: string | null;
  setReport: (report: OrgInfoRecommendationsReport) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
}

export const useOrgInfoRecommendationsStore = create<OrgInfoRecommendationsStore>((set) => ({
  report: null,
  loading: false,
  error: null,
  setReport: (report) => set({ report, loading: false, error: null }),
  setLoading: (loading) => set({ loading, error: null }),
  setError: (error) => set({ error, loading: false }),
}));
