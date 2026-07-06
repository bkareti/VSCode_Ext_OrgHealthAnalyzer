import { create } from 'zustand';
import type { Issue } from '@/types';
import { useAIStore } from './aiStore';

interface IssueStore {
  selectedIssueIdx: number | null;
  selectedIssue: Issue | null;
  filters: { category: string; severity: string; search: string };
  openDrill: (idx: number, issue: Issue) => void;
  closeDrill: () => void;
  setFilters: (filters: Partial<IssueStore['filters']>) => void;
}

export const useIssueStore = create<IssueStore>((set) => ({
  selectedIssueIdx: null,
  selectedIssue: null,
  filters: { category: 'all', severity: 'all', search: '' },
  openDrill: (selectedIssueIdx, selectedIssue) => set({ selectedIssueIdx, selectedIssue }),
  closeDrill: () => {
    // Cross-slice: clear AI explanation via getState() to avoid circular hook dependency
    useAIStore.getState().clearAIExplanation();
    set({ selectedIssueIdx: null, selectedIssue: null });
  },
  setFilters: (filters) => set((s) => ({ filters: { ...s.filters, ...filters } })),
}));
