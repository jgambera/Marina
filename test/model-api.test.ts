import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { ChannelManager } from "../src/coordination/channel-manager";
import { Engine } from "../src/engine/engine";
import { handleModelApi } from "../src/net/model-api";
import { ArtilectDB } from "../src/persistence/database";
import { roomId } from "../src/types";
import { MockConnection, cleanupDb, makeTestRoom } from "./helpers";

const TEST_DB = "test_model_api.db";

function makeRequest(path: string, method: string, body?: unknown): [URL, string, Request] {
  const url = new URL(`http://localhost:3300${path}`);
  const req = new Request(url.toString(), {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return [url, method, req];
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
  });

  afterEach(() => {
    db.close();
    cleanupDb(TEST_DB);
  });

  it("GET /v1/models returns empty list when no model channels exist", async () => {
    const [url, method, req] = makeRequest("/v1/models", "GET");
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp).toBeDefined();
    const data = await resp!.json();
    expect(data.object).toBe("list");
    expect(data.data).toHaveLength(0);
  });

  it("GET /v1/models lists channels matching model* pattern", async () => {
    engine.processCommand(conn1.entity!, "channel create model");
    const [url, method, req] = makeRequest("/v1/models", "GET");
    const resp = await handleModelApi(url, method, req, engine);
    const data = await resp!.json();
    expect(data.data.length).toBeGreaterThanOrEqual(1);
    expect(data.data[0].id).toBe("artilect");
    expect(data.data[0].owned_by).toBe("artilect");
  });

  it("GET /api/tags returns Ollama format model list", async () => {
    engine.processCommand(conn1.entity!, "channel create model");
    const [url, method, req] = makeRequest("/api/tags", "GET");
    const resp = await handleModelApi(url, method, req, engine);
    const data = await resp!.json();
    expect(data.models).toBeDefined();
    expect(data.models[0].name).toBe("artilect");
  });

  it("POST /v1/chat/completions returns 404 for unknown model", async () => {
    const [url, method, req] = makeRequest("/v1/chat/completions", "POST", {
      model: "nonexistent",
      messages: [{ role: "user", content: "hello" }],
    });
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.status).toBe(404);
  });

  it("POST /v1/chat/completions returns 503 when no agents online", async () => {
    // Create channel but remove the agent's connection
    engine.processCommand(conn1.entity!, "channel create model");
    engine.removeConnection("c1");

    const [url, method, req] = makeRequest("/v1/chat/completions", "POST", {
      model: "artilect",
      messages: [{ role: "user", content: "hello" }],
    });
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.status).toBe(503);
  });

  it("POST /v1/chat/completions routes through channel and gets JSON response", async () => {
    engine.processCommand(conn1.entity!, "channel create model");

    // Simulate agent responding via channel listener
    cm.onMessage((channelId, senderId, _senderName, content) => {
      if (senderId === "__model_api__") {
        try {
          const parsed = JSON.parse(content);
          if (parsed.type === "model_request") {
            // Agent responds with model_response
            cm.send(
              channelId,
              conn1.entity!,
              "Agent1",
              JSON.stringify({
                type: "model_response",
                id: parsed.id,
                content: "Hello from Artilect!",
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
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.status).toBe(200);
    const data = await resp!.json();
    expect(data.choices[0].message.content).toBe("Hello from Artilect!");
    expect(data.model).toBe("artilect");
  });

  it("POST /v1/chat/completions accepts plaintext bracket response", async () => {
    engine.processCommand(conn1.entity!, "channel create model");

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
    engine.processCommand(conn1.entity!, "channel create model");

    cm.onMessage((channelId, senderId, _senderName, content) => {
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
                content: "Ollama response",
              }),
            );
          }
        } catch {}
      }
    });

    const [url, method, req] = makeRequest("/api/chat", "POST", {
      model: "artilect",
      messages: [{ role: "user", content: "hello" }],
    });
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.status).toBe(200);
    const data = await resp!.json();
    expect(data.message.content).toBe("Ollama response");
    expect(data.done).toBe(true);
  });

  it("POST /api/generate routes single prompt in Ollama format", async () => {
    engine.processCommand(conn1.entity!, "channel create model");

    cm.onMessage((channelId, senderId, _senderName, content) => {
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
                content: "Generated text",
              }),
            );
          }
        } catch {}
      }
    });

    const [url, method, req] = makeRequest("/api/generate", "POST", {
      model: "artilect",
      prompt: "Tell me a story",
    });
    const resp = await handleModelApi(url, method, req, engine);
    expect(resp!.status).toBe(200);
    const data = await resp!.json();
    expect(data.response).toBe("Generated text");
    expect(data.done).toBe(true);
  });

  it("model ID artilect:scholar maps to channel model-scholar", async () => {
    engine.processCommand(conn1.entity!, "channel create model-scholar");

    cm.onMessage((channelId, senderId, _senderName, content) => {
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
                content: "Scholar response",
              }),
            );
          }
        } catch {}
      }
    });

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
});
