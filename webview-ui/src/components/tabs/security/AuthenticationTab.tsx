import StatCard from '@/components/common/StatCard';
import KVRow from './KVRow';
import SecurityPanel from './SecurityPanel';
import { fmt, profilesWithLoginIpRangeCount, ipRestrictedConnectedAppsCount } from './derivations';
import { PASSWORD_POLICY_SAMPLE, SESSION_MANAGEMENT_SAMPLE, IP_RESTRICTIONS_SAMPLE, AUTHENTICATION_SAMPLE, CONNECTED_APPS_SECURITY_SAMPLE } from './sampleData';
import type { AnalysisResult } from '@/types';

interface Props {
  results: AnalysisResult;
}

export default function AuthenticationTab({ results }: Props) {
  const integ = results.orgInfoData?.integrations;
  const collector = results.securityCollectorData;

  const mfaRequired = collector?.mfaRequired;
  const profilesWithIpRange = profilesWithLoginIpRangeCount(collector?.profileIpRanges);
  const ipRestrictedApps = ipRestrictedConnectedAppsCount(collector?.connectedAppsIpInfo);
  const totalConnectedApps = integ?.connectedApps ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard icon="🔑" value={fmt(integ?.authProviders)} label="Auth Providers" />
        <StatCard icon="📱" value={fmt(integ?.connectedApps)} label="Connected Apps" />
        <StatCard
          icon="🛡️"
          value={mfaRequired == null ? '—' : mfaRequired ? 'Enforced' : 'Not Enforced'}
          label="Org-Wide MFA"
          accent={mfaRequired === false ? 'text-sev-error' : mfaRequired ? 'text-score-good' : undefined}
        />
        <StatCard icon="🌐" value={fmt(profilesWithIpRange)} label="Profiles w/ Login IP Range" />
        <StatCard icon="📶" value={fmt(collector?.orgNetworkAccessRangeCount)} label="Org Trusted IP Ranges" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SecurityPanel
          title="Authentication Overview"
          sample
          sampleNote="SSO detection, session timeout, and the password-policy strength label aren't queryable yet — only MFA and Auth Providers below are real."
        >
          <KVRow label="SSO Enabled" value={AUTHENTICATION_SAMPLE.ssoEnabled ? 'Yes' : 'No'} sample />
          <KVRow label="Multi-Factor Authentication" value={mfaRequired == null ? '—' : mfaRequired ? 'Enforced' : 'Not Enforced'} />
          <KVRow label="Login IP Ranges (profiles)" value={fmt(profilesWithIpRange)} />
          <KVRow label="Auth Providers" value={fmt(integ?.authProviders)} />
          <KVRow label="Session Timeout" value={`${AUTHENTICATION_SAMPLE.sessionTimeoutHours} hours`} sample />
          <KVRow label="Password Policy" value={AUTHENTICATION_SAMPLE.passwordPolicyLabel} sample />
        </SecurityPanel>

        <SecurityPanel
          title="Password Policy"
          sample
          sampleNote="OrgPulse doesn't yet query PasswordPolicy / SecuritySettings metadata."
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
        >
          <KVRow label="Session Timeout"              value={`${SESSION_MANAGEMENT_SAMPLE.sessionTimeoutHours} hours`} />
          <KVRow label="Idle Timeout"                 value={`${SESSION_MANAGEMENT_SAMPLE.idleTimeoutHours} hour`} />
          <KVRow label="Concurrent Sessions"          value={SESSION_MANAGEMENT_SAMPLE.concurrentSessions} />
          <KVRow label="Lock Sessions on Pwd Change"  value={SESSION_MANAGEMENT_SAMPLE.lockOnPasswordChange ? 'Yes' : 'No'} />
          <KVRow label="High Risk Logins (Last 7 Days)" value={SESSION_MANAGEMENT_SAMPLE.highRiskLogins7d} />
        </SecurityPanel>

        <SecurityPanel
          title="IP Restrictions"
          sample
          sampleNote="Login/Trusted IP Range counts are real; login-hours restriction and high-risk IP logins aren't tracked yet."
        >
          <KVRow label="Login IP Ranges (profiles)" value={fmt(profilesWithIpRange)} />
          <KVRow label="Trusted IP Ranges (org)"     value={fmt(collector?.orgNetworkAccessRangeCount)} />
          <KVRow label="Login Hours Restriction"     value={IP_RESTRICTIONS_SAMPLE.loginHoursRestriction ? 'Yes' : 'No'} sample />
          <KVRow label="High Risk IP Logins (7 Days)" value={IP_RESTRICTIONS_SAMPLE.highRiskIpLogins7d} sample />
        </SecurityPanel>

        <SecurityPanel
          title="Connected Apps Security"
          sample
          sampleNote="Total apps and IP-restriction counts are real; refresh-token, privilege, and usage-age fields aren't tracked yet."
        >
          <KVRow label="Total Connected Apps"        value={fmt(totalConnectedApps)} />
          <KVRow label="Apps without IP Restriction" value={fmt(Math.max(totalConnectedApps - ipRestrictedApps, 0))} />
          <KVRow label="Apps with Refresh Token"     value={CONNECTED_APPS_SECURITY_SAMPLE.appsWithRefreshToken} sample />
          <KVRow label="High Privilege Apps"         value={CONNECTED_APPS_SECURITY_SAMPLE.highPrivilegeApps} sample />
          <KVRow label="Unused Apps (90+ days)"      value={CONNECTED_APPS_SECURITY_SAMPLE.unusedApps90d} sample />
          <KVRow label="Over-Privileged Scopes"      value={CONNECTED_APPS_SECURITY_SAMPLE.overPrivilegedScopes} sample />
        </SecurityPanel>
      </div>
    </div>
  );
}
