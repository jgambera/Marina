# Artilect — Claude Code Conventions

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

## Key Files
- `src/types.ts` — all core types
- `src/engine/engine.ts` — engine class, command processing, tick loop
- `src/persistence/database.ts` — migrations, ArtilectDB class
- `src/net/mcp-server.ts` — MCP server with ~30 tools
- `src/net/model-api.ts` — OpenAI-compatible endpoint
- `worlds/default.ts` — default world definition
- `test/helpers.ts` — shared test utilities
