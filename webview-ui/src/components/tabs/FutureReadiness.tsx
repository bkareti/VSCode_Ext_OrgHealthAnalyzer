import { useState } from 'react';
import { useOrgStore } from '@/store/slices/orgStore';
import { useFutureReadinessStore } from '@/store/slices/futureReadinessStore';
import { useVSCode } from '@/hooks/useVSCode';
import GlassCard from '@/components/common/GlassCard';
import Button from '@/components/common/Button';
import EmptyState from '@/components/common/EmptyState';
import SegmentedTabs from '@/components/common/SegmentedTabs';
import ModelLimitErrorBanner from '@/components/common/ModelLimitErrorBanner';
import { ReadinessPackView, PACK_TABS } from './readinessPacks';
import type { FutureReadinessReport, PackId } from '@/types';

// ── Analysis Methodology sub-tab ──────────────────────────────────────────────

interface MethodologyPack {
  packId: string;
  icon: string;
  name: string;
  description: string;
  dimensions: { name: string; inspects: string; source: string; signal: string }[];
  /** Readiness criteria that can't be evaluated from any API — documented here only, never scored. */
  manualNotes?: string[];
}

const METHODOLOGY_PACKS: MethodologyPack[] = [
  {
    packId: 'ai-agentforce',
    icon: '🤖',
    name: 'AI / Agentforce Readiness',
    description: 'Evaluates whether your org can reliably adopt Einstein AI, Agentforce agents, and prompt-based automation.',
    dimensions: [
      { name: 'Data & Metadata Quality',  inspects: 'Fields without descriptions, stale / undocumented objects', source: 'dataModelStats', signal: 'ratio' },
      { name: 'Automation Simplicity',    inspects: 'Legacy workflows, process builders, multi-trigger objects', source: 'automationSummary', signal: 'count' },
      { name: 'Security & Sharing',       inspects: 'Without-sharing Apex classes, broad permission sets', source: 'profileSummary', signal: 'count' },
      { name: 'Flow & API Readiness',     inspects: 'Entry-point flows, API-callable automation', source: 'automationSummary', signal: 'count' },
      { name: 'AI Feature Enablement',    inspects: 'Einstein / Agentforce feature licenses, installed packages', source: 'platformFeatures', signal: 'presence' },
      { name: 'Configuration Quality',    inspects: 'Apex test coverage %, technical debt indicators', source: 'testCoverage + technicalDebt', signal: 'ratio' },
    ],
  },
  {
    packId: 'data-cloud',
    icon: '☁️',
    name: 'Data Cloud Readiness',
    description: 'Assesses identity resolution, data model quality, volume readiness, provisioning, activation, and governance for Salesforce Data Cloud.',
    dimensions: [
      { name: 'Identity Resolution Readiness', inspects: 'Duplicate/matching rules, Individual & ContactPoint coverage, Contact email completeness', source: 'DuplicateRule + MatchingRule + Individual/ContactPoint/Contact collectors', signal: 'count' },
      { name: 'Data Model Quality',            inspects: 'Required field ratio, lookup vs master-detail relationships', source: 'dataModelStats', signal: 'ratio' },
      { name: 'Data Volume & Scale',            inspects: 'Record counts for LDV-candidate objects', source: 'objectRecordCounts', signal: 'count' },
      { name: 'Integration & External Data',    inspects: 'Named credentials, Salesforce Connect external objects', source: 'integrationSummary + dataModelSummary', signal: 'count' },
      { name: 'Data Cloud Provisioning',        inspects: 'Data Cloud license, Data Streams configured, CRM/data connectors', source: 'platformFeatures + DataStreamDefinition/DataConnector collectors', signal: 'presence' },
      { name: 'Activation & Insights',          inspects: 'Calculated Insights and Segments defined', source: 'CalculatedInsight/Segment collectors', signal: 'presence' },
      { name: 'Data Governance',                inspects: 'Overprivileged profiles, super admins, Data Space configuration', source: 'profileSummary + userSummary + DataSpace collector', signal: 'presence' },
    ],
    manualNotes: [
      'Privacy/consent policy (GDPR/CCPA) — not queryable from metadata; verify manually with your compliance process.',
      'Activation targets (Marketing Cloud, etc.) — platform-specific; verify manually per downstream activation channel.',
    ],
  },
  {
    packId: 'hyperforce',
    icon: '⚡',
    name: 'Hyperforce Readiness',
    description: 'Checks migration readiness for Salesforce Hyperforce — domain config, secure endpoints, integrations, and legacy API usage.',
    dimensions: [
      { name: 'Domain Readiness',        inspects: 'My Domain enabled, enhanced domain status', source: 'orgExtendedDetails', signal: 'presence' },
      { name: 'Secure Endpoints',        inspects: 'Remote site settings with http:// (non-TLS) endpoints', source: 'RemoteProxy collector', signal: 'count' },
      { name: 'Integration Hardening',   inspects: 'Named credentials vs hardcoded URL issues found', source: 'integrationFindings + namedCredentialCount', signal: 'ratio' },
      { name: 'Authentication & Access', inspects: 'MFA posture signals from profiles and permission sets', source: 'profileSummary', signal: 'presence' },
      { name: 'Legacy & Compatibility',  inspects: 'Deprecated API usage, old API version callouts', source: 'technicalDebt', signal: 'count' },
    ],
  },
];

const DATA_SOURCES = [
  { src: 'dataModelStats',             desc: 'Object & field inventory from analysis pipeline' },
  { src: 'automationSummary',          desc: 'Flow, trigger, workflow, and process builder counts' },
  { src: 'profileSummary',             desc: 'Profile and permission set configuration' },
  { src: 'integrationSummary',         desc: 'Named credentials, connected apps, callout patterns' },
  { src: 'objectRecordCounts',         desc: 'Aggregate record counts for LDV detection' },
  { src: 'technicalDebt',              desc: 'Deprecated patterns, API version issues' },
  { src: 'testCoverage',               desc: 'Apex test coverage percentages' },
  { src: 'platformFeatures',           desc: 'Feature licenses derived from featureLicenses list' },
  { src: 'DuplicateRule / MatchingRule', desc: 'Active duplicate & matching rules (new lightweight collector)' },
  { src: 'RemoteProxy / Certificate',  desc: 'Remote site http:// endpoints and cert expiry (collector)' },
  { src: 'Individual / ContactPoint*',       desc: 'Identity-graph object counts for Data Cloud matching (batched composite query)' },
  { src: 'DataStreamDefinition / DataConnector', desc: 'Data Cloud ingestion configuration (Tooling API existence checks)' },
  { src: 'CalculatedInsight / Segment',      desc: 'Data Cloud activation & insights configuration (Tooling API existence checks)' },
  { src: 'DataSpace',                        desc: 'Data Cloud governance/tenant partitioning (Tooling API existence check)' },
];

function AnalysisMethodology() {
  const [openPack, setOpenPack] = useState<string>('ai-agentforce');

  return (
    <div className="space-y-5">
      <GlassCard>
        <h2 className="text-sm font-semibold text-sf-text mb-2">How OrgPulse Computes Readiness</h2>
        <p className="text-xs text-sf-muted leading-relaxed">
          OrgPulse analyses your org's Salesforce metadata — never customer records — and runs deterministic checks
          against curated rules for each capability dimension. Scores are computed entirely by the extension engine;
          AI (when enabled) adds interpretive narrative only and never influences scores or grades.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {['Metadata Only', 'No PII Collected', 'Deterministic Scores', 'AI Narrative Only', 'No Customer Records'].map((pill) => (
            <span key={pill} className="px-2.5 py-0.5 rounded-full border border-sf-accent/40 bg-sf-accent/10 text-[11px] text-sf-accent font-medium">
              {pill}
            </span>
          ))}
        </div>
      </GlassCard>

      <GlassCard title="Data Sources Used">
        <div className="grid gap-2 sm:grid-cols-2">
          {DATA_SOURCES.map(({ src, desc }) => (
            <div key={src} className="rounded-lg bg-sf-bg-2 border border-sf-border/50 p-2.5">
              <p className="text-[11px] font-semibold text-sf-accent font-mono">{src}</p>
              <p className="text-[10px] text-sf-muted mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard title="Scoring Methodology">
        <div className="grid gap-3 sm:grid-cols-3 text-center">
          {[
            { icon: '⚖️', label: 'Weighted Dimensions', desc: 'Each dimension has a configurable weight. Pack score = weighted average of dimension scores.' },
            { icon: '🔒', label: 'Deterministic Engine', desc: 'Score thresholds: ≥80 Ready, ≥50 Partial, <50 Blocked. No AI involvement.' },
            { icon: '📊', label: 'Confidence Rating', desc: 'Higher confidence when more checks have data. N/A checks are excluded from averages.' },
          ].map(({ icon, label, desc }) => (
            <div key={label} className="rounded-lg bg-sf-bg-2 border border-sf-border/50 p-3">
              <div className="text-2xl mb-1.5">{icon}</div>
              <p className="text-xs font-semibold text-sf-text mb-1">{label}</p>
              <p className="text-[10px] text-sf-muted leading-snug">{desc}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-sf-muted mb-2">Validated Dimensions by Pack</h3>
        <div className="space-y-2">
          {METHODOLOGY_PACKS.map((pack) => (
            <GlassCard key={pack.packId}>
              <button className="w-full flex items-center justify-between gap-3 text-left" onClick={() => setOpenPack(openPack === pack.packId ? '' : pack.packId)}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">{pack.icon}</span>
                  <div>
                    <h4 className="text-sm font-semibold text-sf-text">{pack.name}</h4>
                    <p className="text-[11px] text-sf-muted">{pack.description}</p>
                  </div>
                </div>
                <span className="text-sf-muted text-xs shrink-0">{openPack === pack.packId ? '▾' : '▸'}</span>
              </button>
              {openPack === pack.packId && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-sf-border/50">
                  <table className="w-full text-left">
                    <thead className="bg-sf-glass-soft">
                      <tr>
                        {['Dimension', 'What Is Inspected', 'Data Source', 'Signal Type'].map((h) => (
                          <th key={h} className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-sf-muted border-b border-sf-border/50">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pack.dimensions.map((dim, i) => (
                        <tr key={dim.name} className={i % 2 === 0 ? 'bg-transparent' : 'bg-sf-glass-stripe'}>
                          <td className="px-3 py-2 text-xs font-medium text-sf-text whitespace-nowrap">{dim.name}</td>
                          <td className="px-3 py-2 text-[11px] text-sf-muted">{dim.inspects}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <code className="text-[10px] text-sf-accent bg-sf-accent/10 px-1.5 py-0.5 rounded">{dim.source}</code>
                          </td>
                          <td className="px-3 py-2"><span className="text-[10px] text-sf-muted capitalize">{dim.signal}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {pack.manualNotes && pack.manualNotes.length > 0 && (
                    <div className="p-3 border-t border-sf-border/50 bg-sf-glass-stripe">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-sf-muted mb-1">Manual Review Required (Not Scored)</p>
                      <ul className="space-y-0.5">
                        {pack.manualNotes.map((note) => (
                          <li key={note} className="text-[11px] text-sf-muted">• {note}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-base">🛡️</span>
          <span className="text-xs font-semibold text-green-400">Privacy Guarantee</span>
        </div>
        <p className="text-[11px] text-sf-muted leading-relaxed">
          OrgPulse never reads or transmits customer records, source code, SOQL queries, file paths, PII, or
          unmasked org IDs. All AI context is sanitized through a PII filter before leaving the extension.
          Scores are determined by the extension engine alone — AI enriches narrative only.
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type ActiveTab = PackId | 'methodology';

const TAB_ITEMS: { id: ActiveTab; label: string }[] = [
  ...PACK_TABS,
  { id: 'methodology', label: 'How We Analyzed' },
];

export default function FutureReadiness() {
  const results = useOrgStore((s) => s.results);
  const storeReport = useFutureReadinessStore((s) => s.report);
  const loading = useFutureReadinessStore((s) => s.loading);
  const error = useFutureReadinessStore((s) => s.error);
  const { postMessage } = useVSCode();

  const [activeTab, setActiveTab] = useState<ActiveTab>('data-cloud');

  const report: FutureReadinessReport | null = storeReport ?? results?.futureReadiness ?? null;
  const hasNarrative = !!report?.narrative;

  const activePack = activeTab === 'methodology' ? null : report?.packs.find((p) => p.packId === activeTab);

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-5 pt-4 pb-0 border-b border-sf-border">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-sf-text">Future Readiness</h1>
              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-[10px] font-bold text-purple-400 uppercase tracking-wide">AI</span>
            </div>
            <p className="text-xs text-sf-muted mt-0.5">Your readiness to adopt Data Cloud, Agentforce, and Hyperforce.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" disabled title="Executive summary export coming soon">Download Summary</Button>
            <Button
              variant="primary"
              loading={loading}
              onClick={() => postMessage({ command: 'runFutureReadiness', force: hasNarrative })}
            >
              {hasNarrative ? 'Regenerate AI Narrative' : 'Generate AI Narrative'}
            </Button>
          </div>
        </div>
        <SegmentedTabs items={TAB_ITEMS} active={activeTab} onChange={setActiveTab} />
      </div>

      {error && (
        <div className="mx-5 mt-3">
          <ModelLimitErrorBanner
            message={error}
            onRetry={() => postMessage({ command: 'runFutureReadiness', force: hasNarrative })}
          />
        </div>
      )}

      {activeTab === 'methodology' ? (
        <div className="p-6"><AnalysisMethodology /></div>
      ) : !report ? (
        <EmptyState
          icon="🔮"
          title="No Future Readiness assessment yet"
          description="Run a full org analysis to evaluate readiness for Data Cloud, Agentforce, and Hyperforce."
          className="m-6"
        />
      ) : activePack ? (
        <div className="p-6">
          <ReadinessPackView pack={activePack} modelUsed={report.modelUsed} />
          <p className="text-[10px] text-sf-muted/40 text-right leading-snug mt-4">
            Generated {new Date(report.generatedAt).toLocaleString()}
            {!report.modelUsed && ' · deterministic scores (no AI narrative)'}
          </p>
        </div>
      ) : (
        <EmptyState
          icon="🔮"
          title={`No ${TAB_ITEMS.find((t) => t.id === activeTab)?.label ?? activeTab} data in this report`}
          className="m-6"
        />
      )}
    </div>
  );
}
