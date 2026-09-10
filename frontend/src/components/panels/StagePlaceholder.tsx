import { EmptyState } from "@/components/ui/EmptyState";

/** Placeholder body for an investigation sub-tab whose module is not built yet. */
export function StagePlaceholder({
  title,
  milestone,
  description,
  points,
}: {
  title: string;
  milestone: string;
  description: string;
  points: string[];
}) {
  return (
    <div className="p-4">
      <EmptyState title={title} milestone={milestone} description={description}>
        <ul className="space-y-1 text-left text-[11px] text-text-muted">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-text-subtle" />
              {p}
            </li>
          ))}
        </ul>
      </EmptyState>
    </div>
  );
}
