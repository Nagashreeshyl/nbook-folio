"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-night-raise text-white hover:bg-ink border border-transparent shadow-xs active:scale-[0.98]",
  secondary:
    "bg-sheet text-ink hover:bg-sheet-hover border border-rule active:scale-[0.98]",
  ghost: "bg-transparent text-ink-muted hover:bg-sheet-hover hover:text-ink border border-transparent",
  danger: "bg-danger text-white hover:brightness-110 border border-transparent",
  quiet: "bg-sheet-low text-ink-muted hover:bg-sheet-hover border border-rule",
};

const SIZES: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-[12px] gap-1.5 min-h-[32px]",
  md: "px-3.5 py-2 text-[13px] gap-1.5 min-h-[38px]",
  lg: "px-5 py-2.5 text-[14px] gap-2 min-h-[44px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: string;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, loading, children, className = "", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      className={`inline-flex items-center justify-center rounded font-mono font-medium transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="material-symbols-outlined animate-spin text-[16px] shrink-0">progress_activity</span>
      ) : icon ? (
        <span className="material-symbols-outlined text-[17px] shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
});
