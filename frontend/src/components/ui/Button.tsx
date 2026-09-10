import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-accent/95 text-accent-contrast hover:bg-accent-strong border border-accent/40",
  outline:
    "border border-border-strong text-text hover:border-accent/70 hover:bg-surface-3/40 bg-transparent",
  ghost: "text-text-muted hover:text-text hover:bg-surface-3/60 border border-transparent",
  danger: "border border-danger/40 text-danger hover:bg-danger/10 bg-transparent",
};

const SIZE: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[11px] gap-1.5 rounded-[5px] tracking-wide",
  md: "h-8 px-3.5 text-xs gap-2 rounded-[6px] tracking-wide",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-medium",
        "transition-[background-color,border-color,color,transform] duration-[180ms] ease-ocean",
        "active:translate-y-px active:scale-[0.99]",
        "disabled:pointer-events-none disabled:opacity-45",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
