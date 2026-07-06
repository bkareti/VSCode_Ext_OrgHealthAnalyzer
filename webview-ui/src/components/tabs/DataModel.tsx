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

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const SUB_TABS = [
  { id: 'overview',        label: 'Overview' },
  { id: 'objects',         label: 'Objects' },
  { id: 'recordtypes',     label: 'Record Types' },
  { id: 'pagelayouts',     label: 'Page Layouts' },
  { id: 'recordpages',     label: 'Record Pages' },
  { id: 'validationrules', label: 'Validation Rules' },
];

const PAGE_SIZE = 10;

// ─── sub-tab object table (used by Objects tab) ──────────────────────────────

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

// ─── Record Types sub-tab table ──────────────────────────────────────────────

type RecordTypeDetail = NonNullable<AnalysisResult['dataModelRecordTypeDetails']>[number];

function RecordTypesTable({ rows }: { rows: RecordTypeDetail[] }) {
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

  if (rows.length === 0) return <EmptyState icon="🏷️" title="No record types found" description="No active record types were found in this org." className="m-6" />;

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-sf-text">{rows.length} objects with record types</span>
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
              {['Object', 'API Name', 'Count', 'Record Type Names'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-sf-muted font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-sf-muted">No results</td></tr>
            ) : paged.map(obj => {
              const names = obj.recordTypes.map(rt => rt.name).join(', ');
              const truncated = names.length > 120 ? names.slice(0, 117) + '…' : names;
              return (
                <tr key={obj.objectName} className="border-b border-sf-border/40 hover:bg-sf-bg-3/40 transition-colors">
                  <td className="px-3 py-1.5 text-sf-text font-medium">{obj.objectLabel ?? obj.objectName}</td>
                  <td className="px-3 py-1.5 text-sf-muted font-mono text-[11px]">{obj.objectName}</td>
                  <td className="px-3 py-1.5 tabular-nums font-semibold text-sf-text">{obj.recordTypes.length}</td>
                  <td className="px-3 py-1.5 text-sf-muted max-w-xs" title={names}>{truncated}</td>
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

// ─── Page Layouts sub-tab table ──────────────────────────────────────────────

type PageLayoutDetail = NonNullable<AnalysisResult['dataModelPageLayoutDetails']>[number];

function PageLayoutsTable({ rows }: { rows: PageLayoutDetail[] }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => !q || r.objectName.toLowerCase().includes(q));
  }, [rows, search]);

  const paged = useMemo(() => {
    const s = (page - 1) * PAGE_SIZE;
    return filtered.slice(s, s + PAGE_SIZE);
  }, [filtered, page]);

  if (rows.length === 0) return <EmptyState icon="📐" title="No page layouts found" description="No page layouts were found in this org." className="m-6" />;

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-sf-text">{rows.length} objects with page layouts</span>
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
              {['Object / API Name', 'Layout Count', 'Page Layout Names'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-sf-muted font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-4 text-center text-sf-muted">No results</td></tr>
            ) : paged.map(obj => {
              const names = obj.pageLayouts.map(pl => pl.name).join(', ');
              const truncated = names.length > 120 ? names.slice(0, 117) + '…' : names;
              return (
                <tr key={obj.objectName} className="border-b border-sf-border/40 hover:bg-sf-bg-3/40 transition-colors">
                  <td className="px-3 py-1.5 font-mono text-sf-muted text-[11px]">{obj.objectName}</td>
                  <td className="px-3 py-1.5 tabular-nums font-semibold text-sf-text">{obj.pageLayouts.length}</td>
                  <td className="px-3 py-1.5 text-sf-muted max-w-xs" title={names}>{truncated}</td>
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

// ─── Validation Rules sub-tab table ─────────────────────────────────────────

type VRDetail = NonNullable<AnalysisResult['dataModelValidationRuleDetails']>[number];

interface FlatVR { objectName: string; id: string; name: string; active: boolean; errorMessage: string; description?: string }

function ValidationRulesTable({ rows }: { rows: VRDetail[] }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const flat = useMemo<FlatVR[]>(() =>
    rows.flatMap(obj => obj.validationRules.map(vr => ({ objectName: obj.objectName, ...vr }))),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return flat.filter(r => !q || r.objectName.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [flat, search]);

  const paged = useMemo(() => {
    const s = (page - 1) * PAGE_SIZE;
    return filtered.slice(s, s + PAGE_SIZE);
  }, [filtered, page]);

  if (flat.length === 0) return <EmptyState icon="✅" title="No validation rules found" description="No active validation rules were found in this org." className="m-6" />;

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-sf-text">{flat.length} validation rules across {rows.length} objects</span>
        <input
          type="text"
          placeholder="Search object or rule…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="text-xs px-2 py-1 rounded border border-sf-border bg-sf-bg-3 text-sf-text placeholder:text-sf-muted outline-none w-44"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-sf-border bg-sf-bg-3">
              {['Object', 'Rule Name', 'Active', 'Error Message'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-sf-muted font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-sf-muted">No results</td></tr>
            ) : paged.map(vr => (
              <tr key={`${vr.objectName}-${vr.id}`} className="border-b border-sf-border/40 hover:bg-sf-bg-3/40 transition-colors">
                <td className="px-3 py-1.5 font-mono text-sf-muted text-[11px] whitespace-nowrap">{vr.objectName}</td>
                <td className="px-3 py-1.5 text-sf-text font-medium">{vr.name}</td>
                <td className="px-3 py-1.5">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${vr.active ? 'bg-green-500/10 text-green-400' : 'bg-sf-muted/10 text-sf-muted'}`}>
                    {vr.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-sf-muted max-w-xs truncate" title={vr.errorMessage}>{vr.errorMessage || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
    </GlassCard>
  );
}

// ─── Record Pages sub-tab table ──────────────────────────────────────────────

type RPDetail = NonNullable<AnalysisResult['dataModelRecordPageDetails']>[number];

interface FlatRP { objectName: string; objectLabel?: string; id: string; name: string; pageType: string }

function RecordPagesTable({ rows }: { rows: RPDetail[] }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const flat = useMemo<FlatRP[]>(() =>
    rows.flatMap(obj => obj.recordPages.map(rp => ({ objectName: obj.objectName, objectLabel: obj.objectLabel, ...rp }))),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return flat.filter(r => !q || r.objectName.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [flat, search]);

  const paged = useMemo(() => {
    const s = (page - 1) * PAGE_SIZE;
    return filtered.slice(s, s + PAGE_SIZE);
  }, [filtered, page]);

  if (flat.length === 0) return <EmptyState icon="⚡" title="No Lightning Record Pages found" description="No Lightning Record Pages (FlexiPages) were associated with objects in this org, or object association could not be resolved." className="m-6" />;

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-sf-text">{flat.length} record pages across {rows.length} objects</span>
        <input
          type="text"
          placeholder="Search object or page…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="text-xs px-2 py-1 rounded border border-sf-border bg-sf-bg-3 text-sf-text placeholder:text-sf-muted outline-none w-44"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-sf-border bg-sf-bg-3">
              {['Page Name', 'Page Type', 'Object'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-sf-muted font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-4 text-center text-sf-muted">No results</td></tr>
            ) : paged.map(rp => (
              <tr key={`${rp.objectName}-${rp.id}`} className="border-b border-sf-border/40 hover:bg-sf-bg-3/40 transition-colors">
                <td className="px-3 py-1.5 text-sf-text font-medium">{rp.name}</td>
                <td className="px-3 py-1.5">
                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-sf-accent/10 text-sf-accent">{rp.pageType}</span>
                </td>
                <td className="px-3 py-1.5 font-mono text-sf-muted text-[11px]">{rp.objectLabel ?? rp.objectName}</td>
              </tr>
            ))}
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
  const [topListTab, setTopListTab]   = useState<'rt' | 'pl' | 'rp'>('rt');

  const stats      = results?.dataModelStats     ?? [];
  const summary    = results?.dataModelSummary;
  const automation = results?.automationSummary;
  const inventory  = results?.orgInventory;

  const rtDetails  = results?.dataModelRecordTypeDetails   ?? [];
  const plDetails  = results?.dataModelPageLayoutDetails   ?? [];
  const vrDetails  = results?.dataModelValidationRuleDetails ?? [];
  const rpDetails  = results?.dataModelRecordPageDetails   ?? [];

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

  // Field-limit pressure — top 10 objects nearest the 800-custom-field limit.
  // The single best scalability signal in the data model.
  const fieldPressure = useMemo(() =>
    [...stats]
      .filter(o => (o.fieldLimitPct ?? 0) > 0)
      .sort((a, b) => (b.fieldLimitPct ?? 0) - (a.fieldLimitPct ?? 0))
      .slice(0, 10)
      .map(o => ({
        name: o.objectLabel ?? o.objectName,
        value: Math.round((o.fieldLimitPct ?? 0) * 10) / 10,
        color: (o.fieldLimitPct ?? 0) >= 90 ? '#ef4444' : (o.fieldLimitPct ?? 0) >= 70 ? '#f97316' : '#3b82f6',
      })),
    [stats],
  );

  const hotFieldObjects = useMemo(
    () => stats.filter(o => (o.fieldLimitPct ?? 0) >= 70).length,
    [stats],
  );

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

  // Top 10 by record type count
  const top10RecordTypes = useMemo(() =>
    [...rtDetails]
      .sort((a, b) => b.recordTypes.length - a.recordTypes.length)
      .slice(0, 10),
    [rtDetails],
  );

  // Top 10 by page layout count
  const top10PageLayouts = useMemo(() =>
    [...plDetails]
      .sort((a, b) => b.pageLayouts.length - a.pageLayouts.length)
      .slice(0, 10),
    [plDetails],
  );

  // Top 10 by record page count
  const top10RecordPages = useMemo(() =>
    [...rpDetails]
      .sort((a, b) => b.recordPages.length - a.recordPages.length)
      .slice(0, 10),
    [rpDetails],
  );

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

          {/* Row 1 — 6 summary stat cards (scalability-first) */}
          <div className="grid grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard icon="📦" value={summary?.customObjectCount                                    ?? 0} label="Custom Objects" />
            <StatCard icon="🏛️" value={summary?.standardObjectCount ?? inventory?.standardObjectCount ?? 0} label="Standard Objects" />
            <StatCard icon="📋" value={fieldTotals.total.toLocaleString()} label="Total Fields" />
            <StatCard icon="🗄️" value={fmtNum(totalRecords)} label="Total Records" />
            <StatCard
              icon="📊"
              value={objectsOver10M}
              label="LDV Objects"
              sub=">10M records"
              accent={objectsOver10M > 0 ? 'text-sev-warning' : 'text-score-good'}
            />
            <StatCard
              icon="🌡️"
              value={hotFieldObjects}
              label="Field Limit Pressure"
              sub="objects ≥70% of limit"
              accent={hotFieldObjects > 0 ? 'text-sev-warning' : 'text-score-good'}
            />
          </div>

          {/* Row 2 — Objects by Type | Records | Field Limit Pressure */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Objects by Type donut */}
            <GlassCard title="Objects by Type">
              {objByTypeData.length > 0 ? (
                <DonutChart data={objByTypeData} height={220} showLegend />
              ) : (
                <div className="flex items-center justify-center h-36 text-xs text-sf-muted">No object data</div>
              )}
              <div className="grid grid-cols-3 gap-1.5 mt-2 text-center">
                {[
                  { label: 'Custom Settings', value: summary?.customSettingCount      ?? 0 },
                  { label: 'Platform Events', value: summary?.platformEventCount      ?? 0 },
                  { label: 'CMDT Types',      value: summary?.customMetadataTypeCount ?? 0 },
                ].map(m => (
                  <div key={m.label} className="p-1.5 rounded bg-sf-bg-2 border border-sf-border/50">
                    <div className="text-sm font-bold tabular-nums text-sf-text">{m.value}</div>
                    <div className="text-[9px] text-sf-muted leading-tight">{m.label}</div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Records — distribution + key stats merged into one card */}
            <GlassCard title="Records Distribution (Custom Objects)">
              {recordBuckets.some(b => b.value > 0) ? (
                <ColumnChart data={recordBuckets} height={150} color="#3b82f6" />
              ) : (
                <div className="flex items-center justify-center h-36 text-xs text-sf-muted">No record data</div>
              )}
              <div className="mt-3 space-y-1 text-xs border-t border-sf-border/50 pt-2">
                {[
                  { label: 'Total (custom objects)', value: fmtNum(totalCustomRecords) },
                  { label: 'Average per object',     value: fmtNum(avgRecords) },
                  { label: `Largest: ${largestObj?.objectLabel ?? largestObj?.objectName ?? '—'}`, value: largestObj ? fmtNum(largestObj.recordCount ?? 0) : '—' },
                  { label: 'Objects > 1M records',   value: String(objectsOver1M) },
                ].map(m => (
                  <div key={m.label} className="flex justify-between">
                    <span className="text-sf-muted truncate pr-2">{m.label}</span>
                    <span className="text-sf-text font-semibold tabular-nums shrink-0">{m.value}</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Field Limit Pressure — top objects vs 800-custom-field limit */}
            <GlassCard title="Field Limit Pressure (Top 10)">
              {fieldPressure.length > 0 ? (
                <>
                  <p className="text-[10px] text-sf-muted mb-1">% of the 800-custom-field governor limit consumed</p>
                  <HBarChart data={fieldPressure} multiColor color="#3b82f6" />
                </>
              ) : (
                <div className="flex items-center justify-center h-36 text-xs text-sf-muted">No field limit data</div>
              )}
            </GlassCard>

          </div>

          {/* Row 3 — Custom Objects Summary | Largest Objects */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">

            {/* Custom Objects Summary (updated columns: Records, Custom Fields, Triggers, Flows, Val. Rules) */}
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
                      {['Object Name', 'API Name', 'Records', 'Custom Fields', 'Triggers', 'Flows', 'Val. Rules'].map(h => (
                        <th key={h} className="px-2 py-2 text-left text-sf-muted font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCustomObjs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-2 py-4 text-center text-sf-muted">No results</td>
                      </tr>
                    ) : pagedCustomObjs.map(obj => {
                      const flows = automation?.objectMap?.[obj.objectName]?.flows ?? 0;
                      return (
                        <tr key={obj.objectName} className="border-b border-sf-border/40 hover:bg-sf-bg-3/40 transition-colors">
                          <td className="px-2 py-1.5 text-sf-text font-medium">{obj.objectLabel ?? obj.objectName}</td>
                          <td className="px-2 py-1.5 text-sf-muted font-mono text-[11px]">{obj.objectName}</td>
                          <td className="px-2 py-1.5 text-sf-muted tabular-nums">{obj.recordCount !== undefined ? fmtNum(obj.recordCount) : '—'}</td>
                          <td className="px-2 py-1.5 text-sf-muted tabular-nums">{obj.customFields ?? '—'}</td>
                          <td className="px-2 py-1.5 text-sf-muted tabular-nums">{obj.triggers ?? '—'}</td>
                          <td className="px-2 py-1.5 text-sf-muted tabular-nums">{flows > 0 ? flows : '—'}</td>
                          <td className="px-2 py-1.5 text-sf-muted tabular-nums">{obj.validationRules ?? '—'}</td>
                        </tr>
                      );
                    })}
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

          </div>

          {/* Row 4 — Field Overview | Relationships Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

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

          </div>

          {/* Row 5 — UI configuration density (one card, segmented toggle) */}
          <GlassCard>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <span className="text-xs font-semibold text-sf-text">UI Configuration Density (Top 10 Objects)</span>
              <div className="flex gap-1">
                {([
                  ['rt', 'Record Types'],
                  ['pl', 'Page Layouts'],
                  ['rp', 'Record Pages'],
                ] as ['rt' | 'pl' | 'rp', string][]).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTopListTab(id)}
                    className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
                      topListTab === id
                        ? 'border-sf-accent text-sf-accent bg-sf-accent/10'
                        : 'border-sf-border text-sf-muted hover:text-sf-text'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {(() => {
              const config = {
                rt: { rows: top10RecordTypes.map(o => ({ name: o.objectLabel ?? o.objectName, count: o.recordTypes.length })), link: 'recordtypes',     linkLabel: 'View all record types →',  empty: 'No record type data' },
                pl: { rows: top10PageLayouts.map(o => ({ name: o.objectName,                  count: o.pageLayouts.length  })), link: 'pagelayouts',    linkLabel: 'View all page layouts →',  empty: 'No page layout data' },
                rp: { rows: top10RecordPages.map(o => ({ name: o.objectLabel ?? o.objectName, count: o.recordPages.length  })), link: 'recordpages',    linkLabel: 'View all record pages →',  empty: 'No record page data' },
              }[topListTab];
              return config.rows.length > 0 ? (
                <div className="space-y-1 mt-1">
                  {config.rows.map((row, i) => (
                    <div key={row.name} className="flex items-center justify-between text-xs py-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sf-muted tabular-nums w-4 text-right shrink-0">{i + 1}.</span>
                        <span className="text-sf-text truncate">{row.name}</span>
                      </div>
                      <span className="text-sf-accent font-semibold tabular-nums ml-2 shrink-0">{row.count}</span>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setActiveTab(config.link)}
                    className="mt-2 text-[11px] text-sf-accent hover:underline"
                  >
                    {config.linkLabel}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center h-24 text-xs text-sf-muted">{config.empty}</div>
              );
            })()}
          </GlassCard>

        </div>
      )}

      {/* ── OBJECTS TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'objects' && (
        <ObjectTable rows={stats} emptyMsg="No objects found" />
      )}

      {/* ── RECORD TYPES TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'recordtypes' && (
        <RecordTypesTable rows={rtDetails} />
      )}

      {/* ── PAGE LAYOUTS TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'pagelayouts' && (
        <PageLayoutsTable rows={plDetails} />
      )}

      {/* ── RECORD PAGES TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'recordpages' && (
        <RecordPagesTable rows={rpDetails} />
      )}

      {/* ── VALIDATION RULES TAB ─────────────────────────────────────────────── */}
      {activeTab === 'validationrules' && (
        vrDetails.length > 0
          ? <ValidationRulesTable rows={vrDetails} />
          : <ObjectTable
              rows={stats.filter(o => (o.validationRules ?? 0) > 0)}
              emptyMsg="No validation rule data"
            />
      )}

    </div>
  );
}
