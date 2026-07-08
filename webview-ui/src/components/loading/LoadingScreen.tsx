import { useEffect, useRef, useState } from 'react';
import type { ProgressData } from '@/store/dashboardStore';
import { useVSCode } from '@/hooks/useVSCode';

// ── Data ──────────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 20;

const ALL_STEPS = [
  'Connecting to Salesforce org',
  'Fetching Apex classes & triggers',
  'Running Salesforce Code Analyzer',
  'Analysing Apex quality',
  'Analysing SOQL queries',
  'Analysing automation complexity',
  'Analysing data model',
  'Fetching test coverage',
  'Analysing permissions & security',
  'Analysing integrations',
  'Scanning governor limit risks',
  'Analysing LWC components',
  'Calculating technical debt',
  'Fetching Scale Center metrics',
  'Building dependency graph',
  'Running plugins',
  'Calculating health scores',
  'Analysing user governance',
  'Analysing profile security',
  'Scanning stale metadata',
];

// Two messages per step-band of 2 steps
const MSG_GROUPS: string[][] = [
  ['Connecting to your org…',        'Authenticating with Salesforce CLI…'],
  ['Reading your codebase…',         'Fetching Apex classes & triggers…'],
  ['Running static analysis…',       'Detecting SOQL inside loops…'],
  ['Reviewing automation stack…',    'Mapping flow complexity…'],
  ['Examining data model…',          'Checking field limit exposure…'],
  ['Auditing security posture…',     'Reviewing profile permissions…'],
  ['Measuring governor risk…',       'Scanning LWC components…'],
  ['Calculating technical debt…',    'Building dependency graph…'],
  ['Evaluating integrations…',       'Fetching org limits…'],
  ['Computing health scores…',       'Preparing your report…'],
];

const INSIGHT_TIPS: string[] = [
  '💡 OrgPulse checks <strong>17 dimensions</strong> of org health in parallel',
  '💡 Governor risk analysis inspects every Apex class for loop-based SOQL',
  '💡 CTA-tier architecture scoring compares your org against enterprise benchmarks',
  '💡 Dependency graph maps all cross-object and Apex relationships',
  '💡 Stale metadata scan identifies unused fields and reports older than 180 days',
  '💡 Test coverage check flags classes below the 75% Salesforce minimum',
];

function formatElapsed(secs: number): string {
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

// ── Shield SVG ────────────────────────────────────────────────────────────────

function ShieldLogo() {
  return (
    <>
      <style>{`
        .op-shield-wrap {
          filter:
            drop-shadow(0 0 18px rgba(1,118,211,.55))
            drop-shadow(0 0 36px rgba(109,40,217,.25));
          animation: op-shield-breathe 3s ease-in-out infinite;
        }
        .op-ecg-line {
          fill: none;
          stroke: rgba(255,255,255,0.92);
          stroke-width: 3;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 280;
          stroke-dashoffset: 280;
          animation: op-ecg-draw 2s ease-in-out infinite;
          filter: drop-shadow(0 0 4px rgba(56,189,248,1));
        }
        @keyframes op-ecg-draw {
          0%   { stroke-dashoffset: 280;  opacity: 0;    }
          8%   {                          opacity: 1;    }
          58%  { stroke-dashoffset: 0;    opacity: 1;    }
          78%  { stroke-dashoffset: 0;    opacity: 0.55; }
          100% { stroke-dashoffset: -280; opacity: 0;    }
        }
        @keyframes op-shield-breathe {
          0%,100% { transform: scale(1);    filter: drop-shadow(0 0 18px rgba(1,118,211,.55)) drop-shadow(0 0 36px rgba(109,40,217,.25)); }
          50%     { transform: scale(1.06); filter: drop-shadow(0 0 28px rgba(1,118,211,.75)) drop-shadow(0 0 56px rgba(109,40,217,.4)); }
        }
      `}</style>
      <div className="op-shield-wrap" style={{ position: 'relative', marginBottom: 4 }}>
        <svg
          viewBox="0 0 100 115"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: 140, height: 158, overflow: 'visible' }}
        >
          <defs>
            <linearGradient id="op-sg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="#38bdf8" />
              <stop offset="50%"  stopColor="#0176d3" />
              <stop offset="100%" stopColor="#6d28d9" />
            </linearGradient>
            <clipPath id="op-shieldClip">
              <path d="M50 4 L92 18 L92 56 Q92 85 50 111 Q8 85 8 56 L8 18 Z" />
            </clipPath>
          </defs>
          {/* Shield body */}
          <path
            d="M50 4 L92 18 L92 56 Q92 85 50 111 Q8 85 8 56 L8 18 Z"
            fill="url(#op-sg)"
            stroke="rgba(255,255,255,.18)"
            strokeWidth="1"
          />
          {/* ECG line clipped inside shield */}
          <g clipPath="url(#op-shieldClip)">
            <polyline
              className="op-ecg-line"
              points="6,58 18,58 25,38 32,78 39,22 46,88 52,58 60,58 66,50 72,66 78,58 96,58"
            />
          </g>
        </svg>
      </div>
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  progressData: ProgressData | null;
}

export default function LoadingScreen({ progressData }: Props) {
  const { postMessage } = useVSCode();

  const step = Math.min(progressData?.step ?? 0, TOTAL_STEPS);
  const pct  = Math.round((step / TOTAL_STEPS) * 100);

  // Elapsed timer
  const startRef              = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // AI message cycling within the current step-band
  const bandIdx                  = Math.min(Math.floor(step / 2), MSG_GROUPS.length - 1);
  const msgs                     = MSG_GROUPS[bandIdx];
  const [msgIdx, setMsgIdx]      = useState(0);
  const [msgKey, setMsgKey]      = useState(0);
  useEffect(() => {
    setMsgIdx(0);
    setMsgKey((k) => k + 1);
  }, [bandIdx]);
  useEffect(() => {
    const id = setInterval(() => {
      setMsgIdx((i) => (i + 1) % msgs.length);
      setMsgKey((k) => k + 1);
    }, 3500);
    return () => clearInterval(id);
  }, [msgs]);

  // Insight tip cycling
  const [tipIdx, setTipIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTipIdx((i) => (i + 1) % INSIGHT_TIPS.length), 6000);
    return () => clearInterval(id);
  }, []);

  // Collapsible details
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-sf-bg/95 backdrop-blur-sm px-4">
      <div className="flex flex-col items-center w-full max-w-sm gap-5">

        {/* Shield logo */}
        <ShieldLogo />

        {/* AI message */}
        <p
          key={msgKey}
          className="text-sm font-medium text-sf-text text-center"
          style={{ animation: 'msgFadeIn 0.4s ease both' }}
        >
          {msgs[msgIdx]}
        </p>

        {/* Progress bar */}
        <div className="w-full space-y-1.5">
          <div className="relative h-1.5 bg-sf-bg-3 rounded-full overflow-visible">
            <div
              className="h-full rounded-full transition-all duration-500 relative"
              style={{
                width: `${pct}%`,
                background: 'linear-gradient(90deg, #0176d3, #38bdf8, #0176d3)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 2s linear infinite',
              }}
            >
              {/* Glow orb at leading edge */}
              {pct > 0 && (
                <span
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-sf-accent"
                  style={{ animation: 'glowPulse 1.5s ease-in-out infinite', boxShadow: '0 0 8px #38bdf8, 0 0 16px #38bdf850' }}
                />
              )}
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-sf-accent font-semibold tabular-nums">{pct}%</span>
            <span className="text-sf-muted tabular-nums">⏱ {formatElapsed(elapsed)}</span>
            <button
              type="button"
              onClick={() => postMessage({ command: 'cancelAnalysis' })}
              className="text-sf-muted hover:text-sev-error transition-colors"
            >
              ✕ Cancel
            </button>
          </div>
        </div>

        {/* Insight tip card */}
        <div
          key={tipIdx}
          className="w-full px-3 py-2.5 rounded-lg border border-sf-accent/20 bg-sf-accent/5 text-[11px] text-sf-text-2 leading-relaxed"
          style={{ animation: 'insightUp 0.5s ease both' }}
          dangerouslySetInnerHTML={{ __html: INSIGHT_TIPS[tipIdx] }}
        />

        {/* Collapsible technical details */}
        <div className="w-full">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-sf-muted hover:text-sf-text transition-colors"
          >
            <span style={{ display: 'inline-block', transform: showDetails ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>▶</span>
            {showDetails ? 'Hide' : 'View'} technical details
          </button>

          {showDetails && (
            <ol className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
              {ALL_STEPS.map((s, i) => (
                <li key={s} className={`flex items-center gap-1.5 text-[11px] py-0.5 ${
                  i < step  ? 'text-score-good' :
                  i === step ? 'text-sf-accent font-medium' :
                  'text-sf-muted'
                }`}>
                  <span className="w-3 shrink-0 text-center text-[10px]">
                    {i < step ? '✓' : i === step ? '●' : '○'}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
