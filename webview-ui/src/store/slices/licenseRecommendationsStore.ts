import { create } from 'zustand';
import type { LicenseRecommendationsReport } from '@/types';

interface LicenseRecommendationsStore {
  report: LicenseRecommendationsReport | null;
  loading: boolean;
  error: string | null;
  setReport: (report: LicenseRecommendationsReport) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
}

export const useLicenseRecommendationsStore = create<LicenseRecommendationsStore>((set) => ({
  report: null,
  loading: false,
  error: null,
  setReport: (report) => set({ report, loading: false, error: null }),
  setLoading: (loading) => set({ loading, error: null }),
  setError: (error) => set({ error, loading: false }),
}));
