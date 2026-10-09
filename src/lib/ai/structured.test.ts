import { describe, expect, it } from "vitest";
import { parseQuiz, parseFlashcards } from "@/lib/ai/structured";

describe("parseQuiz", () => {
  it("parses a plain JSON array", () => {
    const json = JSON.stringify([
      { question: "2+2?", options: ["3", "4", "5", "6"], answerIndex: 1 },
    ]);
    const quiz = parseQuiz(json);
    expect(quiz).toHaveLength(1);
    expect(quiz![0]!.answerIndex).toBe(1);
    expect(quiz![0]!.options).toHaveLength(4);
  });

  it("unwraps a ```json fenced block with preamble", () => {
    const text = 'Here is your quiz:\n```json\n[{"question":"Q","options":["a","b"],"answerIndex":0}]\n```';
    const quiz = parseQuiz(text);
    expect(quiz).toHaveLength(1);
    expect(quiz![0]!.question).toBe("Q");
  });

  it("accepts an answer given as option text instead of an index", () => {
    const json = JSON.stringify([
      { question: "Capital of France?", options: ["Rome", "Paris"], answer: "Paris" },
    ]);
    const quiz = parseQuiz(json);
    expect(quiz![0]!.answerIndex).toBe(1);
  });

  it("accepts a wrapped { questions: [...] } object", () => {
    const json = JSON.stringify({
      questions: [{ question: "Q", options: ["a", "b"], answerIndex: 0 }],
    });
    expect(parseQuiz(json)).toHaveLength(1);
  });

  it("keeps an optional explanation", () => {
    const json = JSON.stringify([
      { question: "Q", options: ["a", "b"], answerIndex: 0, explanation: "because a" },
    ]);
    expect(parseQuiz(json)![0]!.explanation).toBe("because a");
  });

  it("drops rows with too few options or a bad index", () => {
    const json = JSON.stringify([
      { question: "ok", options: ["a", "b"], answerIndex: 0 },
      { question: "bad index", options: ["a", "b"], answerIndex: 9 },
      { question: "one option", options: ["a"], answerIndex: 0 },
    ]);
    expect(parseQuiz(json)).toHaveLength(1);
  });

  it("returns null for non-quiz text", () => {
    expect(parseQuiz("I could not create a quiz.")).toBeNull();
    expect(parseQuiz("[]")).toBeNull();
  });
});

describe("parseFlashcards", () => {
  it("parses question/answer pairs", () => {
    const json = JSON.stringify([
      { question: "What is X?", answer: "A thing" },
      { question: "What is Y?", answer: "Another" },
    ]);
    const cards = parseFlashcards(json);
    expect(cards).toHaveLength(2);
    expect(cards![0]!.answer).toBe("A thing");
  });

  it("accepts front/back keys", () => {
    const json = JSON.stringify([{ front: "F", back: "B" }]);
    const cards = parseFlashcards(json);
    expect(cards![0]!.question).toBe("F");
    expect(cards![0]!.answer).toBe("B");
  });

  it("unwraps a fenced block", () => {
    const text = '```json\n[{"question":"Q","answer":"A"}]\n```';
    expect(parseFlashcards(text)).toHaveLength(1);
  });

  it("returns null for non-flashcard text", () => {
    expect(parseFlashcards("no cards here")).toBeNull();
    expect(parseFlashcards("[]")).toBeNull();
  });
});
