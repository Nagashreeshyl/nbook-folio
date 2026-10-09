import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import type { BlockType } from "@/types/models";

/**
 * Server-side sanitisation of rich-text HTML.
 *
 * Tiptap output is trusted, but the API surface is not: any client can POST
 * arbitrary HTML, so every write is passed through this allow-list filter.
 */
export function sanitizeRichText(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: [
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "strike",
      "mark",
      "span",
      "a",
      "ul",
      "ol",
      "li",
      "blockquote",
      "code",
      "pre",
      "br",
      "hr",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "th",
      "td",
      "caption",
      "label",
      "input",
      "img",
      "sub",
      "sup",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      li: ["data-checked", "class"],
      ul: ["data-type", "class"],
      ol: ["start", "class"],
      input: ["type", "checked", "disabled"],
      td: ["colspan", "rowspan", "style"],
      th: ["colspan", "rowspan", "style"],
      img: ["src", "alt", "width", "height", "title"],
      "*": ["style", "class", "dir"],
    },
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\([\d\s,.%]+\)$/, /^[a-z]+$/],
        "background-color": [
          /^#[0-9a-fA-F]{3,8}$/,
          /^rgba?\([\d\s,.%]+\)$/,
          /^[a-z]+$/,
        ],
        "text-align": [/^(left|right|center|justify)$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
  });
}

const MAX_TEXT = 100_000;
const MAX_CODE = 200_000;

const richText = z
  .string()
  .max(MAX_TEXT, "Text block is too large.")
  .transform(sanitizeRichText);

const optionalRichText = z
  .string()
  .max(MAX_TEXT)
  .optional()
  .transform((value) => (value === undefined ? undefined : sanitizeRichText(value)));

const canvasSnapshotSchema = z
  .object({
    schemaVersion: z.number().int().nonnegative().default(1),
    store: z.record(z.string(), z.unknown()),
    documents: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => JSON.stringify(value).length <= 1_500_000, {
    message: "Canvas content is too large.",
  });

export const blockContentSchemas = {
  paragraph: z.object({ html: richText }),
  heading: z.object({ html: richText }),
  subheading: z.object({ html: richText }),
  bulletList: z.object({ html: richText }),
  numberedList: z.object({ html: richText }),
  checklist: z.object({ html: richText }),
  quote: z.object({ html: richText, citation: optionalRichText }),
  callout: z.object({
    html: richText,
    tone: z.enum(["note", "tip", "warning", "danger"]).default("note"),
  }),
  divider: z.object({ label: z.string().max(120).optional() }),
  table: z.object({ html: richText, caption: optionalRichText }),
  code: z.object({
    language: z
      .string()
      .max(40)
      .regex(/^[a-z0-9+#._-]*$/i, "Unsupported language identifier.")
      .default("plaintext"),
    code: z.string().max(MAX_CODE, "Code block is too large."),
    filename: z.string().max(120).optional(),
    lineNumbers: z.boolean().default(true),
  }),
  canvas: z.object({
    snapshot: canvasSnapshotSchema.nullable(),
    width: z.number().positive().max(20_000).optional(),
    height: z.number().positive().max(20_000).optional(),
  }),
  image: z.object({
    storagePath: z.string().max(512).optional(),
    url: z.string().max(2048).optional(),
    width: z.number().positive().max(20_000).optional(),
    height: z.number().positive().max(20_000).optional(),
    caption: optionalRichText,
    alt: z.string().max(300).optional(),
    status: z.enum(["ready", "uploading", "error", "unavailable"]).optional(),
  }),
  file: z.object({
    storagePath: z.string().max(512).optional(),
    url: z.string().max(2048).optional(),
    name: z.string().max(240),
    size: z.number().nonnegative().max(50 * 1024 * 1024),
    mime: z.string().max(160),
    status: z.enum(["ready", "uploading", "error", "unavailable"]).optional(),
  }),
  math: z.object({
    latex: z.string().max(4000),
    display: z.boolean().default(true),
  }),
} as const;

export type BlockContentSchemaMap = typeof blockContentSchemas;

export function contentSchemaFor(type: BlockType): z.ZodType {
  const schema = blockContentSchemas[type as keyof typeof blockContentSchemas];
  if (!schema) {
    throw new Error(`Unknown block type: ${type}`);
  }
  return schema as z.ZodType;
}

/** Fresh, valid content for a newly inserted block. */
export function defaultContentFor(type: BlockType): unknown {
  switch (type) {
    case "callout":
      return { html: "", tone: "note" };
    case "code":
      return { language: "plaintext", code: "", lineNumbers: true };
    case "canvas":
      return { snapshot: null };
    case "image":
      return { status: "uploading" };
    case "file":
      return { name: "", size: 0, mime: "application/octet-stream", status: "uploading" };
    case "math":
      return { latex: "a^2 + b^2 = c^2", display: true };
    case "divider":
      return {};
    case "table":
      return { html: "<table><tbody><tr><th><p></p></th><th><p></p></th></tr><tr><td><p></p></td><td><p></p></td></tr></tbody></table>" };
    case "heading":
      return { html: "<h2></h2>" };
    case "subheading":
      return { html: "<h3></h3>" };
    case "bulletList":
      return { html: "<ul><li><p></p></li></ul>" };
    case "numberedList":
      return { html: "<ol><li><p></p></li></ol>" };
    case "checklist":
      return {
        html: '<ul data-type="taskList"><li data-checked="false"><label><input type="checkbox" disabled><span></span></label><div><p></p></div></li></ul>',
      };
    case "quote":
      return { html: "<blockquote><p></p></blockquote>" };
    default:
      return { html: "<p></p>" };
  }
}
