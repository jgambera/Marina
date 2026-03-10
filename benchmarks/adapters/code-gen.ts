import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { query } from "../modes/passthrough";
import type { BenchmarkConfig, DatasetItem, Message, ResultItem } from "../types";

function extractCode(response: string, entryPoint: string): string {
  // Try to extract Python code from markdown code block
  const codeBlockMatch = response.match(/```(?:python)?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // Try to find function definition
  const funcMatch = response.match(new RegExp(`(def ${entryPoint}[\\s\\S]*)`, "m"));
  if (funcMatch) return funcMatch[1].trim();

  // Return the whole response as a fallback
  return response.trim();
}

async function runPythonTest(
  code: string,
  test: string,
  entryPoint: string,
  timeoutMs = 30000,
): Promise<boolean> {
  const tmpDir = join(import.meta.dir, "..", ".tmp-humaneval");
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const testFile = join(tmpDir, `test_${entryPoint}_${Date.now()}.py`);
  const fullCode = `${code}\n\n${test}\n\ncheck(${entryPoint})\n`;
  writeFileSync(testFile, fullCode);

  try {
    const result = await $`python3 ${testFile}`.timeout(timeoutMs).quiet().nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  } finally {
    try {
      rmSync(testFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

export async function runCodeGen(
  items: DatasetItem[],
  config: BenchmarkConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<ResultItem[]> {
  const results: ResultItem[] = [];
  let completed = 0;

  // Run sequentially to avoid Python process contention
  for (const item of items) {
    const prompt = (item.metadata?.prompt as string) ?? item.question;
    const test = (item.metadata?.test as string) ?? "";
    const entryPoint = (item.metadata?.entry_point as string) ?? "";

    const messages: Message[] = [
      {
        role: "system",
        content:
          "Complete the following Python function. Return ONLY the complete function implementation in a Python code block. Do not include test code.",
      },
      {
        role: "user",
        content: prompt,
      },
    ];

    const start = performance.now();
    let actual = "";
    let correct = false;

    try {
      const response = await query(config.endpoint, config.model, messages, config.apiKey, 60000);
      actual = extractCode(response, entryPoint);

      // Combine the prompt (which includes the function signature) with the completion
      const fullCode = `${prompt}${actual}`;
      correct = await runPythonTest(fullCode, test, entryPoint);
    } catch (e) {
      actual = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    }

    const latencyMs = performance.now() - start;
    results.push({
      id: item.id,
      question: prompt.slice(0, 200),
      expected: "(passes tests)",
      actual: actual.slice(0, 200),
      correct,
      latencyMs,
      category: "code",
    });

    completed++;
    onProgress?.(completed, items.length);
  }

  // Cleanup tmp dir
  const tmpDir = join(import.meta.dir, "..", ".tmp-humaneval");
  if (existsSync(tmpDir)) {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch {
      // Ignore
    }
  }

  return results;
}
