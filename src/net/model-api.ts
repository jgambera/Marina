import type { ChannelManager } from "../coordination/channel-manager";
import type { Engine } from "../engine/engine";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

const REQUEST_TIMEOUT_MS = 30_000;

/** Map model ID to channel name. "artilect" → "model", "artilect:scholar" → "model-scholar" */
function modelToChannelName(model: string): string {
  const parts = model.split(":");
  if (parts.length > 1) return `model-${parts.slice(1).join("-")}`;
  return "model";
}

/** Map channel name back to model ID. "model" → "artilect", "model-scholar" → "artilect:scholar" */
function channelNameToModel(name: string): string {
  if (name === "model") return "artilect";
  const suffix = name.replace(/^model-/, "");
  return `artilect:${suffix}`;
}

interface ModelInfo {
  id: string;
  channelId: string;
  onlineMembers: number;
}

function listModels(engine: Engine): ModelInfo[] {
  const cm = engine.channelManager;
  if (!cm) return [];

  const onlineIds = new Set(engine.getOnlineAgents().map((e) => e.id));
  const channels = cm.getAllChannels();
  const models: ModelInfo[] = [];

  for (const ch of channels) {
    if (!ch.name.startsWith("model")) continue;
    if (ch.name !== "model" && !ch.name.startsWith("model-")) continue;
    const members = cm.getMembers(ch.id);
    const online = members.filter((m) => onlineIds.has(m as never)).length;
    models.push({
      id: channelNameToModel(ch.name),
      channelId: ch.id,
      onlineMembers: online,
    });
  }
  return models;
}

// --- OpenAI format helpers ---

function openaiModelList(models: ModelInfo[]): unknown {
  return {
    object: "list",
    data: models.map((m) => ({
      id: m.id,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: "artilect",
    })),
  };
}

function openaiCompletion(model: string, content: string): unknown {
  return {
    id: `chatcmpl-${crypto.randomUUID().slice(0, 8)}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

// --- Ollama format helpers ---

function ollamaTagList(models: ModelInfo[]): unknown {
  return {
    models: models.map((m) => ({
      name: m.id,
      modified_at: new Date().toISOString(),
      size: 0,
    })),
  };
}

function ollamaChatResponse(model: string, content: string): unknown {
  return {
    model,
    created_at: new Date().toISOString(),
    message: { role: "assistant", content },
    done: true,
    total_duration: 0,
    eval_count: 0,
  };
}

function ollamaGenerateResponse(model: string, content: string): unknown {
  return {
    model,
    created_at: new Date().toISOString(),
    response: content,
    done: true,
    total_duration: 0,
    eval_count: 0,
  };
}

// --- Core routing ---

interface RouteResult {
  content: string;
}

async function routeToChannel(
  engine: Engine,
  model: string,
  userContent: string,
  context?: string,
): Promise<RouteResult> {
  const cm = engine.channelManager;
  if (!cm) throw new HttpError(503, "Channel system unavailable");

  const channelName = modelToChannelName(model);
  const channel = cm.getChannelByName(channelName);
  if (!channel) throw new HttpError(404, `Model "${model}" not found`);

  // Check online members
  const onlineIds = new Set(engine.getOnlineAgents().map((e) => e.id));
  const members = cm.getMembers(channel.id);
  const onlineMembers = members.filter((m) => onlineIds.has(m as never));
  if (onlineMembers.length === 0) {
    throw new HttpError(503, `No agents online for model "${model}"`);
  }

  const requestId = `req-${crypto.randomUUID().slice(0, 8)}`;

  // Build request payload
  const payload = JSON.stringify({
    type: "model_request",
    id: requestId,
    content: userContent,
    ...(context ? { context } : {}),
  });

  return new Promise<RouteResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new HttpError(504, "Response timeout"));
    }, REQUEST_TIMEOUT_MS);

    const unsub = cm.onMessage((channelId, senderId, _senderName, content) => {
      if (channelId !== channel.id) return;
      if (senderId === "__model_api__") return;

      // Try JSON response format
      try {
        const parsed = JSON.parse(content);
        if (parsed.type === "model_response" && parsed.id === requestId) {
          clearTimeout(timer);
          unsub();
          resolve({ content: parsed.content });
          return;
        }
      } catch {}

      // Fallback: plaintext "[req-abc123] response text"
      const prefix = `[${requestId}] `;
      if (content.startsWith(prefix)) {
        clearTimeout(timer);
        unsub();
        resolve({ content: content.slice(prefix.length) });
      }
    });

    // Send request to channel
    cm.send(channel.id, "__model_api__", "model-api", payload);
  });
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// --- Route handler ---

export async function handleModelApi(
  url: URL,
  method: string,
  req: Request,
  engine: Engine,
): Promise<Response | undefined> {
  // OpenAI: GET /v1/models
  if (url.pathname === "/v1/models" && method === "GET") {
    return json(openaiModelList(listModels(engine)));
  }

  // OpenAI: POST /v1/chat/completions
  if (url.pathname === "/v1/chat/completions" && method === "POST") {
    return await handleOpenaiChat(req, engine);
  }

  // Ollama: GET /api/tags
  if (url.pathname === "/api/tags" && method === "GET") {
    return json(ollamaTagList(listModels(engine)));
  }

  // Ollama: POST /api/chat
  if (url.pathname === "/api/chat" && method === "POST") {
    return await handleOllamaChat(req, engine);
  }

  // Ollama: POST /api/generate
  if (url.pathname === "/api/generate" && method === "POST") {
    return await handleOllamaGenerate(req, engine);
  }

  return undefined;
}

async function handleOpenaiChat(req: Request, engine: Engine): Promise<Response> {
  try {
    const body = await req.json();
    const model = body.model ?? "artilect";
    const messages = body.messages ?? [];

    // Extract last user message
    const userMsg = [...messages].reverse().find((m: { role: string }) => m.role === "user");
    if (!userMsg) return json({ error: "No user message found" }, 400);

    // Build context from system/prior messages
    const contextParts: string[] = [];
    for (const msg of messages) {
      if (msg === userMsg) break;
      contextParts.push(`${msg.role}: ${msg.content}`);
    }
    const context = contextParts.length > 0 ? contextParts.join("\n") : undefined;

    const result = await routeToChannel(engine, model, userMsg.content, context);
    return json(openaiCompletion(model, result.content));
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: "Internal error" }, 500);
  }
}

async function handleOllamaChat(req: Request, engine: Engine): Promise<Response> {
  try {
    const body = await req.json();
    const model = body.model ?? "artilect";
    const messages = body.messages ?? [];

    const userMsg = [...messages].reverse().find((m: { role: string }) => m.role === "user");
    if (!userMsg) return json({ error: "No user message found" }, 400);

    const contextParts: string[] = [];
    for (const msg of messages) {
      if (msg === userMsg) break;
      contextParts.push(`${msg.role}: ${msg.content}`);
    }
    const context = contextParts.length > 0 ? contextParts.join("\n") : undefined;

    const result = await routeToChannel(engine, model, userMsg.content, context);
    return json(ollamaChatResponse(model, result.content));
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: "Internal error" }, 500);
  }
}

async function handleOllamaGenerate(req: Request, engine: Engine): Promise<Response> {
  try {
    const body = await req.json();
    const model = body.model ?? "artilect";
    const prompt = body.prompt;
    if (!prompt) return json({ error: "No prompt provided" }, 400);

    const context = body.system ? `system: ${body.system}` : undefined;
    const result = await routeToChannel(engine, model, prompt, context);
    return json(ollamaGenerateResponse(model, result.content));
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: "Internal error" }, 500);
  }
}
