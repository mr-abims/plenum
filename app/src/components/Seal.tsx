/**
 * Deterministic member seal derived from an account address: twelve wedges switched on or off by
 * the address bytes, with an inner ring weighted by the next byte. Same address, same seal, everywhere.
 */
export function Seal({ address, size = 32, className = "" }: { address: string; size?: number; className?: string }) {
  const hex = address.toLowerCase().replace(/^0x/, "").padEnd(40, "0");
  const byte = (i: number) => parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const wedges = 12;
  const r = 15;
  const paths = Array.from({ length: wedges }, (_, i) => {
    const on = (byte(i % 20) + i) % 3 !== 0;
    const a0 = (i / wedges) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / wedges) * Math.PI * 2 - Math.PI / 2;
    const inner = 6 + (byte((i + 7) % 20) % 4);
    // Rounded so server and browser render identical paths (no hydration mismatch from float noise).
    const p = (rad: number, a: number) => `${(16 + rad * Math.cos(a)).toFixed(2)} ${(16 + rad * Math.sin(a)).toFixed(2)}`;
    return { on, d: `M${p(inner, a0)} L${p(r, a0)} A${r} ${r} 0 0 1 ${p(r, a1)} L${p(inner, a1)} A${inner} ${inner} 0 0 0 ${p(inner, a0)}Z`, i };
  });
  const core = 2.5 + (byte(19) % 3);
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={`Seal for ${address.slice(0, 6)}`} className={`shrink-0 ${className}`}>
      <circle cx="16" cy="16" r="15.5" fill="var(--well)" />
      {paths.map((w) => (w.on ? <path key={w.i} d={w.d} fill="var(--ink)" fillOpacity={0.18 + (byte(w.i) % 5) * 0.12} /> : null))}
      <circle cx="16" cy="16" r={core} fill="var(--accent)" />
    </svg>
  );
}
