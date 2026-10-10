/** Shape-matched loading placeholders. Compose them to mirror the final layout. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`shimmer relative block overflow-hidden rounded-xl bg-well ${className}`} />;
}

export function SkeletonPanel({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-3 rounded-[20px] border border-line bg-raised p-6 ${className}`} aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3 ${i % 2 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}
