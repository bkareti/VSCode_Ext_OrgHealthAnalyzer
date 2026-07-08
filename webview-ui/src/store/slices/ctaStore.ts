import { create } from 'zustand';
import type { CTAReview } from '@/types';

interface CTAStore {
  ctaReview: CTAReview | null;
  ctaLoading: boolean;
  ctaError: string | null;
  setCTAReview: (review: CTAReview) => void;
  setCTALoading: (loading: boolean) => void;
  setCTAError: (error: string) => void;
}

export const useCTAStore = create<CTAStore>((set) => ({
  ctaReview: null,
  ctaLoading: false,
  ctaError: null,
  setCTAReview: (ctaReview) => set({ ctaReview, ctaLoading: false, ctaError: null }),
  setCTALoading: (ctaLoading) => set({ ctaLoading, ctaError: null }),
  setCTAError: (ctaError) => set({ ctaError, ctaLoading: false }),
}));
