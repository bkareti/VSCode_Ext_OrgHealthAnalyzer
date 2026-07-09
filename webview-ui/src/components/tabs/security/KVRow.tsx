import SampleMark from '@/components/common/SampleMark';

interface Props {
  label: string;
  value: string | number;
  valueClassName?: string;
  /** Marks this specific row as sample data within an otherwise-real panel. */
  sample?: boolean;
  sampleNote?: string;
}

export default function KVRow({ label, value, valueClassName, sample, sampleNote }: Props) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-sf-border/40 last:border-0">
      <span className="text-[11px] text-sf-muted flex items-center gap-1">
        {label}
        {sample && <SampleMark note={sampleNote} />}
      </span>
      <span className={`text-xs font-medium text-sf-text ${valueClassName ?? ''}`}>{value}</span>
    </div>
  );
}
