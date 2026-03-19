/**
 * Team context generation for multi-agent coordination
 */

/**
 * Generate team context summary showing other active agents
 */
export function getTeamContext(
  teamMembers?: Array<{ name: string; status: string; lastAction?: string; location?: string }>,
): string {
  if (!teamMembers || teamMembers.length === 0) {
    return `**You are currently the only agent active.** You can still use shared memories to learn from agents who were active before you.

**CRITICAL TEAM ACTIONS**:
- Import shared memories at the start: \`memory(action: "import_shared")\`
- Search shared knowledge: \`memory(action: "search", query: "...", includeShared: true)\`
- Share your discoveries: \`memory(action: "write", ...) then memory(action: "share", entryId: "...")\`
- Consolidate regularly: \`memory(action: "consolidate")\` every 10-15 turns`;
  }

  const lines: string[] = [];
  lines.push(
    `**You are part of a team of ${teamMembers.length + 1} active agents working together.**`,
  );
  lines.push("");
  lines.push("**Your Teammates:**");
  lines.push("");

  for (const member of teamMembers) {
    const statusIndicator =
      member.status === "running"
        ? "Active"
        : member.status === "starting"
          ? "Starting"
          : "Stopped";
    lines.push(`- **${member.name}** (${statusIndicator})`);
    if (member.location) {
      lines.push(`  Current location: ${member.location}`);
    }
    if (member.lastAction) {
      lines.push(`  Last action: ${member.lastAction}`);
    }
    lines.push("");
  }

  lines.push("**CRITICAL TEAM COORDINATION**:");
  lines.push("");
  lines.push(
    '1. **IMPORT team knowledge at startup**: `memory(action: "import_shared")` - Learn everything they know',
  );
  lines.push(
    '2. **SEARCH before acting**: `memory(action: "search", query: "[topic]", includeShared: true)` - Check what\'s known',
  );
  lines.push("3. **COORDINATE locations**: Avoid exploring the same areas simultaneously");
  lines.push(
    '4. **SHARE discoveries**: `memory(action: "write", ...)` then `memory(action: "share", entryId: "...")`',
  );
  lines.push('5. **CONSOLIDATE regularly**: `memory(action: "consolidate")` every 10-15 turns');
  lines.push("6. **DIVIDE tasks**: If teammate exploring one district, you explore another");
  lines.push("");
  lines.push("**TEAM SUCCESS = INDIVIDUAL SUCCESS**");

  return lines.join("\n");
}
