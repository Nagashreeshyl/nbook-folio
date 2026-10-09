"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type ToastKind = "info" | "success" | "error" | "warn";

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (
    message: string,
    kind?: ToastKind,
    action?: ToastItem["action"],
    durationMs?: number,
  ) => void;
  error: (message: string) => void;
  success: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const KIND_STYLES: Record<ToastKind, string> = {
  info: "border-rule bg-sheet text-ink",
  success: "border-amber/40 bg-sheet text-ink",
  error: "border-danger/50 bg-sheet text-ink",
  warn: "border-amber-mid bg-sheet text-ink",
};

const KIND_ICON: Record<ToastKind, string> = {
  info: "info",
  success: "check_circle",
  error: "error",
  warn: "warning",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const nextId = useRef(1);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const show = useCallback<ToastApi["show"]>(
    (message, kind = "info", action, durationMs = 4500) => {
      const id = nextId.current++;
      setItems((prev) => [...prev.slice(-3), { id, message, kind, ...(action ? { action } : {}) }]);
      if (durationMs > 0) {
        window.setTimeout(() => dismiss(id), durationMs);
      }
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      error: (message) => show(message, "error", undefined, 6000),
      success: (message) => show(message, "success"),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div
            className="fixed bottom-4 end-4 z-[60] flex flex-col gap-2 w-[min(380px,calc(100vw-2rem))] no-print"
            role="status"
            aria-live="polite"
          >
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex items-start gap-2.5 border rounded-lg px-3.5 py-3 shadow-lg text-[13px] font-sans ${KIND_STYLES[item.kind]}`}
              >
                <span className="material-symbols-outlined text-[17px] mt-0.5 shrink-0 text-amber">
                  {KIND_ICON[item.kind]}
                </span>
                <span className="flex-1 leading-snug">{item.message}</span>
                {item.action && (
                  <button
                    onClick={() => {
                      item.action?.onClick();
                      dismiss(item.id);
                    }}
                    className="font-mono text-[11px] text-amber font-semibold shrink-0 hover:underline"
                  >
                    {item.action.label}
                  </button>
                )}
                <button
                  onClick={() => dismiss(item.id)}
                  className="text-ink-faint hover:text-ink shrink-0"
                  aria-label="Dismiss notification"
                >
                  <span className="material-symbols-outlined text-[15px]">close</span>
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
