import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';

import { useExtensionMessages } from '@/hooks/useExtensionMessages';
import { useOrgStore } from '@/store/slices/orgStore';
import { useUIStore } from '@/store/slices/uiStore';

import Header from '@/components/layout/Header';
import SideNav from '@/components/layout/SideNav';
import DrillDownPanel from '@/components/issues/DrillDownPanel';
import SecurityModeDialog from '@/components/modals/SecurityModeDialog';
import LoadingScreen from '@/components/loading/LoadingScreen';
import TabSkeleton from '@/components/loading/TabSkeleton';
import ErrorBoundary from '@/components/common/ErrorBoundary';

// ── Lazy-loaded tab screens (each becomes its own JS chunk) ──────────────────
const Overview        = lazy(() => import('@/components/tabs/Overview'));
const OrgInfo         = lazy(() => import('@/components/tabs/OrgInfo'));
const DataModel       = lazy(() => import('@/components/tabs/DataModel'));
const CodeQuality     = lazy(() => import('@/components/tabs/CodeQuality'));
const PerfLimits      = lazy(() => import('@/components/tabs/PerfLimits'));
const GovernorLimits  = lazy(() => import('@/components/tabs/GovernorLimits'));
const SecurityAccess  = lazy(() => import('@/components/tabs/SecurityAccess'));
const FutureReadiness = lazy(() => import('@/components/tabs/FutureReadiness'));
const CTAReview       = lazy(() => import('@/components/tabs/CTAReview'));
const AskArchitect    = lazy(() => import('@/components/tabs/AskArchitect'));
const TrendsHistory   = lazy(() => import('@/components/tabs/TrendsHistory'));

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-sf-muted p-8">
      <span className="text-4xl">🚧</span>
      <p className="text-sm">{label} — coming soon</p>
    </div>
  );
}

export default function App() {
  useExtensionMessages();

  const isLoading          = useOrgStore((s) => s.isLoading);
  const progressData       = useOrgStore((s) => s.progressData);
  const showAnalysisDialog = useUIStore((s) => s.showAnalysisDialog);

  return (
    <HashRouter>
      <div className="flex flex-col h-screen overflow-hidden bg-sf-bg text-sf-text">
        {/* Security mode dialog — shown only when user triggers analysis */}
        {showAnalysisDialog && <SecurityModeDialog />}

        {/* Full-screen loading overlay */}
        {isLoading && <LoadingScreen progressData={progressData} />}

        <Header />

        <div className="flex flex-1 overflow-hidden">
          <SideNav />

          <main className="flex-1 overflow-y-auto">
            <ErrorBoundary>
              <Suspense fallback={<TabSkeleton />}>
                <Routes>
                  <Route index element={<Navigate to="/overview" replace />} />
                  <Route path="/overview"        element={<Overview />} />
                  <Route path="/orginfo"         element={<OrgInfo />} />
                  <Route path="/datamodel"       element={<DataModel />} />
                  <Route path="/code"            element={<CodeQuality />} />
                  <Route path="/perflimits"      element={<PerfLimits />} />
                  <Route path="/govlimits"       element={<GovernorLimits />} />
                  <Route path="/secaccess"       element={<SecurityAccess />} />
                  <Route path="/futurereadiness" element={<FutureReadiness />} />
                  <Route path="/cta"             element={<CTAReview />} />
                  <Route path="/askarchitect"    element={<AskArchitect />} />
                  <Route path="/trendshistory"   element={<TrendsHistory />} />
                  <Route path="/reports"         element={<PlaceholderTab label="Reports" />} />
                  <Route path="/settings"        element={<PlaceholderTab label="Settings" />} />
                  {/* Catch-all — unknown hash falls back to overview */}
                  <Route path="*" element={<Navigate to="/overview" replace />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>

        <DrillDownPanel />
      </div>
    </HashRouter>
  );
}
