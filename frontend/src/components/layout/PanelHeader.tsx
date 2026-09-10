import { cn } from "@/lib/utils";

export function PanelHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-border/70 px-5 pb-5 pt-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <div className="flex items-center gap-2">
              <span className="h-px w-6 bg-accent/60" />
              <span className="text-[0.58rem] font-semibold uppercase tracking-[0.32em] text-text-subtle">
                {eyebrow}
              </span>
            </div>
          )}
          <h1 className="mt-3 truncate font-display text-[1.32rem] font-normal leading-tight tracking-[0.005em] text-text">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-[0.78rem] leading-relaxed text-text-muted">{subtitle}</p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
