import { create } from 'zustand';
import type { FutureReadinessReport } from '@/types';

interface FutureReadinessStore {
  report: FutureReadinessReport | null;
  loading: boolean;
  error: string | null;
  setReport: (report: FutureReadinessReport) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
}

export const useFutureReadinessStore = create<FutureReadinessStore>((set) => ({
  report: null,
  loading: false,
  error: null,
  setReport: (report) => set({ report, loading: false, error: null }),
  setLoading: (loading) => set({ loading, error: null }),
  setError: (error) => set({ error, loading: false }),
}));
