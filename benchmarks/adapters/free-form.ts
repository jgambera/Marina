import { chunkText, queryWithMemory } from "../modes/memory";
import { query, queryMultiTurn } from "../modes/passthrough";
import { judgeResponse } from "../scoring/judge";
import type { BenchmarkConfig, DatasetItem, Message, ResultItem } from "../types";

export async function runFreeForm(
  items: DatasetItem[],
  config: BenchmarkConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<ResultItem[]> {
  const results: ResultItem[] = [];
  const isMTBench = config.dataset === "mt-bench";
  const isNarrativeQA = config.dataset === "narrativeqa";
  const pool: Promise<void>[] = [];
  let completed = 0;

  for (const item of items) {
    const task = (async () => {
      const start = performance.now();
      let actual = "";
      let judgeScore = 0;

      try {
        if (isMTBench) {
          actual = await runMTBenchItem(item, config);
        } else if (isNarrativeQA && config.mode === "memory") {
          actual = await runNarrativeQAMemory(item, config);
        } else {
          actual = await runStandardFreeForm(item, config);
        }

        // Judge the response
        judgeScore = await judgeResponse(
          item.question,
          item.answer,
          actual,
          config.judge ?? { model: config.model, endpoint: config.endpoint },
          config.apiKey,
        );
      } catch (e) {
        actual = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
      }

      const latencyMs = performance.now() - start;
      results.push({
        id: item.id,
        question: item.question.slice(0, 200),
        expected: item.answer.slice(0, 200),
        actual: actual.slice(0, 200),
        correct: judgeScore >= 7,
        score: judgeScore,
        latencyMs,
        category: item.category,
      });

      completed++;
      onProgress?.(completed, items.length);
    })();

    pool.push(task);
    if (pool.length >= config.concurrency) {
      await Promise.race(pool);
      for (let i = pool.length - 1; i >= 0; i--) {
        const settled = await Promise.race([pool[i].then(() => true), Promise.resolve(false)]);
        if (settled) pool.splice(i, 1);
      }
    }
  }

  await Promise.all(pool);
  return results;
}

async function runStandardFreeForm(item: DatasetItem, config: BenchmarkConfig): Promise<string> {
  const context = (item.metadata?.summary as string) ?? "";
  const messages: Message[] = [];

  if (context) {
    messages.push({
      role: "system",
      content: `Use the following context to answer the question:\n\n${context}`,
    });
  }
  messages.push({ role: "user", content: item.question });

  return await query(config.endpoint, config.model, messages, config.apiKey, 60000);
}

async function runNarrativeQAMemory(item: DatasetItem, config: BenchmarkConfig): Promise<string> {
  const summary = (item.metadata?.summary as string) ?? "";
  const chunks = chunkText(summary, 400);

  return await queryWithMemory(
    {
      wsUrl: config.endpoint.replace("http", "ws"),
      endpoint: config.endpoint,
      model: config.model,
      apiKey: config.apiKey,
    },
    [{ role: "user", content: item.question }],
    chunks,
  );
}

async function runMTBenchItem(item: DatasetItem, config: BenchmarkConfig): Promise<string> {
  const turns = (item.metadata?.turns as string[]) ?? [item.question];

  if (turns.length <= 1) {
    return await query(
      config.endpoint,
      config.model,
      [{ role: "user", content: turns[0] }],
      config.apiKey,
      60000,
    );
  }

  const responses = await queryMultiTurn(
    config.endpoint,
    config.model,
    turns,
    config.apiKey,
    60000,
  );
  // Return last response for judging, but include all for context
  return responses.join("\n---\n");
}
