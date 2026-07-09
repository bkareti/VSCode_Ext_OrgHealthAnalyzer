import { useMemo } from 'react';
import StatCard from '@/components/common/StatCard';
import KVRow from './KVRow';
import SecurityPanel from './SecurityPanel';
import SecurityRecommendations from './SecurityRecommendations';
import { DonutChart, HBarChart, TrendLineChart, DonutWithLegend } from '@/components/charts';
import { scoreLabel, scoreText } from '@/constants/scoring';
import {
  fmt, mapRiskCategory, kpiDelta, kpiSparkline,
  encryptedFieldsTotal, ipRestrictedConnectedAppsCount, profilesWithLoginIpRangeCount,
  type SecuritySubTab,
} from './derivations';
import {
  PASSWORD_POLICY_SAMPLE, SESSION_MANAGEMENT_SAMPLE, IP_RESTRICTIONS_SAMPLE, AUTHENTICATION_SAMPLE,
  SHIELD_STATUS_SAMPLE, EVENT_MONITORING_SAMPLE, CONNECTED_APPS_SECURITY_SAMPLE,
  DATA_CLASSIFICATION_SAMPLE, DATA_PROTECTION_SAMPLE, COMPLIANCE_SAMPLE,
} from './sampleData';
import type { AnalysisResult, ScanHistoryEntry } from '@/types';

interface Props {
  results: AnalysisResult;
  history: ScanHistoryEntry[];
  onNavigate: (tab: SecuritySubTab) => void;
}

export default function SecurityOverviewTab({ results, history, onNavigate }: Props) {
  const allIssues = results.issues ?? [];
  const secIssues = useMemo(
    () => allIssues.filter((i) => ['security', 'profile-security', 'user-governance'].includes(i.category)),
    [allIssues],
  );

  const highRiskCount   = useMemo(() => secIssues.filter((i) => i.severity === 'error').length,   [secIssues]);
  const mediumRiskCount = useMemo(() => secIssues.filter((i) => i.severity === 'warning').length, [secIssues]);
  const lowRiskCount    = useMemo(() => secIssues.filter((i) => i.severity === 'info').length,    [secIssues]);

  const severityData = useMemo(() => [
    { name: 'Critical', value: highRiskCount },
    { name: 'Warning',  value: mediumRiskCount },
    { name: 'Info',     value: lowRiskCount },
  ].filter((d) => d.value > 0), [highRiskCount, mediumRiskCount, lowRiskCount]);

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
    const pts = results.trends ?? [];
    if (pts.length < 2) return null;
    return pts.slice(-10).map((t) => ({
      date: new Date(t.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: t.security,
    }));
  }, [results]);

  const user    = results.userSummary;
  const profile = results.profileSummary;
  const qf      = results.orgInfoData?.quickFacts;
  const integ   = results.orgInfoData?.integrations;
  const collector = results.securityCollectorData;
  const secScore = results.scores.security ?? 0;

  const totalUsers = qf?.users ?? ((user?.totalActiveUsers ?? 0) + (user?.totalInactiveUsers ?? 0));
  const profilesWithIpRange = profilesWithLoginIpRangeCount(collector?.profileIpRanges);
  const encryptedFields = encryptedFieldsTotal(results.dataModelStats);
  const piiFields = collector?.piiSensitiveFieldCount;
  const totalConnectedApps = integ?.connectedApps ?? 0;
  const ipRestrictedApps = ipRestrictedConnectedAppsCount(collector?.connectedAppsIpInfo);

  const complianceData = [
    { name: 'Compliant',     value: COMPLIANCE_SAMPLE.compliantPct,    color: '#22c55e' },
    { name: 'Warning',       value: COMPLIANCE_SAMPLE.warningPct,      color: '#f59e0b' },
    { name: 'Non-Compliant', value: COMPLIANCE_SAMPLE.nonCompliantPct, color: '#ef4444' },
  ];

  return (
    <div className="space-y-4">
      {/* KPI Row — 8 KPIs with real vs-last-scan deltas + sparklines where scan history exists */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        <StatCard
          icon="🛡️"
          value={secScore}
          label="Security Score"
          sub={`/100 · ${scoreLabel(secScore)}`}
          accent={scoreText(secScore)}
          delta={kpiDelta(history, (e) => e.scores.security)}
          sparkline={kpiSparkline(history, (e) => e.scores.security)}
        />
        <StatCard
          icon="🔴"
          value={highRiskCount}
          label="High Risk Issues"
          accent={highRiskCount > 0 ? 'text-sev-error' : 'text-score-good'}
          delta={kpiDelta(history, (e) => e.issueSummary.error)}
          deltaGoodDirection="down"
          sparkline={kpiSparkline(history, (e) => e.issueSummary.error)}
        />
        <StatCard
          icon="👥"
          value={fmt(totalUsers)}
          label="Total Users"
          delta={kpiDelta(history, (e) => e.kpiSnapshot?.totalUsers)}
          sparkline={kpiSparkline(history, (e) => e.kpiSnapshot?.totalUsers)}
        />
        <StatCard
          icon="👤"
          value={fmt(profile?.totalProfiles ?? qf?.profiles)}
          label="Profiles"
          delta={kpiDelta(history, (e) => e.kpiSnapshot?.profiles)}
          sparkline={kpiSparkline(history, (e) => e.kpiSnapshot?.profiles)}
        />
        <StatCard
          icon="🔗"
          value={fmt(qf?.permissionSets ?? profile?.permissionSetList?.length)}
          label="Permission Sets"
          delta={kpiDelta(history, (e) => e.kpiSnapshot?.permissionSets)}
          sparkline={kpiSparkline(history, (e) => e.kpiSnapshot?.permissionSets)}
        />
        <StatCard
          icon="🧩"
          value={fmt(qf?.permissionSetGroups ?? profile?.permissionSetGroupList?.length)}
          label="Permission Set Groups"
          delta={kpiDelta(history, (e) => e.kpiSnapshot?.permissionSetGroups)}
          sparkline={kpiSparkline(history, (e) => e.kpiSnapshot?.permissionSetGroups)}
        />
        <StatCard
          icon="🌳"
          value={fmt(qf?.roles)}
          label="Roles"
          delta={kpiDelta(history, (e) => e.kpiSnapshot?.roles)}
          sparkline={kpiSparkline(history, (e) => e.kpiSnapshot?.roles)}
        />
        <StatCard
          icon="📱"
          value={fmt(integ?.connectedApps)}
          label="Connected Apps"
          delta={kpiDelta(history, (e) => e.kpiSnapshot?.connectedApps)}
          sparkline={kpiSparkline(history, (e) => e.kpiSnapshot?.connectedApps)}
        />
      </div>

      {/* Charts Row */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${trendData ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
        <SecurityPanel
          title="Risk Summary by Severity"
          infoTooltip="OrgPulse tracks 3 severity tiers today (Critical/Warning/Info) — High and Low aren't distinct tiers yet."
          linkLabel="View all risks"
          onLinkClick={() => onNavigate('risks')}
        >
          {severityData.length > 0 ? (
            <DonutChart data={severityData} height={160} showLegend />
          ) : (
            <div className="flex items-center justify-center h-32 text-xs text-sf-muted">No security issues</div>
          )}
        </SecurityPanel>

        <SecurityPanel
          title="Top Risk Categories"
          linkLabel="View all risks"
          onLinkClick={() => onNavigate('risks')}
        >
          {catBarData.length > 0 ? (
            <HBarChart data={catBarData} height={160} color="#8b5cf6" />
          ) : (
            <div className="flex items-center justify-center h-32 text-xs text-sf-muted">No data</div>
          )}
        </SecurityPanel>

        {/* Real trend only — hidden entirely until ≥2 scans exist */}
        {trendData && (
          <SecurityPanel
            title={`Security Score Trend (Last ${trendData.length} Scans)`}
            linkLabel="View trend analytics"
            onLinkClick={() => onNavigate('risks')}
          >
            <TrendLineChart
              data={trendData}
              xKey="date"
              series={[{ key: 'value', name: 'Security Score', color: '#3b82f6' }]}
              height={140}
            />
          </SecurityPanel>
        )}

        <SecurityPanel
          title="Compliance Score"
          sample
          sampleNote="No compliance framework/scoring exists in OrgPulse yet — this is illustrative only."
          linkLabel="View compliance report"
          onLinkClick={() => onNavigate('compliance')}
        >
          <DonutWithLegend
            data={complianceData}
            height={140}
            centerLabel={`${COMPLIANCE_SAMPLE.score}%`}
            centerSubLabel="Compliant"
            valueFormatter={(n) => `${n}%`}
            showPercent={false}
          />
        </SecurityPanel>
      </div>

      {/* Summary Panels — Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <SecurityPanel title="Identity & Access Overview" linkLabel="View details" onLinkClick={() => onNavigate('identity')}>
          <KVRow label="Total Users"            value={fmt(totalUsers)} />
          <KVRow label="Active Users"           value={fmt(user?.totalActiveUsers)} />
          <KVRow label="Inactive Users"         value={fmt(user?.totalInactiveUsers)} />
          <KVRow label="Profiles"               value={fmt(profile?.totalProfiles ?? qf?.profiles)} />
          <KVRow label="Permission Sets"        value={fmt(qf?.permissionSets)} />
          <KVRow label="Permission Set Groups"  value={fmt(qf?.permissionSetGroups)} />
          <KVRow label="Public Groups"          value={fmt(qf?.publicGroups)} />
          <KVRow label="Queues"                 value={fmt(qf?.queues)} />
        </SecurityPanel>

        <SecurityPanel
          title="Authentication Overview"
          sample
          sampleNote="SSO detection, session timeout, and the password-policy label aren't queryable yet — MFA and Auth Providers below are real."
          linkLabel="View details"
          onLinkClick={() => onNavigate('authentication')}
        >
          <KVRow label="SSO Enabled"                   value={AUTHENTICATION_SAMPLE.ssoEnabled ? 'Yes' : 'No'} sample />
          <KVRow label="Multi-Factor Authentication"   value={collector?.mfaRequired == null ? '—' : collector.mfaRequired ? 'Enforced' : 'Not Enforced'} />
          <KVRow label="Login IP Ranges"                value={fmt(profilesWithIpRange)} />
          <KVRow label="Auth Providers"                 value={fmt(integ?.authProviders)} />
          <KVRow label="Session Timeout"                value={`${AUTHENTICATION_SAMPLE.sessionTimeoutHours} hours`} sample />
          <KVRow label="Password Policy"                value={AUTHENTICATION_SAMPLE.passwordPolicyLabel} sample />
        </SecurityPanel>

        <SecurityPanel
          title="Password Policy"
          sample
          sampleNote="OrgPulse doesn't yet query PasswordPolicy / SecuritySettings metadata."
          linkLabel="View policy details"
          onLinkClick={() => onNavigate('authentication')}
        >
          <KVRow label="Minimum Length"      value={PASSWORD_POLICY_SAMPLE.minLength} />
          <KVRow label="Require Uppercase"   value={PASSWORD_POLICY_SAMPLE.requireUppercase ? 'Yes' : 'No'} />
          <KVRow label="Require Lowercase"   value={PASSWORD_POLICY_SAMPLE.requireLowercase ? 'Yes' : 'No'} />
          <KVRow label="Require Numbers"     value={PASSWORD_POLICY_SAMPLE.requireNumbers ? 'Yes' : 'No'} />
          <KVRow label="Require Symbols"     value={PASSWORD_POLICY_SAMPLE.requireSymbols ? 'Yes' : 'No'} />
          <KVRow label="Password Expiration" value={`${PASSWORD_POLICY_SAMPLE.expirationDays} days`} />
          <KVRow label="Password History"    value={PASSWORD_POLICY_SAMPLE.historyCount} />
        </SecurityPanel>

        <SecurityPanel
          title="Session Management"
          sample
          sampleNote="OrgPulse doesn't yet query SessionSettings or login-event history."
          linkLabel="View session report"
          onLinkClick={() => onNavigate('authentication')}
        >
          <KVRow label="Session Timeout"                value={`${SESSION_MANAGEMENT_SAMPLE.sessionTimeoutHours} hours`} />
          <KVRow label="Idle Timeout"                    value={`${SESSION_MANAGEMENT_SAMPLE.idleTimeoutHours} hour`} />
          <KVRow label="Concurrent Sessions"             value={SESSION_MANAGEMENT_SAMPLE.concurrentSessions} />
          <KVRow label="Lock Sessions on Pwd Change"     value={SESSION_MANAGEMENT_SAMPLE.lockOnPasswordChange ? 'Yes' : 'No'} />
          <KVRow label="High Risk Logins (Last 7 Days)"  value={SESSION_MANAGEMENT_SAMPLE.highRiskLogins7d} />
        </SecurityPanel>

        <SecurityPanel
          title="IP Restrictions"
          sample
          sampleNote="Login/Trusted IP Range counts are real; login-hours restriction and high-risk IP logins aren't tracked yet."
          linkLabel="View IP report"
          onLinkClick={() => onNavigate('authentication')}
        >
          <KVRow label="Login IP Ranges"                value={fmt(profilesWithIpRange)} />
          <KVRow label="Trusted IP Ranges"               value={fmt(collector?.orgNetworkAccessRangeCount)} />
          <KVRow label="Login Hours Restriction"         value={IP_RESTRICTIONS_SAMPLE.loginHoursRestriction ? 'Yes' : 'No'} sample />
          <KVRow label="High Risk IP Logins (7 Days)"    value={IP_RESTRICTIONS_SAMPLE.highRiskIpLogins7d} sample />
        </SecurityPanel>
      </div>

      {/* Summary Panels — Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <SecurityPanel
          title="Data Classification Overview"
          sample
          sampleNote="PII Detected Fields is real (limited to 5 key objects); sensitivity labels and classification coverage aren't tracked yet."
          linkLabel="View data classification"
          onLinkClick={() => onNavigate('dataProtection')}
        >
          <KVRow label="Data Sensitivity Labels" value={DATA_CLASSIFICATION_SAMPLE.dataSensitivityLabels} sample />
          <KVRow label="Classified Records"      value={fmt(DATA_CLASSIFICATION_SAMPLE.classifiedRecords)} sample />
          <KVRow label="PII Detected Fields"     value={fmt(piiFields)} />
          <KVRow label="Sensitive Objects"       value={DATA_CLASSIFICATION_SAMPLE.sensitiveObjects} sample />
          <KVRow label="Unclassified Objects"    value={DATA_CLASSIFICATION_SAMPLE.unclassifiedObjects} sample />
        </SecurityPanel>

        <SecurityPanel
          title="Salesforce Shield Status"
          sample
          sampleNote="OrgPulse doesn't yet query Shield product configuration."
          linkLabel="View shield details"
          onLinkClick={() => onNavigate('shieldEncryption')}
        >
          <KVRow label="Platform Encryption"       value={SHIELD_STATUS_SAMPLE.platformEncryption ? 'Enabled' : 'Disabled'} />
          <KVRow label="Field Audit Trail"         value={SHIELD_STATUS_SAMPLE.fieldAuditTrail ? 'Enabled' : 'Disabled'} />
          <KVRow label="Shield Event Monitoring"   value={SHIELD_STATUS_SAMPLE.shieldEventMonitoring ? 'Enabled' : 'Disabled'} />
          <KVRow label="Transaction Security"      value={SHIELD_STATUS_SAMPLE.transactionSecurity ? 'Enabled' : 'Disabled'} />
          <KVRow label="Data Mask"                 value={SHIELD_STATUS_SAMPLE.dataMask ? 'Enabled' : 'Disabled'} />
          <KVRow label="Key Management"            value={SHIELD_STATUS_SAMPLE.keyManagement} />
        </SecurityPanel>

        <SecurityPanel
          title="Event Monitoring (Last 7 Days)"
          sample
          sampleNote="OrgPulse doesn't yet query LoginEvent/ApiEvent/UriEvent data."
          linkLabel="View event monitoring"
          onLinkClick={() => onNavigate('eventMonitoring')}
        >
          <KVRow label="Total Events"        value={fmt(EVENT_MONITORING_SAMPLE.totalEvents)} />
          <KVRow label="High Risk Events"    value={fmt(EVENT_MONITORING_SAMPLE.highRiskEvents)} valueClassName="text-sev-error" />
          <KVRow label="Login Events"        value={fmt(EVENT_MONITORING_SAMPLE.loginEvents)} />
          <KVRow label="API Events"          value={fmt(EVENT_MONITORING_SAMPLE.apiEvents)} />
          <KVRow label="Data Access Events"  value={fmt(EVENT_MONITORING_SAMPLE.dataAccessEvents)} />
          <KVRow label="Change Events"       value={fmt(EVENT_MONITORING_SAMPLE.changeEvents)} />
        </SecurityPanel>

        <SecurityPanel
          title="Connected Apps Security"
          sample
          sampleNote="Total apps and IP-restriction counts are real; refresh-token, privilege, and usage-age fields aren't tracked yet."
          linkLabel="View connected apps"
          onLinkClick={() => onNavigate('authentication')}
        >
          <KVRow label="Total Connected Apps"        value={fmt(totalConnectedApps)} />
          <KVRow label="Apps without IP Restriction" value={fmt(Math.max(totalConnectedApps - ipRestrictedApps, 0))} />
          <KVRow label="Apps with Refresh Token"     value={CONNECTED_APPS_SECURITY_SAMPLE.appsWithRefreshToken} sample />
          <KVRow label="High Privilege Apps"         value={CONNECTED_APPS_SECURITY_SAMPLE.highPrivilegeApps} sample />
          <KVRow label="Unused Apps (90+ days)"      value={CONNECTED_APPS_SECURITY_SAMPLE.unusedApps90d} sample />
        </SecurityPanel>

        <SecurityPanel
          title="Data Protection Overview"
          sample
          sampleNote="Encrypted Fields is real; Shield-related protections and Event Monitoring/Audit Trail status aren't queryable yet."
          linkLabel="View data protection"
          onLinkClick={() => onNavigate('dataProtection')}
        >
          <KVRow label="Encrypted Fields"            value={fmt(encryptedFields)} />
          <KVRow label="Encrypted Files"              value={DATA_PROTECTION_SAMPLE.encryptedFiles} sample />
          <KVRow label="Platform Encryption"          value={DATA_PROTECTION_SAMPLE.platformEncryption ? 'Enabled' : 'Disabled'} sample />
          <KVRow label="Shield Platform Encryption"   value={DATA_PROTECTION_SAMPLE.shieldPlatformEncryption ? 'Enabled' : 'Disabled'} sample />
          <KVRow label="Data Mask"                    value={DATA_PROTECTION_SAMPLE.dataMask ? 'Enabled' : 'Disabled'} sample />
          <KVRow label="Event Monitoring"             value={DATA_PROTECTION_SAMPLE.eventMonitoring ? 'Enabled' : 'Disabled'} sample />
        </SecurityPanel>
      </div>

      <SecurityRecommendations cards={results.securityRecommendations?.cards ?? []} />
    </div>
  );
}
