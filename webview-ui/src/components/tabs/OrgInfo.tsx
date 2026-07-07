import { useState } from 'react';
import { useOrgStore } from '@/store/slices/orgStore';
import GlassCard from '@/components/common/GlassCard';
import DonutChart from '@/components/charts/DonutChart';
import ColumnChart from '@/components/charts/ColumnChart';
import type {
  LicenseSummary,
  CloudStatus,
  FeatureLicenseSummary,
  OrgExtendedDetails,
} from '@/types';

// ─── Sub-tabs ──────────────────────────────────────────────────────────────────
const SUBTABS = [
  'Overview', 'Clouds & Licenses', 'Installed Packages',
  'Applications', 'Environments', 'Integrations',
] as const;
type SubTab = typeof SUBTABS[number];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function instanceRegion(name: string): string | null {
  const p = (name || '').replace(/\d+$/, '').toUpperCase();
  const MAP: Record<string, string> = {
    NA: 'North America', EU: 'Europe', AP: 'Asia Pacific',
    CS: 'CS Sandbox', IN: 'India', AU: 'Australia',
  };
  return MAP[p] ?? null;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return 'N/A';
  return Number(n).toLocaleString();
}

// ─── Pagination ────────────────────────────────────────────────────────────────
// Generic client-side pager for any list-backed table on this tab. Keeps large
// inventories (packages, apps, license types) scannable instead of dumping
// every row onto the screen at once.
const PAGE_SIZE = 8;

function usePagination<T>(items: T[], pageSize: number = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return {
    pageItems,
    page: clampedPage,
    totalPages,
    setPage,
    total: items.length,
    from: items.length ? start + 1 : 0,
    to: Math.min(start + pageSize, items.length),
  };
}

interface PagerProps {
  page: number; totalPages: number; from: number; to: number; total: number;
  setPage: (p: number) => void;
}
function Pager({ page, totalPages, from, to, total, setPage }: PagerProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-3 pt-3 border-t border-sf-border/50">
      <span className="text-[11px] text-sf-muted">Showing {from}–{to} of {total}</span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-sf-border text-sf-text hover:bg-sf-bg-3 disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent transition-colors">
          ← Prev
        </button>
        <span className="text-[11px] text-sf-muted tabular-nums">Page {page} of {totalPages}</span>
        <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-sf-border text-sf-text hover:bg-sf-bg-3 disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent transition-colors">
          Next →
        </button>
      </div>
    </div>
  );
}

// ─── Local sub-components ──────────────────────────────────────────────────────
interface KpiCardProps {
  iconBg: string; value: string | number;
  label: string; sub?: string | null;
}
function KpiCard({ iconBg, value, label, sub }: KpiCardProps) {
  return (
    <div className="relative overflow-hidden flex flex-col gap-1.5 p-3.5 rounded-xl border border-sf-border bg-white/[0.03] min-w-0">
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: iconBg.replace(',.15)', ',1)') }} />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-sf-muted">{label}</span>
      <span className="text-[22px] font-bold text-sf-text tabular-nums leading-tight truncate w-full">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {sub && <span className="text-[11px] text-sf-muted leading-tight">{sub}</span>}
    </div>
  );
}

interface DtRowProps { label: string; value?: string | null }
function DtRow({ label, value }: DtRowProps) {
  if (!value) return null;
  return (
    <tr>
      <td className="py-1 pr-2 text-[11px] text-sf-muted align-top w-[45%]">{label}</td>
      <td className="py-1 pl-1 text-[11px] text-sf-text font-medium">{value}</td>
    </tr>
  );
}

interface ListRowProps { label: string; value?: number | null }
function ListRow({ label, value }: ListRowProps) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-sf-border/50 last:border-0">
      <span className="text-xs text-sf-text">{label}</span>
      <span className="text-xs font-bold text-sf-text tabular-nums">{fmt(value)}</span>
    </div>
  );
}

interface IntRowProps { icon: string; bg: string; label: string; value?: number | null }
function IntRow({ icon, bg, label, value }: IntRowProps) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 border-b border-sf-border/50 last:border-0">
      <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs shrink-0"
        style={{ background: bg }}>{icon}</div>
      <span className="text-xs text-sf-text flex-1">{label}</span>
      <span className="text-xs font-bold text-sf-text tabular-nums">{fmt(value)}</span>
    </div>
  );
}

// ─── Demo / static data ────────────────────────────────────────────────────────
const DEMO_LICENSES: LicenseSummary[] = [
  { name: 'Sales Cloud',                usedLicenses: 612,  totalLicenses: 800,  usedPct: 76.5 },
  { name: 'Service Cloud',              usedLicenses: 420,  totalLicenses: 500,  usedPct: 84 },
  { name: 'Experience Cloud',           usedLicenses: 265,  totalLicenses: 400,  usedPct: 66.3 },
  { name: 'Platform',                   usedLicenses: 1280, totalLicenses: 1500, usedPct: 85.3 },
  { name: 'Einstein Analytics',         usedLicenses: 120,  totalLicenses: 150,  usedPct: 80 },
  { name: 'Event Monitoring',           usedLicenses: 45,   totalLicenses: 60,   usedPct: 75 },
  { name: 'Shield Platform Encryption', usedLicenses: 30,   totalLicenses: 50,   usedPct: 60 },
  { name: 'Others',                     usedLicenses: 330,  totalLicenses: 442,  usedPct: 74.7 },
];

const DEMO_CLOUDS: CloudStatus[] = [
  { name: 'Sales Cloud',        key: 'sales',        enabled: true  },
  { name: 'Data Cloud',         key: 'data',         enabled: false },
  { name: 'Service Cloud',      key: 'service',      enabled: true  },
  { name: 'Industries (PSS)',   key: 'industries',   enabled: true  },
  { name: 'Experience Cloud',   key: 'experience',   enabled: true  },
  { name: 'Health Cloud',       key: 'health',       enabled: false },
  { name: 'Revenue Cloud',      key: 'revenue',      enabled: false },
  { name: 'Financial Services', key: 'financial',    enabled: false },
  { name: 'Field Service',      key: 'fieldservice', enabled: true  },
  { name: 'Einstein Analytics', key: 'einstein',     enabled: true  },
  { name: 'Marketing Cloud',    key: 'marketing',    enabled: false },
  { name: 'Agentforce',         key: 'agentforce',   enabled: true  },
];

const DEMO_FEATURE_LICENSES: FeatureLicenseSummary[] = [
  { name: 'Einstein GPT',         status: 'Active',   totalLicenses: 50,  usedLicenses: 32 },
  { name: 'Agentforce',           status: 'Active',   totalLicenses: 100, usedLicenses: 64 },
  { name: 'Data Cloud',           status: 'Inactive', totalLicenses: 0,   usedLicenses: 0  },
  { name: 'Revenue Intelligence', status: 'Active',   totalLicenses: 25,  usedLicenses: 18 },
  { name: 'Field Service',        status: 'Active',   totalLicenses: 200, usedLicenses: 145},
];

// ─── Main component ────────────────────────────────────────────────────────────
export default function OrgInfo() {
  const [subTab, setSubTab] = useState<SubTab>('Overview');
  const results = useOrgStore((s) => s.results);
  const isDemo  = !results;

  // ── Data extraction ──────────────────────────────────────────────────────────
  // Demo mode is ALL-OR-NOTHING: demo constants render only when there are no
  // results at all. Once a real scan exists, missing fields show '—' / null —
  // never a demo value blended next to real data.
  const od   = results?.orgDetails;
  const ext: Partial<OrgExtendedDetails> = results?.orgInfoData?.extended ?? {};
  const inv  = results?.orgInventory;

  const orgName      = od?.orgName ?? od?.username ?? (isDemo ? 'Acme Corporation' : '—');
  const orgId        = od?.orgId        ?? (isDemo ? '00D5g000008abcEAA' : '—');
  const orgType      = od?.orgType      ?? (isDemo ? 'Enterprise' : '—');
  const instanceName = od?.instanceName ?? (isDemo ? 'NA135' : '');
  const apiVersion   = od?.apiVersion   ?? (isDemo ? '65.0' : '');
  const nextRelease  = od?.nextReleaseName ?? (isDemo ? "Summer '26" : null);
  const instanceUrl  = od?.instanceUrl  ?? (isDemo ? 'https://login.salesforce.com' : null);
  const isHyperforce = ext.isHyperforce ?? (isDemo ? true : false);
  const dataCenter   = ext.dataCenter   ?? (isDemo ? 'Hyperforce NA' : null);
  const buildVersion = ext.buildVersion ?? (isDemo ? '246.8' : null);
  const timezone     = ext.timezone     ?? (isDemo ? '(GMT-07:00) Pacific Time (US & Canada)' : null);
  const language     = ext.language     ?? (isDemo ? 'English (United States)' : null);
  const currency     = ext.currency     ?? (isDemo ? 'USD - U.S. Dollar' : null);
  const myDomain     = ext.myDomain     ?? (isDemo ? 'acmecorp.my.salesforce.com' : null);
  const createdDate  = ext.createdDate  ?? (isDemo ? '2015-03-12T00:00:00.000Z' : null);
  const storageUsedMB  = ext.storageUsedMB  ?? (isDemo ? 241254  : 0);
  const storageLimitMB = ext.storageLimitMB ?? (isDemo ? 1048576 : 0);
  const storagePct     = storageLimitMB ? Math.round(storageUsedMB / storageLimitMB * 100) : 0;
  const storageLabel   = storageLimitMB > 0
    ? `${(storageUsedMB / 1024).toFixed(1)} GB of ${Math.round(storageLimitMB / 1024)} TB (${storagePct}%)`
    : null;
  const trustStatus    = od?.trustStatus;

  const clouds    = results?.orgInfoData?.clouds          ?? (isDemo ? DEMO_CLOUDS : []);
  const licenses  = results?.licenseSummary               ?? (isDemo ? DEMO_LICENSES : []);
  const pkgSum    = results?.orgInfoData?.packagesByType  ?? (isDemo ? { managed: 43, unlocked: 12, local: 10, total: 65 } : null);
  const appSum    = results?.orgInfoData?.appsByType      ?? (isDemo ? { lightningApps: 18, experienceSites: 4, consoleApps: 3, connectedApps: 37, mobileApps: 6, omniStudioApps: 5, total: 24 } : null);
  const envSum    = results?.orgInfoData?.environments    ?? (isDemo ? { production: 1, fullSandboxes: 2, partialSandboxes: 3, developerSandboxes: 8, scratchOrgs: 12, total: 26 } : null);
  const intSum    = results?.orgInfoData?.integrations    ?? (isDemo ? { namedCredentials: 23, connectedApps: 18, externalCredentials: 6, remoteSites: 31, authProviders: 4, certificates: 9, total: 38 } : null);
  const qf        = results?.orgInfoData?.quickFacts      ?? (isDemo ? { customObjects: 286, users: 4250, roles: 98, profiles: 42, permissionSets: 118, permissionSetGroups: 16, publicGroups: 24, queues: 37, flows: 1842, apexClasses: 1842, triggers: 354, lwcComponents: 412 } : null);
  const featLics: FeatureLicenseSummary[] = od?.featureLicenses ?? (isDemo ? DEMO_FEATURE_LICENSES : []);
  const pkgList   = results?.orgInventory?.installedPackages ?? [];
  const appList   = od?.apps ?? [];
  const stdObjs   = inv?.standardObjectCount ?? (isDemo ? 212 : null);

  // ── Derived KPI values ───────────────────────────────────────────────────────
  const allocLics  = licenses.filter(l => l.totalLicenses > 0);
  const totalLic   = allocLics.reduce((s, l) => s + l.totalLicenses, 0);
  const usedLic    = allocLics.reduce((s, l) => s + l.usedLicenses, 0);
  const licUtilPct = totalLic > 0 ? Math.round(usedLic / totalLic * 100) : 0;

  const orgTypeWords = orgType.split(' ');
  const editionMain  = orgTypeWords[0] || orgType;
  const editionSub   = orgTypeWords.length > 1 ? orgTypeWords.slice(1).join(' ') : null;
  const region       = instanceRegion(instanceName);
  const instanceSub  = region ? `${region}${isDemo ? ' ◎' : ''}` : null;

  const cloudsEnabled  = clouds.filter(c => c.enabled).length;
  const cloudsDisabled = clouds.length - cloudsEnabled;

  // ── License donut data ───────────────────────────────────────────────────────
  const licDonutData = licenses.slice(0, 7).map(l => ({ name: l.name, value: l.usedLicenses }));

  // ── Package donut data ───────────────────────────────────────────────────────
  const pkgDonutData = pkgSum ? [
    { name: 'Managed',  value: pkgSum.managed  },
    { name: 'Unlocked', value: pkgSum.unlocked },
    { name: 'Local',    value: pkgSum.local    },
  ].filter(d => d.value > 0) : [];

  // ── App bar chart data ───────────────────────────────────────────────────────
  const appBarData = appSum ? [
    { name: 'Lightning',   value: appSum.lightningApps   },
    { name: 'Experience',  value: appSum.experienceSites },
    { name: 'Console',     value: appSum.consoleApps     },
    { name: 'Connected',   value: appSum.connectedApps   },
    { name: 'Mobile',      value: appSum.mobileApps      },
    { name: 'OmniStudio',  value: appSum.omniStudioApps  },
  ].filter(d => d.value > 0) : [];

  // ── Quick facts items ────────────────────────────────────────────────────────
  // Build inventory only — identity counts (roles/profiles/perm sets/groups)
  // are owned by the Security tab; don't repeat them here.
  const qfItems = qf ? [
    { icon: '🗃️', label: 'Custom Objects',    value: qf.customObjects    },
    { icon: '📋', label: 'Standard Objects',  value: stdObjs              },
    { icon: '⚡', label: 'Flows',             value: qf.flows            },
    { icon: '💻', label: 'Apex Classes',      value: qf.apexClasses      },
    { icon: '⚙️', label: 'Triggers',          value: qf.triggers         },
    { icon: '🧩', label: 'LWC Components',   value: qf.lwcComponents    },
    { icon: '📥', label: 'Queues',            value: qf.queues           },
  ] : [];

  // ── Paginated tables ─────────────────────────────────────────────────────────
  const licPager  = usePagination(licenses);
  const featPager = usePagination(featLics);
  const pkgPager  = usePagination(pkgList);
  const appPager  = usePagination(appList);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-4">

      {/* Demo banner */}
      {isDemo && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs border"
          style={{ background: 'rgba(245,158,11,.08)', borderColor: 'rgba(245,158,11,.3)', color: '#f59e0b' }}>
          <span className="text-sm">◎</span>
          <span>Showing demo data — run <strong>Scan Now</strong> to see your org's real information</span>
        </div>
      )}

      {/* Tab header + trust pill */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[19px] font-bold text-sf-text tracking-tight">Organization</h1>
          <p className="text-xs text-sf-muted mt-0.5">Identity, licenses, clouds, packages and integrations for this org.</p>
        </div>
        {trustStatus && (
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border"
              style={
                trustStatus === 'OK'
                  ? { background: 'rgba(34,197,94,.1)', borderColor: 'rgba(34,197,94,.3)', color: '#22c55e' }
                  : { background: 'rgba(245,158,11,.1)', borderColor: 'rgba(245,158,11,.3)', color: '#f59e0b' }
              }
            >
              {trustStatus === 'OK' ? '●' : '⚠'} Salesforce Trust: {trustStatus}
            </span>
            {(od?.trustIncidents?.length ?? 0) > 0 && (
              <span className="text-[11px] text-sev-warning">
                {od!.trustIncidents.length} active incident{od!.trustIncidents.length === 1 ? '' : 's'} on {instanceName}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Sub-tab nav */}
      <div className="flex gap-0 border-b border-sf-border overflow-x-auto scrollbar-none shrink-0">
        {SUBTABS.map((t) => (
          <button key={t} type="button" onClick={() => setSubTab(t)}
            className={`px-4 py-2 text-xs whitespace-nowrap border-b-2 transition-colors ${
              subTab === t
                ? 'border-sf-accent text-sf-text font-semibold'
                : 'border-transparent text-sf-muted hover:text-sf-text-2'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* ════ OVERVIEW ═══════════════════════════════════════════════════════════ */}
      {subTab === 'Overview' && (
        <div className="space-y-4">

          {/* KPI Strip — 6 cards */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <KpiCard iconBg="rgba(245,158,11,.15)" value={editionMain}
              label="Edition" sub={editionSub} />
            <KpiCard iconBg="rgba(59,130,246,.15)" value={instanceName || '—'}
              label="Instance" sub={instanceSub} />
            <KpiCard iconBg="rgba(139,92,246,.15)" value={apiVersion || '—'}
              label="API Version" sub={nextRelease} />
            <KpiCard iconBg="rgba(34,197,94,.15)"
              value={qf ? fmt(qf.users) : (results?.orgInfoData?.activeUsers ? fmt(results.orgInfoData.activeUsers) : (isDemo ? '4,250' : '—'))}
              label="Active Users" sub="of assigned seats" />
            <KpiCard iconBg="rgba(20,184,166,.15)"
              value={usedLic ? usedLic.toLocaleString() : '—'}
              label="Licenses Used" sub={totalLic ? `of ${totalLic.toLocaleString()} · ${licUtilPct}%` : null} />
            <KpiCard iconBg="rgba(236,72,153,.15)"
              value={storageLabel ? `${(storageUsedMB / 1024).toFixed(1)} GB` : '—'}
              label="Data Storage" sub={storageLimitMB ? `of ${Math.round(storageLimitMB / 1024)} TB · ${storagePct}%` : null} />
          </div>

          {/* Row 1: Org Details | Clouds Overview | License Summary */}
          <div className="grid gap-4 items-start"
            style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr)' }}>

            {/* Organization Details */}
            <GlassCard title="Organization Details">
              <div className="grid grid-cols-2 gap-x-6">
                <table className="border-collapse w-full">
                  <tbody>
                    <DtRow label="🏢 Organization Name"  value={orgName} />
                    <DtRow label="🆔 Organization ID"   value={orgId} />
                    <DtRow label="📅 Created Date"
                      value={createdDate ? new Date(createdDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : null} />
                    <DtRow label="🌐 My Domain"   value={myDomain} />
                    <DtRow label="🔗 Login URL"   value={instanceUrl} />
                    <DtRow label="🕐 Time Zone"   value={timezone} />
                    <DtRow label="💬 Language"    value={language} />
                    <DtRow label="💱 Currency"    value={currency} />
                  </tbody>
                </table>
                <table className="border-collapse w-full">
                  <tbody>
                    <DtRow label="📅 Current Release" value={nextRelease} />
                    <DtRow label="🌐 Instance"        value={instanceName} />
                    <DtRow label="📡 API Version"     value={apiVersion} />
                    <DtRow label="🔨 Salesforce CD"   value={buildVersion} />
                    <DtRow label="☁️ Hyperforce"      value={isHyperforce ? '✅ Yes' : 'No'} />
                    <DtRow label="🏢 Data Center"     value={dataCenter} />
                    <DtRow label="💾 Storage Used"    value={storageLabel} />
                  </tbody>
                </table>
              </div>
              {/* Storage progress bar */}
              {storageUsedMB > 0 && (
                <div className="mt-3">
                  <div className="h-1.5 rounded-full bg-sf-border overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${storagePct}%`, background: storagePct > 80 ? '#ef4444' : storagePct > 60 ? '#f59e0b' : '#22c55e' }} />
                  </div>
                </div>
              )}
            </GlassCard>

            {/* Clouds Overview */}
            <GlassCard>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-sf-text">Clouds Overview</h3>
                {clouds.length > 0 && (
                  <span className="text-[10px] text-sf-muted">Total Clouds {clouds.length}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {clouds.map(c => (
                  <div key={c.key}
                    className="flex items-center justify-between px-2 py-1.5 rounded-lg text-[11px]"
                    style={{
                      background: c.enabled ? 'rgba(34,197,94,.07)' : 'rgba(239,68,68,.05)',
                      border: `1px solid ${c.enabled ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.18)'}`,
                    }}>
                    <span className="text-sf-text font-medium truncate pr-1">{c.name}</span>
                    <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{
                        background: c.enabled ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.12)',
                        color: c.enabled ? '#22c55e' : '#ef4444',
                      }}>
                      {c.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                ))}
              </div>
              {clouds.length > 0 && (
                <div className="flex gap-4 justify-center mt-3 text-[11px]">
                  <span style={{ color: '#22c55e', fontWeight: 600 }}>● Enabled ({cloudsEnabled})</span>
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>● Disabled ({cloudsDisabled})</span>
                </div>
              )}
            </GlassCard>

            {/* License Summary */}
            <GlassCard>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-sf-text">License Summary</h3>
                <button type="button"
                  className="text-[11px] font-semibold"
                  style={{ color: 'var(--sf-accent, #0176d3)' }}
                  onClick={() => setSubTab('Clouds & Licenses')}>
                  All Licenses →
                </button>
              </div>
              {licDonutData.length > 0 && (
                <>
                  <DonutChart data={licDonutData} height={150} showLegend={false} />
                  <div className="text-center mt-1 mb-3">
                    <div className="text-sm font-bold text-sf-text">
                      {usedLic.toLocaleString()} <span className="opacity-50 font-normal">of</span> {totalLic.toLocaleString()}
                    </div>
                    <div className="text-[11px] font-semibold mt-0.5"
                      style={{ color: licUtilPct > 90 ? '#ef4444' : licUtilPct > 70 ? '#f59e0b' : '#22c55e' }}>
                      {licUtilPct}% Utilization
                    </div>
                  </div>
                </>
              )}
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-sf-border">
                    <th className="text-left py-1 px-1 text-sf-muted font-medium">License Type</th>
                    <th className="text-center py-1 px-1 text-sf-muted font-medium">Assigned</th>
                    <th className="text-center py-1 px-1 text-sf-muted font-medium">Available</th>
                    <th className="py-1 px-1 text-sf-muted font-medium">Utilization</th>
                  </tr>
                </thead>
                <tbody>
                  {licenses.slice(0, 6).map((l, i) => {
                    const pct = l.totalLicenses > 0 ? Math.round(l.usedLicenses / l.totalLicenses * 100) : 0;
                    const barClr = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
                    return (
                      <tr key={l.name} className={i % 2 ? 'bg-sf-bg-3/50' : ''}>
                        <td className="py-1 px-1 text-sf-text truncate max-w-[90px]">{l.name}</td>
                        <td className="py-1 px-1 text-sf-muted text-center tabular-nums">{l.usedLicenses.toLocaleString()}</td>
                        <td className="py-1 px-1 text-sf-muted text-center tabular-nums">{Math.max(l.totalLicenses - l.usedLicenses, 0).toLocaleString()}</td>
                        <td className="py-1 px-1 min-w-[60px]">
                          <div className="h-1 rounded-full bg-sf-border overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barClr }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </GlassCard>
          </div>

          {/* Row 2: Packages | Apps | Environments | Integrations */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-start">

            {/* Installed Packages by Type */}
            <GlassCard>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-sf-text">Installed Packages by Type</h3>
                {pkgSum && <span className="text-[10px] text-sf-muted">Total: {pkgSum.total}</span>}
              </div>
              {pkgDonutData.length > 0
                ? <DonutChart data={pkgDonutData} height={140} showLegend />
                : <p className="text-xs text-sf-muted py-4 text-center">No package data</p>}
              {pkgSum && pkgList.length === 0 && (
                <button type="button" className="w-full text-center text-[11px] font-semibold mt-2"
                  style={{ color: 'var(--sf-accent, #0176d3)' }}
                  onClick={() => setSubTab('Installed Packages')}>
                  View all packages →
                </button>
              )}
            </GlassCard>

            {/* Applications Summary */}
            <GlassCard>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-sf-text">Applications Summary</h3>
                {appSum && <span className="text-[10px] text-sf-muted">Total: {appSum.total}</span>}
              </div>
              {appBarData.length > 0
                ? <ColumnChart data={appBarData} height={140} multiColor />
                : <p className="text-xs text-sf-muted py-4 text-center">No app data</p>}
              <button type="button" className="w-full text-center text-[11px] font-semibold mt-2"
                style={{ color: 'var(--sf-accent, #0176d3)' }}
                onClick={() => setSubTab('Applications')}>
                View all applications →
              </button>
            </GlassCard>

            {/* Environments Summary */}
            <GlassCard>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-sf-text">Environments Summary</h3>
                {envSum && <span className="text-[10px] text-sf-muted">Total: {envSum.total}</span>}
              </div>
              {envSum ? (
                <>
                  <ListRow label="Production"           value={envSum.production}          />
                  <ListRow label="Full Sandboxes"       value={envSum.fullSandboxes}       />
                  <ListRow label="Partial Sandboxes"    value={envSum.partialSandboxes}    />
                  <ListRow label="Developer Sandboxes"  value={envSum.developerSandboxes}  />
                  <ListRow label="Scratch Orgs"         value={envSum.scratchOrgs}         />
                  <div className="flex justify-between pt-2 font-bold text-xs">
                    <span className="text-sf-text">Total</span>
                    <span style={{ color: '#0176d3' }}>{envSum.total}</span>
                  </div>
                </>
              ) : <p className="text-xs text-sf-muted">No environment data</p>}
            </GlassCard>

            {/* Integrations Overview */}
            <GlassCard>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-sf-text">Integrations Overview</h3>
                {intSum && <span className="text-[10px] text-sf-muted">Total: {intSum.total}</span>}
              </div>
              {intSum ? (
                <>
                  <IntRow icon="🔑" bg="rgba(20,184,166,.15)"  label="Named Credentials"    value={intSum.namedCredentials}    />
                  <IntRow icon="🔗" bg="rgba(59,130,246,.15)"  label="Connected Apps"       value={intSum.connectedApps}       />
                  <IntRow icon="🌐" bg="rgba(139,92,246,.15)"  label="External Credentials" value={intSum.externalCredentials} />
                  <IntRow icon="📡" bg="rgba(245,158,11,.15)"  label="Remote Sites"         value={intSum.remoteSites}         />
                  <IntRow icon="🛡️" bg="rgba(34,197,94,.15)"   label="Auth. Providers"     value={intSum.authProviders}       />
                  <IntRow icon="📜" bg="rgba(249,115,22,.15)"  label="Certificates"         value={intSum.certificates}        />
                  <div className="flex justify-between pt-2 font-bold text-xs">
                    <span className="text-sf-text">Total</span>
                    <span style={{ color: '#0176d3' }}>{intSum.total}</span>
                  </div>
                </>
              ) : <p className="text-xs text-sf-muted">No integration data</p>}
            </GlassCard>
          </div>

          {/* Build Inventory horizontal strip */}
          {qfItems.length > 0 && (
            <GlassCard>
              <h3 className="text-xs font-semibold text-sf-text mb-3">🏗 Build Inventory</h3>
              <div className="flex overflow-x-auto scrollbar-none">
                {qfItems.map((f, i) => (
                  <div key={f.label} className="flex items-center">
                    <div className="flex flex-col items-center text-center px-3 min-w-[72px] shrink-0">
                      <span className="text-base mb-1">{f.icon}</span>
                      <span className="text-base font-bold tabular-nums text-sf-text leading-tight">
                        {fmt(f.value)}
                      </span>
                      <span className="text-[9px] text-sf-muted uppercase tracking-wide leading-tight mt-0.5 max-w-[70px]">
                        {f.label}
                      </span>
                    </div>
                    {i < qfItems.length - 1 && (
                      <div className="w-px self-stretch bg-sf-border/60 shrink-0 mx-0.5" />
                    )}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {/* ════ CLOUDS & LICENSES ══════════════════════════════════════════════════ */}
      {subTab === 'Clouds & Licenses' && (
        <div className="space-y-4">
          <GlassCard title="Clouds Overview">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {clouds.map(c => (
                <div key={c.key}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-xs"
                  style={{
                    background: c.enabled ? 'rgba(34,197,94,.07)' : 'rgba(239,68,68,.05)',
                    border: `1px solid ${c.enabled ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.18)'}`,
                  }}>
                  <span className="text-sf-text font-medium">{c.name}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: c.enabled ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.12)',
                      color: c.enabled ? '#22c55e' : '#ef4444',
                    }}>
                    {c.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              ))}
            </div>
            {clouds.length > 0 && (
              <div className="flex gap-6 mt-4 text-xs">
                <span style={{ color: '#22c55e', fontWeight: 600 }}>● Enabled ({cloudsEnabled})</span>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>● Disabled ({cloudsDisabled})</span>
              </div>
            )}
          </GlassCard>

          <GlassCard title={`License Summary (${licenses.length} types)`}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-sf-border">
                    {['License Type', 'Assigned', 'Available', 'Total', 'Utilization'].map(h => (
                      <th key={h} className="text-left py-2 px-2 text-sf-muted font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {licPager.pageItems.map((l, i) => {
                    const pct = l.totalLicenses > 0 ? Math.round(l.usedLicenses / l.totalLicenses * 100) : 0;
                    const clr = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
                    return (
                      <tr key={l.name} className={`border-b border-sf-border/40 ${i % 2 ? 'bg-sf-bg-3/30' : ''}`}>
                        <td className="py-1.5 px-2 text-sf-text">{l.name}</td>
                        <td className="py-1.5 px-2 text-sf-muted tabular-nums">{l.usedLicenses.toLocaleString()}</td>
                        <td className="py-1.5 px-2 text-sf-muted tabular-nums">{Math.max(l.totalLicenses - l.usedLicenses, 0).toLocaleString()}</td>
                        <td className="py-1.5 px-2 text-sf-muted tabular-nums">{l.totalLicenses.toLocaleString()}</td>
                        <td className="py-1.5 px-2 min-w-[100px]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-sf-border overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: clr }} />
                            </div>
                            <span className="text-[10px] text-sf-muted w-8 text-right">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager {...licPager} />
          </GlassCard>

          {/* Feature licenses (merged from former "Feature Usage" sub-tab) */}
          {featLics.length > 0 && (
            <GlassCard title={`Feature Licenses (${featLics.length})`}>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-sf-border">
                      {['Feature', 'Status', 'Used / Total', 'Utilization'].map(h => (
                        <th key={h} className="text-left py-2 px-2 text-sf-muted font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {featPager.pageItems.map((fl, i) => {
                      const fPct = fl.totalLicenses > 0 ? Math.round(fl.usedLicenses / fl.totalLicenses * 100) : 0;
                      const fClr = fPct > 90 ? '#ef4444' : fPct > 70 ? '#f59e0b' : '#22c55e';
                      return (
                        <tr key={fl.name} className={`border-b border-sf-border/40 ${i % 2 ? 'bg-sf-bg-3/30' : ''}`}>
                          <td className="py-2 px-2 text-sf-text font-medium">{fl.name}</td>
                          <td className="py-2 px-2">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                              style={{
                                background: fl.status === 'Active' ? 'rgba(34,197,94,.15)' : 'rgba(107,114,128,.15)',
                                color:      fl.status === 'Active' ? '#22c55e' : '#6b7280',
                              }}>
                              {fl.status}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-sf-muted tabular-nums">
                            {fl.usedLicenses} / {fl.totalLicenses}
                          </td>
                          <td className="py-2 px-2 min-w-[120px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-sf-border overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${fPct}%`, background: fClr }} />
                              </div>
                              <span className="text-[10px] text-sf-muted w-8 text-right">{fPct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager {...featPager} />
            </GlassCard>
          )}
        </div>
      )}

      {/* ════ INSTALLED PACKAGES ═════════════════════════════════════════════════ */}
      {subTab === 'Installed Packages' && (
        <GlassCard title={`Installed Packages (${pkgSum?.total ?? pkgList.length})`}>
          {pkgDonutData.length > 0 && (
            <div className="mb-4" style={{ maxWidth: 300, margin: '0 auto 16px' }}>
              <DonutChart data={pkgDonutData} height={160} showLegend />
            </div>
          )}
          {pkgList.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-sf-border">
                      {['Name', 'Namespace', 'Version', 'Type'].map(h => (
                        <th key={h} className="text-left py-2 px-2 text-sf-muted font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pkgPager.pageItems.map((p, i) => {
                      const name = p.SubscriberPackage?.Name ?? p.SubscriberPackageVersion?.Name ?? '—';
                      const ns   = p.SubscriberPackage?.NamespacePrefix ?? '—';
                      const ver  = p.SubscriberPackageVersion
                        ? `v${p.SubscriberPackageVersion.MajorVersion}.${p.SubscriberPackageVersion.MinorVersion}.${p.SubscriberPackageVersion.PatchVersion}`
                        : '—';
                      const hasNs = ns && ns !== '—';
                      const typeColor = hasNs ? '#3b82f6' : '#f59e0b';
                      const typeLabel = hasNs ? 'Managed' : 'Unlocked';
                      return (
                        <tr key={p.Id ?? i} className={`border-b border-sf-border/40 ${i % 2 ? 'bg-sf-bg-3/30' : ''}`}>
                          <td className="py-1.5 px-2 text-sf-text">{name}</td>
                          <td className="py-1.5 px-2 text-sf-muted font-mono">{ns}</td>
                          <td className="py-1.5 px-2 text-sf-muted">{ver}</td>
                          <td className="py-1.5 px-2 font-semibold" style={{ color: typeColor }}>{typeLabel}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager {...pkgPager} />
            </>
          ) : (
            <p className="text-xs text-sf-muted text-center py-8">
              {isDemo ? 'Run analysis to see installed packages.' : 'No installed packages found.'}
            </p>
          )}
        </GlassCard>
      )}

      {/* ════ APPLICATIONS ═══════════════════════════════════════════════════════ */}
      {subTab === 'Applications' && (
        <div className="space-y-4">
          <GlassCard title={`Applications Summary${appSum ? ` (${appSum.total} total)` : ''}`}>
            {appBarData.length > 0
              ? <ColumnChart data={appBarData} height={200} multiColor />
              : <p className="text-xs text-sf-muted text-center py-8">No application data available.</p>}
          </GlassCard>
          {appList.length > 0 && (
            <GlassCard title={`All Applications (${appList.length})`}>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-sf-border">
                      {['Application', 'Type', 'Active'].map(h => (
                        <th key={h} className="text-left py-2 px-2 text-sf-muted font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {appPager.pageItems.map((ap, i) => (
                      <tr key={ap.label ?? i} className={`border-b border-sf-border/40 ${i % 2 ? 'bg-sf-bg-3/30' : ''}`}>
                        <td className="py-1.5 px-2 text-sf-text">{ap.label ?? '—'}</td>
                        <td className="py-1.5 px-2 text-sf-muted">{ap.type ?? 'Standard'}</td>
                        <td className="py-1.5 px-2 font-semibold"
                          style={{ color: ap.isActive ? '#22c55e' : '#6b7280' }}>
                          {ap.isActive ? 'Yes' : 'No'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager {...appPager} />
            </GlassCard>
          )}
        </div>
      )}

      {/* ════ ENVIRONMENTS ═══════════════════════════════════════════════════════ */}
      {subTab === 'Environments' && (
        <GlassCard title={`Environments & Sandboxes${envSum ? ` (${envSum.total} total)` : ''}`}>
          {envSum ? (
            <dl className="divide-y divide-sf-border/50">
              {([
                ['🏭', 'Production',          envSum.production         ],
                ['🧪', 'Full Sandboxes',      envSum.fullSandboxes      ],
                ['📋', 'Partial Sandboxes',   envSum.partialSandboxes   ],
                ['💻', 'Developer Sandboxes', envSum.developerSandboxes ],
                ['⚡', 'Scratch Orgs',        envSum.scratchOrgs        ],
              ] as [string, string, number][]).map(([icon, label, val]) => (
                <div key={label} className="flex items-center gap-3 py-3">
                  <span className="text-base w-6">{icon}</span>
                  <dt className="text-sm text-sf-text flex-1">{label}</dt>
                  <dd className="text-sm font-bold text-sf-text tabular-nums">{val}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between py-3 font-bold">
                <span className="text-sm text-sf-text">Total Environments</span>
                <span className="text-sm tabular-nums" style={{ color: '#0176d3' }}>{envSum.total}</span>
              </div>
            </dl>
          ) : <p className="text-xs text-sf-muted text-center py-8">Sandbox data not available for this org.</p>}
        </GlassCard>
      )}

      {/* ════ INTEGRATIONS ═══════════════════════════════════════════════════════ */}
      {subTab === 'Integrations' && (
        <GlassCard title={`Integrations${intSum ? ` (${intSum.total} total)` : ''}`}>
          {intSum ? (
            <dl className="divide-y divide-sf-border/50">
              {([
                ['🔑', 'rgba(20,184,166,.15)', 'Named Credentials',    intSum.namedCredentials   ],
                ['🔗', 'rgba(59,130,246,.15)', 'Connected Apps',       intSum.connectedApps      ],
                ['🌐', 'rgba(139,92,246,.15)', 'External Credentials', intSum.externalCredentials],
                ['📡', 'rgba(245,158,11,.15)', 'Remote Sites',         intSum.remoteSites        ],
                ['🛡️', 'rgba(34,197,94,.15)',  'Auth. Providers',      intSum.authProviders      ],
                ['📜', 'rgba(249,115,22,.15)', 'Certificates',         intSum.certificates       ],
              ] as [string, string, string, number][]).map(([icon, bg, label, val]) => (
                <div key={label} className="flex items-center gap-3 py-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                    style={{ background: bg }}>{icon}</div>
                  <dt className="text-sm text-sf-text flex-1">{label}</dt>
                  <dd className="text-sm font-bold text-sf-text tabular-nums">{val}</dd>
                </div>
              ))}
              <div className="flex justify-between py-3 font-bold">
                <span className="text-sm text-sf-text">Total Integrations</span>
                <span className="text-sm tabular-nums" style={{ color: '#0176d3' }}>{intSum.total}</span>
              </div>
            </dl>
          ) : <p className="text-xs text-sf-muted text-center py-8">Integration data not available.</p>}
        </GlassCard>
      )}

    </div>
  );
}
