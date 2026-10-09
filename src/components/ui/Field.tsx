"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2">
      <span className="font-mono text-[11px] text-ink-faint uppercase font-semibold tracking-wider">
        {children}
      </span>
      {hint && <span className="font-sans text-[11px] text-ink-faint">{hint}</span>}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, className = "", id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div>
      {label && <label htmlFor={inputId}>{<Label hint={hint}>{label}</Label>}</label>}
      <div className="relative">
        {icon && (
          <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-ink-faint text-[18px] pointer-events-none">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full bg-sheet border ${
            error ? "border-danger" : "border-rule"
          } rounded px-3 py-2.5 text-[14px] font-sans text-ink outline-none focus:border-amber transition-colors placeholder:text-ink-faint ${
            icon ? "ps-9" : ""
          } ${className}`}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
      </div>
      {error && <p className="mt-1.5 text-[12px] text-danger font-sans">{error}</p>}
    </div>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, className = "", id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div>
      {label && <label htmlFor={inputId}>{<Label hint={hint}>{label}</Label>}</label>}
      <textarea
        ref={ref}
        id={inputId}
        className={`w-full bg-sheet border border-rule rounded px-3 py-2.5 text-[14px] font-sans text-ink outline-none focus:border-amber transition-colors placeholder:text-ink-faint resize-y ${className}`}
        {...rest}
      />
    </div>
  );
});
