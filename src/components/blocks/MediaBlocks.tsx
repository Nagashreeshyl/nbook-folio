"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import type { BlockContentByType } from "@/types/models";

type ImageContent = BlockContentByType["image"];
type FileContent = BlockContentByType["file"];

async function upload(
  bookId: string,
  file: File,
): Promise<{ storagePath: string; url: string; name: string; size: number; mime: string }> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`/api/books/${bookId}/upload`, {
    method: "POST",
    body: form,
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => null);
  // Errors are `{error, code}` (handleError) — `message` never appears.
  if (!response.ok) throw new Error(payload?.error ?? "Upload failed.");
  return payload;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function useUpload(bookId: string | null) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (file: File) => {
    if (!bookId) throw new Error("No notebook.");
    setBusy(true);
    setError(null);
    try {
      return await upload(bookId, file);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      setError(message);
      throw err;
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, send };
}

export function ImageBlock({
  bookId,
  content,
  editable,
  onChange,
}: {
  bookId: string;
  content: ImageContent;
  editable: boolean;
  onChange: (next: ImageContent) => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { busy, error, send } = useUpload(bookId);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      onChange({ ...content, status: "uploading" });
      const stored = await send(file);
      onChange({
        ...content,
        storagePath: stored.storagePath,
        url: stored.url,
        status: "ready",
        alt: content.alt ?? file.name,
      });
    } catch {
      onChange({ ...content, status: "error" });
    }
  }

  if (!content.url && !editable) return null;

  return (
    <figure className="my-3">
      {content.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={content.url}
          alt={content.alt ?? content.caption ?? ""}
          className="max-w-full h-auto rounded-lg border border-rule bg-sheet"
          loading="lazy"
        />
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!editable || busy}
          className="w-full min-h-[140px] rounded-lg border border-dashed border-rule bg-sheet-low hover:border-amber transition-colors grid place-items-center disabled:opacity-60 no-print"
        >
          <span className="text-center">
            <span
              className={`material-symbols-outlined text-ink-faint text-[26px] block ${busy ? "animate-spin" : ""}`}
            >
              {busy ? "progress_activity" : "image"}
            </span>
            <span className="font-mono text-[11px] text-ink-faint mt-1 block">
              {busy ? t("loading") : t("uploadHint")}
            </span>
          </span>
        </button>
      )}

      {editable && (
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
          className="hidden"
          onChange={(event) => void pick(event.target.files?.[0])}
        />
      )}

      {editable && content.url && (
        <input
          value={content.caption ?? ""}
          placeholder={t("tableCaption")}
          onChange={(event) => onChange({ ...content, caption: event.target.value })}
          className="mt-1.5 w-full bg-transparent font-sans text-[12.5px] text-ink-muted outline-none placeholder:text-ink-faint border-b border-transparent focus:border-amber"
        />
      )}

      {!editable && content.caption && (
        <figcaption className="mt-1.5 font-sans text-[12.5px] text-ink-muted">
          {content.caption}
        </figcaption>
      )}

      {(error || content.status === "error") && (
        <p className="mt-1 font-sans text-[12px] text-danger">{error ?? t("uploadTooLarge")}</p>
      )}
    </figure>
  );
}

export function FileBlock({
  bookId,
  content,
  editable,
  onChange,
}: {
  bookId: string;
  content: FileContent;
  editable: boolean;
  onChange: (next: FileContent) => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { busy, error, send } = useUpload(bookId);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      onChange({ ...content, status: "uploading" });
      const stored = await send(file);
      onChange({
        name: stored.name,
        size: stored.size,
        mime: stored.mime,
        storagePath: stored.storagePath,
        url: stored.url,
        status: "ready",
      });
    } catch {
      onChange({ ...content, status: "error" });
    }
  }

  if (!content.url) {
    if (!editable) return null;
    return (
      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!editable || busy}
          className="w-full flex items-center gap-3 rounded-lg border border-dashed border-rule bg-sheet-low px-4 py-3.5 hover:border-amber transition-colors disabled:opacity-60 text-start no-print"
        >
          <span className={`material-symbols-outlined text-ink-faint text-[22px] ${busy ? "animate-spin" : ""}`}>
            {busy ? "progress_activity" : "attach_file"}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-sans text-[13px] text-ink">{t("insertFile")}</span>
            <span className="block font-mono text-[10.5px] text-ink-faint">
              {t("uploadHint")}
            </span>
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(event) => void pick(event.target.files?.[0])}
        />
        {error && <p className="mt-1 font-sans text-[12px] text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-rule bg-sheet-low px-4 py-3">
      <span className="material-symbols-outlined text-amber text-[22px]">draft</span>
      <span className="flex-1 min-w-0">
        <span className="block font-sans text-[13px] text-ink truncate">{content.name}</span>
        <span className="block font-mono text-[10.5px] text-ink-faint">
          {formatBytes(content.size)} · {content.mime}
        </span>
      </span>
      <a
        href={content.url}
        download={content.name}
        className="font-mono text-[11px] text-amber hover:underline shrink-0"
      >
        {t("exportNow")}
      </a>
      {editable && (
        <button
          onClick={() =>
            onChange({ name: "", size: 0, mime: "application/octet-stream", status: undefined })
          }
          className="text-ink-faint hover:text-danger shrink-0 no-print"
          title={t("delete")}
        >
          <span className="material-symbols-outlined text-[17px]">close</span>
        </button>
      )}
    </div>
  );
}
