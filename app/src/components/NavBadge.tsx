import type { PlenumState } from "@/lib/plenum";
import { ago } from "@/lib/format";
import { Chip } from "./ui";

/** NAV freshness: who priced the fund and when. FALLBACK is labelled as demo resilience only. */
export function NavBadge({ p }: { p: PlenumState }) {
  if (p.nav.timestamp === 0) return <Chip tone="warn">Not priced yet</Chip>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Chip tone={p.nav.fresh ? "info" : "warn"}>
        <span className={`relative size-1.5 rounded-full ${p.nav.fresh ? "pulse bg-info text-info" : "bg-warn"}`} />
        {p.nav.fresh ? "Priced" : "Price is stale"} {ago(p.nav.ageSeconds)}
      </Chip>
      {p.nav.source === "FALLBACK" ? (
        <Chip tone="mock" mono>
          FALLBACK price writer
        </Chip>
      ) : (
        <Chip>by Chainlink CRE</Chip>
      )}
    </span>
  );
}
