import type { MarinaDB } from "../../persistence/database";
import type { CommandDef, Entity, EntityRank, RoomContext } from "../../types";
import { getRank, rankName, setRank } from "../permissions";

interface RankDeps {
  findEntity: (name: string) => Entity | undefined;
  db?: MarinaDB;
}

export function rankCommand(deps: RankDeps): CommandDef {
  return {
    name: "rank",
    aliases: [],
    help: "Check your rank or set another entity's rank. Usage: rank [entity [level]]",
    handler: (ctx: RoomContext, input) => {
      const self = ctx.getEntity(input.entity);
      if (!self) return;

      if (!input.args) {
        const rank = getRank(self);
        ctx.send(input.entity, `Your rank: ${rankName(rank)} (${rank})`);
        return;
      }

      const tokens = input.tokens;
      const targetName = tokens[0];
      if (!targetName) {
        ctx.send(input.entity, "Usage: rank [entity [level]]");
        return;
      }

      if (tokens.length < 2) {
        // Check another player's rank
        const target = deps.findEntity(targetName);
        if (!target) {
          ctx.send(input.entity, `Entity "${targetName}" not found.`);
          return;
        }
        const rank = getRank(target);
        ctx.send(input.entity, `${target.name}'s rank: ${rankName(rank)} (${rank})`);
        return;
      }

      // Set rank: requires admin (4)
      if (getRank(self) < 4) {
        ctx.send(input.entity, "Only admins can set ranks.");
        return;
      }

      const target = deps.findEntity(targetName);
      if (!target) {
        ctx.send(input.entity, `Entity "${targetName}" not found.`);
        return;
      }

      const level = Number.parseInt(tokens[1] ?? "", 10);
      if (Number.isNaN(level) || level < 0 || level > 4) {
        ctx.send(input.entity, "Rank must be 0-4 (guest, citizen, builder, architect, admin).");
        return;
      }

      setRank(target, level as EntityRank);

      // Persist to database
      if (deps.db) {
        const user = deps.db.getUserByName(target.name);
        if (user) deps.db.updateUserRank(user.id, level);
      }

      ctx.send(
        input.entity,
        `Set ${target.name}'s rank to ${rankName(level as EntityRank)} (${level}).`,
      );
      ctx.send(target.id, `Your rank has been set to ${rankName(level as EntityRank)} (${level}).`);
    },
  };
}
