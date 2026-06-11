import type { MarketReliabilityResult } from "@/lib/market-reliability";
import { AlertTriangle, ShieldCheck } from "lucide-react";

type ReliabilityAuditPanelProps = {
  reliability?: MarketReliabilityResult | null;
};

function toneForStatus(status: MarketReliabilityResult["status"]) {
  if (status === "healthy") return "text-emerald-300";
  if (status === "degraded") return "text-[#FDD000]";
  return "text-red-200";
}

function formatStatus(status: string) {
  return status.slice(0, 1).toUpperCase() + status.slice(1);
}

function formatSync(value: string) {
  return value.split("_").map(formatStatus).join(" ");
}

function formatLastSuccessfulSync(value: string | null, syncStatus: string) {
  if (value) {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    return value;
  }

  if (syncStatus === "synced") return "Session load";
  if (syncStatus === "partial") return "Partial session";
  return "Waiting";
}

export default function ReliabilityAuditPanel({
  reliability,
}: ReliabilityAuditPanelProps) {
  if (!reliability) return null;

  const statusTone = toneForStatus(reliability.status);
  const Icon = reliability.market.defensiveMode ? AlertTriangle : ShieldCheck;
  const primaryIssues = reliability.market.primaryIssues.slice(0, 5);

  return (
    <section className="mt-5 rounded-lg border border-white/10 bg-[#101010] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Icon className="h-4 w-4 text-[#FDD000]" />
            Data reliability audit
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-zinc-500">
            {reliability.market.explanation}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
            <div className="text-zinc-500">Score</div>
            <div className={`mt-1 text-lg font-semibold ${statusTone}`}>
              {Math.round(reliability.score)} / 100
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
            <div className="text-zinc-500">Status</div>
            <div className={`mt-1 text-lg font-semibold ${statusTone}`}>
              {formatStatus(reliability.status)}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
            <div className="text-zinc-500">Confidence cap</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {Math.round(reliability.confidenceCap)}%
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AuditStat
          label="Valid assets"
          value={`${reliability.market.validAssets}`}
        />
        <AuditStat
          label="Rejected assets"
          value={`${reliability.market.rejectedAssets}`}
        />
        <AuditStat
          label="Venue"
          value={formatStatus(reliability.market.venueStatus)}
        />
        <AuditStat
          label="Synchronization"
          value={formatSync(reliability.market.synchronizationStatus)}
        />
        <AuditStat
          label="Stale candles"
          value={`${reliability.market.staleCandles}`}
        />
        <AuditStat
          label="Missing fields"
          value={`${reliability.market.missingFields + reliability.market.missingOhlcv}`}
        />
        <AuditStat
          label="Last successful sync"
          value={formatLastSuccessfulSync(
            reliability.market.lastSuccessfulSync,
            reliability.market.synchronizationStatus,
          )}
        />
        <AuditStat
          label="Fallback mode"
          value={reliability.market.fallbackMode ? "Active" : "Inactive"}
        />
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-black/30 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Primary issues
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {primaryIssues.map((issue) => (
            <span
              key={issue}
              className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-xs text-zinc-300"
            >
              {issue}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function AuditStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-white">
        {value}
      </div>
    </div>
  );
}
