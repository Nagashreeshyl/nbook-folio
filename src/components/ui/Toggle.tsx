"use client";

import { Label } from "./Field";

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ label, description, checked, onChange, disabled }: ToggleProps) {
  return (
    <label
      className={`flex items-center justify-between gap-4 p-3 bg-sheet-low rounded-lg border border-rule ${
        disabled ? "opacity-50 pointer-events-none" : "cursor-pointer"
      }`}
    >
      <span className="min-w-0">
        <span className="block font-sans text-[13px] font-medium text-ink">{label}</span>
        {description && (
          <span className="block font-sans text-[11px] text-ink-faint mt-0.5">{description}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={(event) => {
          event.preventDefault();
          onChange(!checked);
        }}
        className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
          checked ? "bg-amber" : "bg-rule"
        }`}
      >
        <span
          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
            checked ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}

interface SegmentedProps<T extends string> {
  label?: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`py-2 px-3 rounded border font-mono text-[12px] transition-all ${
              value === option.value
                ? "border-amber bg-sheet-high font-bold text-ink"
                : "border-rule bg-sheet-low text-ink-muted hover:bg-sheet-hover"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
