/**
 * Backward-compatible re-export shim.
 *
 * New code should import directly from '@/store/slices/<slice>'.
 * All existing imports from '@/store/dashboardStore' continue to work.
 *
 * NOTE: useDashboardStore subscribes a component to all 5 slices.
 *       Migrate callers to targeted slice hooks for optimal re-render perf.
 */
import type { AnalysisResult, CTAReview, Issue } from '@/types';

import { useUIStore } from './slices/uiStore';
import type { TabId, SecurityMode } from './slices/uiStore';

import { useOrgStore } from './slices/orgStore';
import type { ProgressData } from './slices/orgStore';

import { useIssueStore } from './slices/issueStore';

import { useAIStore } from './slices/aiStore';
import type { AIModel, AIExplanationData } from './slices/aiStore';

import { useCTAStore } from './slices/ctaStore';

// ── Named re-exports (type + store) ────────────────────────────────────────
export type { TabId, SecurityMode };
export { useUIStore };

export type { ProgressData };
export { useOrgStore };

export { useIssueStore };

export type { AIModel, AIExplanationData };
export { useAIStore };

export { useCTAStore };

// ── Legacy merged-state type ────────────────────────────────────────────────
interface LegacyDashboardState {
  // ui — activeTab is now URL-driven; provided for compat but not reactive to URL
  activeTab: TabId;
  securityMode: SecurityMode | null;
  selectedModelId: string | null;
  showAnalysisDialog: boolean;
  /** @deprecated Use useNavigate() from react-router-dom instead */
  setActiveTab: (tab: TabId) => void;
  setSecurityMode: (mode: SecurityMode) => void;
  setSelectedModelId: (id: string) => void;
  setShowAnalysisDialog: (v: boolean) => void;
  // org
  results: AnalysisResult | null;
  isLoading: boolean;
  loadingStep: number | null;
  progressData: ProgressData | null;
  setResults: (results: AnalysisResult) => void;
  setLoading: (loading: boolean, step?: number | null) => void;
  setProgress: (data: ProgressData) => void;
  // issues
  selectedIssueIdx: number | null;
  selectedIssue: Issue | null;
  filters: { category: string; severity: string; search: string };
  openDrill: (idx: number, issue: Issue) => void;
  closeDrill: () => void;
  setFilters: (filters: Partial<LegacyDashboardState['filters']>) => void;
  // ai
  availableModels: AIModel[];
  claudeAuthorized: boolean;
  claudeAuthError: string | null;
  aiExplanation: AIExplanationData | null;
  aiExplanationLoading: boolean;
  architectAnswer: string | null;
  architectAnswerLoading: boolean;
  setModels: (models: AIModel[]) => void;
  setClaudeAuth: (authorized: boolean, count?: number, error?: string | null) => void;
  setAIExplanation: (data: AIExplanationData | null, loading?: boolean) => void;
  setArchitectAnswer: (answer: string | null, loading?: boolean) => void;
  // cta
  ctaReview: CTAReview | null;
  ctaLoading: boolean;
  ctaError: string | null;
  setCTAReview: (review: CTAReview) => void;
  setCTALoading: (loading: boolean) => void;
  setCTAError: (error: string) => void;
}

/** Derive current TabId from the URL hash (e.g. #/overview → 'overview'). */
function tabIdFromHash(): TabId {
  const hash = window.location.hash.replace(/^#\//, '');
  const valid: TabId[] = [
    'overview', 'orginfo', 'datamodel', 'code',
    'perflimits', 'govlimits', 'secaccess', 'cta', 'askarchitect',
    'futurereadiness', 'trendshistory', 'reports', 'settings',
  ];
  return valid.includes(hash as TabId) ? (hash as TabId) : 'overview';
}

/**
 * Legacy combined hook — mirrors the old useDashboardStore API.
 * Subscribes to all 5 slices; prefer individual slice hooks in new code.
 */
export function useDashboardStore<T>(selector: (state: LegacyDashboardState) => T): T {
  const ui    = useUIStore();
  const org   = useOrgStore();
  const issue = useIssueStore();
  const ai    = useAIStore();
  const cta   = useCTAStore();

  const merged: LegacyDashboardState = {
    // ui — activeTab read from URL hash for backward compat
    activeTab:              tabIdFromHash(),
    securityMode:           ui.securityMode,
    selectedModelId:        ui.selectedModelId,
    showAnalysisDialog:     ui.showAnalysisDialog,
    setActiveTab:           (tab) => { window.location.hash = `/${tab}`; },
    setSecurityMode:        ui.setSecurityMode,
    setSelectedModelId:     ui.setSelectedModelId,
    setShowAnalysisDialog:  ui.setShowAnalysisDialog,
    // org
    results:      org.results,
    isLoading:    org.isLoading,
    loadingStep:  org.loadingStep,
    progressData: org.progressData,
    setResults:   org.setResults,
    setLoading:   org.setLoading,
    setProgress:  org.setProgress,
    // issues
    selectedIssueIdx: issue.selectedIssueIdx,
    selectedIssue:    issue.selectedIssue,
    filters:          issue.filters,
    openDrill:        issue.openDrill,
    closeDrill:       issue.closeDrill,
    setFilters:       issue.setFilters,
    // ai
    availableModels:        ai.availableModels,
    claudeAuthorized:       ai.claudeAuthorized,
    claudeAuthError:        ai.claudeAuthError,
    aiExplanation:          ai.aiExplanation,
    aiExplanationLoading:   ai.aiExplanationLoading,
    architectAnswer:        ai.architectAnswer,
    architectAnswerLoading: ai.architectAnswerLoading,
    setModels:          ai.setModels,
    setClaudeAuth:      ai.setClaudeAuth,
    setAIExplanation:   ai.setAIExplanation,
    setArchitectAnswer: ai.setArchitectAnswer,
    // cta
    ctaReview:      cta.ctaReview,
    ctaLoading:     cta.ctaLoading,
    ctaError:       cta.ctaError,
    setCTAReview:   cta.setCTAReview,
    setCTALoading:  cta.setCTALoading,
    setCTAError:    cta.setCTAError,
  };

  return selector(merged);
}
