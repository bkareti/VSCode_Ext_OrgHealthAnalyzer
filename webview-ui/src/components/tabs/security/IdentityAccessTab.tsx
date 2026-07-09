import { useMemo } from 'react';
import StatCard from '@/components/common/StatCard';
import GlassCard from '@/components/common/GlassCard';
import { DonutChart, HBarChart } from '@/components/charts';
import KVRow from './KVRow';
import { fmt, pct } from './derivations';
import type { AnalysisResult } from '@/types';

interface Props {
  results: AnalysisResult;
}

export default function IdentityAccessTab({ results }: Props) {
  const user    = results.userSummary;
  const profile = results.profileSummary;
  const qf      = results.orgInfoData?.quickFacts;

  const totalUsers = qf?.users ?? ((user?.totalActiveUsers ?? 0) + (user?.totalInactiveUsers ?? 0));

  const topProfiles = useMemo(() =>
    [...(profile?.profileList ?? [])]
      .sort((a, b) => (b._userCount ?? 0) - (a._userCount ?? 0))
      .slice(0, 5),
    [profile],
  );

  const topPermSets = useMemo(() =>
    [...(profile?.permissionSetList ?? [])]
      .sort((a, b) => (b._userCount ?? 0) - (a._userCount ?? 0))
      .slice(0, 5),
    [profile],
  );

  const dangerousProfiles = useMemo(() =>
    (profile?.profileList ?? []).filter(
      (p) => p.PermissionsModifyAllData || p.PermissionsViewAllData || p.PermissionsAuthorApex,
    ),
    [profile],
  );

  const profileDistData = useMemo(() => {
    const dist = results.userSummary?.profileDistribution ?? [];
    const sorted = [...dist].sort((a, b) => b.count - a.count);
    const top = sorted.slice(0, 5).map((d) => ({ name: d.profileName, value: d.count }));
    const rest = sorted.slice(5).reduce((s, d) => s + d.count, 0);
    return rest > 0 ? [...top, { name: 'Other', value: rest }] : top;
  }, [results]);

  const usersByTypeData = useMemo(() =>
    Object.entries(results.userSummary?.usersByType ?? {})
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value),
    [results],
  );

  return (
    <div className="space-y-4">
      {user && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon="👥" value={fmt(user.totalActiveUsers)}   label="Active Users" />
          <StatCard icon="💤" value={fmt(user.dormantUsers ?? 0)}  label="Dormant Users"   accent={(user.dormantUsers ?? 0) > 0 ? 'text-sev-warning' : 'text-score-good'} />
          <StatCard icon="⚡" value={fmt(user.superAdmins ?? 0)}   label="Super Admins"    accent={(user.superAdmins ?? 0) > 0 ? 'text-sev-error' : 'text-score-good'} />
          <StatCard icon="🔑" value={fmt(user.neverLoggedIn ?? 0)} label="Never Logged In" accent={(user.neverLoggedIn ?? 0) > 0 ? 'text-sev-warning' : 'text-score-good'} />
          <StatCard icon="👪" value={fmt(qf?.publicGroups)}        label="Public Groups" />
          <StatCard icon="📥" value={fmt(qf?.queues)}              label="Queues" />
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  {topProfiles.map((p) => (
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
                  {topPermSets.map((ps) => (
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
      </div>

      <GlassCard title="Identity Inventory">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <div>
            <KVRow label="Users"                 value={fmt(totalUsers)} />
            <KVRow label="Active Users"          value={`${fmt(user?.totalActiveUsers)} (${pct(user?.totalActiveUsers ?? 0, totalUsers)})`} />
            <KVRow label="Inactive Users"        value={`${fmt(user?.totalInactiveUsers)} (${pct(user?.totalInactiveUsers ?? 0, totalUsers)})`} />
            <KVRow label="Profiles"              value={fmt(profile?.totalProfiles ?? qf?.profiles)} />
          </div>
          <div>
            <KVRow label="Permission Sets"       value={fmt(qf?.permissionSets ?? profile?.permissionSetList?.length)} />
            <KVRow label="Permission Set Groups" value={fmt(qf?.permissionSetGroups ?? profile?.permissionSetGroupList?.length)} />
            <KVRow label="Public Groups"         value={fmt(qf?.publicGroups)} />
            <KVRow label="Queues"                value={fmt(qf?.queues)} />
          </div>
        </div>
      </GlassCard>

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
                    {dangerousProfiles.map((p) => (
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
  );
}
