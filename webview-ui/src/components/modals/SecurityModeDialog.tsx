import { useState } from 'react';
import { useUIStore, type SecurityMode } from '@/store/slices/uiStore';
import { useVSCode } from '@/hooks/useVSCode';
import { cn } from '@/lib/cn';
import { SECURITY_MODES } from '@/constants/security';
import { Button } from '@/components/common';

export default function SecurityModeDialog() {
  const [selected, setSelected] = useState<SecurityMode>('standard');
  const [consented, setConsented] = useState(false);
  const setSecurityMode        = useUIStore((s) => s.setSecurityMode);
  const setShowAnalysisDialog  = useUIStore((s) => s.setShowAnalysisDialog);
  const { postMessage } = useVSCode();

  const handleStart = () => {
    if (!consented) return;
    setSecurityMode(selected);
    setShowAnalysisDialog(false);
    postMessage({ command: 'setSecurityMode', mode: selected });
    postMessage({ command: 'runAnalysis', data: { force: true } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-sf-bg-2 border border-sf-border rounded-xl shadow-glass w-full max-w-2xl mx-4 p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-sf-text">Choose Security Mode</h2>
          <p className="text-xs text-sf-muted mt-1">Select how OrgPulse may access your org and AI services.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SECURITY_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelected(m.id)}
              className={cn(
                'text-left p-4 rounded-lg border transition-all space-y-2',
                selected === m.id
                  ? 'border-sf-accent bg-sf-accent/10 shadow-[0_0_0_1px_var(--color-sf-accent)]'
                  : 'border-sf-border hover:border-sf-text-2'
              )}
            >
              <div className="font-medium text-sm text-sf-text">{m.label}</div>
              <div className="text-xs text-sf-muted">{m.desc}</div>
              <ul className="text-xs text-sf-text-2 space-y-0.5 mt-2">
                {m.features.map((f) => (
                  <li key={f} className="flex items-center gap-1">
                    <span className="text-score-good">✓</span> {f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-sf-text cursor-pointer">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            className="accent-sf-accent"
          />
          I understand OrgPulse will access my Salesforce org in <strong>{selected}</strong> mode.
        </label>

        <Button
          variant="primary"
          size="md"
          disabled={!consented}
          onClick={handleStart}
          className="w-full py-2 text-sm rounded-lg font-medium"
        >
          Start Analysis
        </Button>
      </div>
    </div>
  );
}
