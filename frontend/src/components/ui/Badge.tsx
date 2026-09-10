import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "outline";

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-3 text-text-muted border-transparent",
  accent: "bg-accent/12 text-accent border-accent/25",
  success: "bg-success/12 text-success border-success/25",
  warning: "bg-warning/12 text-warning border-warning/25",
  danger: "bg-danger/12 text-danger border-danger/25",
  outline: "bg-transparent text-text-subtle border-border",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium leading-none tracking-wide",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
