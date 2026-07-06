import { useState, useMemo } from 'react';
import { useDashboardStore } from '@/store/dashboardStore';
import type { AnalysisResult } from '@/types';
import GlassCard from '@/components/common/GlassCard';
import StatCard from '@/components/common/StatCard';
import { EmptyState } from '@/components/common';
import Pagination from '@/components/common/Pagination';
import DonutChart from '@/components/charts/DonutChart';
import ColumnChart from '@/components/charts/ColumnChart';
import HBarChart from '@/components/charts/HBarChart';
import SparklineChart from '@/components/charts/SparklineChart';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const DONUT_COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6'];

const SUB_TABS = [
  { id: 'overview',       label: 'Overview' },
  { id: 'objects',        label: 'Objects' },
  { id: 'fields',         label: 'Fields' },
  { id: 'relationships',  label: 'Relationships' },
  { id: 'recordtypes',    label: 'Record Types' },
  { id: 'pagelayouts',    label: 'Page Layouts' },
  { id: 'validationrules',label: 'Validation Rules' },
  { id: 'triggers',       label: 'Triggers' },
  { id: 'flows',          label: 'Flows' },
  { id: 'custommetadata', label: 'Custom Metadata Type' },
  { id: 'platformevents', label: 'Platform Events' },
  { id: 'externalobjects',label: 'External Objects' },
  { id: 'bigobjects',     label: 'Big Objects' },
  { id: 'ldvobjects',     label: 'LDV Objects' },
];

const PAGE_SIZE = 10;

// ─── sub-tab object table ────────────────────────────────────────────────────

type StatRow = NonNullable<AnalysisResult['dataModelStats']>[number];

interface ObjectTableProps {
  rows: StatRow[];
  emptyMsg: string;
}

function ObjectTable({ rows, emptyMsg }: ObjectTableProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => !q || r.objectName.toLowerCase().includes(q) || (r.objectLabel ?? '').toLowerCase().includes(q));
  }, [rows, search]);

  const paged = useMemo(() => {
    const s = (page - 1) * PAGE_SIZE;
    return filtered.slice(s, s + PAGE_SIZE);
  }, [filtered, page]);

  if (rows.length === 0) return <EmptyState icon="🗄️" title={emptyMsg} description="No matching objects found for this category." className="m-6" />;

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-sf-text">{rows.length} objects</span>
        <input
          type="text"
          placeholder="Search objects…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="text-xs px-2 py-1 rounded border border-sf-border bg-sf-bg-3 text-sf-text placeholder:text-sf-muted outline-none w-40"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-sf-border bg-sf-bg-3">
              {['Object', 'API Name', 'Total Fields', 'Custom', 'Unused', 'Field Limit %', 'Records', 'Triggers', 'Val. Rules'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-sf-muted font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-4 text-center text-sf-muted">No results</td></tr>
            ) : paged.map(obj => {
              const lp = obj.fieldLimitPct ?? 0;
              return (
                <tr key={obj.objectName} className="border-b border-sf-border/40 hover:bg-sf-bg-3/40 transition-colors">
                  <td className="px-3 py-1.5 text-sf-text font-medium">{obj.objectLabel ?? obj.objectName}</td>
                  <td className="px-3 py-1.5 text-sf-muted font-mono text-[11px]">{obj.objectName}</td>
                  <td className="px-3 py-1.5 text-sf-text tabular-nums">{obj.totalFields}</td>
                  <td className="px-3 py-1.5 text-sf-muted tabular-nums">{obj.customFields ?? '—'}</td>
                  <td className="px-3 py-1.5 tabular-nums" style={{ color: (obj.unusedFields ?? 0) > 10 ? '#f59e0b' : '#9d9d9d' }}>{obj.unusedFields}</td>
                  <td className="px-3 py-1.5 tabular-nums" style={{ color: lp >= 90 ? '#ef4444' : lp >= 70 ? '#f97316' : '#9d9d9d' }}>
                    {obj.fieldLimitPct !== undefined ? `${obj.fieldLimitPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-sf-muted tabular-nums">{obj.recordCount !== undefined ? fmtNum(obj.recordCount) : '—'}</td>
                  <td className="px-3 py-1.5 text-sf-muted tabular-nums">{obj.triggers ?? '—'}</td>
                  <td className="px-3 py-1.5 text-sf-muted tabular-nums">{obj.validationRules ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
    </GlassCard>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function DataModel() {
  const results  = useDashboardStore((s) => s.results);
  const [activeTab, setActiveTab] = useState('overview');
  const [tableSearch, setTableSearch] = useState('');
  const [tablePage, setTablePage]     = useState(1);

  const stats     = results?.dataModelStats     ?? [];
  const summary   = results?.dataModelSummary;
  const automation = results?.automationSummary;
  const inventory  = results?.orgInventory;

  // ── aggregations ────────────────────────────────────────────────────────────

  const customObjects = useMemo(() => stats.filter(o => o.objectName.endsWith('__c')), [stats]);

  const totalRecords = useMemo(
    () => stats.reduce((s, o) => s + (o.recordCount ?? 0), 0),
    [stats],
  );

  const totalCustomRecords = useMemo(
    () => customObjects.reduce((s, o) => s + (o.recordCount ?? 0), 0),
    [customObjects],
  );

  const avgRecords = stats.length ? Math.round(totalRecords / stats.length) : 0;

  const largestObj = useMemo(
    () => stats.reduce<typeof stats[0] | null>((best, o) => ((o.recordCount ?? 0) > (best?.recordCount ?? 0) ? o : best), null),
    [stats],
  );

  const objectsOver1M  = useMemo(() => stats.filter(o => (o.recordCount ?? 0) > 1_000_000).length,  [stats]);
  const objectsOver10M = useMemo(() => stats.filter(o => (o.recordCount ?? 0) > 10_000_000).length, [stats]);

  // Objects by Type donut
  const objByTypeData = useMemo(() => [
    { name: 'Custom Objects',   value: summary?.customObjectCount        ?? 0 },
    { name: 'Standard Objects', value: inventory?.standardObjectCount     ?? 0 },
    { name: 'External Objects', value: summary?.externalObjectCount       ?? 0 },
    { name: 'Big Objects',      value: summary?.bigObjectCount            ?? 0 },
    { name: 'Custom Settings',  value: summary?.customSettingCount        ?? 0 },
    { name: 'Other (Platform Events, CMDT)', value: summary?.customMetadataTypeCount ?? 0 },
  ].filter(d => d.value > 0), [summary, inventory]);

  // Records distribution buckets
  const recordBuckets = useMemo(() => {
    const b = { '0 - 1K': 0, '1K - 10K': 0, '10K - 100K': 0, '100K - 1M': 0, '1M - 10M': 0, '10M+': 0 };
    for (const o of stats) {
      const r = o.recordCount ?? 0;
      if      (r < 1_000)       b['0 - 1K']++;
      else if (r < 10_000)      b['1K - 10K']++;
      else if (r < 100_000)     b['10K - 100K']++;
      else if (r < 1_000_000)   b['100K - 1M']++;
      else if (r < 10_000_000)  b['1M - 10M']++;
      else                      b['10M+']++;
    }
    return Object.entries(b).map(([name, value]) => ({ name, value }));
  }, [stats]);

  // Top 10 objects by record count for HBarChart
  const top10ByRecords = useMemo(() =>
    [...stats]
      .filter(o => (o.recordCount ?? 0) > 0)
      .sort((a, b) => (b.recordCount ?? 0) - (a.recordCount ?? 0))
      .slice(0, 10)
      .map(o => ({ name: o.objectName, value: o.recordCount ?? 0 })),
    [stats],
  );

  // Automation overview donut
  const automationData = useMemo(() => {
    if (!automation) return [];
    return [
      { name: 'Triggers',         value: automation.totalTriggers         ?? 0 },
      { name: 'Validation Rules', value: automation.totalValidationRules   ?? 0 },
      { name: 'Flows',            value: automation.totalFlows             ?? 0 },
      { name: 'Process Builder',  value: automation.totalProcessBuilders   ?? 0 },
      { name: 'Workflow Rules',   value: automation.totalWorkflowRules     ?? 0 },
    ].filter(d => d.value > 0);
  }, [automation]);

  const totalAutomations = automationData.reduce((s, d) => s + d.value, 0);

  // Field totals
  const fieldTotals = useMemo(() => ({
    total:     stats.reduce((s, o) => s + (o.totalFields   ?? 0), 0),
    custom:    stats.reduce((s, o) => s + (o.customFields  ?? 0), 0),
    standard:  stats.reduce((s, o) => s + (o.standardFields ?? 0), 0),
    formula:   stats.reduce((s, o) => s + (o.fieldTypes?.['Formula'] ?? 0), 0),
    encrypted: stats.reduce((s, o) => s + (o.fieldTypes?.['EncryptedText'] ?? 0), 0),
  }), [stats]);

  // Relationship totals
  const relTotals = useMemo(() => ({
    lookup:       stats.reduce((s, o) => s + (o.lookupFields      ?? 0), 0),
    masterDetail: stats.reduce((s, o) => s + (o.masterDetailFields ?? 0), 0),
    rollUp:       stats.reduce((s, o) => s + (o.fieldTypes?.['Summary'] ?? 0), 0),
  }), [stats]);

  // Custom Objects Summary table (searchable + paginated)
  const filteredCustomObjs = useMemo(() => {
    const q = tableSearch.toLowerCase();
    return customObjects.filter(o =>
      !q || o.objectName.toLowerCase().includes(q) || (o.objectLabel ?? '').toLowerCase().includes(q),
    );
  }, [customObjects, tableSearch]);

  const pagedCustomObjs = useMemo(() => {
    const s = (tablePage - 1) * PAGE_SIZE;
    return filteredCustomObjs.slice(s, s + PAGE_SIZE);
  }, [filteredCustomObjs, tablePage]);

  // Sub-tab object subsets
  const tabRows = useMemo((): Record<string, typeof stats> => ({
    objects:         stats,
    fields:          stats,
    relationships:   stats.filter(o => (o.lookupFields ?? 0) + (o.masterDetailFields ?? 0) > 0),
    recordtypes:     customObjects,
    pagelayouts:     customObjects,
    validationrules: stats.filter(o => (o.validationRules ?? 0) > 0),
    triggers:        stats.filter(o => (o.triggers ?? 0) > 0),
    flows:           customObjects,
    custommetadata:  stats.filter(o => o.objectName.endsWith('__mdt')),
    platformevents:  stats.filter(o => o.objectName.endsWith('__e')),
    externalobjects: stats.filter(o => o.objectName.endsWith('__x')),
    bigobjects:      stats.filter(o => o.objectName.endsWith('__b')),
    ldvobjects:      stats.filter(o => (o.recordCount ?? 0) > 10_000_000),
  }), [stats, customObjects]);

  // ── empty guard ──────────────────────────────────────────────────────────────

  if (!results) {
    return (
      <EmptyState
        icon="🗄️"
        title="No data model data yet"
        description="Run a full analysis to inspect objects, fields, and relationships."
        className="m-6"
      />
    );
  }

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-base font-semibold text-sf-text mb-0.5">Data Model</h1>
        <p className="text-xs text-sf-muted">Overview of all data structures in your Salesforce organization</p>
      </div>

      {/* Sub-tab nav */}
      <div className="flex items-center gap-0 border-b border-sf-border overflow-x-auto">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              'px-3 py-2 text-xs whitespace-nowrap border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-sf-accent text-sf-accent font-medium'
                : 'border-transparent text-sf-muted hover:text-sf-text',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-5">

          {/* Row 1 — 8 summary stat cards */}
          <div className="grid grid-cols-4 xl:grid-cols-8 gap-3">
            <StatCard icon="📦" value={summary?.customObjectCount                                    ?? 0} label="Custom Objects" />
            <StatCard icon="🏛️" value={summary?.standardObjectCount ?? inventory?.standardObjectCount ?? 0} label="Standard Objects" />
            <StatCard icon="🌐" value={summary?.externalObjectCount                                  ?? 0} label="External Objects" />
            <StatCard icon="🗄️" value={summary?.bigObjectCount                                       ?? 0} label="Big Objects" />
            <StatCard icon="⚙️" value={summary?.customSettingCount                                   ?? 0} label="Custom Settings" />
            <StatCard icon="📡" value={summary?.platformEventCount                                   ?? 0} label="Platform Events" />
            <StatCard icon="🔧" value={summary?.customMetadataTypeCount                              ?? 0} label="Custom Metadata Types" />
            <StatCard icon="📊" value={stats.filter(o => (o.recordCount ?? 0) > 10_000_000).length}       label="LDV Objects" />
          </div>

          {/* Row 2 — Objects by Type | Records Overview | Records Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Objects by Type donut */}
            <GlassCard title="Objects by Type">
              {objByTypeData.length > 0 ? (
                <DonutChart data={objByTypeData} height={220} showLegend />
              ) : (
                <div className="flex items-center justify-center h-36 text-xs text-sf-muted">No object data</div>
              )}
            </GlassCard>

            {/* Records Overview grid */}
            <GlassCard title="Records Overview">
              <div className="grid grid-cols-2 gap-2 h-full">
                {[
                  { label: 'Total Records (All)',               value: fmtNum(totalRecords) },
                  { label: 'Total Records (Custom Objects)',    value: fmtNum(totalCustomRecords) },
                  { label: 'Average Records per Object',        value: fmtNum(avgRecords) },
                  { label: `Largest Object\n${largestObj?.objectName ?? '—'}`, value: largestObj ? fmtNum(largestObj.recordCount ?? 0) : '—' },
                  { label: 'Objects with > 1M Records',         value: objectsOver1M },
                  { label: 'Objects with > 10M Records',        value: objectsOver10M },
                ].map(m => (
                  <div key={m.label} className="p-3 rounded-lg bg-sf-bg-2 border border-sf-border flex flex-col justify-between">
                    <div className="text-[10px] text-sf-muted leading-tight whitespace-pre-line">{m.label}</div>
                    <div className="text-xl font-bold tabular-nums text-sf-text mt-1">{m.value}</div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Records Distribution column chart */}
            <GlassCard title="Records Distribution (Custom Objects)">
              {recordBuckets.some(b => b.value > 0) ? (
                <ColumnChart data={recordBuckets} height={200} color="#3b82f6" />
              ) : (
                <div className="flex items-center justify-center h-36 text-xs text-sf-muted">No record data</div>
              )}
            </GlassCard>

          </div>

          {/* Row 3 — Custom Objects Summary | Largest Objects | Automation Overview */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px_260px] gap-4">

            {/* Custom Objects Summary (searchable + paginated table) */}
            <GlassCard>
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <span className="text-xs font-semibold text-sf-text">
                  Custom Objects Summary
                </span>
                <input
                  type="text"
                  placeholder="Search objects…"
                  value={tableSearch}
                  onChange={e => { setTableSearch(e.target.value); setTablePage(1); }}
                  className="text-xs px-2 py-1 rounded border border-sf-border bg-sf-bg-3 text-sf-text placeholder:text-sf-muted outline-none w-44"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-sf-border bg-sf-bg-3">
                      {['Object Name', 'API Name', 'Total Records', 'Triggers', 'Val. Rules', 'Fields'].map(h => (
                        <th key={h} className="px-2 py-2 text-left text-sf-muted font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCustomObjs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-2 py-4 text-center text-sf-muted">No results</td>
                      </tr>
                    ) : pagedCustomObjs.map(obj => (
                      <tr key={obj.objectName} className="border-b border-sf-border/40 hover:bg-sf-bg-3/40 transition-colors">
                        <td className="px-2 py-1.5 text-sf-text font-medium">{obj.objectLabel ?? obj.objectName}</td>
                        <td className="px-2 py-1.5 text-sf-muted font-mono text-[11px]">{obj.objectName}</td>
                        <td className="px-2 py-1.5 text-sf-muted tabular-nums">{obj.recordCount !== undefined ? fmtNum(obj.recordCount) : '—'}</td>
                        <td className="px-2 py-1.5 text-sf-muted tabular-nums">{obj.triggers ?? '—'}</td>
                        <td className="px-2 py-1.5 text-sf-muted tabular-nums">{obj.validationRules ?? '—'}</td>
                        <td className="px-2 py-1.5 text-sf-muted tabular-nums">{obj.totalFields}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={tablePage}
                pageSize={PAGE_SIZE}
                total={filteredCustomObjs.length}
                onChange={p => setTablePage(p)}
              />
            </GlassCard>

            {/* Largest Objects by Record Count */}
            <GlassCard title="Largest Objects by Record Count (Top 10)">
              {top10ByRecords.length > 0 ? (
                <HBarChart data={top10ByRecords} color="#8b5cf6" />
              ) : (
                <div className="flex items-center justify-center h-36 text-xs text-sf-muted">No record data</div>
              )}
            </GlassCard>

            {/* Object Automation Overview */}
            <GlassCard title="Object Automation Overview">
              {automationData.length > 0 ? (
                <div className="space-y-2">
                  <DonutChart data={automationData} height={180} showLegend={false} />
                  <div className="text-center text-xs font-bold text-sf-text">{totalAutomations.toLocaleString()} Total Automations</div>
                  <div className="space-y-1 mt-2">
                    {automationData.map((d, i) => (
                      <div key={d.name} className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                          <span className="text-sf-muted">{d.name}</span>
                        </div>
                        <span className="text-sf-text font-medium tabular-nums">
                          {d.value} ({totalAutomations ? ((d.value / totalAutomations) * 100).toFixed(1) : 0}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-36 text-xs text-sf-muted">No automation data</div>
              )}
            </GlassCard>

          </div>

          {/* Row 4 — Field Overview | Relationships Overview | Data Growth */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Field Overview */}
            <GlassCard title="Field Overview">
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mt-1">
                {[
                  { label: 'Total Fields',     value: fieldTotals.total     },
                  { label: 'Custom Fields',    value: fieldTotals.custom    },
                  { label: 'Standard Fields',  value: fieldTotals.standard  },
                  { label: 'Formula Fields',   value: fieldTotals.formula   },
                  { label: 'Encrypted Fields', value: fieldTotals.encrypted },
                ].map(m => (
                  <div key={m.label} className="text-center">
                    <div className="text-lg font-bold tabular-nums text-sf-text">{m.value.toLocaleString()}</div>
                    <div className="text-[10px] text-sf-muted leading-tight mt-0.5">{m.label}</div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Relationships Overview */}
            <GlassCard title="Relationships Overview">
              <div className="grid grid-cols-2 gap-2 mt-1">
                {[
                  { label: 'Lookup Relationships',        value: relTotals.lookup.toLocaleString()       },
                  { label: 'Master-Detail Relationships', value: relTotals.masterDetail.toLocaleString() },
                  { label: 'Many-to-Many Relationships',  value: '—'                                     },
                  { label: 'Roll-Up Summary Fields',      value: relTotals.rollUp.toLocaleString()       },
                ].map(m => (
                  <div key={m.label} className="p-2 rounded-lg bg-sf-bg-2 border border-sf-border">
                    <div className="text-[10px] text-sf-muted leading-tight">{m.label}</div>
                    <div className="text-lg font-bold tabular-nums text-sf-text mt-0.5">{m.value}</div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Data Growth */}
            <GlassCard title="Data Growth (All Records)">
              <div className="text-2xl font-bold tabular-nums text-sf-text">{fmtNum(totalRecords)}</div>
              <div className="text-[10px] text-sf-muted mb-3">Total Records</div>
              <SparklineChart data={[{ value: totalRecords }]} color="#3b82f6" height={80} />
              <div className="text-[10px] text-sf-muted mt-2">Historical trend data not yet available</div>
            </GlassCard>

          </div>
        </div>
      )}

      {/* ── NON-OVERVIEW TABS ────────────────────────────────────────────────── */}
      {activeTab !== 'overview' && (
        <ObjectTable
          rows={tabRows[activeTab] ?? stats}
          emptyMsg={`No ${SUB_TABS.find(t => t.id === activeTab)?.label ?? ''} data`}
        />
      )}

    </div>
  );
}
