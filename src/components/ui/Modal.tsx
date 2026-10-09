"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/I18nProvider";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  align?: "center" | "top";
  /** Rendered without the standard header (custom screens). */
  bare?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  maxWidth = "max-w-lg",
  align = "center",
  bare = false,
}: ModalProps) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
      if (event.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    const timer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("input, textarea, button")?.focus();
    }, 30);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = "";
      window.clearTimeout(timer);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-ink/40 backdrop-blur-[2px] p-4 select-none ${
        align === "center" ? "items-center" : "items-start pt-[12vh]"
      }`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={`bg-sheet border border-rule rounded-xl shadow-2xl w-full ${maxWidth} max-h-[90vh] flex flex-col text-ink-soft`}
      >
        {!bare && (
          <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-rule shrink-0">
            <div className="flex items-start gap-2 min-w-0">
              {icon && (
                <span className="material-symbols-outlined text-amber text-[22px] mt-0.5 shrink-0">
                  {icon}
                </span>
              )}
              <div className="min-w-0">
                <h2 className="font-serif text-[20px] font-semibold text-ink leading-tight">
                  {title}
                </h2>
                {subtitle && (
                  <p className="font-sans text-[13px] text-ink-muted mt-1 leading-snug">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded text-ink-faint hover:text-ink hover:bg-sheet-hover transition-colors shrink-0"
              aria-label={t("close")}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        )}
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-rule bg-sheet-low/60 rounded-b-xl shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
