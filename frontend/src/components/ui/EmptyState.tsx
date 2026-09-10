import { cn } from "@/lib/utils";
import { Badge } from "./Badge";

/** The recurring "this stage isn't built yet" panel — honest and on-brand. */
export function EmptyState({
  icon,
  title,
  description,
  milestone,
  className,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  milestone?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded border border-dashed border-border px-6 py-10 text-center",
        className,
      )}
    >
      {icon && <div className="mb-3 text-text-subtle">{icon}</div>}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-text">{title}</h3>
        {milestone && <Badge tone="outline">{milestone}</Badge>}
      </div>
      <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-text-muted">{description}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
