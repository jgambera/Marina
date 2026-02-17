import { error as fmtError, header, separator, success } from "../../net/ansi";
import type { ArtilectDB } from "../../persistence/database";
import type { CommandDef, Entity, RoomContext, RoomId, RoomModule } from "../../types";
import { getRank } from "../permissions";
import {
  DEFAULT_COMMAND_SOURCE,
  compileCommandModule,
  compileRoomModule,
  validateCommandSource,
  validateRoomSource,
} from "../sandbox";

export interface BuildDeps {
  getEntity: (id: string) => Entity | undefined;
  db: ArtilectDB;
  getRoom: (id: RoomId) => { id: RoomId; module: RoomModule } | undefined;
  registerRoom: (id: RoomId, module: RoomModule) => void;
  replaceRoom: (id: RoomId, module: RoomModule) => void;
  entitiesInRoom: (room: RoomId) => Entity[];
  registerCommand?: (def: CommandDef) => void;
  unregisterCommand?: (name: string) => boolean;
  isBuiltinCommand?: (name: string) => boolean;
  clearSandboxMetrics?: (roomId: string) => void;
}

export function buildCommand(deps: BuildDeps): CommandDef {
  return {
    name: "build",
    aliases: [],
    minRank: 2,
    help: "In-game building. Usage: build [room|modify|link|unlink|code|validate|reload|audit|revert|destroy|template] [args]",
    handler: async (ctx: RoomContext, input) => {
      const entity = deps.getEntity(input.entity);
      if (!entity) return;

      const rank = getRank(entity);

      const tokens = input.tokens;
      const sub = tokens[0]?.toLowerCase() ?? "help";

      switch (sub) {
        case "space": {
          // build space <id> [short description]
          const roomIdStr = tokens[1];
          if (!roomIdStr) {
            ctx.send(input.entity, "Usage: build space <id> [short description]");
            return;
          }
          const newRoomId = roomIdStr as RoomId;
          const existing = deps.getRoom(newRoomId);
          if (existing) {
            ctx.send(input.entity, `Space "${roomIdStr}" already exists.`);
            return;
          }

          const short = tokens.slice(2).join(" ") || "An empty space";
          const module: RoomModule = {
            short,
            long: "This space has not been described yet.",
            exits: {},
            items: {},
          };

          deps.registerRoom(newRoomId, module);

          // Save source to DB
          const source = generateRoomSource(module);
          deps.db.saveRoomSource({
            roomId: roomIdStr,
            source,
            authorId: input.entity,
            authorName: entity.name,
            valid: true,
          });

          ctx.send(input.entity, `Created space "${roomIdStr}" with short: "${short}".`);
          return;
        }

        case "modify": {
          // build modify [room] <field> <value>
          // field: short, long, items.key, items.key.delete
          const FIELDS = ["short", "long", "item"];
          const firstIsField = FIELDS.includes(tokens[1]?.toLowerCase() ?? "");
          const targetRoomId =
            !firstIsField && tokens.length >= 4 ? tokens[1]! : (entity.room as string);
          const fieldIdx = !firstIsField && tokens.length >= 4 ? 2 : 1;
          const field = tokens[fieldIdx]?.toLowerCase();
          const value = tokens.slice(fieldIdx + 1).join(" ");

          if (!field || !value) {
            ctx.send(
              input.entity,
              "Usage: build modify [space] <short|long|item> <value>\n  build modify short A new description\n  build modify long A longer description...\n  build modify item <key> <description>",
            );
            return;
          }

          const room = deps.getRoom(targetRoomId as RoomId);
          if (!room) {
            ctx.send(input.entity, `Space "${targetRoomId}" not found.`);
            return;
          }

          if (field === "short") {
            room.module.short = value;
          } else if (field === "long") {
            if (typeof room.module.long === "string") {
              room.module.long = value;
            } else {
              ctx.send(input.entity, "Cannot modify a dynamic long description.");
              return;
            }
          } else if (field === "item") {
            // build modify item <key> <description>
            const itemKey = tokens[fieldIdx + 1];
            const itemDesc = tokens.slice(fieldIdx + 2).join(" ");
            if (!itemKey || !itemDesc) {
              ctx.send(input.entity, "Usage: build modify item <key> <description>");
              return;
            }
            if (!room.module.items) room.module.items = {};
            room.module.items[itemKey] = itemDesc;
          } else {
            ctx.send(input.entity, `Unknown field "${field}". Use: short, long, item`);
            return;
          }

          // Save updated source
          const source = generateRoomSource(room.module);
          deps.db.saveRoomSource({
            roomId: targetRoomId,
            source,
            authorId: input.entity,
            authorName: entity.name,
            valid: true,
          });

          ctx.send(input.entity, `Modified ${field} of "${targetRoomId}".`);
          return;
        }

        case "link": {
          // build link [from] <exit> <to>
          if (tokens.length < 3) {
            ctx.send(input.entity, "Usage: build link [from] <exit> <to>");
            return;
          }
          let fromId: string;
          let exitName: string;
          let toId: string;
          if (tokens.length >= 4) {
            fromId = tokens[1]!;
            exitName = tokens[2]!;
            toId = tokens[3]!;
          } else {
            fromId = entity.room as string;
            exitName = tokens[1]!;
            toId = tokens[2]!;
          }

          const fromRoom = deps.getRoom(fromId as RoomId);
          if (!fromRoom) {
            ctx.send(input.entity, `Space "${fromId}" not found.`);
            return;
          }

          if (!fromRoom.module.exits) fromRoom.module.exits = {};
          fromRoom.module.exits[exitName] = toId as RoomId;

          const source = generateRoomSource(fromRoom.module);
          deps.db.saveRoomSource({
            roomId: fromId,
            source,
            authorId: input.entity,
            authorName: entity.name,
            valid: true,
          });

          ctx.send(input.entity, `Linked exit "${exitName}" from "${fromId}" to "${toId}".`);
          return;
        }

        case "unlink": {
          // build unlink [from] <exit>
          if (tokens.length < 2) {
            ctx.send(input.entity, "Usage: build unlink [from] <exit>");
            return;
          }
          let fromId: string;
          let exitName: string;
          if (tokens.length >= 3) {
            fromId = tokens[1]!;
            exitName = tokens[2]!;
          } else {
            fromId = entity.room as string;
            exitName = tokens[1]!;
          }

          const fromRoom = deps.getRoom(fromId as RoomId);
          if (!fromRoom) {
            ctx.send(input.entity, `Space "${fromId}" not found.`);
            return;
          }

          if (!fromRoom.module.exits?.[exitName]) {
            ctx.send(input.entity, `No exit "${exitName}" in "${fromId}".`);
            return;
          }

          delete fromRoom.module.exits[exitName];

          const source = generateRoomSource(fromRoom.module);
          deps.db.saveRoomSource({
            roomId: fromId,
            source,
            authorId: input.entity,
            authorName: entity.name,
            valid: true,
          });

          ctx.send(input.entity, `Removed exit "${exitName}" from "${fromId}".`);
          return;
        }

        case "code": {
          // build code <room> <source> — set raw TypeScript source
          if (rank < 3) {
            ctx.send(input.entity, "You must be at least an architect (rank 3) to set space code.");
            return;
          }

          const roomIdStr = tokens[1];
          if (!roomIdStr) {
            ctx.send(input.entity, "Usage: build code <space> <typescript source>");
            return;
          }

          const source = tokens.slice(2).join(" ");
          if (!source) {
            // Show current source
            const current = deps.db.getRoomSource(roomIdStr);
            if (current) {
              ctx.send(
                input.entity,
                `${header(`Source for ${roomIdStr} (v${current.version}):`)}\n${current.source}`,
              );
            } else {
              ctx.send(input.entity, `No stored source for "${roomIdStr}".`);
            }
            return;
          }

          const validation = validateRoomSource(source);
          if (!validation.valid) {
            ctx.send(
              input.entity,
              `${fmtError("Validation failed:")}\n${validation.errors.join("\n")}`,
            );
            return;
          }

          const version = deps.db.saveRoomSource({
            roomId: roomIdStr,
            source,
            authorId: input.entity,
            authorName: entity.name,
            valid: false,
          });

          ctx.send(
            input.entity,
            `Saved source for "${roomIdStr}" (v${version}). Use "build validate ${roomIdStr}" to check, then "build reload ${roomIdStr}" to apply.`,
          );
          return;
        }

        case "validate": {
          // build validate <room>
          const roomIdStr = tokens[1] ?? (entity.room as string);
          const source = deps.db.getRoomSource(roomIdStr);
          if (!source) {
            ctx.send(input.entity, `No stored source for "${roomIdStr}".`);
            return;
          }

          const validation = validateRoomSource(source.source);
          if (validation.valid) {
            deps.db.markRoomSourceValid(roomIdStr, source.version);
            ctx.send(
              input.entity,
              success(`Source for "${roomIdStr}" v${source.version} is valid.`),
            );
          } else {
            ctx.send(
              input.entity,
              `${fmtError(`Validation failed for "${roomIdStr}" v${source.version}:`)}\n${validation.errors.join("\n")}`,
            );
          }
          return;
        }

        case "reload": {
          // build reload <room> — compile and hot-reload
          if (rank < 3) {
            ctx.send(input.entity, "You must be at least an architect (rank 3) to reload spaces.");
            return;
          }

          const roomIdStr = tokens[1] ?? (entity.room as string);
          const source = deps.db.getRoomSource(roomIdStr);
          if (!source) {
            ctx.send(input.entity, `No stored source for "${roomIdStr}".`);
            return;
          }

          try {
            const module = await compileRoomModule(source.source);
            const rid = roomIdStr as RoomId;
            if (deps.getRoom(rid)) {
              deps.replaceRoom(rid, module);
            } else {
              deps.registerRoom(rid, module);
            }
            deps.db.markRoomSourceValid(roomIdStr, source.version);
            ctx.send(
              input.entity,
              success(`Reloaded space "${roomIdStr}" from v${source.version}.`),
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            ctx.send(input.entity, `${fmtError("Reload failed:")} ${msg}`);
          }
          return;
        }

        case "audit": {
          // build audit <room> — show version history
          const roomIdStr = tokens[1] ?? (entity.room as string);
          const history = deps.db.getRoomSourceHistory(roomIdStr);
          if (history.length === 0) {
            ctx.send(input.entity, `No source history for "${roomIdStr}".`);
            return;
          }

          const lines = [
            header(`Source History: ${roomIdStr}`),
            separator(),
            ...history.map((h) => {
              const date = new Date(h.created_at).toISOString().slice(0, 19);
              const valid = h.valid ? success("\u2713") : fmtError("\u2717");
              return `  v${h.version} ${valid} by ${h.author_name} at ${date}`;
            }),
          ];
          ctx.send(input.entity, lines.join("\n"));
          return;
        }

        case "revert": {
          // build revert <room> [version]
          if (rank < 3) {
            ctx.send(input.entity, "You must be at least an architect (rank 3) to revert spaces.");
            return;
          }

          const roomIdStr = tokens[1];
          if (!roomIdStr) {
            ctx.send(input.entity, "Usage: build revert <space> [version]");
            return;
          }

          const versionStr = tokens[2];
          let targetVersion: number;
          if (versionStr) {
            targetVersion = Number.parseInt(versionStr, 10);
          } else {
            // Revert to previous version
            const latest = deps.db.getLatestRoomSourceVersion(roomIdStr);
            targetVersion = latest - 1;
          }

          if (targetVersion < 1) {
            ctx.send(input.entity, "No previous version to revert to.");
            return;
          }

          const source = deps.db.getRoomSource(roomIdStr, targetVersion);
          if (!source) {
            ctx.send(input.entity, `Version ${targetVersion} not found for "${roomIdStr}".`);
            return;
          }

          try {
            const module = await compileRoomModule(source.source);
            const rid = roomIdStr as RoomId;
            if (deps.getRoom(rid)) {
              deps.replaceRoom(rid, module);
            } else {
              deps.registerRoom(rid, module);
            }

            // Save as new version (revert is a new entry)
            const newVersion = deps.db.saveRoomSource({
              roomId: roomIdStr,
              source: source.source,
              authorId: input.entity,
              authorName: entity.name,
              valid: true,
            });

            ctx.send(
              input.entity,
              `Reverted "${roomIdStr}" to v${targetVersion} (saved as v${newVersion}).`,
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            ctx.send(input.entity, `${fmtError("Revert failed:")} ${msg}`);
          }
          return;
        }

        case "destroy": {
          // build destroy <room>
          if (rank < 3) {
            ctx.send(input.entity, "You must be at least an architect (rank 3) to destroy spaces.");
            return;
          }

          const roomIdStr = tokens[1];
          if (!roomIdStr) {
            ctx.send(input.entity, "Usage: build destroy <space>");
            return;
          }

          const room = deps.getRoom(roomIdStr as RoomId);
          if (!room) {
            ctx.send(input.entity, `Space "${roomIdStr}" not found.`);
            return;
          }

          // Check if anyone is in the room
          const occupants = deps.entitiesInRoom(roomIdStr as RoomId);
          if (occupants.length > 0) {
            ctx.send(
              input.entity,
              `Cannot destroy "${roomIdStr}" — ${occupants.length} entities are inside.`,
            );
            return;
          }

          deps.db.deleteRoomSources(roomIdStr);
          deps.clearSandboxMetrics?.(roomIdStr);
          ctx.send(input.entity, `Destroyed space "${roomIdStr}" and its source history.`);
          return;
        }

        case "template": {
          // build template save|list|apply
          const templateSub = tokens[1]?.toLowerCase();
          switch (templateSub) {
            case "save": {
              // build template save <room> <name> [description]
              const roomIdStr = tokens[2];
              const templateName = tokens[3];
              if (!roomIdStr || !templateName) {
                ctx.send(input.entity, "Usage: build template save <space> <name> [description]");
                return;
              }

              const source = deps.db.getRoomSource(roomIdStr);
              if (!source) {
                // Generate from live room
                const room = deps.getRoom(roomIdStr as RoomId);
                if (!room) {
                  ctx.send(input.entity, `Space "${roomIdStr}" not found.`);
                  return;
                }
                const generatedSource = generateRoomSource(room.module);
                const description = tokens.slice(4).join(" ");
                deps.db.saveRoomTemplate({
                  name: templateName,
                  source: generatedSource,
                  authorId: input.entity,
                  authorName: entity.name,
                  description,
                });
              } else {
                const description = tokens.slice(4).join(" ");
                deps.db.saveRoomTemplate({
                  name: templateName,
                  source: source.source,
                  authorId: input.entity,
                  authorName: entity.name,
                  description,
                });
              }

              ctx.send(input.entity, `Saved template "${templateName}".`);
              return;
            }

            case "list": {
              const templates = deps.db.getAllRoomTemplates();
              if (templates.length === 0) {
                ctx.send(input.entity, "No templates saved.");
                return;
              }
              const lines = [
                header("Space Templates"),
                separator(),
                ...templates.map(
                  (t) =>
                    `  ${t.name} — by ${t.author_name}${t.description ? ` (${t.description})` : ""}`,
                ),
              ];
              ctx.send(input.entity, lines.join("\n"));
              return;
            }

            case "apply": {
              // build template apply <name> <newRoomId>
              const templateName = tokens[2];
              const newRoomIdStr = tokens[3];
              if (!templateName || !newRoomIdStr) {
                ctx.send(input.entity, "Usage: build template apply <name> <newRoomId>");
                return;
              }

              const template = deps.db.getRoomTemplate(templateName);
              if (!template) {
                ctx.send(input.entity, `Template "${templateName}" not found.`);
                return;
              }

              const existing = deps.getRoom(newRoomIdStr as RoomId);
              if (existing) {
                ctx.send(input.entity, `Space "${newRoomIdStr}" already exists.`);
                return;
              }

              try {
                const module = await compileRoomModule(template.source);
                deps.registerRoom(newRoomIdStr as RoomId, module);
                deps.db.saveRoomSource({
                  roomId: newRoomIdStr,
                  source: template.source,
                  authorId: input.entity,
                  authorName: entity.name,
                  valid: true,
                });
                ctx.send(
                  input.entity,
                  `Applied template "${templateName}" to create space "${newRoomIdStr}".`,
                );
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                ctx.send(input.entity, `${fmtError("Template apply failed:")} ${msg}`);
              }
              return;
            }

            default:
              ctx.send(input.entity, "Usage: build template save|list|apply [args]");
              return;
          }
        }

        case "command": {
          // build command <sub> [args]
          const cmdSub = tokens[1]?.toLowerCase();
          if (!cmdSub) {
            ctx.send(
              input.entity,
              "Usage: build command create|code|validate|reload|list|audit|destroy <name>",
            );
            return;
          }

          switch (cmdSub) {
            case "create": {
              // build command create <name>
              const name = tokens[2]?.toLowerCase();
              if (!name) {
                ctx.send(input.entity, "Usage: build command create <name>");
                return;
              }
              if (name.length < 2 || name.length > 30) {
                ctx.send(input.entity, "Command name must be 2-30 characters.");
                return;
              }
              const existing = deps.db.getCommandByName(name);
              if (existing) {
                ctx.send(
                  input.entity,
                  `Command "${name}" already exists. Use 'build command code ${name}' to edit.`,
                );
                return;
              }
              if (deps.isBuiltinCommand?.(name)) {
                ctx.send(
                  input.entity,
                  fmtError(`Cannot create "${name}" — it conflicts with a built-in command.`),
                );
                return;
              }
              const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              deps.db.saveCommandSource({
                id: cmdId,
                name,
                source: DEFAULT_COMMAND_SOURCE.replace("mycommand", name),
                createdBy: entity.name,
              });
              ctx.send(
                input.entity,
                `Created command "${name}" with default source. Use 'build command code ${name} <source>' to set source, then 'build command reload ${name}'.`,
              );
              return;
            }

            case "code": {
              // build command code <name> [source]
              if (rank < 3) {
                ctx.send(
                  input.entity,
                  "You must be at least an architect (rank 3) to set command code.",
                );
                return;
              }
              const name = tokens[2]?.toLowerCase();
              if (!name) {
                ctx.send(input.entity, "Usage: build command code <name> [source]");
                return;
              }
              const source = tokens.slice(3).join(" ");
              if (!source) {
                const current = deps.db.getCommandByName(name);
                if (current) {
                  ctx.send(
                    input.entity,
                    `${header(`Source for command "${name}" (v${current.version}):`)}\n${current.source}`,
                  );
                } else {
                  ctx.send(input.entity, `Command "${name}" not found.`);
                }
                return;
              }
              const validation = validateCommandSource(source);
              if (!validation.valid) {
                ctx.send(
                  input.entity,
                  `${fmtError("Validation failed:")}\n${validation.errors.join("\n")}`,
                );
                return;
              }
              const existing = deps.db.getCommandByName(name);
              if (existing) {
                deps.db.saveCommandSource({
                  id: existing.id,
                  name,
                  source,
                  createdBy: entity.name,
                });
              } else {
                const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                deps.db.saveCommandSource({
                  id: cmdId,
                  name,
                  source,
                  createdBy: entity.name,
                });
              }
              ctx.send(
                input.entity,
                `Saved source for command "${name}". Use 'build command reload ${name}' to compile and register.`,
              );
              return;
            }

            case "validate": {
              // build command validate <name>
              const name = tokens[2]?.toLowerCase();
              if (!name) {
                ctx.send(input.entity, "Usage: build command validate <name>");
                return;
              }
              const cmd = deps.db.getCommandByName(name);
              if (!cmd) {
                ctx.send(input.entity, `Command "${name}" not found.`);
                return;
              }
              const validation = validateCommandSource(cmd.source);
              if (validation.valid) {
                ctx.send(input.entity, success(`Command "${name}" v${cmd.version} is valid.`));
              } else {
                ctx.send(
                  input.entity,
                  `${fmtError(`Validation failed for "${name}" v${cmd.version}:`)}\n${validation.errors.join("\n")}`,
                );
              }
              return;
            }

            case "reload": {
              // build command reload <name>
              if (rank < 3) {
                ctx.send(
                  input.entity,
                  "You must be at least an architect (rank 3) to reload commands.",
                );
                return;
              }
              const name = tokens[2]?.toLowerCase();
              if (!name) {
                ctx.send(input.entity, "Usage: build command reload <name>");
                return;
              }
              const cmd = deps.db.getCommandByName(name);
              if (!cmd) {
                ctx.send(input.entity, `Command "${name}" not found.`);
                return;
              }
              try {
                const compiled = await compileCommandModule(cmd.source);
                if (compiled.name !== name) {
                  ctx.send(
                    input.entity,
                    fmtError(
                      `Source exports name "${compiled.name}" but DB name is "${name}". Fix the source to match.`,
                    ),
                  );
                  return;
                }
                deps.db.markCommandValid(name);
                if (deps.registerCommand) {
                  // Unregister old version by DB name first
                  deps.unregisterCommand?.(name);
                  deps.registerCommand(compiled);
                  ctx.send(input.entity, success(`Command "${name}" reloaded and registered.`));
                } else {
                  ctx.send(
                    input.entity,
                    success(
                      `Command "${name}" compiled successfully but registration not available.`,
                    ),
                  );
                }
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                ctx.send(input.entity, `${fmtError("Reload failed:")} ${msg}`);
              }
              return;
            }

            case "list": {
              const commands = deps.db.listCommands();
              if (commands.length === 0) {
                ctx.send(
                  input.entity,
                  "No dynamic commands. Use 'build command create <name>' to create one.",
                );
                return;
              }
              const lines = [
                header("Dynamic Commands"),
                separator(),
                ...commands.map((c) => {
                  const valid = c.valid ? success("\u2713") : fmtError("\u2717");
                  return `  ${valid} ${c.name} (v${c.version}) by ${c.created_by}`;
                }),
              ];
              ctx.send(input.entity, lines.join("\n"));
              return;
            }

            case "audit": {
              const name = tokens[2]?.toLowerCase();
              if (!name) {
                ctx.send(input.entity, "Usage: build command audit <name>");
                return;
              }
              const history = deps.db.getCommandHistory(name);
              const current = deps.db.getCommandByName(name);
              if (!current && history.length === 0) {
                ctx.send(input.entity, `No history for command "${name}".`);
                return;
              }
              const lines = [header(`Command History: ${name}`), separator()];
              if (current) {
                const valid = current.valid ? success("\u2713") : fmtError("\u2717");
                lines.push(`  v${current.version} ${valid} (current) by ${current.created_by}`);
              }
              for (const h of history) {
                const date = new Date(h.edited_at).toISOString().slice(0, 19);
                lines.push(`  v${h.version} by ${h.edited_by} at ${date}`);
              }
              ctx.send(input.entity, lines.join("\n"));
              return;
            }

            case "destroy": {
              if (rank < 3) {
                ctx.send(
                  input.entity,
                  "You must be at least an architect (rank 3) to destroy commands.",
                );
                return;
              }
              const name = tokens[2]?.toLowerCase();
              if (!name) {
                ctx.send(input.entity, "Usage: build command destroy <name>");
                return;
              }
              const cmd = deps.db.getCommandByName(name);
              if (!cmd) {
                ctx.send(input.entity, `Command "${name}" not found.`);
                return;
              }
              deps.unregisterCommand?.(name);
              deps.db.deleteCommand(name);
              ctx.send(input.entity, `Command "${name}" destroyed.`);
              return;
            }

            default:
              ctx.send(
                input.entity,
                "Usage: build command create|code|validate|reload|list|audit|destroy <name>",
              );
              return;
          }
        }

        default:
          ctx.send(
            input.entity,
            "Usage: build space|modify|link|unlink|code|validate|reload|audit|revert|destroy|template|command [args]",
          );
      }
    },
  };
}

// ─── Helper: Generate room source from module ────────────────────────────────

function generateRoomSource(module: RoomModule): string {
  const lines: string[] = [];
  lines.push('import type { RoomModule, RoomId } from "../../src/types";');
  lines.push("");
  lines.push("const room: RoomModule = {");
  lines.push(`  short: ${JSON.stringify(module.short)},`);

  if (typeof module.long === "string") {
    lines.push(`  long: ${JSON.stringify(module.long)},`);
  } else {
    lines.push('  long: "(dynamic)",');
  }

  if (module.exits && Object.keys(module.exits).length > 0) {
    lines.push("  exits: {");
    for (const [dir, target] of Object.entries(module.exits)) {
      lines.push(`    ${JSON.stringify(dir)}: ${JSON.stringify(target)} as RoomId,`);
    }
    lines.push("  },");
  } else {
    lines.push("  exits: {},");
  }

  if (module.items && Object.keys(module.items).length > 0) {
    lines.push("  items: {");
    for (const [key, desc] of Object.entries(module.items)) {
      if (typeof desc === "string") {
        lines.push(`    ${JSON.stringify(key)}: ${JSON.stringify(desc)},`);
      }
    }
    lines.push("  },");
  }

  lines.push("};");
  lines.push("");
  lines.push("export default room;");
  lines.push("");

  return lines.join("\n");
}
