import { cn } from "@/lib/utils";

/** A compact 0–1 confidence meter with an optional rationale below. */
export function ConfidenceBar({
  score,
  label = "Confidence",
  rationale,
  className,
}: {
  score: number;
  label?: string;
  rationale?: string;
  className?: string;
}) {
  const pct = Math.round(score * 100);
  const tone =
    score >= 0.75 ? "bg-success" : score >= 0.5 ? "bg-warning" : "bg-danger";

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="uppercase tracking-wide text-text-subtle">{label}</span>
        <span className="tnum font-semibold text-text">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-ocean", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {rationale && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-text-muted">{rationale}</p>
      )}
    </div>
  );
}
