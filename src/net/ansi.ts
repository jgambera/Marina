// ─── Central ANSI Color Utilities ───────────────────────────────────────────
//
// All terminal color formatting flows through this module.
// Semantic functions provide consistent visual hierarchy across the MUD.

// ─── Raw ANSI Escape Codes ──────────────────────────────────────────────────

export const A = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",

  // Standard foreground
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  // Bright foreground
  brightBlack: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",
} as const;

const R = A.reset;

// ─── Entity Name Coloring (hash-based stable assignment) ────────────────────

// 8 readable 256-color codes for entity names
const ENTITY_PALETTE = [
  "\x1b[38;5;208m", // orange
  "\x1b[38;5;117m", // sky blue
  "\x1b[38;5;183m", // lavender
  "\x1b[38;5;220m", // gold
  "\x1b[38;5;155m", // lime
  "\x1b[38;5;210m", // salmon
  "\x1b[38;5;114m", // green
  "\x1b[38;5;75m", // lighter blue
];

/** FNV-1a hash → bucket index */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

/** Bold + hash-colored entity name */
export function entity(name: string): string {
  const color = ENTITY_PALETTE[fnv1a(name) % ENTITY_PALETTE.length]!;
  return `${A.bold}${color}${name}${R}`;
}

// ─── Semantic Formatting ────────────────────────────────────────────────────

/** Section header — bold cyan */
export function header(text: string): string {
  return `${A.bold}${A.cyan}${text}${R}`;
}

/** Category label — bold yellow */
export function category(text: string): string {
  return `${A.bold}${A.yellow}${text}${R}`;
}

/** Horizontal divider */
export function separator(width = 40): string {
  return `${A.dim}${"─".repeat(width)}${R}`;
}

/** Secondary/muted text */
export function dim(text: string): string {
  return `${A.dim}${text}${R}`;
}

/** Emphasized text */
export function bold(text: string): string {
  return `${A.bold}${text}${R}`;
}

/** Note/task ID — bold yellow */
export function id(n: number): string {
  return `${A.bold}${A.yellow}#${n}${R}`;
}

/** Status badge [TEXT] — color by kind */
export function status(text: string, kind: "active" | "done" | "fail" | "info" | "warn"): string {
  const colors: Record<string, string> = {
    active: A.green,
    done: A.brightGreen,
    fail: A.red,
    info: A.cyan,
    warn: A.yellow,
  };
  const c = colors[kind] ?? A.white;
  return `${A.bold}${c}[${text}]${R}`;
}

/** Rank badge — color by rank level */
export function rank(n: number): string {
  const names = ["Guest", "Citizen", "Builder", "Architect", "Admin"];
  const colors = [A.brightBlack, A.white, A.green, A.blue, A.red];
  const name = names[n] ?? "Unknown";
  const c = colors[n] ?? A.white;
  return `${c}[${name}]${R}`;
}

/** Success message — bold green */
export function success(text: string): string {
  return `${A.bold}${A.green}${text}${R}`;
}

/** Error highlight — bold red */
export function error(text: string): string {
  return `${A.bold}${A.red}${text}${R}`;
}

// ─── Communication Formatters ───────────────────────────────────────────────

/** "Alice says: hello" — colored name */
export function say(name: string, msg: string): string {
  return `${entity(name)} says: ${msg}`;
}

/** "You say: hello" — dim prefix */
export function saySelf(msg: string): string {
  return `${A.dim}You say:${R} ${msg}`;
}

/** Tell messages — magenta arrow prefix */
export function tell(name: string, msg: string, dir: "from" | "to"): string {
  const arrow = `${A.magenta}>${R}`;
  if (dir === "from") {
    return `${arrow} ${entity(name)} tells you: ${msg}`;
  }
  return `${arrow} You tell ${entity(name)}: ${msg}`;
}

/** "Someone shouts: HEY" — bold bright yellow, stands out */
export function shout(name: string, msg: string): string {
  return `${A.bold}${A.brightYellow}${name} shouts: ${msg}${R}`;
}

/** "You shout: HEY" — bold bright yellow */
export function shoutSelf(msg: string): string {
  return `${A.bold}${A.brightYellow}You shout: ${msg}${R}`;
}

/** "* Alice waves" — italic cyan */
export function emote(name: string, action: string): string {
  return `${A.italic}${A.cyan}* ${name} ${action}${R}`;
}

/** "[general] Alice: hello" — green channel tag + colored name */
export function channel(ch: string, name: string, msg: string): string {
  return `${A.green}[${ch}]${R} ${entity(name)}: ${msg}`;
}

/** "[general] You: hello" — green channel tag */
export function channelSelf(ch: string, msg: string): string {
  return `${A.green}[${ch}]${R} You: ${msg}`;
}

/** "Guide says: ..." — bold magenta NPC name */
export function npcSays(name: string, dialogue: string): string {
  return `${A.bold}${A.magenta}${name} says:${R} "${dialogue}"`;
}

// ─── Movement Formatters (dimmed + italic — don't compete with chat) ────────

/** "Alice arrives." */
export function arrival(name: string): string {
  return `${A.dim}${A.italic}${name} arrives.${R}`;
}

/** "Alice leaves north." */
export function departure(name: string, direction: string): string {
  return `${A.dim}${A.italic}${name} leaves ${direction}.${R}`;
}

/** "Alice connects." — dim green */
export function connects(name: string): string {
  return `${A.dim}${A.green}${name} connects.${R}`;
}

/** "Alice disconnects." — dim red */
export function disconnects(name: string): string {
  return `${A.dim}${A.red}${name} disconnects.${R}`;
}

// ─── Room Formatters ────────────────────────────────────────────────────────

/** Room title — bold cyan */
export function roomTitle(text: string): string {
  return `${A.bold}${A.cyan}${text}${R}`;
}

/** Exit list — bold yellow */
export function exits(list: string): string {
  return `${A.bold}${A.yellow}Exits: ${list}${R}`;
}

/** Board tag — bold magenta */
export function boardTag(names: string): string {
  return `${A.bold}${A.magenta}[Boards: ${names}]${R}`;
}
