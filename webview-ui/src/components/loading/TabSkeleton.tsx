export default function TabSkeleton() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-4 w-48 rounded bg-sf-bg-3" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-sf-bg-3" />
        ))}
      </div>
      <div className="h-40 rounded-lg bg-sf-bg-3" />
      <div className="h-32 rounded-lg bg-sf-bg-3" />
    </div>
  );
}
