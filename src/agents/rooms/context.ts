/**
 * Context documentation for the LLM about Marina room building.
 * This is injected into the agent's system prompt when in builder mode.
 */

export function getRoomBuildingContext(): string {
  return `## Marina Room Building Guide

### RoomModule Interface
Every room is a TypeScript module that exports a default object conforming to RoomModule:

\`\`\`typescript
interface RoomModule {
  short: string;                          // Room title (shown in bold)
  long: string | ((ctx, viewer) => string); // Description (can be dynamic)
  items?: Record<string, string | ((ctx, viewer) => string)>;  // Examinable items
  exits?: Record<string, RoomId>;         // Direction -> destination room ID
  commands?: Record<string, CommandHandler>; // Custom commands in this room
  onEnter?: (ctx, entity) => void;        // Hook: entity enters room
  onLeave?: (ctx, entity) => void;        // Hook: entity leaves room
  onTick?: (ctx) => void;                 // Hook: called on server tick
}
\`\`\`

### RoomContext API
Available inside room handlers:
- \`ctx.entities\` — Array of entities in this room
- \`ctx.send(target, message)\` — Send message to specific entity
- \`ctx.broadcast(message)\` — Broadcast to all entities in room
- \`ctx.broadcastExcept(exclude, message)\` — Broadcast except one entity
- \`ctx.getEntity(id)\` — Get entity by ID
- \`ctx.findEntity(name)\` — Find entity by name (partial match)
- \`ctx.store\` — Room-scoped persistent KV store
  - \`ctx.store.get<T>(key)\` / \`ctx.store.set(key, value)\` / \`ctx.store.delete(key)\`
- \`ctx.spawn({name, short, long})\` — Spawn an NPC
- \`ctx.despawn(entityId)\` — Remove an NPC
- \`ctx.boards?.getBoard(name)\` / \`ctx.boards?.post(...)\` — Board API
- \`ctx.channels?.send(...)\` / \`ctx.channels?.history(...)\` — Channel API
- \`ctx.roomId\` — Current room's ID

### CommandInput
\`\`\`typescript
interface CommandInput {
  raw: string;        // Full user input
  verb: string;       // First word (command name)
  args: string;       // Rest after verb
  tokens: string[];   // Split by whitespace
  entity: EntityId;   // Who executed it
  room: RoomId;       // Which room
}
\`\`\`

### Sandbox Restrictions
Room code runs in a sandbox. These are FORBIDDEN:
- \`process\`, \`require\`, dynamic \`import()\`
- \`globalThis\`, \`Bun\`, \`Deno\`
- \`eval()\`, \`new Function()\`
- \`child_process\`, \`execSync\`, \`spawnSync\`
- Filesystem writes (\`writeFile\`, \`unlink\`)
- Network access (\`fetch\`, \`WebSocket\`, \`XMLHttpRequest\`)

### Room IDs
- Path-based strings: "hub/plaza", "market/bazaar", "dungeon/entrance"
- File path becomes room ID: rooms/hub/plaza.ts -> "hub/plaza"
- Convention: district/room-name

### Build Commands
- \`build room <id>\` — Create a new room (pipe code via stdin)
- \`build modify <id> short <value>\` — Change room title
- \`build modify <id> long <value>\` — Change room description
- \`build link <from> <direction> <to>\` — Create exit between rooms
- \`build unlink <id> <direction>\` — Remove exit
- \`build code <id>\` — View room source
- \`build validate <id>\` — Check room for errors
- \`build reload <id>\` — Reload room from source
- \`build destroy <id>\` — Delete a room
- \`build template [name]\` — View available templates

### Rank Requirements
- Rank 0 (guest): Can explore and communicate
- Rank 1 (citizen): Full access to channels, boards, groups, tasks
- Rank 2 (builder): Can build rooms using the build command
- Rank 3 (architect): Can modify any room
- Rank 4 (admin): Full server access

### Best Practices
1. Keep room descriptions vivid but concise (2-3 sentences)
2. Add 2-3 examinable items per room for depth
3. Use dynamic descriptions (functions) for rooms that change state
4. Use ctx.store for persistent state that survives server restarts
5. Spawn NPCs in onTick only if they don't already exist
6. Always handle missing args in custom commands
7. Use broadcastExcept for actions to avoid echoing back to the actor`;
}
