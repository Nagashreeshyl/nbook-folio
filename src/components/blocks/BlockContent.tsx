"use client";

import dynamic from "next/dynamic";
import { CodeView } from "@/components/blocks/CodeView";
import { MathView } from "@/components/blocks/MathView";
import { CanvasBlock } from "@/components/blocks/CanvasBlock";
import { FileBlock, ImageBlock } from "@/components/blocks/MediaBlocks";
import { RichTextEditor, type RichKind } from "@/components/blocks/RichTextEditor";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useNotebookContext } from "@/components/book/NotebookProvider";
import { useNotebookSession } from "@/components/book/NotebookGate";
import type { Block, BlockContentByType, CalloutTone } from "@/types/models";

const CALLOUT_STYLE: Record<CalloutTone, { border: string; icon: string; label: string }> = {
  note: { border: "border-sky-700/40", icon: "info", label: "Note" },
  tip: { border: "border-emerald-700/40", icon: "lightbulb", label: "Tip" },
  warning: { border: "border-amber-mid/60", icon: "warning", label: "Warning" },
  danger: { border: "border-danger/50", icon: "error", label: "Important" },
};

const CodeEditor = dynamic(() => import("@/components/blocks/CodeEditor"), {
  ssr: false,
  loading: () => <div className="h-40 bg-[#0d1117] rounded-lg animate-pulse" />,
});

const PLACEHOLDER: Partial<Record<Block["type"], string>> = {
  paragraph: "Type something, or press / for blocks",
  heading: "Section title",
  subheading: "Subsection title",
  bulletList: "List item",
  numberedList: "List item",
  checklist: "To-do",
  quote: "Quote",
  callout: "Callout text",
  table: "Cell",
};

const RICH_KIND: Partial<Record<Block["type"], RichKind>> = {
  paragraph: "paragraph",
  heading: "heading",
  subheading: "subheading",
  bulletList: "bulletList",
  numberedList: "numberedList",
  checklist: "checklist",
  quote: "quote",
  callout: "callout",
  table: "table",
};

interface Props {
  block: Block;
  editable: boolean;
  onChange: (content: Block["content"]) => void;
}

/** Renders a single block's body — wrapper chrome lives in `BlockList`. */
export function BlockContent({ block, editable, onChange }: Props) {
  const { t } = useI18n();
  const notebook = useNotebookContext();
  const session = useNotebookSession();
  const allowCopy = notebook.book?.settings.allowViewerCopy ?? true;

  const rich = RICH_KIND[block.type];
  if (rich) {
    const content = block.content as { html: string };
    if (!editable) {
      if (!content.html || content.html === "<p></p>") return null;
      return (
        <div
          className={`nb-prose nb-prose--${block.type}`}
          // Server sanitises every rich-text write through an allow-list.
          dangerouslySetInnerHTML={{ __html: content.html }}
        />
      );
    }
    return (
      <RichTextEditor
        key={block.id}
        kind={rich}
        html={content.html}
        editable
        {...(PLACEHOLDER[block.type] ? { placeholder: PLACEHOLDER[block.type]! } : {})}
        onChange={(html) => onChange({ ...content, html } as never)}
      />
    );
  }

  switch (block.type) {
    case "divider": {
      const content = block.content as BlockContentByType["divider"];
      if (content.label) {
        return (
          <div className="flex items-center gap-3 my-5 select-none" aria-hidden="true">
            <span className="h-px flex-1 bg-rule" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
              {content.label}
            </span>
            <span className="h-px flex-1 bg-rule" />
          </div>
        );
      }
      return <hr className="my-6 border-rule" />;
    }

    case "quote": {
      const content = block.content as BlockContentByType["quote"];
      if (!editable && !content.html) return null;
      return (
        <blockquote className="border-s-3 border-amber/70 ps-4 py-1 my-4">
          <div
            className="nb-prose font-serif text-[17px] text-ink-soft italic"
            dangerouslySetInnerHTML={{ __html: content.html }}
          />
          {content.citation && (
            <cite className="block mt-1.5 font-mono text-[11px] text-ink-faint not-italic">
              — {content.citation}
            </cite>
          )}
          {editable && (
            <input
              value={content.citation ?? ""}
              placeholder={t("quoteCitation")}
              onChange={(event) => onChange({ ...content, citation: event.target.value })}
              className="mt-2 w-full bg-transparent font-mono text-[11.5px] text-ink-muted outline-none placeholder:text-ink-faint border-b border-transparent focus:border-amber"
            />
          )}
        </blockquote>
      );
    }

    case "callout": {
      const content = block.content as BlockContentByType["callout"];
      const tone = CALLOUT_STYLE[content.tone] ?? CALLOUT_STYLE.note;
      return (
        <div
          className={`flex gap-3 rounded-lg border border-s-4 ${tone.border} bg-sheet-low px-4 py-3 my-3`}
        >
          <span className="material-symbols-outlined text-[18px] text-amber mt-0.5 shrink-0">
            {tone.icon}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">
              {tone.label}
            </p>
            <div
              className="nb-prose nb-prose--callout"
              dangerouslySetInnerHTML={{ __html: content.html }}
            />
          </div>
        </div>
      );
    }

    case "code": {
      const content = block.content as BlockContentByType["code"];
      if (!editable) {
        return (
          <div className="my-3">
            <CodeView
              code={content.code}
              language={content.language}
              lineNumbers={content.lineNumbers}
              {...(content.filename ? { filename: content.filename } : {})}
              allowCopy={allowCopy || session.role !== "viewer"}
            />
          </div>
        );
      }
      return <CodeEditor content={content} onChange={(next) => onChange(next as never)} />;
    }

    case "canvas": {
      const content = block.content as BlockContentByType["canvas"];
      return (
        <div className="my-3">
          <CanvasBlock
            snapshot={content.snapshot}
            height={content.height ?? 320}
            editable={editable}
            {...(editable
              ? {
                  onChange: (next) =>
                    onChange({ ...content, snapshot: next } as never),
                }
              : {})}
          />
        </div>
      );
    }

    case "image":
      return (
        <ImageBlock
          bookId={notebook.bookId ?? session.bookId ?? ""}
          content={block.content as BlockContentByType["image"]}
          editable={editable}
          onChange={(next) => onChange(next as never)}
        />
      );

    case "file":
      return (
        <FileBlock
          bookId={notebook.bookId ?? session.bookId ?? ""}
          content={block.content as BlockContentByType["file"]}
          editable={editable}
          onChange={(next) => onChange(next as never)}
        />
      );

    case "math": {
      const content = block.content as BlockContentByType["math"];
      if (editable) {
        return (
          <div className="flex flex-col gap-2">
            <input
              value={content.latex}
              placeholder={t("mathPlaceholder")}
              onChange={(event) => onChange({ ...content, latex: event.target.value })}
              className="w-full bg-sheet-low border border-rule rounded px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-amber"
            />
            <MathView latex={content.latex} display={content.display} />
          </div>
        );
      }
      return (
        <div className="my-2 overflow-x-auto">
          <MathView latex={content.latex} display={content.display} />
        </div>
      );
    }

    default:
      return null;
  }
}

