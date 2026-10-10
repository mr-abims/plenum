/** Plenum mark: a chamber of seats arranged around one guarded centre point. */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  const seats = 9;
  const dots = Array.from({ length: seats }, (_, i) => {
    // Seats sweep 270 degrees, leaving the chamber open at the bottom like an assembly hall.
    const a = (135 + (270 / (seats - 1)) * i) * (Math.PI / 180);
    return { x: 16 + 12 * Math.cos(a), y: 16 + 12 * Math.sin(a) };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <circle cx="16" cy="16" r="7.5" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r="1.9" fill="currentColor" />
      ))}
      <circle cx="16" cy="16" r="3" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className="font-display text-[22px] font-semibold tracking-[-0.03em]">Plenum</span>
    </span>
  );
}
