import type { PlenumState } from "@/lib/plenum";
import { ago } from "@/lib/format";
import { Badge } from "./ui";

/** NAV freshness: who priced the fund and when. FALLBACK is labelled as demo resilience only. */
export function NavBadge({ p }: { p: PlenumState }) {
  if (p.nav.timestamp === 0) return <Badge tone="warn">Not priced yet</Badge>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge tone={p.nav.fresh ? "ok" : "warn"}>
        {p.nav.fresh ? "Priced" : "Price is stale"} {ago(p.nav.ageSeconds)}
      </Badge>
      {p.nav.source === "FALLBACK" ? <Badge tone="mock">FALLBACK price writer</Badge> : <Badge>Chainlink CRE administrator</Badge>}
    </span>
  );
}
