"use client";

import { useEffect, useRef } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { indentOnInput, bracketMatching, foldGutter, foldKeymap, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { tags } from "@lezer/highlight";

import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { rust } from "@codemirror/lang-rust";
import { php } from "@codemirror/lang-php";
import { sql } from "@codemirror/lang-sql";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { StreamLanguage, LanguageSupport } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { xml } from "@codemirror/legacy-modes/mode/xml";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";

export const LANGUAGES = [
  "text",
  "javascript",
  "typescript",
  "jsx",
  "python",
  "java",
  "c",
  "cpp",
  "go",
  "rust",
  "php",
  "sql",
  "html",
  "css",
  "json",
  "markdown",
  "shell",
  "yaml",
  "ruby",
  "swift",
  "xml",
  "dockerfile",
] as const;

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#ff7b72" },
  { tag: [tags.string, tags.special(tags.string)], color: "#a5d6ff" },
  { tag: [tags.number, tags.bool, tags.null], color: "#79c0ff" },
  { tag: tags.comment, color: "#8b949e", fontStyle: "italic" },
  { tag: tags.function(tags.variableName), color: "#d2a8ff" },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "#ffa657" },
  { tag: tags.propertyName, color: "#79c0ff" },
  { tag: tags.operator, color: "#ff7b72" },
  { tag: tags.punctuation, color: "#c9d1d9" },
  { tag: tags.link, color: "#79c0ff" },
  { tag: tags.heading, color: "#7ee787" },
]);

function languageFor(name: string): Extension[] {
  switch (name) {
    case "javascript":
      return [javascript()];
    case "typescript":
      return [javascript({ typescript: true })];
    case "jsx":
      return [javascript({ jsx: true })];
    case "python":
      return [python()];
    case "java":
      return [java()];
    case "c":
    case "cpp":
      return [cpp()];
    case "go":
      return [go()];
    case "rust":
      return [rust()];
    case "php":
      return [php()];
    case "sql":
      return [sql()];
    case "html":
      return [html()];
    case "css":
      return [css()];
    case "json":
      return [json()];
    case "markdown":
      return [markdown()];
    case "shell":
      return [new LanguageSupport(StreamLanguage.define(shell))];
    case "yaml":
      return [new LanguageSupport(StreamLanguage.define(yaml))];
    case "ruby":
      return [new LanguageSupport(StreamLanguage.define(ruby))];
    case "swift":
      return [new LanguageSupport(StreamLanguage.define(swift))];
    case "xml":
      return [new LanguageSupport(StreamLanguage.define(xml))];
    case "dockerfile":
      return [new LanguageSupport(StreamLanguage.define(dockerFile))];
    default:
      return [];
  }
}

interface Props {
  content: {
    language: string;
    code: string;
    filename?: string;
    lineNumbers: boolean;
  };
  onChange: (next: Props["content"]) => void;
}

/**
 * CodeMirror 6 editor for code blocks.
 *
 * There is intentionally no run affordance: NBOOK never executes notebook code.
 */
export default function CodeEditor({ content, onChange }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const contentRef = useRef(content);
  contentRef.current = content;
  const language = content.language;
  const showLines = content.lineNumbers;

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const extensions: Extension[] = [
      showLines ? lineNumbers() : [],
      highlightActiveLine(),
      history(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      foldGutter(),
      highlightSelectionMatches(),
      syntaxHighlighting(highlight),
      ...languageFor(language),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...foldKeymap,
        indentWithTab,
      ]),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const next = update.state.doc.toString();
        onChangeRef.current({ ...contentRef.current, code: next });
      }),
      EditorView.theme({
        "&": { backgroundColor: "transparent", fontSize: "13px", color: "#c9d1d9" },
        ".cm-content": { fontFamily: "var(--font-mono)", padding: "12px 4px", minHeight: "96px" },
        ".cm-scroller": { fontFamily: "var(--font-mono)", overflow: "auto" },
        ".cm-gutters": {
          backgroundColor: "transparent",
          color: "#4d5566",
          border: "none",
          borderInlineEnd: "1px solid rgba(255,255,255,0.08)",
        },
        ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#ffdcc2" },
        ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.03)" },
        ".cm-cursor": { borderLeftColor: "#ffdcc2" },
        "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
          backgroundColor: "rgba(255,220,194,0.22) !important",
        },
      }),
    ];

    const state = EditorState.create({ doc: contentRef.current.code, extensions });
    const instance = new EditorView({ state, parent: element });
    view.current = instance;
    return () => {
      instance.destroy();
      view.current = null;
    };
    // Rebuild only when the language or gutter setting changes; typing is
    // owned by CodeMirror's own document.
  }, [language, showLines]);

  return (
    <div className="rounded-lg border border-rule bg-[#0d1117] overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-white/10">
        <select
          value={content.language}
          aria-label="Language"
          onChange={(event) => onChange({ ...content, language: event.target.value })}
          className="bg-white/5 border border-white/10 rounded px-2 py-1 font-mono text-[11px] text-white/75 outline-none"
        >
          {LANGUAGES.map((name) => (
            <option key={name} value={name} className="text-ink">
              {name}
            </option>
          ))}
        </select>
        <input
          value={content.filename ?? ""}
          placeholder="filename"
          onChange={(event) => onChange({ ...content, filename: event.target.value })}
          className="flex-1 min-w-[120px] bg-white/5 border border-white/10 rounded px-2 py-1 font-mono text-[11px] text-white/75 outline-none placeholder:text-white/30"
        />
        <label className="flex items-center gap-1.5 font-mono text-[11px] text-white/55">
          <input
            type="checkbox"
            checked={content.lineNumbers}
            onChange={(event) => onChange({ ...content, lineNumbers: event.target.checked })}
            className="accent-amber"
          />
          lines
        </label>
      </div>
      <div ref={host} className="cm-host" />
    </div>
  );
}
