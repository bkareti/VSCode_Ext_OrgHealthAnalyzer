import StatCard from '@/components/common/StatCard';
import SampleMark from '@/components/common/SampleMark';
import { fmt } from './derivations';
import { EVENT_MONITORING_SAMPLE } from './sampleData';

export default function EventMonitoringTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] text-sf-muted">
          OrgPulse doesn't yet query LoginEvent/ApiEvent/UriEvent data — every figure below is illustrative.
        </p>
        <SampleMark />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon="📡" value={fmt(EVENT_MONITORING_SAMPLE.totalEvents)}      label="Total Events" sub="Last 7 days" />
        <StatCard icon="🔴" value={fmt(EVENT_MONITORING_SAMPLE.highRiskEvents)}   label="High Risk Events" accent="text-sev-error" />
        <StatCard icon="🔑" value={fmt(EVENT_MONITORING_SAMPLE.loginEvents)}      label="Login Events" />
        <StatCard icon="🔌" value={fmt(EVENT_MONITORING_SAMPLE.apiEvents)}        label="API Events" />
        <StatCard icon="📂" value={fmt(EVENT_MONITORING_SAMPLE.dataAccessEvents)} label="Data Access Events" />
        <StatCard icon="✏️" value={fmt(EVENT_MONITORING_SAMPLE.changeEvents)}     label="Change Events" />
      </div>
    </div>
  );
}
