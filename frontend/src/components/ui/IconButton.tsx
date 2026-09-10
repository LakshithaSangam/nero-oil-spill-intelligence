import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  size?: "sm" | "md";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, active, size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-sm border transition-colors duration-fast ease-ocean",
        "disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "h-7 w-7" : "h-9 w-9",
        active
          ? "border-accent/50 bg-accent/12 text-accent"
          : "border-border bg-surface-2/70 text-text-muted hover:text-text hover:border-border-strong",
        className,
      )}
      {...props}
    />
  ),
);
IconButton.displayName = "IconButton";
