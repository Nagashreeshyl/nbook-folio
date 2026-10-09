import type { ChatMessage } from "./types";

export type AIFeature =
  | "explain"
  | "summarize"
  | "rewrite"
  | "translate"
  | "flashcards"
  | "quiz"
  | "code_explain"
  | "code_improve"
  | "code_document"
  | "code_example"
  | "ask";

export const TEXT_FEATURES: AIFeature[] = [
  "explain",
  "summarize",
  "rewrite",
  "translate",
  "flashcards",
  "quiz",
];

export const CODE_FEATURES: AIFeature[] = [
  "code_explain",
  "code_improve",
  "code_document",
  "code_example",
];

export const FEATURE_LABELS: Record<AIFeature, string> = {
  explain: "Explain",
  summarize: "Summarize",
  rewrite: "Rewrite",
  translate: "Translate",
  flashcards: "Flashcards",
  quiz: "Quiz",
  code_explain: "Explain code",
  code_improve: "Improve code",
  code_document: "Document code",
  code_example: "Generate example",
  ask: "Ask NBOOK",
};

const SYSTEM = `You are NBOOK Assist, a study companion embedded inside a digital notebook.
Be precise, well structured and concise. Use Markdown.
Never invent notebook content: if the provided notebook context does not contain
an answer, say so plainly and answer only from general knowledge, clearly marked
as such.`;

export interface PromptInput {
  feature: AIFeature;
  /** Selected rich text (HTML already flattened to plain text). */
  selection?: string;
  /** Page/chapter context so answers can be grounded and cited. */
  context?: string;
  /** Free-form question for `ask`. */
  query?: string;
  /** Target language name/code for `translate`. */
  language?: string;
}

export function buildMessages(input: PromptInput): ChatMessage[] {
  const selection = input.selection?.trim() ?? "";
  const context = input.context?.trim() ?? "";
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM }];

  if (context) {
    messages.push({
      role: "user",
      content: `NOTEBOOK CONTEXT (verbatim excerpts, cite chapter/page when you use them):\n\n${context}`,
    });
  }

  switch (input.feature) {
    case "explain":
      messages.push({
        role: "user",
        content: `Explain the following passage for a student. Cover the core idea, why it matters, and a concrete example.\n\n${selection}`,
      });
      break;
    case "summarize":
      messages.push({
        role: "user",
        content: `Summarize the following passage in tight bullet points, then give a one-sentence takeaway.\n\n${selection}`,
      });
      break;
    case "rewrite":
      messages.push({
        role: "user",
        content: `Rewrite the following passage so it is clearer and more concise while preserving meaning and technical accuracy.\n\n${selection}`,
      });
      break;
    case "translate":
      messages.push({
        role: "user",
        content: `Translate the following passage into ${input.language ?? "English"}. Keep technical terms accurate. Output only the translation.\n\n${selection}`,
      });
      break;
    case "flashcards":
      messages.push({
        role: "user",
        content: `Create 5 study flashcards from the following passage as a JSON array of objects with keys "question" and "answer". Output only JSON.\n\n${selection}`,
      });
      break;
    case "quiz":
      messages.push({
        role: "user",
        content: `Create a 5-question multiple-choice quiz from the following passage. For each item provide "question", "options" (4) and "answerIndex". Output only JSON.\n\n${selection}`,
      });
      break;
    case "code_explain":
      messages.push({
        role: "user",
        content: `Explain what this code does, step by step, then state its time and space complexity where applicable.\n\n\`\`\`\n${selection}\n\`\`\``,
      });
      break;
    case "code_improve":
      messages.push({
        role: "user",
        content: `Suggest concrete improvements to this code (correctness, clarity, performance, edge cases). Then output the improved version in a fenced code block.\n\n\`\`\`\n${selection}\n\`\`\``,
      });
      break;
    case "code_document":
      messages.push({
        role: "user",
        content: `Write clear documentation for this code: a short summary, parameter descriptions, return value, and inline comments. Output the commented code in a fenced block plus a short doc block above it.\n\n\`\`\`\n${selection}\n\`\`\``,
      });
      break;
    case "code_example":
      messages.push({
        role: "user",
        content: `Write a small, runnable example that demonstrates how to use this code, with brief comments.\n\n\`\`\`\n${selection}\n\`\`\``,
      });
      break;
    case "ask":
    default:
      messages.push({
        role: "user",
        content: `${input.query ?? ""}\n\nAnswer using the notebook context where possible and cite "Chapter — Page" for every claim drawn from it. If the notebook does not contain the answer, say so explicitly.`,
      });
      break;
  }

  return messages;
}
