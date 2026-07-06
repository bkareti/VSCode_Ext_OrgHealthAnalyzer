import { useState, useMemo } from 'react';
import { useDashboardStore } from '@/store/dashboardStore';
import GlassCard from '@/components/common/GlassCard';
import StatCard from '@/components/common/StatCard';
import { EmptyState } from '@/components/common';
import IssueTable from '@/components/issues/IssueTable';
import IssueFilters from '@/components/issues/IssueFilters';
import DonutChart from '@/components/charts/DonutChart';
import HBarChart from '@/components/charts/HBarChart';
import SparklineChart from '@/components/charts/SparklineChart';
import { scoreLabel, scoreText } from '@/constants/scoring';

type SubTab = 'overview' | 'identity' | 'integrations' | 'risks';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'overview',     label: 'Overview' },
  { id: 'identity',     label: 'Identity & Access' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'risks',        label: 'Security Risks' },
];

const SEC_CATS = ['security', 'profile-security', 'user-governance'];

function fmt(n: number | null | undefined): string {
  return n != null ? n.toLocaleString() : '—';
}

function pct(n: number, total: number): string {
  return total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '—';
}

function mapRiskCategory(category: string, message: string): string {
  if (category === 'profile-security') return 'Access Management';
  if (category === 'user-governance')  return 'User Governance';
  const m = message.toLowerCase();
  if (m.includes('auth') || m.includes('sso') || m.includes('mfa') || m.includes('login')) return 'Authentication';
  if (m.includes('shar') || m.includes('owd') || m.includes('public group'))               return 'Sharing Risks';
  if (m.includes('encrypt') || m.includes('sensitive') || m.includes('pii'))               return 'Data Exposure';
  if (m.includes('config') || m.includes('setting') || m.includes('policy'))               return 'Configuration Issues';
  return 'Other Risks';
}

// KV row used in summary panels
function KVRow({ label, value, valueClassName }: { label: string; value: string | number; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-sf-border/40 last:border-0">
      <span className="text-[11px] text-sf-muted">{label}</span>
      <span className={`text-xs font-medium text-sf-text ${valueClassName ?? ''}`}>{value}</span>
    </div>
  );
}

export default function SecurityAccess() {
  const [subTab, setSubTab] = useState<SubTab>('overview');
  const results  = useDashboardStore((s) => s.results);
  const allIssues = results?.issues ?? [];

  // ── Derived data (hooks before early return) ────────────────────────────────
  const secIssues = useMemo(
    () => allIssues.filter(i => SEC_CATS.includes(i.category)),
    [allIssues]
  );

  const highRiskCount   = useMemo(() => secIssues.filter(i => i.severity === 'error').length,   [secIssues]);
  const mediumRiskCount = useMemo(() => secIssues.filter(i => i.severity === 'warning').length, [secIssues]);
  const lowRiskCount    = useMemo(() => secIssues.filter(i => i.severity === 'info').length,    [secIssues]);

  const severityData = useMemo(() => [
    { name: 'Critical', value: highRiskCount },
    { name: 'Warning',  value: mediumRiskCount },
    { name: 'Info',     value: lowRiskCount },
  ].filter(d => d.value > 0), [highRiskCount, mediumRiskCount, lowRiskCount]);

  const catBarData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of secIssues) {
      const cat = mapRiskCategory(i.category, i.message);
      map[cat] = (map[cat] ?? 0) + 1;
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([name, value]) => ({ name, value }));
  }, [secIssues]);

  // Real trend only — never fabricate points
  const trendData = useMemo(() => {
    const pts = results?.trends ?? [];
    if (pts.length < 2) return null;
    return pts.slice(-10).map(t => ({ value: t.security }));
  }, [results]);

  const topProfiles = useMemo(() =>
    [...(results?.profileSummary?.profileList ?? [])]
      .sort((a, b) => (b._userCount ?? 0) - (a._userCount ?? 0))
      .slice(0, 5),
    [results]
  );

  const topPermSets = useMemo(() =>
    [...(results?.profileSummary?.permissionSetList ?? [])]
      .sort((a, b) => (b._userCount ?? 0) - (a._userCount ?? 0))
      .slice(0, 5),
    [results]
  );

  const dangerousProfiles = useMemo(() =>
    (results?.profileSummary?.profileList ?? []).filter(
      p => p.PermissionsModifyAllData || p.PermissionsViewAllData || p.PermissionsAuthorApex
    ),
    [results]
  );

  // Identity charts — from userSummary (previously collected but unrendered)
  const profileDistData = useMemo(() => {
    const dist = results?.userSummary?.profileDistribution ?? [];
    const sorted = [...dist].sort((a, b) => b.count - a.count);
    const top = sorted.slice(0, 5).map(d => ({ name: d.profileName, value: d.count }));
    const rest = sorted.slice(5).reduce((s, d) => s + d.count, 0);
    return rest > 0 ? [...top, { name: 'Other', value: rest }] : top;
  }, [results]);

  const usersByTypeData = useMemo(() =>
    Object.entries(results?.userSummary?.usersByType ?? {})
      .map(([name, value]) => ({ name, value }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value),
    [results]
  );

  // Public Apex entry points (attack/integration surface) — previously unrendered
  const entryPoints = results?.entryPoints ?? [];

  // ── Early return when no data ──────────────────────────────────────────────
  if (!results) {
    return (
      <EmptyState
        icon="🛡️"
        title="No security data yet"
        description="Run a full analysis to review permissions, profiles, and access posture."
        className="m-6"
      />
    );
  }

  const user    = results.userSummary;
  const profile = results.profileSummary;
  const qf      = results.orgInfoData?.quickFacts;
  const integ   = results.orgInfoData?.integrations;
  const secScore = results.scores.security ?? 0;

  const totalUsers = qf?.users ?? ((user?.totalActiveUsers ?? 0) + (user?.totalInactiveUsers ?? 0));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold text-sf-text mb-1">Security</h1>
        <p className="text-xs text-sf-muted">Security posture, identity governance, and integration access.</p>
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-sf-border overflow-x-auto">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap rounded-t transition-colors ${
              subTab === t.id
                ? 'bg-sf-bg-2 text-sf-text border-b-2 border-sf-accent'
                : 'text-sf-muted hover:text-sf-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      {subTab === 'overview' && (
        <div className="space-y-4">
          {/* KPI Row — 6 action-oriented KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              icon="🛡️"
              value={secScore}
              label="Security Score"
              sub={`/100 · ${scoreLabel(secScore)}`}
              accent={scoreText(secScore)}
            />
            <StatCard
              icon="🔴"
              value={highRiskCount}
              label="Critical Risks"
              accent={highRiskCount > 0 ? 'text-sev-error' : 'text-score-good'}
            />
            <StatCard
              icon="⚡"
              value={fmt(user?.superAdmins)}
              label="Super Admins"
              sub="Modify All Data"
              accent={(user?.superAdmins ?? 0) > 3 ? 'text-sev-error' : 'text-sf-text'}
            />
            <StatCard
              icon="💤"
              value={fmt(user?.dormantUsers)}
              label="Dormant Users"
              sub="No login in 90+ days"
              accent={(user?.dormantUsers ?? 0) > 0 ? 'text-sev-warning' : 'text-score-good'}
            />
            <StatCard
              icon="🔓"
              value={fmt(profile?.profilesWithModifyAll)}
              label="Profiles w/ Modify All"
              accent={(profile?.profilesWithModifyAll ?? 0) > 3 ? 'text-sev-error' : 'text-sf-text'}
            />
            <StatCard icon="🔗" value={fmt(integ?.connectedApps)} label="Connected Apps" />
          </div>

          {/* Charts Row */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${trendData ? 'lg:grid-cols-3' : ''} gap-4`}>
            <GlassCard title="Risks by Severity">
              {severityData.length > 0 ? (
                <DonutChart data={severityData} height={160} showLegend />
              ) : (
                <div className="flex items-center justify-center h-32 text-xs text-sf-muted">No security issues</div>
              )}
            </GlassCard>

            <GlassCard title="Top Risk Categories">
              {catBarData.length > 0 ? (
                <HBarChart data={catBarData} height={160} color="#8b5cf6" />
              ) : (
                <div className="flex items-center justify-center h-32 text-xs text-sf-muted">No data</div>
              )}
            </GlassCard>

            {/* Real trend only — hidden entirely until ≥2 scans exist */}
            {trendData && (
              <GlassCard title={`Security Score Trend (Last ${trendData.length} Scans)`}>
                <div className="mt-2">
                  <SparklineChart data={trendData} color="#3b82f6" height={120} />
                  <div className="flex justify-between mt-1 text-[10px] text-sf-muted">
                    <span>Oldest</span>
                    <span>Latest</span>
                  </div>
                </div>
              </GlassCard>
            )}
          </div>

          {/* Summary Panels */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <GlassCard title="Profiles Summary (Top 5 by Users)">
              {topProfiles.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-[10px] text-sf-muted uppercase">
                        <th className="text-left py-1.5 font-medium">Profile Name</th>
                        <th className="text-right py-1.5 font-medium">Users</th>
                        <th className="text-right py-1.5 font-medium">% of Users</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProfiles.map(p => (
                        <tr key={p.Id} className="border-t border-sf-border/40">
                          <td className="py-1.5 text-sf-text truncate max-w-30" title={p.Name}>{p.Name}</td>
                          <td className="py-1.5 text-right tabular-nums text-sf-text">{fmt(p._userCount ?? 0)}</td>
                          <td className="py-1.5 text-right tabular-nums text-sf-muted">{pct(p._userCount ?? 0, totalUsers)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-sf-muted text-center py-6">No profile data</p>
              )}
            </GlassCard>

            <GlassCard title="Permission Sets Summary (Top 5 by Users)">
              {topPermSets.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-[10px] text-sf-muted uppercase">
                        <th className="text-left py-1.5 font-medium">Permission Set</th>
                        <th className="text-right py-1.5 font-medium">Users</th>
                        <th className="text-right py-1.5 font-medium">% of Users</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topPermSets.map(ps => (
                        <tr key={ps.Id} className="border-t border-sf-border/40">
                          <td className="py-1.5 text-sf-text truncate max-w-30" title={ps.Label}>{ps.Label}</td>
                          <td className="py-1.5 text-right tabular-nums text-sf-text">{fmt(ps._userCount ?? 0)}</td>
                          <td className="py-1.5 text-right tabular-nums text-sf-muted">{pct(ps._userCount ?? 0, totalUsers)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-sf-muted text-center py-6">No permission set data</p>
              )}
            </GlassCard>

            <GlassCard title="Identity Inventory">
              <div className="space-y-0">
                <KVRow label="Users"                 value={fmt(totalUsers)} />
                <KVRow label="Active Users"          value={`${fmt(user?.totalActiveUsers)} (${pct(user?.totalActiveUsers ?? 0, totalUsers)})`} />
                <KVRow label="Inactive Users"        value={`${fmt(user?.totalInactiveUsers)} (${pct(user?.totalInactiveUsers ?? 0, totalUsers)})`} />
                <KVRow label="Profiles"              value={fmt(profile?.totalProfiles ?? qf?.profiles)} />
                <KVRow label="Permission Sets"       value={fmt(qf?.permissionSets ?? profile?.permissionSetList?.length)} />
                <KVRow label="Permission Set Groups" value={fmt(qf?.permissionSetGroups ?? profile?.permissionSetGroupList?.length)} />
                <KVRow label="Roles"                 value={fmt(qf?.roles)} />
                {user?.roleHierarchyDepth != null && (
                  <KVRow label="Role Hierarchy Depth" value={String(user.roleHierarchyDepth)} />
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* ── IDENTITY & ACCESS ────────────────────────────────────────────── */}
      {subTab === 'identity' && (
        <div className="space-y-4">
          {user && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon="👥" value={fmt(user.totalActiveUsers)}   label="Active Users" />
              <StatCard icon="💤" value={fmt(user.dormantUsers ?? 0)}  label="Dormant Users"   accent={(user.dormantUsers ?? 0) > 0 ? 'text-sev-warning' : 'text-score-good'} />
              <StatCard icon="⚡" value={fmt(user.superAdmins ?? 0)}   label="Super Admins"    accent={(user.superAdmins ?? 0) > 0 ? 'text-sev-error' : 'text-score-good'} />
              <StatCard icon="🔑" value={fmt(user.neverLoggedIn ?? 0)} label="Never Logged In" accent={(user.neverLoggedIn ?? 0) > 0 ? 'text-sev-warning' : 'text-score-good'} />
            </div>
          )}

          {/* Identity composition — profileDistribution + usersByType */}
          {(profileDistData.length > 0 || usersByTypeData.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {profileDistData.length > 0 && (
                <GlassCard title="Users by Profile">
                  <DonutChart data={profileDistData} height={200} showLegend />
                </GlassCard>
              )}
              {usersByTypeData.length > 0 && (
                <GlassCard title="Users by License Type">
                  <HBarChart data={usersByTypeData} color="#3b82f6" />
                </GlassCard>
              )}
            </div>
          )}

          {/* Dangerous Permissions Audit */}
          {profile && (
            <GlassCard title="Dangerous Permissions Audit">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Profiles with Modify All',  count: profile.profilesWithModifyAll,  threshold: 3 },
                  { label: 'Profiles with View All',    count: profile.profilesWithViewAll,    threshold: 5 },
                  { label: 'Profiles with Author Apex', count: profile.profilesWithAuthorApex, threshold: 5 },
                ].map(({ label, count, threshold }) => (
                  <div key={label} className="p-3 rounded-lg border border-sf-border bg-sf-bg-3 text-center space-y-1">
                    <span className={`text-2xl font-bold tabular-nums ${(count ?? 0) > threshold ? 'text-sev-error' : 'text-score-good'}`}>
                      {count ?? 0}
                    </span>
                    <p className="text-[11px] text-sf-muted">{label}</p>
                  </div>
                ))}
              </div>

              {dangerousProfiles.length > 0 && (
                <div className="mt-4">
                  <p className="text-[10px] text-sf-muted uppercase tracking-wider mb-2">Profiles with Elevated Risk</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="text-[10px] text-sf-muted uppercase">
                          <th className="text-left py-1.5 font-medium">Profile Name</th>
                          <th className="text-right py-1.5 font-medium">Users</th>
                          <th className="text-left py-1.5 font-medium pl-4">Permissions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dangerousProfiles.map(p => (
                          <tr key={p.Id} className="border-t border-sf-border/40">
                            <td className="py-1.5 text-sf-text">{p.Name}</td>
                            <td className="py-1.5 text-right tabular-nums text-sf-muted">{fmt(p._userCount ?? 0)}</td>
                            <td className="py-1.5 pl-4">
                              <div className="flex gap-1 flex-wrap">
                                {p.PermissionsModifyAllData && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-sev-error/15 text-sev-error border border-sev-error/20">Modify All</span>
                                )}
                                {p.PermissionsViewAllData && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-sev-warning/15 text-sev-warning border border-sev-warning/20">View All</span>
                                )}
                                {p.PermissionsAuthorApex && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-sev-info/15 text-sev-info border border-sev-info/20">Author Apex</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </GlassCard>
          )}
        </div>
      )}

      {/* ── INTEGRATIONS ─────────────────────────────────────────────────── */}
      {subTab === 'integrations' && (
        <div className="space-y-4">
          {integ && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard icon="🔐" value={fmt(integ.namedCredentials)}    label="Named Credentials" />
              <StatCard icon="🗝️" value={fmt(integ.externalCredentials)} label="External Credentials" />
              <StatCard icon="📱" value={fmt(integ.connectedApps)}       label="Connected Apps" />
              <StatCard icon="🔑" value={fmt(integ.authProviders)}       label="Auth Providers" />
              <StatCard icon="🌐" value={fmt(integ.remoteSites)}         label="Remote Sites" />
              <StatCard icon="📜" value={fmt(integ.certificates)}        label="Certificates" />
            </div>
          )}

          {/* Public Apex entry points — the org's exposed surface */}
          {entryPoints.length > 0 && (
            <GlassCard title={`Public Apex Entry Points (${entryPoints.length})`}>
              <p className="text-[11px] text-sf-muted mb-2">
                Apex classes exposed as REST resources or inbound email handlers. Review sharing and input validation on each.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-sf-border bg-sf-bg-3">
                      {['Class', 'Type', 'Annotation'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-sf-muted font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entryPoints.map((ep, i) => (
                      <tr key={`${ep.name}-${i}`} className="border-b border-sf-border/40 hover:bg-sf-bg-3/40 transition-colors">
                        <td className="px-3 py-1.5 text-sf-text font-mono text-[11px]">{ep.name}</td>
                        <td className="px-3 py-1.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            ep.type === 'RestResource'
                              ? 'bg-sf-accent/10 text-sf-accent'
                              : 'bg-sev-warning/10 text-sev-warning'
                          }`}>
                            {ep.type}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-sf-muted font-mono text-[11px] truncate max-w-80" title={ep.annotation}>{ep.annotation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          <GlassCard title="Integration Issues">
            <IssueFilters />
            <IssueTable issues={allIssues.filter(i => i.category === 'integration')} />
          </GlassCard>
        </div>
      )}

      {/* ── SECURITY RISKS ───────────────────────────────────────────────── */}
      {subTab === 'risks' && (
        <GlassCard title={`Security Issues (${secIssues.length})`}>
          <IssueFilters />
          <IssueTable issues={secIssues} />
        </GlassCard>
      )}
    </div>
  );
}
