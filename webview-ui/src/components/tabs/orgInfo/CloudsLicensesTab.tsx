import { GlassCard, ExpandableCard, SampleMark, InfoCard } from '@/components/common';
import { DonutWithLegend, TrendLineChart } from '@/components/charts';
import LicenseRecommendations from './LicenseRecommendations';
import {
  DEMO_CLOUDS_EXTENDED, DEMO_LICENSES, DEMO_FEATURE_LICENSES, SAMPLE_LICENSE_KPI,
  SAMPLE_PERMISSION_SET_LICENSES, SAMPLE_PERMISSION_SET_TOTAL, SAMPLE_PERMISSION_SET_AVAILABLE,
  SAMPLE_LOGIN_ACTIVITY, SAMPLE_LICENSE_TREND,
  SAMPLE_WASTE_UNASSIGNED, SAMPLE_WASTE_EXPIRED, SAMPLE_WASTE_MULTI_LICENSE_USERS,
  SAMPLE_TOP_UNUSED_FEATURE_LICENSES, CLOUD_CATEGORY,
} from './sampleData';
import { licenseUtilizationSplit, cloudsEnabledCount, featureLicenseDonutBuckets, topUnusedFeatureLicenses } from './derivations';
import type { AnalysisResult } from '@/types';

interface Props {
  results: AnalysisResult | null;
  isDemo: boolean;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return 'N/A';
  return Number(n).toLocaleString();
}

// ─── KPI strip cards ────────────────────────────────────────────────────────
interface KpiCardProps { iconBg: string; value: string | number; label: string; sub?: string | null; sample?: boolean }
function KpiCard({ iconBg, value, label, sub, sample }: KpiCardProps) {
  return (
    <div className="relative overflow-hidden flex flex-col gap-1.5 p-3.5 rounded-xl border border-sf-border bg-sf-glass min-w-0">
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: iconBg.replace(',.15)', ',1)') }} />
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-sf-muted">{label}</span>
        {sample && <SampleMark />}
      </div>
      <span className="text-[22px] font-bold text-sf-text tabular-nums leading-tight truncate w-full">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {sub && <span className="text-[11px] text-sf-muted leading-tight">{sub}</span>}
    </div>
  );
}

export default function CloudsLicensesTab({ results, isDemo }: Props) {
  // ── Real data extraction ───────────────────────────────────────────────────
  const licenses = results?.licenseSummary ?? (isDemo ? DEMO_LICENSES : []);
  const featLics = results?.featureLicenses ?? (isDemo ? DEMO_FEATURE_LICENSES : []);
  const clouds = results?.orgInfoData?.clouds ?? [];
  const dormantUsers = results?.userSummary?.dormantUsers;

  const hasRealLicenses = !!results?.licenseSummary?.length;
  const hasRealFeatureLicenses = !!results?.featureLicenses?.length;
  const hasRealClouds = !!results?.orgInfoData?.clouds?.length;
  const hasRealDormant = dormantUsers != null;

  // ── Derived real numbers ────────────────────────────────────────────────────
  // Demo mode shows the reference screenshot's literal KPI totals — like most
  // hand-built dashboard mockups, they aren't cross-summed from the 8-row demo
  // table below. Real scans compute this live from the org's actual licenses.
  const split = isDemo && !hasRealLicenses ? SAMPLE_LICENSE_KPI : licenseUtilizationSplit(licenses);
  const cloudCounts = isDemo
    ? { enabled: DEMO_CLOUDS_EXTENDED.filter((c) => c.status === 'enabled').length, total: DEMO_CLOUDS_EXTENDED.length }
    : cloudsEnabledCount(clouds);
  const featureLicDonut = featureLicenseDonutBuckets(featLics, 5);
  const topUnused = hasRealFeatureLicenses ? topUnusedFeatureLicenses(featLics, 6) : SAMPLE_TOP_UNUSED_FEATURE_LICENSES;
  const inactiveUsersValue = dormantUsers ?? 238;

  return (
    <div className="space-y-4">

      {/* ════ KPI STRIP ═══════════════════════════════════════════════════════ */}
      <GlassCard>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0,2fr) repeat(5, minmax(0,1fr))' }}>

          {/* Overall License Utilization */}
          <div className="relative overflow-hidden flex flex-col gap-1.5 p-3.5 rounded-xl border border-sf-border bg-sf-glass min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-sf-muted leading-tight">Overall License Utilization</span>
              <SampleMark note="Used/Available reflect real license totals; Unassigned/Expired are illustrative sample proportions — Salesforce doesn't expose those as distinct license states." />
            </div>
            <DonutWithLegend
              layout="side"
              height={120}
              showPercent={false}
              centerLabel={`${split.utilizationPct}%`}
              centerSubLabel="Utilized"
              data={[
                { name: 'Used', value: split.used, color: '#3b82f6' },
                { name: 'Available', value: split.available, color: '#22c55e' },
                { name: 'Unassigned', value: split.unassigned, color: '#f59e0b' },
                { name: 'Expired', value: split.expired, color: '#ef4444' },
              ]}
            />
            {isDemo && <span className="text-[10px] font-semibold text-score-excellent">↑ 5% vs last scan</span>}
          </div>

          <KpiCard iconBg="rgba(59,130,246,.15)" value={split.total} label="Total Licenses"
            sub={`Assigned ${fmt(split.used)} · Available ${fmt(split.available + split.unassigned + split.expired)}`} />

          <KpiCard iconBg="rgba(20,184,166,.15)" value={`${cloudCounts.enabled} / ${cloudCounts.total}`} label="Clouds Enabled" />

          <KpiCard iconBg="rgba(139,92,246,.15)" value={featLics.length} label="Feature Licenses"
            sub={`Assigned ${fmt(featLics.reduce((s, f) => s + f.usedLicenses, 0))} · Available ${fmt(featLics.reduce((s, f) => s + (f.totalLicenses - f.usedLicenses), 0))}`} />

          <KpiCard iconBg="rgba(236,72,153,.15)" value={SAMPLE_PERMISSION_SET_TOTAL} label="Permission Set Licenses"
            sub={`Assigned ${fmt(SAMPLE_PERMISSION_SET_TOTAL - SAMPLE_PERMISSION_SET_AVAILABLE)} · Available ${fmt(SAMPLE_PERMISSION_SET_AVAILABLE)}`}
            sample />

          <KpiCard iconBg="rgba(245,158,11,.15)" value={inactiveUsersValue} label="Inactive Users"
            sub="Not logged in > 90 days" sample={!hasRealDormant} />
        </div>
      </GlassCard>

      {/* ════ CENTER SECTION: 2-column (main + sidebar) ═════════════════════════ */}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)' }}>

        {/* ── Column 1: main ─────────────────────────────────────────────────── */}
        <div className="space-y-4 min-w-0">

          {/* Row 1: Clouds Overview | License Utilization by Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">

        {/* Clouds Overview */}
        <ExpandableCard
          title="Clouds Overview"
          headerRight={
            <div className="flex items-center gap-2 text-[10px] shrink-0">
              <span className="flex items-center gap-1 text-score-excellent">● Enabled</span>
              <span className="flex items-center gap-1 text-score-critical">● Disabled</span>
              {isDemo && <span className="flex items-center gap-1 text-sf-muted">● Not Available</span>}
            </div>
          }
          expandLabel="View all cloud details"
          summary={
            <div className="grid grid-cols-2 gap-1.5">
              {(isDemo ? DEMO_CLOUDS_EXTENDED : clouds.map((c) => ({ name: c.name, key: c.key, status: c.enabled ? 'enabled' as const : 'disabled' as const }))).map((c) => {
                const clr = c.status === 'enabled' ? '#22c55e' : c.status === 'disabled' ? '#ef4444' : '#6b7280';
                const label = c.status === 'enabled' ? 'Enabled' : c.status === 'disabled' ? 'Disabled' : 'Not Available';
                return (
                  <div key={c.key} className="flex items-center justify-between px-2 py-1.5 rounded-lg text-[11px]"
                    style={{ background: `${clr}12`, border: `1px solid ${clr}40` }}>
                    <span className="text-sf-text font-medium truncate pr-1">{c.name}</span>
                    <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${clr}26`, color: clr }}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          }
          details={
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-sf-border">
                  <th className="text-left py-1 px-1 text-sf-muted font-medium">Cloud</th>
                  <th className="text-left py-1 px-1 text-sf-muted font-medium">Category</th>
                  <th className="text-left py-1 px-1 text-sf-muted font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(isDemo ? DEMO_CLOUDS_EXTENDED : clouds.map((c) => ({ name: c.name, key: c.key, status: c.enabled ? 'enabled' as const : 'disabled' as const }))).map((c) => (
                  <tr key={c.key} className="border-b border-sf-border/40">
                    <td className="py-1 px-1 text-sf-text">{c.name}</td>
                    <td className="py-1 px-1 text-sf-muted">{CLOUD_CATEGORY[c.key] ?? '—'}</td>
                    <td className="py-1 px-1 text-sf-muted capitalize">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />

        {/* License Utilization by Type */}
        <ExpandableCard
          title="License Utilization by Type"
          infoTooltip="Assigned / Total seats per license type, from the org's UserLicense records."
          expandLabel={`View all ${licenses.length} license types`}
          summary={
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-sf-border">
                  <th className="text-left py-1 px-1 text-sf-muted font-medium">License Type</th>
                  <th className="text-center py-1 px-1 text-sf-muted font-medium">Assigned / Total</th>
                  <th className="py-1 px-1 text-sf-muted font-medium">Utilization</th>
                </tr>
              </thead>
              <tbody>
                {licenses.slice(0, 5).map((l, i) => {
                  const pct = l.totalLicenses > 0 ? Math.round((l.usedLicenses / l.totalLicenses) * 100) : 0;
                  const clr = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
                  return (
                    <tr key={l.name} className={i % 2 ? 'bg-sf-bg-3/50' : ''}>
                      <td className="py-1 px-1 text-sf-text truncate max-w-[110px]">{l.name}</td>
                      <td className="py-1 px-1 text-sf-muted text-center tabular-nums whitespace-nowrap">{l.usedLicenses.toLocaleString()} / {l.totalLicenses.toLocaleString()}</td>
                      <td className="py-1 px-1 min-w-[70px]">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1 rounded-full bg-sf-border overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: clr }} />
                          </div>
                          <span className="text-[10px] text-sf-muted w-7 text-right">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          }
          details={
            licenses.length > 5 ? (
              <table className="w-full border-collapse text-[11px]">
                <tbody>
                  {licenses.slice(5).map((l, i) => {
                    const pct = l.totalLicenses > 0 ? Math.round((l.usedLicenses / l.totalLicenses) * 100) : 0;
                    const clr = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
                    return (
                      <tr key={l.name} className={i % 2 ? 'bg-sf-bg-3/50' : ''}>
                        <td className="py-1 px-1 text-sf-text truncate max-w-[110px]">{l.name}</td>
                        <td className="py-1 px-1 text-sf-muted text-center tabular-nums whitespace-nowrap">{l.usedLicenses.toLocaleString()} / {l.totalLicenses.toLocaleString()}</td>
                        <td className="py-1 px-1 min-w-[70px]">
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-1 rounded-full bg-sf-border overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: clr }} />
                            </div>
                            <span className="text-[10px] text-sf-muted w-7 text-right">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <p className="text-[11px] text-sf-muted">No additional license types.</p>
          }
        />

          </div>
          {/* Row 2: User Login Activity | License Trend | Top Unused Feature Licenses */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">

        {/* User Login Activity */}
        <ExpandableCard
          title="User Login Activity"
          sample
          sampleNote="Login-recency buckets aren't tracked by OrgPulse yet — shown as illustrative sample data."
          expandLabel="View all users"
          summary={
            <DonutWithLegend
              layout="below"
              height={140}
              colors={['#22c55e', '#3b82f6', '#f59e0b', '#ef4444']}
              centerLabel={fmt(SAMPLE_LOGIN_ACTIVITY.reduce((s, d) => s + d.value, 0))}
              centerSubLabel="Total Users"
              data={SAMPLE_LOGIN_ACTIVITY}
            />
          }
          details={
            <table className="w-full border-collapse text-[11px]">
              <tbody>
                {SAMPLE_LOGIN_ACTIVITY.map((b, i) => (
                  <tr key={b.name} className={i % 2 ? 'bg-sf-bg-3/50' : ''}>
                    <td className="py-1 px-1 text-sf-text">{b.name}</td>
                    <td className="py-1 px-1 text-sf-muted text-right tabular-nums">{b.value.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />

        {/* License Trend (Last 12 Scans) */}
        <GlassCard>
          <div className="flex items-center gap-1.5 mb-2">
            <h3 className="text-xs font-semibold text-sf-text">License Trend (Last 12 Scans)</h3>
            <SampleMark note="Scan history doesn't persist license counts yet — shown as illustrative sample data." />
          </div>
          <TrendLineChart
            data={SAMPLE_LICENSE_TREND}
            xKey="month"
            height={190}
            yDomain={[0, 3000]}
            yTickFormatter={(n) => (n >= 1000 ? `${(Math.round(n / 100) / 10).toFixed(1).replace(/\.0$/, '')}K` : `${n}`)}
            series={[
              { key: 'assigned', name: 'Assigned', color: '#3b82f6' },
              { key: 'used', name: 'Used', color: '#22c55e' },
              { key: 'available', name: 'Available', color: '#9ca3af', dashed: true },
            ]}
          />
        </GlassCard>

        {/* Top Unused Feature Licenses */}
        <ExpandableCard
          title="Top Unused Feature Licenses"
          sample={!hasRealFeatureLicenses}
          toggleInHeader
          expandLabel="View all"
          summary={
            <div>
              {topUnused.slice(0, 6).map((row) => (
                <div key={row.name} className="flex justify-between items-center py-1.5 border-b border-sf-border/50 last:border-0">
                  <span className="text-xs text-sf-text truncate pr-2">{row.name}</span>
                  <span className="text-xs font-bold tabular-nums text-sf-text">{fmt(row.value)}</span>
                </div>
              ))}
            </div>
          }
          details={
            topUnused.length > 6 ? (
              <div>
                {topUnused.slice(6).map((row) => (
                  <div key={row.name} className="flex justify-between items-center py-1.5 border-b border-sf-border/50 last:border-0">
                    <span className="text-xs text-sf-text truncate pr-2">{row.name}</span>
                    <span className="text-xs font-bold tabular-nums text-sf-text">{fmt(row.value)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-[11px] text-sf-muted">No additional feature licenses.</p>
          }
        />

          </div>
        </div>

        {/* ── Column 2: sidebar ──────────────────────────────────────────────── */}
        <div className="space-y-4 min-w-0">

        {/* Feature Licenses Overview */}
        <ExpandableCard
          title="Feature Licenses Overview"
          expandLabel="View all feature licenses"
          summary={
            <DonutWithLegend
              layout="side"
              height={150}
              centerLabel={fmt(featureLicDonut.reduce((s, d) => s + d.value, 0))}
              centerSubLabel="Assigned"
              data={featureLicDonut}
            />
          }
          details={
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-sf-border">
                  <th className="text-left py-1 px-1 text-sf-muted font-medium">Feature</th>
                  <th className="text-left py-1 px-1 text-sf-muted font-medium">Status</th>
                  <th className="text-right py-1 px-1 text-sf-muted font-medium">Used / Total</th>
                </tr>
              </thead>
              <tbody>
                {featLics.map((fl, i) => (
                  <tr key={fl.name} className={i % 2 ? 'bg-sf-bg-3/50' : ''}>
                    <td className="py-1 px-1 text-sf-text truncate max-w-[110px]">{fl.name}</td>
                    <td className="py-1 px-1 text-sf-muted">{fl.status}</td>
                    <td className="py-1 px-1 text-sf-muted text-right tabular-nums whitespace-nowrap">{fl.usedLicenses} / {fl.totalLicenses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />

        {/* Permission Set License Usage */}
        <ExpandableCard
          title="Permission Set License Usage"
          sample
          sampleNote="Permission Set License assignment data isn't collected by OrgPulse yet — shown as illustrative sample data."
          expandLabel="View permission set licenses"
          summary={
            <DonutWithLegend
              layout="side"
              height={150}
              centerLabel={fmt(SAMPLE_PERMISSION_SET_TOTAL)}
              centerSubLabel="Assigned"
              data={SAMPLE_PERMISSION_SET_LICENSES}
            />
          }
          details={
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-sf-border">
                  <th className="text-left py-1 px-1 text-sf-muted font-medium">Permission Set License</th>
                  <th className="text-right py-1 px-1 text-sf-muted font-medium">Assigned</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE_PERMISSION_SET_LICENSES.map((b, i) => (
                  <tr key={b.name} className={i % 2 ? 'bg-sf-bg-3/50' : ''}>
                    <td className="py-1 px-1 text-sf-text">{b.name}</td>
                    <td className="py-1 px-1 text-sf-muted text-right tabular-nums">{b.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />

        {/* License Waste Indicators */}
        <ExpandableCard
          title="License Waste Indicators"
          sample
          sampleNote="Unassigned/Expired/Multi-license figures are illustrative sample data — Salesforce doesn't expose license expiration or per-user license joins."
          expandLabel="View waste details"
          summary={
            <div>
              {[
                { label: 'Unassigned Licenses', value: SAMPLE_WASTE_UNASSIGNED },
                { label: 'Expired Licenses', value: SAMPLE_WASTE_EXPIRED },
                { label: 'Inactive Users with Licenses', value: inactiveUsersValue },
                { label: 'Users with Multiple Expensive Licenses', value: SAMPLE_WASTE_MULTI_LICENSE_USERS },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center py-1.5 border-b border-sf-border/50 last:border-0">
                  <span className="text-xs text-sf-text">{row.label}</span>
                  <span className="text-xs font-bold tabular-nums text-score-critical">{fmt(row.value)}</span>
                </div>
              ))}
            </div>
          }
          details={
            <ul className="space-y-1.5 text-[11px] text-sf-muted list-disc pl-4">
              <li>Unassigned Licenses — purchased seats with no active assignment; candidates to surrender at next renewal.</li>
              <li>Expired Licenses — seats past their entitlement window still counted against the org's allocation.</li>
              <li>Inactive Users with Licenses — active users who haven't logged in for 90+ days but still hold a paid license.</li>
              <li>Users with Multiple Expensive Licenses — users assigned more than one premium license where a single, lower-cost license would suffice.</li>
            </ul>
          }
        />

        </div>
      </div>

      {/* ════ AI LICENSE RECOMMENDATIONS ═════════════════════════════════════════ */}
      <LicenseRecommendations results={results} />

      {/* ════ INFO BANNER ═══════════════════════════════════════════════════════ */}
      <InfoCard variant="info">
        ⓘ Recommendations are based on usage patterns, login activity, and historical trends. Review and validate before making any license changes.
      </InfoCard>

      {!hasRealLicenses && !hasRealFeatureLicenses && !hasRealClouds && !isDemo && (
        <p className="text-[11px] text-sf-muted text-center py-2">
          Run a full analysis to populate real license, feature license, and cloud data for this tab.
        </p>
      )}
    </div>
  );
}
