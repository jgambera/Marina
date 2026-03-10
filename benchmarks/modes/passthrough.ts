import type { Message } from "../types";

export async function query(
  endpoint: string,
  model: string,
  messages: Message[],
  apiKey?: string,
  timeoutMs = 30000,
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(`${endpoint}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, messages, temperature: 0 }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`API error ${resp.status}: ${text}`);
    }

    const data = (await resp.json()) as {
      choices: { message: { content: string } }[];
    };
    return data.choices[0].message.content;
  } finally {
    clearTimeout(timer);
  }
}

export async function queryMultiTurn(
  endpoint: string,
  model: string,
  turns: string[],
  apiKey?: string,
  timeoutMs = 30000,
): Promise<string[]> {
  const messages: Message[] = [];
  const responses: string[] = [];

  for (const turn of turns) {
    messages.push({ role: "user", content: turn });
    const response = await query(endpoint, model, messages, apiKey, timeoutMs);
    messages.push({ role: "assistant", content: response });
    responses.push(response);
  }

  return responses;
}
