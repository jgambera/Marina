import { query } from "../modes/passthrough";
import type { BenchmarkConfig, DatasetItem, Message, ResultItem } from "../types";

const LETTERS = "ABCDEFGHIJ";

function formatMCPrompt(item: DatasetItem): Message[] {
  const choices = item.choices ?? [];
  const choiceText = choices.map((c, i) => `${LETTERS[i]}) ${c}`).join("\n");

  return [
    {
      role: "system",
      content:
        "Answer the multiple-choice question. Reply with ONLY the letter of the correct answer.",
    },
    {
      role: "user",
      content: `${item.question}\n\n${choiceText}\n\nAnswer:`,
    },
  ];
}

function extractLetter(response: string): string {
  const cleaned = response.trim().toUpperCase();
  // Try to find first letter A-J in the response
  const match = cleaned.match(/\b([A-J])\b/);
  if (match) return match[1];
  // Fall back to first character if it's a valid letter
  if (cleaned.length > 0 && /[A-J]/.test(cleaned[0])) return cleaned[0];
  return "";
}

export async function runMultipleChoice(
  items: DatasetItem[],
  config: BenchmarkConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<ResultItem[]> {
  const results: ResultItem[] = [];
  const isTruthfulQA = config.dataset === "truthfulqa";

  // Simple concurrency pool
  const pool: Promise<void>[] = [];
  let completed = 0;

  for (const item of items) {
    const task = (async () => {
      const messages = formatMCPrompt(item);
      const start = performance.now();
      let actual = "";
      let correct = false;
      let score: number | undefined;

      try {
        const response = await query(config.endpoint, config.model, messages, config.apiKey, 60000);
        actual = extractLetter(response);

        if (isTruthfulQA) {
          // MC2: multiple correct answers, check if selected answer is correct
          const correctIndices = item.answer.split(",").map(Number);
          const selectedIndex = LETTERS.indexOf(actual);
          correct = correctIndices.includes(selectedIndex);
          // Normalized score: 1 if correct, 0 if not
          score = correct ? 1 : 0;
        } else {
          // Standard MC: single correct answer (letter)
          correct = actual === item.answer.trim().toUpperCase();
        }
      } catch (e) {
        actual = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
      }

      const latencyMs = performance.now() - start;
      results.push({
        id: item.id,
        question: item.question,
        expected: item.answer,
        actual,
        correct,
        score,
        latencyMs,
        category: item.category,
      });

      completed++;
      onProgress?.(completed, items.length);
    })();

    pool.push(task);

    if (pool.length >= config.concurrency) {
      await Promise.race(pool);
      // Remove settled promises
      for (let i = pool.length - 1; i >= 0; i--) {
        const settled = await Promise.race([pool[i].then(() => true), Promise.resolve(false)]);
        if (settled) pool.splice(i, 1);
      }
    }
  }

  await Promise.all(pool);
  return results;
}
