import type { ChannelManager } from "../coordination/channel-manager";
import type { Engine } from "../engine/engine";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Conversation-Id, X-Load-Balance",
  "Access-Control-Expose-Headers": "X-Conversation-Id, x-request-id",
};

// --- API key authentication ---
// When MODEL_API_KEYS is set, only requests with a valid Bearer token are accepted.
// When unset, the API is open (suitable for local development).

function getApiKeys(): Set<string> | null {
  const raw = process.env.MODEL_API_KEYS;
  if (!raw) return null;
  const keys = raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  return keys.length > 0 ? new Set(keys) : null;
}

function authenticate(req: Request): Response | null {
  const keys = getApiKeys();
  if (!keys) return null;
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return errorJson(401, "Missing or invalid Authorization header");
  }
  const token = auth.slice(7);
  if (!keys.has(token)) {
    return errorJson(401, "Invalid API key");
  }
  return null;
}

function generateRequestId(): string {
  return `req-${crypto.randomUUID().slice(0, 8)}`;
}

function json(data: unknown, status = 200, extra?: Record<string, string>): Response {
  return Response.json(data, {
    status,
    headers: { ...CORS_HEADERS, "x-request-id": generateRequestId(), ...extra },
  });
}

/** OpenAI-compatible nested error format */
function errorJson(status: number, message: string): Response {
  const typeMap: Record<number, string> = {
    400: "invalid_request_error",
    401: "authentication_error",
    404: "not_found_error",
    429: "rate_limit_error",
    503: "server_error",
    504: "server_error",
  };
  return json(
    { error: { message, type: typeMap[status] ?? "server_error", param: null, code: null } },
    status,
  );
}

const REQUEST_TIMEOUT_MS = 30_000;

/** Map model ID to channel name. "marina" → "model", "marina:scholar" → "model-scholar" */
function modelToChannelName(model: string): string {
  const parts = model.split(":");
  if (parts.length > 1) return `model-${parts.slice(1).join("-")}`;
  return "model";
}

/** Map channel name back to model ID. "model" → "marina", "model-scholar" → "marina:scholar" */
function channelNameToModel(name: string): string {
  if (name === "model") return "marina";
  const suffix = name.replace(/^model-/, "");
  return `marina:${suffix}`;
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
    // Exclude conversation channels from model listing
    if (ch.name.startsWith("model-conv-")) continue;
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
      owned_by: "marina",
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

// --- OpenAI streaming format helpers ---

/** Role-only first chunk — required by OpenAI SDK stream accumulator */
function openaiStreamRoleChunk(id: string, model: string): string {
  const chunk = {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

function openaiStreamChunk(id: string, model: string, content: string): string {
  const chunk = {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

function openaiStreamEnd(id: string, model: string): string {
  const chunk = {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  };
  return `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`;
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

// --- Ollama streaming format helpers ---

function ollamaStreamChunk(model: string, content: string, isChat: boolean): string {
  if (isChat) {
    return `${JSON.stringify({ model, created_at: new Date().toISOString(), message: { role: "assistant", content }, done: false })}\n`;
  }
  return `${JSON.stringify({ model, created_at: new Date().toISOString(), response: content, done: false })}\n`;
}

function ollamaStreamEnd(model: string, isChat: boolean): string {
  if (isChat) {
    return `${JSON.stringify({ model, created_at: new Date().toISOString(), message: { role: "assistant", content: "" }, done: true, total_duration: 0, eval_count: 0 })}\n`;
  }
  return `${JSON.stringify({ model, created_at: new Date().toISOString(), response: "", done: true, total_duration: 0, eval_count: 0 })}\n`;
}

// --- Load balancing ---

const roundRobinCounters = new Map<string, number>();
const pendingRequests = new Map<string, number>();

function selectAgent(
  onlineMembers: string[],
  channelId: string,
  strategy: "round-robin" | "least-busy",
): string {
  if (onlineMembers.length === 1) return onlineMembers[0]!;

  if (strategy === "least-busy") {
    let best = onlineMembers[0]!;
    let bestCount = pendingRequests.get(best) ?? 0;
    for (let i = 1; i < onlineMembers.length; i++) {
      const count = pendingRequests.get(onlineMembers[i]!) ?? 0;
      if (count < bestCount) {
        best = onlineMembers[i]!;
        bestCount = count;
      }
    }
    return best;
  }

  // round-robin
  const idx = roundRobinCounters.get(channelId) ?? 0;
  const selected = onlineMembers[idx % onlineMembers.length]!;
  roundRobinCounters.set(channelId, idx + 1);
  return selected;
}

function incrementPending(entityId: string): void {
  pendingRequests.set(entityId, (pendingRequests.get(entityId) ?? 0) + 1);
}

function decrementPending(entityId: string): void {
  const count = (pendingRequests.get(entityId) ?? 1) - 1;
  if (count <= 0) pendingRequests.delete(entityId);
  else pendingRequests.set(entityId, count);
}

// --- Multi-turn conversation channels ---

interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

function getOrCreateConversationChannel(
  cm: ChannelManager,
  conversationId: string,
): { id: string; name: string } {
  const name = `model-conv-${conversationId}`;
  const existing = cm.getChannelByName(name);
  if (existing) return { id: existing.id, name: existing.name };
  const channel = cm.createChannel({
    type: "model",
    name,
    retentionHours: 24,
  });
  return { id: channel.id, name: channel.name };
}

function buildHistory(cm: ChannelManager, channelId: string): HistoryEntry[] {
  const messages = cm.getHistory(channelId, 50);
  const history: HistoryEntry[] = [];
  for (const msg of messages) {
    const role: "user" | "assistant" = msg.senderId === "__model_conv__" ? "user" : "assistant";
    history.push({ role, content: msg.content });
  }
  return history;
}

// --- Core routing ---

interface RouteResult {
  content: string;
  conversationId?: string;
}

interface RouteOptions {
  context?: string;
  conversationId?: string;
  strategy?: "round-robin" | "least-busy";
}

async function routeToChannel(
  engine: Engine,
  model: string,
  userContent: string,
  opts?: RouteOptions,
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

  // Load balancing
  const strategy = opts?.strategy ?? "round-robin";
  const target = selectAgent(onlineMembers, channel.id, strategy);

  // Multi-turn conversation
  const convId = opts?.conversationId ?? undefined;
  let convChannel: { id: string; name: string } | undefined;
  let history: HistoryEntry[] | undefined;
  if (convId) {
    convChannel = getOrCreateConversationChannel(cm, convId);
    history = buildHistory(cm, convChannel.id);
  }

  const requestId = `req-${crypto.randomUUID().slice(0, 8)}`;

  // Build request payload
  const payload = JSON.stringify({
    type: "model_request",
    id: requestId,
    content: userContent,
    target,
    ...(opts?.context ? { context: opts.context } : {}),
    ...(convId ? { conversation_id: convId } : {}),
    ...(history && history.length > 0 ? { history } : {}),
  });

  incrementPending(target);

  try {
    const result = await new Promise<RouteResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new HttpError(504, "Response timeout"));
      }, REQUEST_TIMEOUT_MS);

      const unsub = cm.onMessage((channelId, senderId, _senderName, content) => {
        if (channelId !== channel.id) return;
        if (senderId === "__model_api__") return;

        // Try JSON response format
        let parsed: Record<string, string> | undefined;
        try {
          parsed = JSON.parse(content);
        } catch {
          // Non-JSON — fall through to plaintext check
        }
        if (parsed?.type === "model_response" && parsed.id === requestId) {
          clearTimeout(timer);
          unsub();
          resolve({ content: parsed.content ?? "", conversationId: convId });
          return;
        }

        // Fallback: plaintext "[req-abc123] response text"
        const prefix = `[${requestId}] `;
        if (content.startsWith(prefix)) {
          clearTimeout(timer);
          unsub();
          resolve({
            content: content.slice(prefix.length),
            conversationId: convId,
          });
        }
      });

      // Send request to channel
      cm.send(channel.id, "__model_api__", "model-api", payload);
    });

    // Persist to conversation channel (use __model_conv__ to avoid triggering agents)
    if (convChannel) {
      cm.send(convChannel.id, "__model_conv__", "user", userContent);
      cm.send(convChannel.id, target, "agent", result.content);
    }

    return result;
  } finally {
    decrementPending(target);
  }
}

// --- Streaming routing ---

type StreamFormat = "openai" | "ollama-chat" | "ollama-generate";

function routeToChannelStreaming(
  engine: Engine,
  model: string,
  userContent: string,
  format: StreamFormat,
  opts?: RouteOptions,
): { stream: ReadableStream<Uint8Array>; conversationId?: string } {
  const cm = engine.channelManager;
  if (!cm) throw new HttpError(503, "Channel system unavailable");

  const channelName = modelToChannelName(model);
  const channel = cm.getChannelByName(channelName);
  if (!channel) throw new HttpError(404, `Model "${model}" not found`);

  const onlineIds = new Set(engine.getOnlineAgents().map((e) => e.id));
  const members = cm.getMembers(channel.id);
  const onlineMembers = members.filter((m) => onlineIds.has(m as never));
  if (onlineMembers.length === 0) {
    throw new HttpError(503, `No agents online for model "${model}"`);
  }

  const strategy = opts?.strategy ?? "round-robin";
  const target = selectAgent(onlineMembers, channel.id, strategy);

  const convId = opts?.conversationId ?? undefined;
  let convChannel: { id: string; name: string } | undefined;
  let history: HistoryEntry[] | undefined;
  if (convId) {
    convChannel = getOrCreateConversationChannel(cm, convId);
    history = buildHistory(cm, convChannel.id);
  }

  const reqId = `req-${crypto.randomUUID().slice(0, 8)}`;
  const streamId = `chatcmpl-${reqId.slice(4)}`;
  const encoder = new TextEncoder();
  const collectedContent: string[] = [];

  const payload = JSON.stringify({
    type: "model_request",
    id: reqId,
    content: userContent,
    target,
    stream: true,
    ...(opts?.context ? { context: opts.context } : {}),
    ...(convId ? { conversation_id: convId } : {}),
    ...(history && history.length > 0 ? { history } : {}),
  });

  incrementPending(target);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // OpenAI streams must begin with a role-only chunk
      if (format === "openai") {
        controller.enqueue(encoder.encode(openaiStreamRoleChunk(streamId, model)));
      }

      const timer = setTimeout(() => {
        unsub();
        decrementPending(target);
        controller.close();
      }, REQUEST_TIMEOUT_MS);

      const unsub = cm.onMessage((channelId, senderId, _senderName, content) => {
        if (channelId !== channel.id) return;
        if (senderId === "__model_api__") return;

        let parsed: { type?: string; id?: string; content?: string };
        try {
          parsed = JSON.parse(content);
        } catch {
          return; // Non-JSON message — skip
        }

        const text = parsed.content ?? "";

        // Streaming chunk
        if (parsed.type === "model_response_chunk" && parsed.id === reqId) {
          collectedContent.push(text);
          let chunk: string;
          if (format === "openai") {
            chunk = openaiStreamChunk(streamId, model, text);
          } else {
            chunk = ollamaStreamChunk(model, text, format === "ollama-chat");
          }
          controller.enqueue(encoder.encode(chunk));
          return;
        }

        // Streaming end
        if (parsed.type === "model_response_end" && parsed.id === reqId) {
          clearTimeout(timer);
          unsub();
          decrementPending(target);
          let endChunk: string;
          if (format === "openai") {
            endChunk = openaiStreamEnd(streamId, model);
          } else {
            endChunk = ollamaStreamEnd(model, format === "ollama-chat");
          }
          controller.enqueue(encoder.encode(endChunk));
          // Persist to conversation channel
          if (convChannel) {
            cm.send(convChannel.id, "__model_conv__", "user", userContent);
            cm.send(convChannel.id, target, "agent", collectedContent.join(""));
          }
          controller.close();
          return;
        }

        // Phase 1 compat: single model_response → wrap as one chunk + end
        if (parsed.type === "model_response" && parsed.id === reqId) {
          clearTimeout(timer);
          unsub();
          decrementPending(target);
          collectedContent.push(text);
          if (format === "openai") {
            controller.enqueue(encoder.encode(openaiStreamChunk(streamId, model, text)));
            controller.enqueue(encoder.encode(openaiStreamEnd(streamId, model)));
          } else {
            controller.enqueue(
              encoder.encode(ollamaStreamChunk(model, text, format === "ollama-chat")),
            );
            controller.enqueue(encoder.encode(ollamaStreamEnd(model, format === "ollama-chat")));
          }
          if (convChannel) {
            cm.send(convChannel.id, "__model_conv__", "user", userContent);
            cm.send(convChannel.id, target, "agent", text);
          }
          controller.close();
        }
      });

      cm.send(channel.id, "__model_api__", "model-api", payload);
    },
  });

  return { stream, conversationId: convId };
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// --- Conversation channel cleanup (called from engine tick) ---

export function cleanupStaleConversationChannels(cm: ChannelManager): number {
  const channels = cm.getAllChannels();
  let cleaned = 0;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const ch of channels) {
    if (!ch.name.startsWith("model-conv-")) continue;
    const history = cm.getHistory(ch.id, 1);
    if (history.length === 0 || history[history.length - 1]!.createdAt < cutoff) {
      cm.deleteChannel(ch.id);
      cleaned++;
    }
  }
  return cleaned;
}

// --- Route handler ---

function extractConversationId(
  req: Request,
  body?: { conversation_id?: string },
): string | undefined {
  return body?.conversation_id ?? req.headers.get("X-Conversation-Id") ?? undefined;
}

function extractStrategy(req: Request): "round-robin" | "least-busy" {
  const header = req.headers.get("X-Load-Balance");
  if (header === "least-busy") return "least-busy";
  return "round-robin";
}

export async function handleModelApi(
  url: URL,
  method: string,
  req: Request,
  engine: Engine,
): Promise<Response | undefined> {
  // Authenticate (skipped for CORS preflight)
  if (method !== "OPTIONS") {
    const authError = authenticate(req);
    if (authError) return authError;
  }

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
    const model = body.model ?? "marina";
    const messages = body.messages ?? [];

    // Extract last user message
    const userMsg = [...messages].reverse().find((m: { role: string }) => m.role === "user");
    if (!userMsg) return errorJson(400, "No user message found");

    // Build context from system/prior messages
    const contextParts: string[] = [];
    for (const msg of messages) {
      if (msg === userMsg) break;
      contextParts.push(`${msg.role}: ${msg.content}`);
    }
    const context = contextParts.length > 0 ? contextParts.join("\n") : undefined;

    const conversationId = extractConversationId(req, body);
    const strategy = extractStrategy(req);
    const opts: RouteOptions = { context, conversationId, strategy };

    // Streaming mode
    if (body.stream === true) {
      const { stream, conversationId: convId } = routeToChannelStreaming(
        engine,
        model,
        userMsg.content,
        "openai",
        opts,
      );
      const headers: Record<string, string> = {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "x-request-id": generateRequestId(),
      };
      if (convId) headers["X-Conversation-Id"] = convId;
      return new Response(stream, { headers });
    }

    const result = await routeToChannel(engine, model, userMsg.content, opts);
    const extra: Record<string, string> = {};
    if (result.conversationId) extra["X-Conversation-Id"] = result.conversationId;
    return json(openaiCompletion(model, result.content), 200, extra);
  } catch (e) {
    if (e instanceof HttpError) return errorJson(e.status, e.message);
    return errorJson(500, "Internal error");
  }
}

async function handleOllamaChat(req: Request, engine: Engine): Promise<Response> {
  try {
    const body = await req.json();
    const model = body.model ?? "marina";
    const messages = body.messages ?? [];

    const userMsg = [...messages].reverse().find((m: { role: string }) => m.role === "user");
    if (!userMsg) return errorJson(400, "No user message found");

    const contextParts: string[] = [];
    for (const msg of messages) {
      if (msg === userMsg) break;
      contextParts.push(`${msg.role}: ${msg.content}`);
    }
    const context = contextParts.length > 0 ? contextParts.join("\n") : undefined;

    const conversationId = extractConversationId(req, body);
    const strategy = extractStrategy(req);
    const opts: RouteOptions = { context, conversationId, strategy };

    // Ollama defaults to streaming (stream !== false)
    if (body.stream !== false) {
      const { stream, conversationId: convId } = routeToChannelStreaming(
        engine,
        model,
        userMsg.content,
        "ollama-chat",
        opts,
      );
      const headers: Record<string, string> = {
        ...CORS_HEADERS,
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
      };
      if (convId) headers["X-Conversation-Id"] = convId;
      return new Response(stream, { headers });
    }

    const result = await routeToChannel(engine, model, userMsg.content, opts);
    const extra: Record<string, string> = {};
    if (result.conversationId) extra["X-Conversation-Id"] = result.conversationId;
    return json(ollamaChatResponse(model, result.content), 200, extra);
  } catch (e) {
    if (e instanceof HttpError) return errorJson(e.status, e.message);
    return errorJson(500, "Internal error");
  }
}

async function handleOllamaGenerate(req: Request, engine: Engine): Promise<Response> {
  try {
    const body = await req.json();
    const model = body.model ?? "marina";
    const prompt = body.prompt;
    if (!prompt) return errorJson(400, "No prompt provided");

    const context = body.system ? `system: ${body.system}` : undefined;
    const conversationId = extractConversationId(req, body);
    const strategy = extractStrategy(req);
    const opts: RouteOptions = { context, conversationId, strategy };

    // Ollama defaults to streaming (stream !== false)
    if (body.stream !== false) {
      const { stream, conversationId: convId } = routeToChannelStreaming(
        engine,
        model,
        prompt,
        "ollama-generate",
        opts,
      );
      const headers: Record<string, string> = {
        ...CORS_HEADERS,
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
      };
      if (convId) headers["X-Conversation-Id"] = convId;
      return new Response(stream, { headers });
    }

    const result = await routeToChannel(engine, model, prompt, opts);
    const extra: Record<string, string> = {};
    if (result.conversationId) extra["X-Conversation-Id"] = result.conversationId;
    return json(ollamaGenerateResponse(model, result.content), 200, extra);
  } catch (e) {
    if (e instanceof HttpError) return errorJson(e.status, e.message);
    return errorJson(500, "Internal error");
  }
}

// Exported for testing
export { selectAgent, pendingRequests, roundRobinCounters };
