import { useState, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { useDashboardStore } from '@/store/dashboardStore';
import { useAIStore } from '@/store/slices/aiStore';
import { useVSCode } from '@/hooks/useVSCode';
import GlassCard from '@/components/common/GlassCard';
import Badge from '@/components/common/Badge';
import Button from '@/components/common/Button';
import EmptyState from '@/components/common/EmptyState';
import ModelLimitErrorBanner from '@/components/common/ModelLimitErrorBanner';
import CTALoadingScene from '@/components/loading/CTALoadingScene';
import RadarChart from '@/components/charts/RadarChart';
import RiskMatrix from '@/components/charts/RiskMatrix';
import DependencyDiagram from '@/components/charts/DependencyDiagram';
import type { CTAReview as CTAReviewType } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const SUBTABS = ['Risk Summary', 'Findings', 'Architecture', 'Recommendations', 'Verdict'] as const;
type SubTab = (typeof SUBTABS)[number];

const VERDICT_COLOR: Record<string, string> = {
  Go: 'text-score-good border-score-good bg-score-good/10',
  'Conditional Go': 'text-score-fair border-score-fair bg-score-fair/10',
  'No-Go': 'text-sev-error border-sev-error bg-sev-error/10',
};

const SWOT_STYLE: Record<'Strength' | 'Weakness' | 'Opportunity' | 'Threat', { border: string; bg: string; text: string }> = {
  Strength: { border: 'border-score-good/30', bg: 'bg-score-good/5', text: 'text-score-good' },
  Weakness: { border: 'border-sev-error/30', bg: 'bg-sev-error/5', text: 'text-sev-error' },
  Opportunity: { border: 'border-sf-accent/30', bg: 'bg-sf-accent/5', text: 'text-sf-accent' },
  Threat: { border: 'border-sev-warning/30', bg: 'bg-sev-warning/5', text: 'text-sev-warning' },
};

const HIGHLIGHTS = [
  {
    icon: '🧠',
    bg: 'bg-purple-500/20',
    title: 'AI-Powered Insights',
    desc: 'Advanced AI model analyzes your org data to deliver expert-level assessments.',
  },
  {
    icon: '🛡️',
    bg: 'bg-green-500/20',
    title: 'Secure & Private',
    desc: 'Your data stays in your environment. No code, metadata, or PII is stored.',
  },
  {
    icon: '🎯',
    bg: 'bg-blue-500/20',
    title: 'Actionable Recommendations',
    desc: 'Get prioritized recommendations, quick wins, and a strategic roadmap.',
  },
];

const FORMAT_OPTIONS = [
  {
    id: 'interactive' as const,
    icon: '🖥',
    label: 'Interactive Report + PDF',
    desc: 'Web report with interactive dashboards and PDF export.',
  },
  {
    id: 'pdf' as const,
    icon: '📄',
    label: 'PDF Report',
    desc: 'Comprehensive PDF report for presentations.',
  },
  {
    id: 'html' as const,
    icon: '</>',
    label: 'HTML Report',
    desc: 'HTML report for sharing and embedding.',
  },
];

const FEATURE_COLORS = [
  'bg-blue-500/15',
  'bg-purple-500/15',
  'bg-green-500/15',
  'bg-orange-500/15',
  'bg-pink-500/15',
  'bg-teal-500/15',
];

const FEATURES = [
  {
    icon: '📄',
    title: 'Executive Summary',
    desc: 'High-level overview with key insights, risks, and priorities.',
  },
  {
    icon: '🏛️',
    title: 'Architecture Review',
    desc: 'In-depth review of architecture patterns, design, and maturity.',
  },
  {
    icon: '🛡️',
    title: 'Security Assessment',
    desc: 'Security posture, access controls, compliance, and vulnerability review.',
  },
  {
    icon: '💻',
    title: 'Code Quality Review',
    desc: 'Code quality, best practices, complexity, and technical debt analysis.',
  },
  {
    icon: '🗄️',
    title: 'Data Model Review',
    desc: 'Data model analysis, LDV risks, relationships, and modeling best practices.',
  },
  {
    icon: '🚀',
    title: 'Performance Review',
    desc: 'Performance bottlenecks, governor limits, scalability, and optimization areas.',
  },
  {
    icon: '⚙️',
    title: 'Automation Review',
    desc: 'Flows, processes, triggers, scheduled jobs, and automation effectiveness.',
  },
  {
    icon: '🔗',
    title: 'Integration Review',
    desc: 'Integration patterns, APIs, callouts, and middleware assessment.',
  },
  {
    icon: '⭐',
    title: 'License & Feature Review',
    desc: 'License utilization, feature adoption, and optimization opportunities.',
  },
  {
    icon: '⚠️',
    title: 'Technical Debt Analysis',
    desc: 'Technical debt, code smells, complexity hotspots, and refactoring opportunities.',
  },
  {
    icon: '🚨',
    title: 'Risks & Issues',
    desc: 'Risk assessment, critical issues, and impact analysis.',
  },
  {
    icon: '⚡',
    title: 'Quick Wins',
    desc: 'High-impact, low-effort recommendations for immediate improvement.',
  },
  {
    icon: '☁️',
    title: 'AI & Platform Readiness',
    desc: 'Readiness for AI, Agentforce, Data Cloud, and platform modernization.',
  },
  {
    icon: '🗺️',
    title: 'Roadmap & Recommendations',
    desc: 'Prioritized roadmap with timeline, initiatives, and strategic recommendations.',
  },
  {
    icon: '📈',
    title: 'Historical Trend Analysis',
    desc: 'Trend analysis, score comparison, and improvement trajectory.',
  },
  {
    icon: '🔍',
    title: 'Visual Diagrams & Maps',
    desc: 'Architecture diagrams, data maps, dependency graphs, and heatmaps.',
  },
  {
    icon: '💬',
    title: 'Executive Talking Points',
    desc: 'Key talking points, strengths, risks, and recommendations for stakeholders.',
  },
  {
    icon: '📋',
    title: 'Technical Appendix',
    desc: 'Detailed findings, rule evidence, and supporting documentation.',
  },
];

const REVIEW_INFO_ROWS = [
  { icon: '📅', bg: 'bg-blue-500/20', label: 'Source Scan' },
  { icon: '📡', bg: 'bg-green-500/20', label: 'Scan Coverage' },
  { icon: '🏢', bg: 'bg-orange-500/20', label: 'Org Complexity' },
  { icon: '📄', bg: 'bg-purple-500/20', label: 'Estimated Report Length' },
  { icon: '🤖', bg: 'bg-pink-500/20', label: 'Generated By' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(d: Date | string | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString();
  } catch {
    return '—';
  }
}

function fmtDate(d: Date | string | undefined): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

// ── Report HTML generator (pure — no React, no side effects) ─────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scoreColor(pct: number): string {
  if (pct >= 80) return '#22c55e';
  if (pct >= 60) return '#f59e0b';
  return '#ef4444';
}

function generateCtaReportHtml(review: CTAReviewType, orgAlias: string): string {
  const ts = (() => {
    try {
      return new Date(review.generatedAt).toLocaleString();
    } catch {
      return review.generatedAt;
    }
  })();

  const verdictStyle =
    review.verdict === 'Go'
      ? 'color:#16a34a;border:2px solid #16a34a;background:#f0fdf4'
      : review.verdict === 'Conditional Go'
        ? 'color:#b45309;border:2px solid #d97706;background:#fffbeb'
        : 'color:#dc2626;border:2px solid #dc2626;background:#fef2f2';

  const verdictAccent =
    review.verdict === 'Go'
      ? '#22c55e'
      : review.verdict === 'Conditional Go'
        ? '#f59e0b'
        : '#ef4444';

  // Health score rows + radar chart
  const scoreBars = (review.healthScoreBreakdown ?? [])
    .map((item) => {
      const pct = Math.round((item.score / item.maxScore) * 100);
      const color = scoreColor(pct);
      const trendIcon = item.trend === 'improving' ? '↑' : item.trend === 'declining' ? '↓' : '→';
      const trendColor =
        item.trend === 'improving' ? '#22c55e' : item.trend === 'declining' ? '#ef4444' : '#94a3b8';
      return `<tr>
      <td style="padding:9px 12px;font-size:13px;color:#1e293b;white-space:nowrap">${esc(item.area)}</td>
      <td style="padding:9px 12px;width:200px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:8px;border-radius:4px;background:#e2e8f0;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${color}"></div>
          </div>
          <span style="font-size:13px;font-weight:700;color:${color};min-width:28px">${pct}</span>
          <span style="font-size:13px;color:${trendColor}">${trendIcon}</span>
        </div>
      </td>
      <td style="padding:9px 12px;font-size:12px;color:#64748b">${esc(item.keyFinding)}</td>
    </tr>`;
    })
    .join('');

  const radarChart = (() => {
    const items = review.healthScoreBreakdown;
    if (!items || items.length === 0) return '';
    const cx = 150,
      cy = 150,
      r = 105;
    const n = Math.min(items.length, 7);
    const pts = items.slice(0, n);
    const ang = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
    const ax = (i: number, s = 1): [number, number] => [
      cx + r * s * Math.cos(ang(i)),
      cy + r * s * Math.sin(ang(i)),
    ];
    const rings = [0.25, 0.5, 0.75, 1]
      .map((s) => {
        const rp = pts
          .map((_, i) => {
            const [x, y] = ax(i, s);
            return `${x},${y}`;
          })
          .join(' ');
        return `<polygon points="${rp}" fill="none" stroke="#e2e8f0" stroke-width="1"/>`;
      })
      .join('');
    const axes = pts
      .map((_, i) => {
        const [x, y] = ax(i);
        return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`;
      })
      .join('');
    const data = pts
      .map((p, i) => {
        const [x, y] = ax(i, Math.min(p.score / p.maxScore, 1));
        return `${x},${y}`;
      })
      .join(' ');
    const dots = pts
      .map((p, i) => {
        const [x, y] = ax(i, Math.min(p.score / p.maxScore, 1));
        return `<circle cx="${x}" cy="${y}" r="3" fill="#3b82f6"/>`;
      })
      .join('');
    const labels = pts
      .map((p, i) => {
        const [x, y] = ax(i, 1.22);
        const anchor = x > cx + 8 ? 'start' : x < cx - 8 ? 'end' : 'middle';
        return `<text x="${x}" y="${y + 4}" text-anchor="${anchor}" font-size="10" fill="#64748b">${esc(p.area)}</text>`;
      })
      .join('');
    return `<svg width="300" height="300" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
      ${rings}${axes}
      <polygon points="${data}" fill="#3b82f625" stroke="#3b82f6" stroke-width="2"/>
      ${dots}${labels}
    </svg>`;
  })();

  // Domain findings
  const domainRows = review.domainFindings
    .map((d) => {
      const bs =
        d.status === 'Pass'
          ? 'background:#dcfce7;color:#16a34a'
          : d.status === 'Warning'
            ? 'background:#fef9c3;color:#b45309'
            : 'background:#fee2e2;color:#dc2626';
      const risks = d.risks
        .map(
          (r) =>
            `<li style="color:#b45309;font-size:12px;margin-bottom:4px;display:flex;gap:6px"><span>⚠</span>${esc(r)}</li>`
        )
        .join('');
      const recs = d.recommendations
        .map(
          (r) =>
            `<li style="color:#3b82f6;font-size:12px;margin-bottom:4px;display:flex;gap:6px"><span>→</span>${esc(r)}</li>`
        )
        .join('');
      return `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <strong style="font-size:14px;color:#1e293b">${esc(d.domain)}</strong>
        <span style="${bs};padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600">${esc(d.status)}</span>
      </div>
      <p style="font-size:13px;color:#475569;line-height:1.6;margin-bottom:${risks ? '10px' : '0'}">${esc(d.analysis)}</p>
      ${risks ? `<ul style="list-style:none;padding:0;margin-bottom:${recs ? '8px' : '0'}">${risks}</ul>` : ''}
      ${recs ? `<ul style="list-style:none;padding:0">${recs}</ul>` : ''}
    </div>`;
    })
    .join('');

  // Top critical issues
  const criticalIssueHtml = (review.topCriticalIssues ?? [])
    .map((issue) => {
      const sc = issue.severity === 'Critical' ? '#dc2626' : '#b45309';
      return `<div style="border:1px solid ${sc}25;border-radius:8px;padding:14px;margin-bottom:10px;background:${sc}05">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
        <span style="background:${sc}20;color:${sc};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">#${issue.rank} ${esc(issue.severity)}</span>
        <strong style="font-size:13px;color:#1e293b">${esc(issue.title)}</strong>
        <span style="font-size:11px;color:#94a3b8;margin-left:auto">${esc(issue.domain)}</span>
      </div>
      <p style="font-size:12px;color:#64748b;margin-bottom:4px"><strong>Impact:</strong> ${esc(issue.impact)}</p>
      <p style="font-size:12px;color:#64748b;margin-bottom:4px"><strong>Remediation:</strong> ${esc(issue.remediation)}</p>
      <p style="font-size:11px;color:#94a3b8">Effort: ${esc(issue.effortEstimate)}</p>
    </div>`;
    })
    .join('');

  // Risk heatmap
  const heatmapRows = (review.riskAnalysis?.riskHeatmap ?? [])
    .map((cell) => {
      const lc =
        cell.likelihood === 'High'
          ? '#dc2626'
          : cell.likelihood === 'Medium'
            ? '#f59e0b'
            : '#22c55e';
      const ic =
        cell.impact === 'High' ? '#dc2626' : cell.impact === 'Medium' ? '#f59e0b' : '#22c55e';
      return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b">${esc(cell.domain)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center"><span style="background:${lc}20;color:${lc};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">${esc(cell.likelihood)}</span></td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center"><span style="background:${ic}20;color:${ic};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">${esc(cell.impact)}</span></td>
    </tr>`;
    })
    .join('');

  // Quick wins
  const quickWinHtml = (review.recommendations?.quickWins ?? [])
    .map(
      (w) =>
        `<li style="display:flex;gap:10px;align-items:flex-start;padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:8px">
      <span style="color:#16a34a;font-size:16px;line-height:1;flex-shrink:0">✓</span>
      <div>
        <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:2px">${esc(w.action)}</div>
        <div style="font-size:12px;color:#64748b">Effort: ${esc(w.effort)} · ${esc(w.impact)}</div>
      </div>
    </li>`
    )
    .join('');

  // Strategic initiatives
  const strategicHtml = (review.recommendations?.strategic ?? [])
    .map(
      (s) =>
        `<li style="display:flex;gap:10px;align-items:flex-start;padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:8px">
      <span style="color:#3b82f6;font-size:16px;line-height:1;flex-shrink:0">→</span>
      <div>
        <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:2px">${esc(s.action)}</div>
        <div style="font-size:12px;color:#64748b">Timeline: ${esc(s.timeline)} · Effort: ${esc(s.effort)}</div>
        ${s.impact ? `<div style="font-size:12px;color:#64748b;margin-top:2px">${esc(s.impact)}</div>` : ''}
      </div>
    </li>`
    )
    .join('');

  // SWOT grid for architecture observations
  const swotColors: Record<string, string> = {
    Strength: '#22c55e',
    Weakness: '#ef4444',
    Opportunity: '#3b82f6',
    Threat: '#f59e0b',
  };
  const swotGroups: Record<string, string[]> = {
    Strength: [],
    Weakness: [],
    Opportunity: [],
    Threat: [],
  };
  (review.architectureObservations ?? []).forEach((o) => {
    if (swotGroups[o.classification]) swotGroups[o.classification].push(o.observation);
  });
  const swotGrid = Object.entries(swotGroups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => {
      const color = swotColors[label] ?? '#64748b';
      return `<div style="padding:16px;background:${color}0d;border:1px solid ${color}30;border-radius:8px">
      <div style="font-size:11px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">${label}</div>
      <ul style="list-style:none;padding:0">${items.map((i) => `<li style="font-size:12px;color:#475569;margin-bottom:4px;display:flex;gap:6px"><span style="color:${color};flex-shrink:0">•</span>${esc(i)}</li>`).join('')}</ul>
    </div>`;
    })
    .join('');

  // Benchmark comparison
  const benchmarkRows = (review.benchmarkComparison ?? [])
    .map((b) => {
      const sc = b.status === 'Above' ? '#22c55e' : b.status === 'At' ? '#3b82f6' : '#ef4444';
      const sl = b.status === 'Above' ? '↑ Above' : b.status === 'At' ? '= At' : '↓ Below';
      return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b">${esc(b.metric)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:13px;font-weight:600;color:#1e293b">${esc(b.orgValue)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:13px;color:#64748b">${esc(b.industryAvg)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:13px;color:#64748b">${esc(b.topQuartile)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center"><span style="color:${sc};font-size:12px;font-weight:600">${sl}</span></td>
    </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>OrgPulse Advisory — ${esc(orgAlias)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#1e293b;line-height:1.6}
    .page{max-width:960px;margin:0 auto;padding:40px 24px}
    h2{font-size:15px;font-weight:600;color:#1e293b;margin:0 0 14px}
    table{border-collapse:collapse;width:100%}
    th{padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e2e8f0;background:#f8fafc}
    .card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:24px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
    @media print{
      body{background:#fff}
      .card,.no-print-bg{box-shadow:none!important}
      .no-print{display:none!important}
      .header{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header / Cover -->
  <div class="header" style="background:linear-gradient(135deg,#1e3a5f 0%,#1d4ed8 100%);border-radius:14px;padding:32px;margin-bottom:24px;color:#fff">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px">
      <div>
        <div style="font-size:12px;font-weight:700;color:#93c5fd;letter-spacing:.1em;margin-bottom:6px">ORGPULSE ADVISORY</div>
        <div style="font-size:26px;font-weight:800;color:#fff;margin-bottom:8px">Architecture Assessment Report</div>
        <div style="font-size:14px;color:#bfdbfe;margin-bottom:4px">${esc(orgAlias)} · Generated ${esc(ts)}</div>
        <div style="font-size:12px;color:#93c5fd">AI Model: ${esc(review.modelUsed)}</div>
      </div>
      <div style="text-align:center">
        <div style="display:inline-flex;align-items:center;justify-content:center;padding:14px 28px;border-radius:12px;${verdictStyle};font-size:22px;font-weight:800">
          ${esc(review.verdict)}
        </div>
        <div style="margin-top:6px;font-size:11px;color:#93c5fd;text-transform:uppercase;letter-spacing:.05em">Verdict</div>
      </div>
    </div>
  </div>

  <!-- Executive Summary -->
  <div class="card" style="border-left:4px solid #3b82f6">
    <h2>Executive Summary</h2>
    <p style="font-size:14px;color:#475569;line-height:1.7">${esc(review.executiveSummary)}</p>
  </div>

  <!-- Architecture Maturity + Org Profile -->
  ${
    review.architectureMaturity || review.orgProfile
      ? `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
    ${
      review.architectureMaturity
        ? `
    <div class="card" style="border-left:4px solid #8b5cf6">
      <h2>Architecture Maturity</h2>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <span style="font-size:42px;font-weight:800;color:#8b5cf6;line-height:1">${review.architectureMaturity.level}</span>
        <span style="font-size:20px;color:#94a3b8">/5</span>
        <strong style="font-size:15px;color:#1e293b">${esc(review.architectureMaturity.label)}</strong>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:12px">
        ${Array.from(
          { length: 5 },
          (_, i) =>
            `<div style="width:26px;height:26px;border-radius:50%;border:2px solid ${i < review.architectureMaturity!.level ? '#8b5cf6' : '#e2e8f0'};background:${i < review.architectureMaturity!.level ? '#8b5cf6' : 'transparent'}"></div>`
        ).join('')}
      </div>
      <p style="font-size:13px;color:#64748b;line-height:1.6">${esc(review.architectureMaturity.summary)}</p>
    </div>`
        : '<div></div>'
    }
    ${
      review.orgProfile
        ? `
    <div class="card" style="border-left:4px solid #06b6d4">
      <h2>Org Profile</h2>
      <dl style="display:grid;row-gap:10px">
        ${[
          ['Complexity', review.orgProfile.complexity],
          ['User Scale', review.orgProfile.userScale],
          ['Integration', review.orgProfile.integrationFootprint],
          ['Customization', review.orgProfile.customizationLevel],
        ]
          .map(
            ([l, v]) =>
              `<div><dt style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">${l}</dt><dd style="font-size:13px;color:#1e293b;font-weight:500;margin-top:2px">${esc(v)}</dd></div>`
          )
          .join('')}
      </dl>
    </div>`
        : '<div></div>'
    }
  </div>`
      : ''
  }

  <!-- Business Impact -->
  ${
    review.businessImpactSummary
      ? `
  <div class="card" style="border-left:4px solid #ef4444">
    <h2>Business Impact</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:12px">
      ${[
        { l: 'Revenue Risk', v: review.businessImpactSummary.revenueRisk, c: '#ef4444' },
        { l: 'Operational Risk', v: review.businessImpactSummary.operationalRisk, c: '#f59e0b' },
        { l: 'Compliance Risk', v: review.businessImpactSummary.complianceRisk, c: '#8b5cf6' },
      ]
        .map(
          ({ l, v, c }) =>
            `<div style="padding:14px;background:${c}08;border:1px solid ${c}20;border-radius:8px"><div style="font-size:11px;font-weight:600;color:${c};text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">${l}</div><div style="font-size:13px;color:#1e293b;line-height:1.5">${esc(v)}</div></div>`
        )
        .join('')}
    </div>
    <div style="padding:8px 12px;background:#f8fafc;border-radius:6px;font-size:12px;color:#64748b">
      Overall Severity: <strong style="color:#1e293b">${esc(review.businessImpactSummary.overallSeverity)}</strong>
    </div>
  </div>`
      : ''
  }

  <!-- Health Score Breakdown + Radar Chart -->
  ${
    (review.healthScoreBreakdown ?? []).length > 0
      ? `
  <div class="card" style="border-left:4px solid #22c55e">
    <h2>Health Score Breakdown</h2>
    <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">
      <div style="flex:1;min-width:260px">
        <table>
          <thead><tr><th>Area</th><th>Score</th><th>Key Finding</th></tr></thead>
          <tbody>${scoreBars}</tbody>
        </table>
      </div>
      ${radarChart ? `<div style="flex-shrink:0">${radarChart}</div>` : ''}
    </div>
  </div>`
      : ''
  }

  <!-- Risk Analysis -->
  ${
    review.riskAnalysis
      ? `
  <div class="card" style="border-left:4px solid #f59e0b">
    <h2>Risk Analysis</h2>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:${heatmapRows ? '16px' : '0'}">
      <div style="padding:12px 16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px">
        <div style="font-size:11px;color:#9a3412;text-transform:uppercase;font-weight:600;margin-bottom:4px">Probability of Incident</div>
        <div style="font-size:15px;font-weight:700;color:#1e293b">${esc(review.riskAnalysis.probabilityOfIncident)}</div>
      </div>
      <div style="padding:12px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px">
        <div style="font-size:11px;color:#991b1b;text-transform:uppercase;font-weight:600;margin-bottom:4px">Time to Risk</div>
        <div style="font-size:15px;font-weight:700;color:#1e293b">${esc(review.riskAnalysis.timeToRisk)}</div>
      </div>
    </div>
    ${
      heatmapRows
        ? `
    <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Risk Heatmap</div>
    <table><thead><tr><th>Domain</th><th style="text-align:center">Likelihood</th><th style="text-align:center">Impact</th></tr></thead><tbody>${heatmapRows}</tbody></table>`
        : ''
    }
  </div>`
      : ''
  }

  <!-- Top Critical Issues -->
  ${
    criticalIssueHtml
      ? `
  <div class="card" style="border-left:4px solid #dc2626">
    <h2>Top Critical Issues</h2>
    ${criticalIssueHtml}
  </div>`
      : ''
  }

  <!-- Domain Findings -->
  ${
    review.domainFindings.length > 0
      ? `
  <div class="card" style="border-left:4px solid #06b6d4">
    <h2>Domain Findings</h2>
    ${domainRows}
  </div>`
      : ''
  }

  <!-- Benchmark Comparison -->
  ${
    benchmarkRows
      ? `
  <div class="card" style="border-left:4px solid #3b82f6">
    <h2>Benchmark Comparison</h2>
    <table>
      <thead><tr><th>Metric</th><th style="text-align:center">Your Org</th><th style="text-align:center">Industry Avg</th><th style="text-align:center">Top Quartile</th><th style="text-align:center">Status</th></tr></thead>
      <tbody>${benchmarkRows}</tbody>
    </table>
  </div>`
      : ''
  }

  <!-- Quick Wins -->
  ${
    quickWinHtml
      ? `
  <div class="card" style="border-left:4px solid #22c55e">
    <h2>⚡ Quick Wins</h2>
    <ul style="list-style:none;padding:0">${quickWinHtml}</ul>
  </div>`
      : ''
  }

  <!-- Strategic Initiatives -->
  ${
    strategicHtml
      ? `
  <div class="card" style="border-left:4px solid #3b82f6">
    <h2>🗺️ Strategic Initiatives</h2>
    <ul style="list-style:none;padding:0">${strategicHtml}</ul>
  </div>`
      : ''
  }

  <!-- AI Insights -->
  ${
    review.aiInsights
      ? `
  <div class="card" style="border-left:4px solid #8b5cf6">
    <h2>🤖 AI Insights</h2>
    ${
      review.aiInsights.hiddenRisks.length > 0
        ? `
    <div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Hidden Risks</div>
      <ul style="list-style:none;padding:0">${review.aiInsights.hiddenRisks.map((r) => `<li style="font-size:13px;color:#475569;margin-bottom:6px;display:flex;gap:8px"><span style="color:#8b5cf6;flex-shrink:0">•</span>${esc(r)}</li>`).join('')}</ul>
    </div>`
        : ''
    }
    ${
      review.aiInsights.predictions.length > 0
        ? `
    <div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Predictions</div>
      <ul style="list-style:none;padding:0">${review.aiInsights.predictions.map((p) => `<li style="font-size:13px;color:#475569;margin-bottom:6px;display:flex;gap:8px"><span style="color:#3b82f6;flex-shrink:0">→</span>${esc(p)}</li>`).join('')}</ul>
    </div>`
        : ''
    }
    ${
      (review.aiInsights.unusualPatterns ?? []).length > 0
        ? `
    <div>
      <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Unusual Patterns</div>
      <ul style="list-style:none;padding:0">${(review.aiInsights.unusualPatterns ?? []).map((p) => `<li style="font-size:13px;color:#475569;margin-bottom:6px;display:flex;gap:8px"><span style="color:#f59e0b;flex-shrink:0">!</span>${esc(p)}</li>`).join('')}</ul>
    </div>`
        : ''
    }
  </div>`
      : ''
  }

  <!-- Architecture Observations (SWOT) -->
  ${
    swotGrid
      ? `
  <div class="card" style="border-left:4px solid #06b6d4">
    <h2>Architecture Observations</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${swotGrid}</div>
  </div>`
      : ''
  }

  <!-- Cost of Inaction -->
  ${
    review.costOfInaction
      ? `
  <div class="card" style="border-left:4px solid #f59e0b">
    <h2>Cost of Inaction</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:${review.costOfInaction.risks.length ? '14px' : '0'}">
      <div style="padding:14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px">
        <div style="font-size:11px;font-weight:600;color:#9a3412;text-transform:uppercase;margin-bottom:6px">Financial Impact</div>
        <div style="font-size:13px;color:#1e293b;line-height:1.5">${esc(review.costOfInaction.financialImpact)}</div>
      </div>
      <div style="padding:14px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px">
        <div style="font-size:11px;font-weight:600;color:#92400e;text-transform:uppercase;margin-bottom:6px">Technical Debt Growth</div>
        <div style="font-size:13px;color:#1e293b;line-height:1.5">${esc(review.costOfInaction.technicalDebtGrowth)}</div>
      </div>
    </div>
    ${review.costOfInaction.risks.length > 0 ? `<ul style="list-style:none;padding:0">${review.costOfInaction.risks.map((r) => `<li style="font-size:13px;color:#b45309;margin-bottom:6px;display:flex;gap:8px"><span style="flex-shrink:0">⚠</span>${esc(r)}</li>`).join('')}</ul>` : ''}
  </div>`
      : ''
  }

  <!-- Final Recommendation -->
  ${
    review.finalRecommendation
      ? `
  <div class="card" style="border-left:4px solid ${verdictAccent}">
    <h2>Final Recommendation</h2>
    <div style="display:inline-flex;align-items:center;padding:8px 20px;border-radius:8px;${verdictStyle};font-size:18px;font-weight:800;margin-bottom:14px">
      ${esc(review.verdict)}
    </div>
    <p style="font-size:14px;color:#475569;line-height:1.7;margin-bottom:${review.finalRecommendation.nextSteps.length > 0 ? '14px' : '0'}">${esc(review.finalRecommendation.summary)}</p>
    ${
      review.finalRecommendation.nextSteps.length > 0
        ? `
    <div style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Next Steps</div>
      <ol style="padding-left:18px;margin:0">${review.finalRecommendation.nextSteps.map((s) => `<li style="font-size:13px;color:#475569;margin-bottom:5px">${esc(s)}</li>`).join('')}</ol>
    </div>`
        : ''
    }
    ${
      review.finalRecommendation.proposedTimeline
        ? `
    <div style="padding:10px 14px;background:#f8fafc;border-radius:6px;font-size:13px;color:#64748b">
      📅 Proposed Timeline: <strong style="color:#1e293b">${esc(review.finalRecommendation.proposedTimeline)}</strong>
    </div>`
        : ''
    }
  </div>`
      : ''
  }

  <!-- Footer -->
  <div style="text-align:center;padding:24px 0;border-top:1px solid #e2e8f0;margin-top:8px">
    <div style="font-size:14px;font-weight:700;color:#3b82f6;margin-bottom:4px">OrgPulse Advisory</div>
    <div style="font-size:12px;color:#94a3b8">Generated by ${esc(review.modelUsed)} · ${esc(ts)}</div>
    <div class="no-print" style="margin-top:14px;padding:10px 18px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;display:inline-block">
      <span style="font-size:12px;color:#1d4ed8">💡 To export as PDF: open in browser then use <strong>File → Print → Save as PDF</strong> (or ⌘P / Ctrl+P)</span>
    </div>
  </div>

</div>
</body>
</html>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CTAReview() {
  const [subTab, setSubTab] = useState<SubTab>('Risk Summary');
  const [selectedFormat, setSelectedFormat] = useState<'interactive' | 'pdf' | 'html'>(
    'interactive'
  );
  const { postMessage } = useVSCode();

  const review = useDashboardStore((s) => s.ctaReview);
  const ctaLoading = useDashboardStore((s) => s.ctaLoading);
  const ctaError = useDashboardStore((s) => s.ctaError);
  const results = useDashboardStore((s) => s.results);

  const copilotAvailable = useAIStore((s) => s.copilotAvailable);
  const claudeAuthorized = useAIStore((s) => s.claudeAuthorized);
  const anyProviderActive = copilotAvailable || claudeAuthorized;

  const handleRun = (force = false) => postMessage({ command: 'runCtaReview', force });
  const handleDownload = () => {
    if (!review) return;
    const orgAlias =
      (results?.orgDetails as Record<string, string> | undefined)?.alias ??
      (results?.orgDetails as Record<string, string> | undefined)?.username ??
      'Salesforce-Org';
    const html = generateCtaReportHtml(review, orgAlias);
    const dateStr = new Date().toISOString().slice(0, 10);
    postMessage({ command: 'exportCtaHtml', html, fileName: `OrgPulse_Advisory_${dateStr}.html` });
  };
  const handleDownloadPdf = () => {
    if (!review) return;
    const orgAlias =
      (results?.orgDetails as Record<string, string> | undefined)?.alias ??
      (results?.orgDetails as Record<string, string> | undefined)?.username ??
      'Salesforce-Org';
    const html = generateCtaReportHtml(review, orgAlias);

    // Hidden srcdoc iframe + contentWindow.print() — opens the native OS print
    // dialog pre-loaded with the styled report so the user can "Save as PDF".
    // No PDF library needed (see requires `frame-src 'self'` in the webview CSP).
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const cleanup = () => {
      if (iframe.parentNode) { document.body.removeChild(iframe); }
    };
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      // print() blocks until the dialog closes in Chromium; this is a safety
      // net in case a host implements it asynchronously instead.
      setTimeout(cleanup, 1000);
    };
    iframe.srcdoc = html;
  };

  // ── Derived scan metadata ─────────────────────────────────────────────────

  const scanDateLabel = useMemo(() => {
    const d = results?.timestamp;
    const s = fmtDate(d);
    return s ? `Full Scan – ${s}` : null;
  }, [results]);

  const scanCoverage = useMemo(() => {
    if (!results) return 0;
    const populated = [
      results.orgDetails,
      results.codeInventory,
      results.automationSummary,
      results.testCoverageSummary,
      results.dataModelStats?.length,
      results.staleMetadata,
      results.userSummary,
      results.licenseSummary?.length,
      results.orgLimits?.length,
      results.issues?.length,
    ].filter(Boolean).length;
    return Math.round((populated / 10) * 100);
  }, [results]);

  const orgComplexity = useMemo((): string | null => {
    if (!results) return null;
    const apex = results.codeInventory?.apexClasses ?? 0;
    const objs = results.dataModelSummary?.customObjectCount ?? 0;
    if (apex >= 400 || objs >= 100) return 'Enterprise';
    if (apex >= 150 || objs >= 50) return 'Large';
    if (apex >= 50 || objs >= 15) return 'Medium';
    return 'Small';
  }, [results]);

  const estimatedPages = useMemo((): number | null => {
    if (!results) return null;
    return Math.min(10 + 15 + Math.ceil((results.issues?.length ?? 0) / 5), 60);
  }, [results]);

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (ctaLoading) return <CTALoadingScene />;

  // ── Shared sub-components (no hooks, safe as inner helpers) ──────────────────

  const renderPageHeader = (showRegenerate: boolean) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-base font-semibold text-sf-text">
            OrgPulse Advisory <span className="text-sf-accent">✨</span>
          </h1>
          <p className="text-xs text-sf-muted">
            Generate an AI-powered architecture assessment with actionable insights, risks, and
            recommendations.
          </p>
        </div>
        {showRegenerate && (
          <div className="flex shrink-0 items-center gap-2">
            {review && (
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${VERDICT_COLOR[review.verdict] ?? 'border-sf-border text-sf-text'}`}
              >
                {review.verdict}
              </span>
            )}
            <Button size="sm" variant="ghost" onClick={() => handleRun(true)}>
              Run New Assessment
            </Button>
          </div>
        )}
      </div>
      {!showRegenerate && (
        <div className="flex items-center gap-3 rounded-lg border border-sf-accent/30 bg-sf-accent/5 px-4 py-2.5 text-xs">
          <span className="shrink-0 text-base text-sf-accent">ⓘ</span>
          <span className="shrink-0 font-semibold text-sf-accent">Powered by AI</span>
          <span className="leading-relaxed text-sf-muted">
            Uses the latest scan data and historical trends to generate a comprehensive architecture
            assessment. No source code, metadata, or PII is sent to AI.
          </span>
        </div>
      )}
    </div>
  );

  const complexityBadgeVariant =
    orgComplexity === 'Enterprise' || orgComplexity === 'Large' ? 'warning' : 'info';

  const renderRecentAssessments = () => (
    <GlassCard>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-sf-text">4. Recent Assessments</p>
        {review && <span className="text-[10px] text-sf-accent">View all reports →</span>}
      </div>
      {review ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-sf-border">
                {['Report Name', 'Source Scan', 'Model', 'Generated On', 'Status', 'Actions'].map(
                  (h) => (
                    <th
                      key={h}
                      className="pr-4 pb-2 text-left text-[10px] font-medium tracking-wider whitespace-nowrap text-sf-muted uppercase"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2.5 pr-4 whitespace-nowrap">
                  <span className="text-sf-text">
                    OrgPulse Advisory
                    {scanDateLabel ? ` – ${scanDateLabel.replace('Full Scan – ', '')}` : ''}
                  </span>
                  <Badge variant="accent" className="ml-1.5">
                    Latest
                  </Badge>
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-sf-text-2">
                  {scanDateLabel ?? '—'}
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-sf-text-2">{review.modelUsed}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-sf-text-2">
                  {fmtDateTime(review.generatedAt)}
                </td>
                <td className="py-2.5 pr-4">
                  <Badge variant="success">Completed</Badge>
                </td>
                <td className="py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setSubTab('Risk Summary')}>
                      👁 View
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleDownload}>
                      ⬇ HTML
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleDownloadPdf}>
                      🖨 PDF
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No assessments yet"
          description="Run your first OrgPulse Advisory to see it here."
        />
      )}
    </GlassCard>
  );

  // ── Landing page — no review generated yet ────────────────────────────────

  if (!review) {
    return (
      <div className="space-y-5 p-6">
        {renderPageHeader(false)}

        {ctaError && <ModelLimitErrorBanner message={ctaError} onRetry={() => handleRun(false)} />}

        {/* Feature highlights — 20:80 icon/content layout */}
        <div className="grid grid-cols-3 gap-3">
          {HIGHLIGHTS.map((h) => (
            <div
              key={h.title}
              className="flex items-center gap-3 rounded-lg border border-sf-border bg-sf-bg-3 p-3"
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${h.bg}`}
              >
                <span className="text-xl">{h.icon}</span>
              </div>
              <div>
                <p className="mb-0.5 text-xs font-semibold text-sf-text">{h.title}</p>
                <p className="text-[10px] leading-relaxed text-sf-muted">{h.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Configure + Review Information */}
        <div className="grid grid-cols-2 gap-4">
          {/* 1. Configure Assessment */}
          <GlassCard>
            <p className="mb-3 text-sm font-semibold text-sf-text">1. Configure Assessment</p>

            {/* No AI provider nudge */}
            {!anyProviderActive && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-sev-warning/40 bg-sev-warning/5 p-3">
                <span className="shrink-0 text-sm text-sev-warning">⚠</span>
                <p className="text-xs leading-relaxed text-sf-muted">
                  No AI provider connected.{' '}
                  <NavLink to="/settings" className="text-sf-accent hover:underline">
                    Go to Settings
                  </NavLink>{' '}
                  to connect GitHub Copilot or Claude.
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="mb-1.5 block text-[10px] tracking-wider text-sf-muted uppercase">
                Output Format
              </label>
              <div className="grid grid-cols-3 gap-2">
                {FORMAT_OPTIONS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFormat(f.id)}
                    className={`rounded-lg border p-2 text-left transition-colors ${
                      selectedFormat === f.id
                        ? 'border-sf-accent bg-sf-accent/10'
                        : 'border-sf-border bg-sf-bg-3 hover:border-sf-accent/40'
                    }`}
                  >
                    <p className="mb-0.5 text-sm">{f.icon}</p>
                    <p className="text-[10px] leading-tight font-semibold text-sf-text">
                      {f.label}
                    </p>
                    <p className="mt-0.5 text-[9px] leading-tight text-sf-muted">{f.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <Button
              variant="primary"
              className="mb-2 w-full justify-center"
              onClick={() => handleRun(false)}
              disabled={!results}
            >
              🔍 Generate AI Architecture Assessment
            </Button>
            <p className="text-center text-[10px] text-sf-muted">
              {results
                ? 'This may take 1–3 minutes depending on org size and model.'
                : 'Run an org analysis first to enable assessment generation.'}
            </p>
          </GlassCard>

          {/* 2. Review Information */}
          <GlassCard>
            <p className="mb-3 text-sm font-semibold text-sf-text">2. Review Information</p>
            <div className="space-y-3">
              {/* Source Scan */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${REVIEW_INFO_ROWS[0].bg}`}
                  >
                    <span className="text-sm">{REVIEW_INFO_ROWS[0].icon}</span>
                  </div>
                  <span className="text-xs text-sf-muted">{REVIEW_INFO_ROWS[0].label}</span>
                </div>
                <span className="text-xs font-medium text-sf-text">{scanDateLabel ?? '—'}</span>
              </div>

              {/* Scan Coverage */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${REVIEW_INFO_ROWS[1].bg}`}
                    >
                      <span className="text-sm">{REVIEW_INFO_ROWS[1].icon}</span>
                    </div>
                    <span className="text-xs text-sf-muted">{REVIEW_INFO_ROWS[1].label}</span>
                  </div>
                  <span className="text-xs font-medium text-sf-text">
                    {results ? `${scanCoverage}%` : '—'}
                  </span>
                </div>
                {results && (
                  <div className="ml-9 h-2 overflow-hidden rounded-full bg-sf-bg-3">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-green-500 to-emerald-400 transition-all"
                      style={{ width: `${scanCoverage}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Org Complexity */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${REVIEW_INFO_ROWS[2].bg}`}
                  >
                    <span className="text-sm">{REVIEW_INFO_ROWS[2].icon}</span>
                  </div>
                  <span className="text-xs text-sf-muted">{REVIEW_INFO_ROWS[2].label}</span>
                </div>
                {orgComplexity ? (
                  <Badge variant={complexityBadgeVariant}>{orgComplexity}</Badge>
                ) : (
                  <span className="text-xs text-sf-muted">—</span>
                )}
              </div>

              {/* Estimated Report Length */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${REVIEW_INFO_ROWS[3].bg}`}
                  >
                    <span className="text-sm">{REVIEW_INFO_ROWS[3].icon}</span>
                  </div>
                  <span className="text-xs text-sf-muted">{REVIEW_INFO_ROWS[3].label}</span>
                </div>
                <span className="text-xs font-medium text-sf-text">
                  {estimatedPages ? `~${estimatedPages} pages` : '—'}
                </span>
              </div>

              {/* Generated By */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${REVIEW_INFO_ROWS[4].bg}`}
                  >
                    <span className="text-sm">{REVIEW_INFO_ROWS[4].icon}</span>
                  </div>
                  <span className="text-xs text-sf-muted">{REVIEW_INFO_ROWS[4].label}</span>
                </div>
                <span className="text-xs font-medium text-sf-text">OrgPulse AI Engine</span>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* 3. What You'll Get — 20:80 icon/content layout with varied colors */}
        <GlassCard>
          <p className="mb-3 text-sm font-semibold text-sf-text">3. What You'll Get</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="flex items-start gap-2 rounded-lg border border-sf-border bg-sf-bg-3 p-2.5 transition-colors hover:border-sf-accent/40"
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${FEATURE_COLORS[i % FEATURE_COLORS.length]}`}
                >
                  <span className="text-base">{f.icon}</span>
                </div>
                <div className="min-w-0">
                  <p className="mb-0.5 text-[10px] leading-tight font-semibold text-sf-text">
                    {f.title}
                  </p>
                  <p className="text-[9px] leading-relaxed text-sf-muted">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* 4. Recent Assessments */}
        {renderRecentAssessments()}
      </div>
    );
  }

  // ── Results view — review generated ──────────────────────────────────────────

  const verdictClass = VERDICT_COLOR[review.verdict] ?? 'text-sf-text border-sf-border';

  return (
    <div className="space-y-5 p-6">
      {renderPageHeader(true)}

      {ctaError && <ModelLimitErrorBanner message={ctaError} onRetry={() => handleRun(true)} />}

      {/* Sub-tab nav */}
      <div className="flex gap-1 border-b border-sf-border">
        {SUBTABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSubTab(t)}
            className={`border-b-2 px-4 py-2 text-xs transition-colors ${
              subTab === t
                ? 'border-sf-accent font-medium text-sf-text'
                : 'border-transparent text-sf-muted hover:text-sf-text-2'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Risk Summary */}
      {subTab === 'Risk Summary' && (
        <div className="space-y-4">
          <GlassCard title="Executive Summary">
            <p className="text-xs leading-relaxed text-sf-text-2">{review.executiveSummary}</p>
          </GlassCard>

          {(review.healthScoreBreakdown?.length ?? 0) > 0 && (
            <GlassCard title="Health Score Breakdown">
              <div className="flex flex-wrap items-start gap-6">
                <div className="min-w-60 flex-1 space-y-3">
                  {review.healthScoreBreakdown!.map((item) => {
                    const pct = Math.round((item.score / item.maxScore) * 100);
                    const barColor =
                      pct >= 80 ? 'bg-score-good' : pct >= 60 ? 'bg-score-fair' : 'bg-sev-error';
                    const textColor =
                      pct >= 80 ? 'text-score-good' : pct >= 60 ? 'text-score-fair' : 'text-sev-error';
                    const trendIcon =
                      item.trend === 'improving' ? '↑' : item.trend === 'declining' ? '↓' : '→';
                    return (
                      <div key={item.area}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-sf-text">{item.area}</span>
                          <span className="flex items-center gap-1.5">
                            <span className={`font-semibold ${textColor}`}>{pct}</span>
                            <span className="text-sf-muted">{trendIcon}</span>
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-sf-bg-3">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1 text-[10px] leading-snug text-sf-muted">{item.keyFinding}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="w-60 shrink-0">
                  <RadarChart
                    data={review.healthScoreBreakdown!.map((i) => ({
                      subject: i.area,
                      value: Math.round((i.score / i.maxScore) * 100),
                      fullMark: 100,
                    }))}
                    height={220}
                  />
                </div>
              </div>
            </GlassCard>
          )}

          {review.architectureMaturity && (
            <GlassCard title="Architecture Maturity">
              <div className="flex items-center gap-4">
                <div className="text-4xl font-bold text-sf-accent">
                  {review.architectureMaturity.level}
                  <span className="text-lg text-sf-muted">/5</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-sf-text">
                    {review.architectureMaturity.label}
                  </p>
                  <p className="mt-0.5 text-xs text-sf-muted">
                    {review.architectureMaturity.summary}
                  </p>
                </div>
              </div>
            </GlassCard>
          )}

          {review.riskAnalysis && (
            <GlassCard title="Risk Analysis">
              <div className="space-y-2 text-xs">
                <div className="flex gap-6">
                  <div>
                    <span className="text-sf-muted">Probability of Incident: </span>
                    <span className="font-medium text-sf-text">
                      {review.riskAnalysis.probabilityOfIncident}
                    </span>
                  </div>
                  <div>
                    <span className="text-sf-muted">Time to Risk: </span>
                    <span className="font-medium text-sf-text">
                      {review.riskAnalysis.timeToRisk}
                    </span>
                  </div>
                </div>
                {review.riskAnalysis.riskHeatmap.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-[10px] tracking-wider text-sf-muted uppercase">
                      Risk Heatmap
                    </p>
                    <RiskMatrix cells={review.riskAnalysis.riskHeatmap} />
                  </div>
                )}
              </div>
            </GlassCard>
          )}

          {review.businessImpactSummary && (
            <GlassCard title="Business Impact">
              <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
                {[
                  { label: 'Revenue Risk', value: review.businessImpactSummary.revenueRisk },
                  {
                    label: 'Operational Risk',
                    value: review.businessImpactSummary.operationalRisk,
                  },
                  { label: 'Compliance Risk', value: review.businessImpactSummary.complianceRisk },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="mb-0.5 text-sf-muted">{label}</dt>
                    <dd className="leading-snug text-sf-text">{value}</dd>
                  </div>
                ))}
              </dl>
            </GlassCard>
          )}
        </div>
      )}

      {/* Findings */}
      {subTab === 'Findings' && (
        <div className="space-y-3">
          {review.topCriticalIssues?.map((issue) => (
            <div
              key={issue.rank}
              className="space-y-1 rounded-lg border border-sev-error/20 bg-sev-error/5 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-sev-error/20 px-1.5 py-0.5 text-[10px] font-medium text-sev-error">
                  #{issue.rank} {issue.severity}
                </span>
                <span className="text-xs font-medium text-sf-text">{issue.title}</span>
              </div>
              <p className="text-xs leading-relaxed text-sf-muted">{issue.impact}</p>
              <p className="text-xs text-sf-text-2">
                <span className="text-sf-muted">Remediation: </span>
                {issue.remediation}
              </p>
            </div>
          ))}
          {review.domainFindings.map((domain, i) => (
            <GlassCard key={i} title={domain.domain}>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    domain.status === 'Pass'
                      ? 'bg-score-good/20 text-score-good'
                      : domain.status === 'Warning'
                        ? 'bg-sev-warning/20 text-sev-warning'
                        : 'bg-sev-error/20 text-sev-error'
                  }`}
                >
                  {domain.status}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-sf-text-2">{domain.analysis}</p>
              {domain.risks.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {domain.risks.map((r, ri) => (
                    <li key={ri} className="flex gap-1.5 text-xs text-sev-warning">
                      <span>⚠</span>
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>
          ))}
        </div>
      )}

      {/* Architecture */}
      {subTab === 'Architecture' && (
        <div className="space-y-4">
          {review.orgProfile && (
            <GlassCard title="Org Profile">
              <dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                {[
                  { label: 'Complexity', value: review.orgProfile.complexity },
                  { label: 'User Scale', value: review.orgProfile.userScale },
                  { label: 'Integration', value: review.orgProfile.integrationFootprint },
                  { label: 'Customization', value: review.orgProfile.customizationLevel },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="mb-0.5 text-[10px] tracking-wider text-sf-muted uppercase">{label}</dt>
                    <dd className="text-sm leading-snug font-medium text-sf-text">{value}</dd>
                  </div>
                ))}
              </dl>
            </GlassCard>
          )}

          {(review.benchmarkComparison?.length ?? 0) > 0 && (
            <GlassCard title="Benchmark Comparison">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-sf-border">
                      {['Metric', 'Your Org', 'Industry Avg', 'Top Quartile', 'Status'].map((h) => (
                        <th
                          key={h}
                          className="py-2 pr-4 text-left text-[10px] font-medium tracking-wider text-sf-muted uppercase"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {review.benchmarkComparison!.map((b, i) => {
                      const statusColor =
                        b.status === 'Above'
                          ? 'text-score-good'
                          : b.status === 'At'
                            ? 'text-sf-accent'
                            : 'text-sev-error';
                      const statusLabel =
                        b.status === 'Above' ? '↑ Above' : b.status === 'At' ? '= At' : '↓ Below';
                      return (
                        <tr key={i} className="border-b border-sf-border/50">
                          <td className="py-2 pr-4 text-sf-text">{b.metric}</td>
                          <td className="py-2 pr-4 font-semibold text-sf-text">{b.orgValue}</td>
                          <td className="py-2 pr-4 text-sf-muted">{b.industryAvg}</td>
                          <td className="py-2 pr-4 text-sf-muted">{b.topQuartile}</td>
                          <td className={`py-2 pr-4 font-medium ${statusColor}`}>{statusLabel}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          {(review.architectureObservations?.length ?? 0) > 0 && (
            <GlassCard title="Architecture Observations">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(['Strength', 'Weakness', 'Opportunity', 'Threat'] as const).map((cls) => {
                  const items = review.architectureObservations!.filter((o) => o.classification === cls);
                  if (items.length === 0) { return null; }
                  const style = SWOT_STYLE[cls];
                  return (
                    <div key={cls} className={`rounded-lg border p-3 ${style.border} ${style.bg}`}>
                      <p className={`mb-2 text-[10px] font-semibold tracking-wider uppercase ${style.text}`}>
                        {cls}
                      </p>
                      <ul className="space-y-1.5">
                        {items.map((o, i) => (
                          <li key={i} className="flex gap-1.5 text-xs text-sf-text-2">
                            <span className={style.text}>•</span>
                            {o.observation}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          )}

          {(results?.dependencyGraph?.nodes.length ?? 0) > 0 && (
            <GlassCard title="Architecture Map">
              <p className="mb-3 text-[10px] text-sf-muted">
                Top connected components by dependency fan-in/fan-out — Automation → Logic → Data.
              </p>
              <DependencyDiagram graph={results!.dependencyGraph!} />
            </GlassCard>
          )}

          {!review.orgProfile &&
            (review.benchmarkComparison?.length ?? 0) === 0 &&
            (review.architectureObservations?.length ?? 0) === 0 &&
            (results?.dependencyGraph?.nodes.length ?? 0) === 0 && (
              <EmptyState
                title="No architecture details available"
                description="This section populates when the AI report includes org profile, benchmark, or observation data."
              />
            )}
        </div>
      )}

      {/* Recommendations */}
      {subTab === 'Recommendations' && review.recommendations && (
        <div className="space-y-4">
          {review.recommendations.quickWins.length > 0 && (
            <GlassCard title="Quick Wins">
              <ul className="space-y-2">
                {review.recommendations.quickWins.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 shrink-0 text-score-good">✓</span>
                    <div>
                      <span className="font-medium text-sf-text">{w.action}</span>
                      <span className="ml-2 text-sf-muted">· {w.effort} effort</span>
                      {w.impact && <p className="mt-0.5 text-sf-muted">{w.impact}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}
          {review.recommendations.strategic.length > 0 && (
            <GlassCard title="Strategic Initiatives">
              <ul className="space-y-2">
                {review.recommendations.strategic.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 shrink-0 text-sf-accent">→</span>
                    <div>
                      <span className="font-medium text-sf-text">{s.action}</span>
                      <span className="ml-2 text-sf-muted">· {s.timeline}</span>
                      {s.impact && <p className="mt-0.5 text-sf-muted">{s.impact}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}
          {review.aiInsights && (
            <GlassCard title="AI Insights">
              {review.aiInsights.hiddenRisks.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1 text-[10px] tracking-wider text-sf-muted uppercase">
                    Hidden Risks
                  </p>
                  <ul className="space-y-1">
                    {review.aiInsights.hiddenRisks.map((r, i) => (
                      <li key={i} className="text-xs text-sf-text-2">
                        • {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {review.aiInsights.predictions.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] tracking-wider text-sf-muted uppercase">
                    Predictions
                  </p>
                  <ul className="space-y-1">
                    {review.aiInsights.predictions.map((p, i) => (
                      <li key={i} className="text-xs text-sf-text-2">
                        • {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </GlassCard>
          )}
        </div>
      )}

      {/* Verdict */}
      {subTab === 'Verdict' && (
        <div className="space-y-4">
          <GlassCard title="Final Recommendation">
            <div
              className={`mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold ${verdictClass}`}
            >
              {review.verdict}
            </div>
            {review.finalRecommendation && (
              <>
                <p className="text-xs leading-relaxed text-sf-text-2">
                  {review.finalRecommendation.summary}
                </p>
                {review.finalRecommendation.nextSteps.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-[10px] tracking-wider text-sf-muted uppercase">
                      Next Steps
                    </p>
                    <ul className="space-y-1">
                      {review.finalRecommendation.nextSteps.map((s, i) => (
                        <li key={i} className="text-xs text-sf-text-2">
                          • {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {review.finalRecommendation.proposedTimeline && (
                  <p className="mt-2 text-xs text-sf-muted">
                    Timeline: {review.finalRecommendation.proposedTimeline}
                  </p>
                )}
              </>
            )}
          </GlassCard>
          {review.costOfInaction && (
            <GlassCard title="Cost of Inaction">
              <div className="space-y-2 text-xs">
                <p>
                  <span className="text-sf-muted">Financial: </span>
                  <span className="text-sf-text-2">{review.costOfInaction.financialImpact}</span>
                </p>
                <p>
                  <span className="text-sf-muted">Technical Debt Growth: </span>
                  <span className="text-sf-text-2">
                    {review.costOfInaction.technicalDebtGrowth}
                  </span>
                </p>
                {review.costOfInaction.risks.length > 0 && (
                  <ul className="mt-1 space-y-1">
                    {review.costOfInaction.risks.map((r, i) => (
                      <li key={i} className="text-sev-warning">
                        • {r}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {/* Recent Assessments (bottom of results view) */}
      {renderRecentAssessments()}
    </div>
  );
}
