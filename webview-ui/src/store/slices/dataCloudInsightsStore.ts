import { create } from 'zustand';
import type { DataCloudInsightsReport } from '@/types';

interface DataCloudInsightsStore {
  report: DataCloudInsightsReport | null;
  loading: boolean;
  error: string | null;
  setReport: (report: DataCloudInsightsReport) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
}

export const useDataCloudInsightsStore = create<DataCloudInsightsStore>((set) => ({
  report: null,
  loading: false,
  error: null,
  setReport: (report) => set({ report, loading: false, error: null }),
  setLoading: (loading) => set({ loading, error: null }),
  setError: (error) => set({ error, loading: false }),
}));
