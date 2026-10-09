/**
 * Parsers that turn the model's JSON replies for the quiz and flashcard
 * features into typed, validated structures the UI can render interactively.
 *
 * The model is asked for "only JSON", but in practice it often wraps the array
 * in a ```json fence or adds a sentence before it. These helpers extract the
 * first JSON array/object from the text and validate its shape, returning null
 * when nothing usable is found (the caller then falls back to plain text).
 */

export interface QuizItem {
  question: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
}

export interface Flashcard {
  question: string;
  answer: string;
}

/** Pulls the first balanced JSON array or object out of a text blob. */
function extractJson(text: string): unknown {
  const trimmed = text.trim();

  // Strip a surrounding ```json … ``` (or plain ```) fence if present.
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  // Try a direct parse first.
  try {
    return JSON.parse(candidate);
  } catch {
    /* fall through to bracket extraction */
  }

  // Otherwise, find the first array (preferred) or object span and parse it.
  for (const [open, close] of [
    ["[", "]"],
    ["{", "}"],
  ] as const) {
    const start = candidate.indexOf(open);
    const end = candidate.lastIndexOf(close);
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        /* try the next shape */
      }
    }
  }
  return null;
}

/** Coerce the AI's quiz JSON into validated QuizItem[], or null. */
export function parseQuiz(text: string): QuizItem[] | null {
  const data = extractJson(text);
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { questions?: unknown })?.questions)
      ? (data as { questions: unknown[] }).questions
      : null;
  if (!rows) return null;

  const items: QuizItem[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const question = typeof row.question === "string" ? row.question.trim() : "";
    const options = Array.isArray(row.options)
      ? row.options.filter((o): o is string => typeof o === "string").map((o) => o.trim())
      : [];
    // Accept answerIndex (number) or answer (matching option text).
    const answerIndex =
      typeof row.answerIndex === "number"
        ? row.answerIndex
        : typeof row.answer === "string"
          ? options.findIndex((o) => o.toLowerCase() === (row.answer as string).trim().toLowerCase())
          : -1;
    if (question && options.length >= 2 && answerIndex >= 0 && answerIndex < options.length) {
      items.push({
        question,
        options,
        answerIndex,
        ...(typeof row.explanation === "string" ? { explanation: row.explanation.trim() } : {}),
      });
    }
  }
  return items.length > 0 ? items : null;
}

/** Coerce the AI's flashcard JSON into validated Flashcard[], or null. */
export function parseFlashcards(text: string): Flashcard[] | null {
  const data = extractJson(text);
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { flashcards?: unknown })?.flashcards)
      ? (data as { flashcards: unknown[] }).flashcards
      : null;
  if (!rows) return null;

  const cards: Flashcard[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const question =
      typeof row.question === "string"
        ? row.question.trim()
        : typeof row.front === "string"
          ? row.front.trim()
          : "";
    const answer =
      typeof row.answer === "string"
        ? row.answer.trim()
        : typeof row.back === "string"
          ? row.back.trim()
          : "";
    if (question && answer) cards.push({ question, answer });
  }
  return cards.length > 0 ? cards : null;
}
