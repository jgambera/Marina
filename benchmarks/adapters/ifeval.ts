import { query } from "../modes/passthrough";
import { checkInstruction } from "../scoring/ifeval-checks";
import type { BenchmarkConfig, DatasetItem, Message, ResultItem } from "../types";

export async function runIFEval(
  items: DatasetItem[],
  config: BenchmarkConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<ResultItem[]> {
  const results: ResultItem[] = [];
  const pool: Promise<void>[] = [];
  let completed = 0;

  for (const item of items) {
    const task = (async () => {
      const messages: Message[] = [{ role: "user", content: item.question }];
      const start = performance.now();
      let actual = "";
      let allPassed = false;
      let passedCount = 0;
      let totalConstraints = 0;

      try {
        actual = await query(config.endpoint, config.model, messages, config.apiKey, 60000);

        const instructionIds = (item.metadata?.instruction_id_list as string[]) ?? [];
        const kwargs = (item.metadata?.kwargs as Record<string, unknown>[]) ?? [];

        totalConstraints = instructionIds.length;
        passedCount = 0;

        for (let i = 0; i < instructionIds.length; i++) {
          const passed = checkInstruction(actual, instructionIds[i], kwargs[i] ?? {});
          if (passed) passedCount++;
        }

        allPassed = passedCount === totalConstraints;
      } catch (e) {
        actual = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
      }

      const latencyMs = performance.now() - start;
      results.push({
        id: item.id,
        question: item.question,
        expected: `${totalConstraints} constraints`,
        actual: `${passedCount}/${totalConstraints} passed`,
        correct: allPassed,
        score: totalConstraints > 0 ? passedCount / totalConstraints : 0,
        latencyMs,
        category: "ifeval",
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
