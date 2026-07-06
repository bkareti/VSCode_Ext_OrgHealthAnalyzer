import { useState } from 'react';
import { useVSCode } from '@/hooks/useVSCode';
import { cn } from '@/lib/cn';
import { EXPORT_FORMATS, type ExportFormat } from '@/constants/export';
import { Button } from '@/components/common';

interface Props {
  onClose: () => void;
}

export default function ExportModal({ onClose }: Props) {
  const [format, setFormat]     = useState<ExportFormat>('html');
  const [fileName, setFileName] = useState('');
  const { postMessage }         = useVSCode();

  const handleExport = () => {
    postMessage({ command: 'exportReport', format, fileName: fileName || undefined });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-sf-bg-2 border border-sf-border rounded-xl shadow-glass w-full max-w-md mx-4 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-sf-text">Export Report</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sf-muted hover:text-sf-text text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-2">
          {EXPORT_FORMATS.map((f) => (
            <label
              key={f.id}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                format === f.id
                  ? 'border-sf-accent bg-sf-accent/10'
                  : 'border-sf-border hover:border-sf-text-2'
              )}
            >
              <input
                type="radio"
                name="export-format"
                value={f.id}
                checked={format === f.id}
                onChange={() => setFormat(f.id)}
                className="mt-0.5 accent-sf-accent"
              />
              <div>
                <div className="text-xs font-medium text-sf-text">{f.label}</div>
                <div className="text-xs text-sf-muted">{f.desc}</div>
              </div>
            </label>
          ))}
        </div>

        <input
          type="text"
          placeholder="File name (optional)"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          className="w-full px-3 py-1.5 text-xs rounded border border-sf-border bg-sf-bg-3 text-sf-text placeholder:text-sf-muted focus:border-sf-accent outline-none"
        />

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleExport}>Export</Button>
        </div>
      </div>
    </div>
  );
}
