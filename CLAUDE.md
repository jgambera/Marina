# Marina — Claude Code Conventions

## Build & Test
```bash
bun run start          # Start server
bun test               # Run all 896 tests (39 files)
bun run typecheck      # TypeScript strict check
bun run lint           # Biome lint
bun run format         # Biome auto-format (run before committing)
```

## Code Style
- **Formatter**: Biome — line width 100, indent 2 spaces
- **Imports**: alphabetical by path (biome organizeImports)
- **Types**: branded `EntityId`, `RoomId` — cast in tests: `"e_1" as EntityId`
- **Errors**: use `getErrorMessage()` for extraction, `tryLog()` for non-critical DB ops
- **DB table**: `groups_` not `groups` (SQL keyword)
- **FTS5**: add insert/update/delete triggers when creating FTS tables
- **Tests**: use helpers from `test/helpers.ts` (MockConnection, stripAnsi, cleanupDb)

## Architecture Rules
- Commands: one file per command in `src/engine/commands/`, register in `engine.ts` → `registerBuiltinCommands()`
- Migrations: append to `migrations` array in `src/persistence/database.ts`, never modify existing migrations
- MCP tools: add in `src/net/mcp-server.ts` → `createMcpServer()`
- Room handlers get `RoomContext`, built-in commands get `CommandContext` (extends with mcp/http/notes/memory/pool)
- `minRank` on `CommandDef` is the permission gate — don't add custom rank checks in handlers
- Tick budget: room onTick handlers must complete within 200ms total
- Non-critical DB operations should be wrapped in `tryLog()` or `tryLogAsync()`

## World Templates
- World definitions live in `worlds/` — each is a TypeScript file exporting a `WorldDefinition`
- `MARINA_WORLD` env var selects which world to load (default: `default`)
- Available worlds: `default` (blank canvas), `commons` (coordination-ready), `research` (research lab), `personal` (self-evolving agent), `empty` (minimal)
- `WorldDefinition.seed?(db)` runs once on first boot, seeds DB with templates/projects/tasks (must be idempotent)
- `RoomContext.brief?(entityId)` lets rooms push compass signals to entities
- `brief watch [N]` / `brief unwatch` — periodic compass subscription (30-600 ticks)

## Agent Runtime
- `src/engine/agent-runtime.ts` — AgentRuntime class: spawn/stop/list managed agents
- `src/engine/providers.ts` — Model resolution wrapper (pi-ai integration)
- `src/engine/commands/agent.ts` — `agent spawn|stop|list|status` command (minRank: architect)
- `src/agents/` — Agent intelligence layer (from artilect-agent)
  - `lean/` — Lean agent (delegates memory/state to platform)
  - `full/` — Full agent (local memory, curiosity, goals, learning)
  - `external/` — External bridge (Claude Code, Codex CLI, Goose adapters)
  - `tools/` — 17 marina_* tools for agent-server interaction
  - `net/` — MarinaClient WebSocket client, MCP client
  - `agent/` — Roles, model registry, social awareness, context management
  - `credentials/` — API key and custom endpoint management (~/.marina/)

## Key Files
- `src/types.ts` — all core types (includes `RoomContext.brief`)
- `src/engine/engine.ts` — engine class, command processing, tick loop, brief subscribers
- `src/persistence/database.ts` — migrations (25), MarinaDB class
- `src/net/mcp-server.ts` — MCP server with ~30 tools
- `src/net/model-api.ts` — OpenAI-compatible endpoint
- `src/world/world-definition.ts` — WorldDefinition interface (includes `seed`)
- `worlds/default.ts` — default world definition (blank canvas)
- `worlds/commons.ts` — coordination-focused world with seeded projects/templates
- `worlds/research.ts` — research-focused world
- `worlds/personal.ts` — single-agent evolver world
- `test/helpers.ts` — shared test utilities
