import { useState, type ReactNode } from 'react';
import { useOrgStore } from '@/store/slices/orgStore';
import { GlassCard, ProgressBar, AIRecommendations, Tooltip } from '@/components/common';
import TrendLineChart from '@/components/charts/TrendLineChart';
import IssueFilters from '@/components/issues/IssueFilters';
import {
  DonutLegendCard,
  IntegrationCatalogTable,
  KPI_CARDS,
  TECHNOLOGY_DISTRIBUTION,
  AUTH_LANDSCAPE,
  MODERNIZATION_INDICATORS,
  METADATA_INVENTORY,
  IMPLEMENTATION_ITEMS,
  RISK_ITEMS,
  ACTIVITY_TREND,
  AI_RECOMMENDATION_CARDS,
} from './integrationsSummary';

const ENVIRONMENT_OPTIONS = ['All Environments', 'Production', 'Full Sandbox', 'Partial Sandbox', 'Developer Sandbox'];

// Anchored dropdown for header actions — mirrors the same local helper
// duplicated in SecurityAccess.tsx / GovernorLimits.tsx (no shared popover
// component exists yet).
function HeaderPopoverButton({ label, icon, children }: { label: string; icon: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-1.5 text-xs font-medium rounded border border-sf-border bg-sf-bg-2 text-sf-text hover:bg-sf-bg-3 transition-colors flex items-center gap-1.5"
      >
        <span>{icon}</span>
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-64 z-20 rounded-lg border border-sf-border bg-sf-bg-2 shadow-glass p-3">
            {children}
          </div>
        </>
      )}
    </div>
  );
}

function EnvironmentDropdown() {
  const [selected, setSelected] = useState(ENVIRONMENT_OPTIONS[0]);
  return (
    <HeaderPopoverButton label={selected} icon="🗂️">
      <div className="space-y-1">
        {ENVIRONMENT_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setSelected(opt)}
            className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors ${
              opt === selected ? 'bg-sf-accent/15 text-sf-accent font-semibold' : 'text-sf-text hover:bg-sf-bg-3'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </HeaderPopoverButton>
  );
}

function IntegrationKpiCard({ icon, iconBg, label, value, delta }: (typeof KPI_CARDS)[number]) {
  const hasDelta = delta !== null;
  return (
    <div className="flex flex-col gap-1.5 p-3.5 rounded-xl border border-sf-border bg-sf-glass min-w-0">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: iconBg }}>
        {icon}
      </div>
      <span className="text-[20px] font-bold text-sf-text tabular-nums leading-tight">{value.toLocaleString()}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-sf-muted leading-tight">{label}</span>
      <span className={`text-[10px] font-medium ${hasDelta ? 'text-score-good' : 'text-sf-muted'}`}>
        {hasDelta ? `▲ ${delta} vs last scan` : '— No change'}
      </span>
    </div>
  );
}

function ModernizationRow({ label, used, total }: (typeof MODERNIZATION_INDICATORS)[number]) {
  const pct = Math.round((used / total) * 100);
  return (
    <div className="py-1.5 border-b border-sf-border/50 last:border-0">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-sf-text">{label}</span>
        <span className="text-sf-muted tabular-nums">{used} / {total} — {pct}%</span>
      </div>
      <ProgressBar pct={pct} color="#3b82f6" height="xs" />
    </div>
  );
}

function MetadataInventoryRow({ icon, bg, label, value }: (typeof METADATA_INVENTORY)[number]) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 border-b border-sf-border/50 last:border-0">
      <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs shrink-0" style={{ background: bg }}>{icon}</div>
      <span className="text-xs text-sf-text flex-1">{label}</span>
      <span className="text-xs font-bold text-sf-text tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}

function LabeledCountRow({ label, value, valueColor }: { label: string; value: number; valueColor?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-sf-border/50 last:border-0">
      <span className="text-xs text-sf-text">{label}</span>
      <span className="text-xs font-bold tabular-nums" style={{ color: valueColor }}>{value.toLocaleString()}</span>
    </div>
  );
}

export default function Integrations() {
  const results = useOrgStore((s) => s.results);
  const orgHistory = useOrgStore((s) => s.orgHistory);

  const orgId = results?.orgDetails?.orgId ?? results?.metadata?.orgId ?? null;
  const history = orgId ? (orgHistory[orgId] ?? []) : [];
  const historyNewestFirst = [...history].reverse();

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-base font-semibold text-sf-text mb-1 flex items-center gap-2">
            Integration Architecture
            <Tooltip content="Complete visibility into every outbound callout, inbound event, and integration credential detected across this org.">
              <span className="text-[10px] text-sf-muted cursor-help">ⓘ</span>
            </Tooltip>
          </h1>
          <p className="text-xs text-sf-muted">Complete visibility into how your Salesforce org integrates with external systems and technologies.</p>
        </div>
        <div className="flex items-center gap-2">
          <HeaderPopoverButton label="Scan History" icon="🕐">
            {historyNewestFirst.length > 0 ? (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {historyNewestFirst.map((h) => (
                  <div key={h.timestamp} className="flex items-center justify-between text-[11px] py-1 border-b border-sf-border/40 last:border-0">
                    <span className="text-sf-muted">{new Date(h.timestamp).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-sf-muted">No scan history yet — run at least 2 scans to see trends.</p>
            )}
          </HeaderPopoverButton>
          <EnvironmentDropdown />
          <HeaderPopoverButton label="Filters" icon="🔍">
            <IssueFilters />
          </HeaderPopoverButton>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
        {KPI_CARDS.map((k) => <IntegrationKpiCard key={k.label} {...k} />)}
      </div>

      {/* Row: Technology Distribution | Authentication Landscape | Modernization Indicators | Metadata Inventory */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <DonutLegendCard
          title="Technology Distribution"
          infoTooltip="Breakdown of integration technologies detected across the org."
          centerLabel="58"
          centerSubLabel="Integration Technologies"
          rows={TECHNOLOGY_DISTRIBUTION}
          footerLabel="View technology details"
        />
        <DonutLegendCard
          title="Authentication Landscape"
          infoTooltip="Authentication mechanisms used across all detected integrations."
          centerLabel="58"
          centerSubLabel="Integrations"
          rows={AUTH_LANDSCAPE}
          footerLabel="View authentication details"
        />
        <GlassCard title="Modernization Indicators">
          <div>
            {MODERNIZATION_INDICATORS.map((m) => <ModernizationRow key={m.label} {...m} />)}
          </div>
          <button type="button" className="text-[11px] font-semibold mt-3" style={{ color: 'var(--sf-accent, #0176d3)' }}>
            View modernization report →
          </button>
        </GlassCard>
        <GlassCard title="Integration Metadata Inventory">
          <div>
            {METADATA_INVENTORY.map((m) => <MetadataInventoryRow key={m.label} {...m} />)}
          </div>
          <button type="button" className="text-[11px] font-semibold mt-3" style={{ color: 'var(--sf-accent, #0176d3)' }}>
            View all metadata →
          </button>
        </GlassCard>
      </div>

      {/* Integration Catalog */}
      <IntegrationCatalogTable />

      {/* Row: Implementation | Risk | Activity Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard title="Integration Implementation">
          <div>
            {IMPLEMENTATION_ITEMS.map((it) => <LabeledCountRow key={it.label} {...it} />)}
          </div>
          <button type="button" className="text-[11px] font-semibold mt-3" style={{ color: 'var(--sf-accent, #0176d3)' }}>
            View implementation map →
          </button>
        </GlassCard>
        <GlassCard title="Legacy & Risk Indicators">
          <div>
            {RISK_ITEMS.map((it) => <LabeledCountRow key={it.label} {...it} valueColor="#ef4444" />)}
          </div>
          <button type="button" className="text-[11px] font-semibold mt-3" style={{ color: 'var(--sf-accent, #0176d3)' }}>
            View risk analysis →
          </button>
        </GlassCard>
        <GlassCard>
          <h3 className="text-xs font-semibold text-sf-text mb-2">Integration Activity Trend (Last 12 Scans)</h3>
          <TrendLineChart
            data={ACTIVITY_TREND}
            xKey="month"
            height={180}
            series={[
              { key: 'outbound',    name: 'Outbound',     color: '#3b82f6' },
              { key: 'inbound',     name: 'Inbound',       color: '#22c55e' },
              { key: 'eventDriven', name: 'Event Driven', color: '#f59e0b' },
            ]}
          />
          <button type="button" className="text-[11px] font-semibold mt-3" style={{ color: 'var(--sf-accent, #0176d3)' }}>
            View trend analytics →
          </button>
        </GlassCard>
      </div>

      <AIRecommendations
        title="AI Recommendations"
        infoTooltip="Illustrative recommendations — Integration Architecture analysis is not yet wired to live scan data."
        cards={AI_RECOMMENDATION_CARDS}
      />

      {/* Footer note */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] border border-sf-border bg-sf-bg-2 text-sf-muted">
        <span>ⓘ</span>
        <span>All metrics are derived from Salesforce metadata, Tooling API, and static code analysis. Click on any card or row to view details.</span>
      </div>
    </div>
  );
}
