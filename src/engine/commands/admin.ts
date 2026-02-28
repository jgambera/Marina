import type { ArtilectDB } from "../../persistence/database";
import { exportState } from "../../persistence/export-import";
import type { CommandDef, Connection, Entity, EntityId } from "../../types";

interface AdminDeps {
  db: ArtilectDB;
  dbPath?: string;
  worldName?: string;
  getEntity: (id: string) => Entity | undefined;
  findEntity: (name: string) => Entity | undefined;
  getConnections: () => Map<string, Connection>;
  removeConnection: (connId: string) => void;
  broadcastAll: (message: string) => void;
  roomCount: () => number;
  entityCount: () => number;
  getUptime: () => number;
  reloadRoom?: (roomId: string) => Promise<string>;
}

export function adminCommand(deps: AdminDeps): CommandDef {
  return {
    name: "admin",
    minRank: 4,
    help: "Admin commands. Requires rank 4.\nUsage: admin kick|ban|unban|bans|stats|announce|reload|export\n\nExamples:\n  admin kick Alice\n  admin ban Bob Griefing\n  admin stats\n  admin announce Server restart in 5 minutes",
    handler(ctx, input) {
      const entity = deps.getEntity(input.entity);
      if (!entity) return;

      const sub = input.tokens[0]?.toLowerCase();
      if (!sub) {
        ctx.send(input.entity, "Usage: admin <kick|ban|unban|stats|announce|reload|export> [args]");
        return;
      }

      switch (sub) {
        case "kick": {
          const targetName = input.tokens[1];
          if (!targetName) {
            ctx.send(input.entity, "Usage: admin kick <entity>");
            return;
          }
          const target = deps.findEntity(targetName);
          if (!target) {
            ctx.send(input.entity, `Entity "${targetName}" not found.`);
            return;
          }
          // Find their connection and disconnect
          const conns = deps.getConnections();
          for (const [connId, conn] of conns) {
            if (conn.entity === target.id) {
              conn.send({
                kind: "system",
                timestamp: Date.now(),
                data: { text: "You have been kicked by an admin." },
              });
              deps.removeConnection(connId);
              ctx.send(input.entity, `Kicked ${target.name}.`);
              deps.broadcastAll(`${target.name} has been kicked.`);
              return;
            }
          }
          ctx.send(input.entity, `Could not find connection for ${target.name}.`);
          break;
        }

        case "ban": {
          const targetName = input.tokens[1];
          if (!targetName) {
            ctx.send(input.entity, "Usage: admin ban <entity> [reason]");
            return;
          }
          const reason = input.tokens.slice(2).join(" ") || "No reason given";

          // Kick if online
          const target = deps.findEntity(targetName);
          if (target) {
            const conns = deps.getConnections();
            for (const [connId, conn] of conns) {
              if (conn.entity === target.id) {
                conn.send({
                  kind: "system",
                  timestamp: Date.now(),
                  data: { text: `You have been banned: ${reason}` },
                });
                deps.removeConnection(connId);
                break;
              }
            }
          }

          deps.db.addBan(targetName, entity.name, reason);
          ctx.send(input.entity, `Banned ${targetName}: ${reason}`);
          deps.broadcastAll(`${targetName} has been banned.`);
          break;
        }

        case "unban": {
          const targetName = input.tokens[1];
          if (!targetName) {
            ctx.send(input.entity, "Usage: admin unban <entity>");
            return;
          }
          if (deps.db.removeBan(targetName)) {
            ctx.send(input.entity, `Unbanned ${targetName}.`);
          } else {
            ctx.send(input.entity, `${targetName} is not banned.`);
          }
          break;
        }

        case "bans": {
          const bans = deps.db.listBans();
          if (bans.length === 0) {
            ctx.send(input.entity, "No active bans.");
            return;
          }
          const lines = bans.map(
            (b) => `  ${b.name} — by ${b.banned_by}: ${b.reason || "(no reason)"}`,
          );
          ctx.send(input.entity, `Active bans (${bans.length}):\n${lines.join("\n")}`);
          break;
        }

        case "stats": {
          const uptime = deps.getUptime();
          const hours = Math.floor(uptime / 3600000);
          const mins = Math.floor((uptime % 3600000) / 60000);
          const onlineCount = deps.getConnections().size;
          const lines = [
            "Server Stats:",
            `  Rooms: ${deps.roomCount()}`,
            `  Entities: ${deps.entityCount()}`,
            `  Online connections: ${onlineCount}`,
            `  Uptime: ${hours}h ${mins}m`,
          ];
          ctx.send(input.entity, lines.join("\n"));
          break;
        }

        case "announce": {
          const message = input.tokens.slice(1).join(" ");
          if (!message) {
            ctx.send(input.entity, "Usage: admin announce <message>");
            return;
          }
          deps.broadcastAll(`[ADMIN] ${message}`);
          ctx.send(input.entity, "Announcement sent.");
          break;
        }

        case "reload": {
          const roomId = input.tokens[1];
          if (!roomId) {
            ctx.send(input.entity, "Usage: admin reload <room-id>");
            return;
          }
          if (!deps.reloadRoom) {
            ctx.send(input.entity, "Room reloading is not available.");
            return;
          }
          deps.reloadRoom(roomId).then(
            (msg) => ctx.send(input.entity, msg),
            (err) => ctx.send(input.entity, `Reload failed: ${err}`),
          );
          break;
        }

        case "export": {
          const dbPath = deps.dbPath ?? "artilect.db";
          const outputPath =
            input.tokens[1] ??
            `artilect-export-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
          const skipEvents = input.tokens.includes("--skip-events");
          const skipConnectors = input.tokens.includes("--skip-connectors");

          try {
            ctx.send(input.entity, `Exporting state from ${dbPath}...`);
            const snapshot = exportState(dbPath, {
              skipEventLog: skipEvents,
              skipConnectors,
              worldName: deps.worldName,
            });

            const tableNames = Object.keys(snapshot.tables);
            let totalRows = 0;
            for (const name of tableNames) {
              totalRows += snapshot.tables[name]!.length;
            }

            Bun.write(outputPath, JSON.stringify(snapshot, null, 2)).then(
              () => {
                ctx.send(
                  input.entity,
                  `Exported ${totalRows} rows (${tableNames.length} tables) to ${outputPath}`,
                );
              },
              (err) => {
                ctx.send(input.entity, `Export write failed: ${err}`);
              },
            );
          } catch (err) {
            ctx.send(
              input.entity,
              `Export failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          break;
        }

        default:
          ctx.send(input.entity, `Unknown admin command: ${sub}`);
      }
    },
  };
}
