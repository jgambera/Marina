import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { ChannelManager } from "../src/coordination/channel-manager";
import { Engine } from "../src/engine/engine";
import {
  handleModelApi,
  pendingRequests,
  roundRobinCounters,
  selectAgent,
} from "../src/net/model-api";
import { ArtilectDB } from "../src/persistence/database";
import { roomId } from "../src/types";
import { MockConnection, cleanupDb, makeTestRoom } from "./helpers";

const TEST_DB = "test_model_api.db";

function makeRequest(
  path: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>,
): [URL, string, Request] {
  const url = new URL(`http://localhost:3300${path}`);
  const req = new Request(url.toString(), {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return [url, method, req];
}

/** Helper to collect all text from a ReadableStream */
async function collectStream(resp: Response): Promise<string> {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

/** Simulate an agent that responds to model_request with streaming chunks */
function setupStreamingAgent(
  cm: ChannelManager,
  entityId: string,
  entityName: string,
  chunks: string[],
): void {
  cm.onMessage((channelId, senderId, _senderName, content) => {
    if (senderId === "__model_api__") {
      try {
        const parsed = JSON.parse(content);
        if (parsed.type === "model_request") {
          for (const chunk of chunks) {
            cm.send(
              channelId,
              entityId,
              entityName,
              JSON.stringify({
                type: "model_response_chunk",
                id: parsed.id,
                content: chunk,
              }),
            );
          }
          cm.send(
            channelId,
            entityId,
            entityName,
            JSON.stringify({ type: "model_response_end", id: parsed.id }),
          );
        }
      } catch {}
    }
  });
}

/** Simulate an agent that responds to model_request with a single model_response */
function setupPhase1Agent(
  cm: ChannelManager,
  entityId: string,
  entityName: string,
  response: string,
): void {
  cm.onMessage((channelId, senderId, _senderName, content) => {
    if (senderId === "__model_api__") {
      try {
        const parsed = JSON.parse(content);
        if (parsed.type === "model_request") {
          cm.send(
            channelId,
            entityId,
            entityName,
            JSON.stringify({
              type: "model_response",
              id: parsed.id,
              content: response,
            }),
          );
        }
      } catch {}
    }
  });
}

describe("Model API", () => {
  let db: ArtilectDB;
  let engine: Engine;
  let conn1: MockConnection;
  let cm: ChannelManager;

  beforeEach(() => {
    db = new ArtilectDB(TEST_DB);
    engine = new Engine({ startRoom: roomId("test/start"), tickInterval: 60_000, db });
    engine.registerRoom(roomId("test/start"), makeTestRoom({ short: "Start" }));

    conn1 = new MockConnection("c1");
    engine.addConnection(conn1);
    engine.spawnEntity("c1", "Agent1");
    conn1.clear();

    cm = engine.channelManager!;

    // Clear load balancing state between tests
    roundRobinCounters.clear();
    pendingRequests.clear();
  });

  afterEach(() => {
    db.close();
    cleanupDb(TEST_DB);
  });

  it("GET /v1/models always lists the default artilect model", async () => {
    const [url, method, req] = makeRequest("/v1/models", "GET");
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp).toBeDefined();
    const data = await resp!.json();
    expect(data.object).toBe("list");
    expect(data.data).toHaveLength(1);
    expect(data.data[0].id).toBe("artilect");
    expect(data.data[0].owned_by).toBe("artilect");
  });

  it("GET /v1/models lists channels matching model* pattern", async () => {
    engine.processCommand(conn1.entity!, "channel join model");
    const [url, method, req] = makeRequest("/v1/models", "GET");
    const resp = await handleModelApi(url, method, req, engine);
    const data = await resp!.json();
    expect(data.data.length).toBeGreaterThanOrEqual(1);
    expect(data.data[0].id).toBe("artilect");
    expect(data.data[0].owned_by).toBe("artilect");
  });

  it("GET /api/tags returns Ollama format model list", async () => {
    engine.processCommand(conn1.entity!, "channel join model");
    const [url, method, req] = makeRequest("/api/tags", "GET");
    const resp = await handleModelApi(url, method, req, engine);
    const data = await resp!.json();
    expect(data.models).toBeDefined();
    expect(data.models[0].name).toBe("artilect");
  });

  it("POST /v1/chat/completions returns 404 for unknown model variant", async () => {
    const [url, method, req] = makeRequest("/v1/chat/completions", "POST", {
      model: "artilect:nonexistent",
      messages: [{ role: "user", content: "hello" }],
    });
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.status).toBe(404);
  });

  it("POST /v1/chat/completions returns 503 when no agents online", async () => {
    // Create channel but remove the agent's connection
    engine.processCommand(conn1.entity!, "channel join model");
    engine.removeConnection("c1");

    const [url, method, req] = makeRequest("/v1/chat/completions", "POST", {
      model: "artilect",
      messages: [{ role: "user", content: "hello" }],
    });
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.status).toBe(503);
  });

  it("POST /v1/chat/completions routes through channel and gets JSON response", async () => {
    engine.processCommand(conn1.entity!, "channel join model");
    setupPhase1Agent(cm, conn1.entity!, "Agent1", "Hello from Artilect!");

    const [url, method, req] = makeRequest("/v1/chat/completions", "POST", {
      model: "artilect",
      messages: [{ role: "user", content: "hello" }],
    });
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.status).toBe(200);
    const data = await resp!.json();
    expect(data.choices[0].message.content).toBe("Hello from Artilect!");
    expect(data.model).toBe("artilect");
  });

  it("POST /v1/chat/completions accepts plaintext bracket response", async () => {
    engine.processCommand(conn1.entity!, "channel join model");

    cm.onMessage((channelId, senderId, _senderName, content) => {
      if (senderId === "__model_api__") {
        try {
          const parsed = JSON.parse(content);
          if (parsed.type === "model_request") {
            // Human player responds with bracket format
            cm.send(channelId, conn1.entity!, "Agent1", `[${parsed.id}] Hi there!`);
          }
        } catch {}
      }
    });

    const [url, method, req] = makeRequest("/v1/chat/completions", "POST", {
      model: "artilect",
      messages: [{ role: "user", content: "hello" }],
    });
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.status).toBe(200);
    const data = await resp!.json();
    expect(data.choices[0].message.content).toBe("Hi there!");
  });

  it("POST /api/chat routes in Ollama format", async () => {
    engine.processCommand(conn1.entity!, "channel join model");
    setupPhase1Agent(cm, conn1.entity!, "Agent1", "Ollama response");

    const [url, method, req] = makeRequest("/api/chat", "POST", {
      model: "artilect",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
    });
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.status).toBe(200);
    const data = await resp!.json();
    expect(data.message.content).toBe("Ollama response");
    expect(data.done).toBe(true);
  });

  it("POST /api/generate routes single prompt in Ollama format", async () => {
    engine.processCommand(conn1.entity!, "channel join model");
    setupPhase1Agent(cm, conn1.entity!, "Agent1", "Generated text");

    const [url, method, req] = makeRequest("/api/generate", "POST", {
      model: "artilect",
      prompt: "Tell me a story",
      stream: false,
    });
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.status).toBe(200);
    const data = await resp!.json();
    expect(data.response).toBe("Generated text");
    expect(data.done).toBe(true);
  });

  it("model ID artilect:scholar maps to channel model-scholar", async () => {
    engine.processCommand(conn1.entity!, "channel create model-scholar");
    setupPhase1Agent(cm, conn1.entity!, "Agent1", "Scholar response");

    const [url, method, req] = makeRequest("/v1/chat/completions", "POST", {
      model: "artilect:scholar",
      messages: [{ role: "user", content: "hello" }],
    });
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.status).toBe(200);
    const data = await resp!.json();
    expect(data.choices[0].message.content).toBe("Scholar response");
  });

  it("returns undefined for unmatched routes", async () => {
    const [url, method, req] = makeRequest("/v1/unknown", "GET");
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp).toBeUndefined();
  });

  it("channel onMessage listener can be unsubscribed", () => {
    let callCount = 0;
    const unsub = cm.onMessage(() => {
      callCount++;
    });

    engine.processCommand(conn1.entity!, "channel create testchan");
    engine.processCommand(conn1.entity!, "channel send testchan hello");
    expect(callCount).toBe(1);

    unsub();
    engine.processCommand(conn1.entity!, "channel send testchan world");
    expect(callCount).toBe(1);
  });

  // --- Compatibility tests ---

  it("error responses use OpenAI nested format", async () => {
    const [url, method, req] = makeRequest("/v1/chat/completions", "POST", {
      model: "artilect:nonexistent",
      messages: [{ role: "user", content: "hello" }],
    });
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.status).toBe(404);
    const data = await resp!.json();
    expect(data.error).toBeDefined();
    expect(data.error.message).toContain("not found");
    expect(data.error.type).toBe("not_found_error");
    expect(data.error.param).toBeNull();
    expect(data.error.code).toBeNull();
  });

  it("responses include x-request-id header", async () => {
    const [url, method, req] = makeRequest("/v1/models", "GET");
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.headers.get("x-request-id")).toBeDefined();
    expect(resp!.headers.get("x-request-id")!.startsWith("req-")).toBe(true);
  });

  // --- Streaming tests ---

  it("streaming: OpenAI SSE format with model_response_chunk + model_response_end", async () => {
    engine.processCommand(conn1.entity!, "channel join model");
    setupStreamingAgent(cm, conn1.entity!, "Agent1", ["Hello", " world", "!"]);

    const [url, method, req] = makeRequest("/v1/chat/completions", "POST", {
      model: "artilect",
      messages: [{ role: "user", content: "hello" }],
      stream: true,
    });
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.headers.get("Content-Type")).toBe("text/event-stream");

    const text = await collectStream(resp!);
    const dataLines = text.split("\n").filter((l) => l.startsWith("data: "));
    // 1 role chunk + 3 content chunks + 1 stop + 1 [DONE]
    expect(dataLines.length).toBe(6);

    // Role-only first chunk (required by OpenAI SDK)
    const role = JSON.parse(dataLines[0]!.slice(6));
    expect(role.choices[0].delta.role).toBe("assistant");
    expect(role.object).toBe("chat.completion.chunk");

    // Content chunks
    const first = JSON.parse(dataLines[1]!.slice(6));
    expect(first.choices[0].delta.content).toBe("Hello");

    const second = JSON.parse(dataLines[2]!.slice(6));
    expect(second.choices[0].delta.content).toBe(" world");

    const third = JSON.parse(dataLines[3]!.slice(6));
    expect(third.choices[0].delta.content).toBe("!");

    // Stop chunk
    const stop = JSON.parse(dataLines[4]!.slice(6));
    expect(stop.choices[0].finish_reason).toBe("stop");
    expect(stop.choices[0].delta).toEqual({});

    // [DONE]
    expect(dataLines[5]).toBe("data: [DONE]");
  });

  it("streaming: Ollama chunked JSON lines format", async () => {
    engine.processCommand(conn1.entity!, "channel join model");
    setupStreamingAgent(cm, conn1.entity!, "Agent1", ["Hello", " world"]);

    const [url, method, req] = makeRequest("/api/chat", "POST", {
      model: "artilect",
      messages: [{ role: "user", content: "hello" }],
    });
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.headers.get("Content-Type")).toBe("application/x-ndjson");

    const text = await collectStream(resp!);
    const lines = text.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(3); // 2 chunks + 1 done

    const chunk1 = JSON.parse(lines[0]!);
    expect(chunk1.message.content).toBe("Hello");
    expect(chunk1.done).toBe(false);

    const chunk2 = JSON.parse(lines[1]!);
    expect(chunk2.message.content).toBe(" world");
    expect(chunk2.done).toBe(false);

    const end = JSON.parse(lines[2]!);
    expect(end.done).toBe(true);
  });

  it("streaming: fallback when agent sends single model_response (Phase 1 compat)", async () => {
    engine.processCommand(conn1.entity!, "channel join model");
    // Phase 1 agent: responds with model_response, not chunks
    setupPhase1Agent(cm, conn1.entity!, "Agent1", "Complete response");

    const [url, method, req] = makeRequest("/v1/chat/completions", "POST", {
      model: "artilect",
      messages: [{ role: "user", content: "hello" }],
      stream: true,
    });
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.headers.get("Content-Type")).toBe("text/event-stream");

    const text = await collectStream(resp!);
    const dataLines = text.split("\n").filter((l) => l.startsWith("data: "));
    // 1 role chunk + 1 content chunk + 1 stop chunk + [DONE]
    expect(dataLines.length).toBe(4);

    // Role chunk
    const role = JSON.parse(dataLines[0]!.slice(6));
    expect(role.choices[0].delta.role).toBe("assistant");

    const chunk = JSON.parse(dataLines[1]!.slice(6));
    expect(chunk.choices[0].delta.content).toBe("Complete response");

    const stop = JSON.parse(dataLines[2]!.slice(6));
    expect(stop.choices[0].finish_reason).toBe("stop");

    expect(dataLines[3]).toBe("data: [DONE]");
  });

  // --- Multi-turn conversation tests ---

  it("multi-turn: first request creates conversation channel", async () => {
    engine.processCommand(conn1.entity!, "channel join model");
    setupPhase1Agent(cm, conn1.entity!, "Agent1", "Response 1");

    const [url, method, req] = makeRequest("/v1/chat/completions", "POST", {
      model: "artilect",
      messages: [{ role: "user", content: "hello" }],
      conversation_id: "test-conv-1",
    });
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.status).toBe(200);
    expect(resp!.headers.get("X-Conversation-Id")).toBe("test-conv-1");

    // Verify conversation channel was created
    const convCh = cm.getChannelByName("model-conv-test-conv-1");
    expect(convCh).toBeDefined();
    expect(convCh!.retentionHours).toBe(24);
  });

  it("multi-turn: second request includes history from first exchange", async () => {
    engine.processCommand(conn1.entity!, "channel join model");

    let capturedPayload: string | undefined;

    // First response
    const unsub1 = cm.onMessage((channelId, senderId, _senderName, content) => {
      if (senderId === "__model_api__") {
        try {
          const parsed = JSON.parse(content);
          if (parsed.type === "model_request") {
            cm.send(
              channelId,
              conn1.entity!,
              "Agent1",
              JSON.stringify({
                type: "model_response",
                id: parsed.id,
                content: "I am Agent1",
              }),
            );
          }
        } catch {}
      }
    });

    const [url1, method1, req1] = makeRequest("/v1/chat/completions", "POST", {
      model: "artilect",
      messages: [{ role: "user", content: "Who are you?" }],
      conversation_id: "conv-history",
    });
    await handleModelApi(url1, method1, req1, engine);
    unsub1();

    // Second request — capture the payload to check history
    const unsub2 = cm.onMessage((channelId, senderId, _senderName, content) => {
      if (senderId === "__model_api__") {
        try {
          const parsed = JSON.parse(content);
          if (parsed.type === "model_request" && channelId.includes("model")) {
            capturedPayload = content;
            cm.send(
              channelId,
              conn1.entity!,
              "Agent1",
              JSON.stringify({
                type: "model_response",
                id: parsed.id,
                content: "I already told you",
              }),
            );
          }
        } catch {}
      }
    });

    const [url2, method2, req2] = makeRequest("/v1/chat/completions", "POST", {
      model: "artilect",
      messages: [{ role: "user", content: "Tell me again" }],
      conversation_id: "conv-history",
    });
    await handleModelApi(url2, method2, req2, engine);
    unsub2();

    // The second request payload should include history
    expect(capturedPayload).toBeDefined();
    const payload = JSON.parse(capturedPayload!);
    expect(payload.history).toBeDefined();
    expect(payload.history.length).toBeGreaterThanOrEqual(2);
    expect(payload.history[0].role).toBe("user");
    expect(payload.history[1].role).toBe("assistant");
    expect(payload.history[1].content).toBe("I am Agent1");
  });

  it("multi-turn: X-Conversation-Id header returned and reusable", async () => {
    engine.processCommand(conn1.entity!, "channel join model");
    setupPhase1Agent(cm, conn1.entity!, "Agent1", "Response");

    const [url, method, req] = makeRequest(
      "/v1/chat/completions",
      "POST",
      {
        model: "artilect",
        messages: [{ role: "user", content: "hello" }],
      },
      { "X-Conversation-Id": "header-conv-1" },
    );
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.headers.get("X-Conversation-Id")).toBe("header-conv-1");

    // Verify channel was created
    const convCh = cm.getChannelByName("model-conv-header-conv-1");
    expect(convCh).toBeDefined();
  });

  // --- Load balancing tests ---

  it("load balancing: round-robin alternates between two agents", async () => {
    engine.processCommand(conn1.entity!, "channel join model");

    // Add a second agent
    const conn2 = new MockConnection("c2");
    engine.addConnection(conn2);
    engine.spawnEntity("c2", "Agent2");
    engine.processCommand(conn2.entity!, "channel join model");

    // Track which agents receive requests
    const targets: string[] = [];
    cm.onMessage((channelId, senderId, _senderName, content) => {
      if (senderId === "__model_api__") {
        try {
          const parsed = JSON.parse(content);
          if (parsed.type === "model_request") {
            targets.push(parsed.target);
            cm.send(
              channelId,
              parsed.target,
              "Agent",
              JSON.stringify({
                type: "model_response",
                id: parsed.id,
                content: "ok",
              }),
            );
          }
        } catch {}
      }
    });

    for (let i = 0; i < 4; i++) {
      const [url, method, req] = makeRequest("/v1/chat/completions", "POST", {
        model: "artilect",
        messages: [{ role: "user", content: `msg ${i}` }],
      });
      await handleModelApi(url, method, req, engine);
    }

    // Should alternate between the two agents
    expect(targets.length).toBe(4);
    expect(targets[0]).not.toBe(targets[1]);
    expect(targets[0]).toBe(targets[2]);
    expect(targets[1]).toBe(targets[3]);
  });

  it("load balancing: least-busy picks agent with fewer pending requests", () => {
    const members = ["agent-a", "agent-b"];
    pendingRequests.set("agent-a", 3);
    pendingRequests.set("agent-b", 1);

    const selected = selectAgent(members, "ch:test", "least-busy");
    expect(selected).toBe("agent-b");
  });

  it("load balancing: single agent always selected", () => {
    const members = ["agent-only"];
    const result1 = selectAgent(members, "ch:test", "round-robin");
    const result2 = selectAgent(members, "ch:test", "least-busy");
    expect(result1).toBe("agent-only");
    expect(result2).toBe("agent-only");
  });

  it("model-conv channels excluded from model listing", async () => {
    engine.processCommand(conn1.entity!, "channel join model");
    // Create a conversation channel manually
    cm.createChannel({ type: "model", name: "model-conv-test123", retentionHours: 24 });

    const [url, method, req] = makeRequest("/v1/models", "GET");
    const resp = await handleModelApi(url, method, req, engine);
    const data = await resp!.json();
    // Should only list "artilect", not the conversation channel
    expect(data.data.length).toBe(1);
    expect(data.data[0].id).toBe("artilect");
  });

  it("request payload includes target field for load balancing", async () => {
    engine.processCommand(conn1.entity!, "channel join model");

    let capturedTarget: string | undefined;
    cm.onMessage((channelId, senderId, _senderName, content) => {
      if (senderId === "__model_api__") {
        try {
          const parsed = JSON.parse(content);
          if (parsed.type === "model_request") {
            capturedTarget = parsed.target;
            cm.send(
              channelId,
              conn1.entity!,
              "Agent1",
              JSON.stringify({
                type: "model_response",
                id: parsed.id,
                content: "ok",
              }),
            );
          }
        } catch {}
      }
    });

    const [url, method, req] = makeRequest("/v1/chat/completions", "POST", {
      model: "artilect",
      messages: [{ role: "user", content: "hello" }],
    });
    await handleModelApi(url, method, req, engine);

    expect(capturedTarget).toBe(conn1.entity!);
  });
});
