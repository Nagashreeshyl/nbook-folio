"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useNotebookContext } from "@/components/book/NotebookProvider";
import { apiRequest } from "@/lib/api/client";

interface FormatInfo {
  id: string;
  label: string;
  description: string;
}

interface FormatsResponse {
  formats: FormatInfo[];
  allowed: boolean;
}

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const notebook = useNotebookContext();
  const [data, setData] = useState<FormatsResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setData(null);
    apiRequest<FormatsResponse>(`/api/books/${notebook.bookId}/export`)
      .then(setData)
      .catch((error) => toast.error(error instanceof Error ? error.message : t("errorGeneric")));
  }, [open, notebook.bookId, toast, t]);

  async function download(format: string) {
    setBusy(format);
    try {
      const response = await fetch(`/api/books/${notebook.bookId}/export?format=${format}`, {
        credentials: "same-origin",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? t("errorGeneric"));
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `nbook.${format}`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errorGeneric"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="download"
      title={t("export")}
      subtitle={notebook.book?.name ?? ""}
      maxWidth="max-w-md"
    >
      {data && !data.allowed && (
        <p className="mb-4 rounded-lg border border-rule bg-sheet-low p-3 font-sans text-[13px] text-ink-muted">
          {t("errorForbidden")}
        </p>
      )}

      <div className="space-y-2">
        {(data?.formats ?? []).map((format) => (
          <div
            key={format.id}
            className="flex items-center gap-3 rounded-lg border border-rule bg-sheet-low px-3.5 py-3"
          >
            <span className="material-symbols-outlined text-amber text-[20px]">
              {format.id === "json"
                ? "data_object"
                : format.id === "html"
                  ? "language"
                  : "description"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-sans text-[13.5px] text-ink font-medium">{format.label}</p>
              <p className="font-sans text-[11.5px] text-ink-faint">{format.description}</p>
            </div>
            <Button
              size="sm"
              disabled={!data?.allowed || busy !== null}
              loading={busy === format.id}
              onClick={() => void download(format.id)}
            >
              {t("exportNow")}
            </Button>
          </div>
        ))}

        {!data && (
          <div className="space-y-2">
            <div className="h-16 bg-sheet-low border border-rule rounded-lg animate-pulse" />
            <div className="h-16 bg-sheet-low border border-rule rounded-lg animate-pulse" />
          </div>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-rule flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] text-ink-faint">{t("printPdf")}</span>
        <Button
          icon="print"
          onClick={() => {
            onClose();
            window.setTimeout(() => window.print(), 120);
          }}
        >
          {t("print")}
        </Button>
      </div>
    </Modal>
  );
}
