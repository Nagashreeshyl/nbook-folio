"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";

export type RichKind =
  | "paragraph"
  | "heading"
  | "subheading"
  | "bulletList"
  | "numberedList"
  | "checklist"
  | "quote"
  | "callout"
  | "table";

/** Everything switched off — individual kinds opt back in. */
const OFF = {
  heading: false,
  blockquote: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
  codeBlock: false,
  horizontalRule: false,
} as const;

function extensionsFor(kind: RichKind, placeholder?: string): Extensions {
  const base = [
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: "noopener noreferrer" },
    }),
    Highlight.configure({ multicolor: false }),
    Underline,
    ...(placeholder
      ? [
          Placeholder.configure({
            placeholder,
            emptyEditorClass: "is-editor-empty",
            emptyNodeClass: "is-empty",
          }),
        ]
      : []),
  ];

  switch (kind) {
    case "heading":
      return [StarterKit.configure({ ...OFF, heading: { levels: [2] } }), ...base];
    case "subheading":
      return [StarterKit.configure({ ...OFF, heading: { levels: [4] } }), ...base];
    case "bulletList":
      return [
        StarterKit.configure({ ...OFF, bulletList: undefined, listItem: undefined }),
        ...base,
      ];
    case "numberedList":
      return [
        StarterKit.configure({ ...OFF, orderedList: undefined, listItem: undefined }),
        ...base,
      ];
    case "quote":
      return [
        StarterKit.configure({ ...OFF, blockquote: undefined, listItem: undefined }),
        ...base,
      ];
    case "checklist":
      return [StarterKit.configure(OFF), ...base, TaskList, TaskItem.configure({ nested: true })];
    case "table":
      return [
        StarterKit.configure(OFF),
        ...base,
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
      ];
    case "paragraph":
    case "callout":
    default:
      return [StarterKit.configure(OFF), ...base];
  }
}

interface RichTextEditorProps {
  kind: RichKind;
  html: string;
  onChange?: (html: string) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Shared Tiptap surface for every rich-text block type.
 *
 * The `kind` decides which node schema is loaded, so a heading block cannot
 * accidentally grow a nested list and a checklist cannot grow a table.
 */
export function RichTextEditor({
  kind,
  html,
  onChange,
  editable = true,
  placeholder,
  className = "",
  autoFocus,
}: RichTextEditorProps) {
  const [focused, setFocused] = useState(false);
  const lastHtml = useRef(html);

  const extensions = useMemo(
    () => extensionsFor(kind, editable ? placeholder : undefined),
    [kind, editable, placeholder],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    editable,
    content: html,
    editorProps: {
      attributes: {
        class: `nb-rich nb-rich--${kind} focus:outline-none`,
        ...(autoFocus ? { "data-autofocus": "true" } : {}),
      },
    },
    onUpdate: ({ editor: instance }) => {
      const next = instance.getHTML();
      if (next === lastHtml.current) return;
      lastHtml.current = next;
      onChange?.(next);
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  });

  // External updates (remote edits, undo of a remote change) must win only
  // when this editor is not mid-typing.
  useEffect(() => {
    if (!editor) return;
    if (html === lastHtml.current) return;
    if (editor.isFocused) return;
    lastHtml.current = html;
    editor.commands.setContent(html === "<p></p>" ? "" : html, false);
  }, [html, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor || !autoFocus) return;
    const timer = window.setTimeout(() => editor.commands.focus("end"), 40);
    return () => window.clearTimeout(timer);
  }, [editor, autoFocus]);

  const exec = useCallback(
    (run: (instance: NonNullable<typeof editor>) => boolean) => {
      if (!editor) return;
      run(editor);
      editor.chain().focus().run();
    },
    [editor],
  );

  if (!editor) {
    return <div className={`${className} min-h-[1.5em]`} aria-hidden="true" />;
  }

  return (
    <div className={`relative ${className}`}>
      {editable && focused && (kind === "paragraph" || kind === "heading" || kind === "subheading") && (
        <div className="absolute -top-9 end-0 z-20 flex items-center gap-0.5 rounded border border-rule bg-sheet px-1 py-0.5 shadow-lg no-print">
          <ToolButton
            icon="format_bold"
            label="Bold (⌘B)"
            active={editor.isActive("bold")}
            onClick={() => exec((e) => e.chain().toggleBold().run())}
          />
          <ToolButton
            icon="format_italic"
            label="Italic (⌘I)"
            active={editor.isActive("italic")}
            onClick={() => exec((e) => e.chain().toggleItalic().run())}
          />
          <ToolButton
            icon="format_underlined"
            label="Underline (⌘U)"
            active={editor.isActive("underline")}
            onClick={() => exec((e) => e.chain().toggleUnderline().run())}
          />
          <ToolButton
            icon="code"
            label="Inline code"
            active={editor.isActive("code")}
            onClick={() => exec((e) => e.chain().toggleCode().run())}
          />
          <ToolButton
            icon="highlight"
            label="Highlight"
            active={editor.isActive("highlight")}
            onClick={() => exec((e) => e.chain().toggleHighlight().run())}
          />
          <ToolButton
            icon="link"
            label="Link"
            active={editor.isActive("link")}
            onClick={() => {
              if (editor.isActive("link")) {
                exec((e) => e.chain().unsetLink().run());
                return;
              }
              const url = window.prompt("Link URL", "https://");
              if (url) exec((e) => e.chain().setLink({ href: url }).run());
            }}
          />
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  );
}

function ToolButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`p-1 rounded transition-colors ${
        active ? "bg-amber text-white" : "text-ink-muted hover:bg-sheet-hover hover:text-ink"
      }`}
    >
      <span className="material-symbols-outlined text-[15px]">{icon}</span>
    </button>
  );
}
